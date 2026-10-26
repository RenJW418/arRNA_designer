"""Local, scoped motif annotation with optional exact-accession reference lookup.

Only the accession is sent to NCBI. Submitted bases stay in this process, and
reference features require a single exact forward match in the fetched record.
"""

import re
from time import monotonic
from xml.etree.ElementTree import ParseError

import httpx
from defusedxml import ElementTree
from defusedxml.common import DefusedXmlException

from app.modules.exon_skipping import ESE_MATRICES
from app.schemas.sequence_analysis import AnnotationRequest, AnnotationResponse, SequenceFeature

EFETCH_API = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi"
REFERENCE_MAX_BYTES = 5_000_000
REFERENCE_MAX_BASES = 1_000_000
REFERENCE_DEADLINE_SECONDS = 12
MATRIX_SOURCE = "https://esefinder.ahc.umn.edu/cgi-bin/tools/ESE3/esefinder.cgi?process=matrices"
PREDICTION_METHOD = (
    "ESEfinder 3.0: five published SR-protein matrices at their published thresholds "
    "(SF2/ASF, SF2/ASF IgM-BRCA1, SC35, SRp40, SRp55), including motifs without A. "
    "This scoped motif scan is not a universal RNA-binding-protein screen."
)
PROTEINS = {"SF2/ASF": "SRSF1", "SF2/ASF IgM-BRCA1": "SRSF1", "SC35": "SRSF2",
            "SRp40": "SRSF5", "SRp55": "SRSF6"}


class ReferenceAnnotationError(RuntimeError):
    pass


def _fetch_reference_xml(accession: str) -> bytes:
    deadline = monotonic() + REFERENCE_DEADLINE_SECONDS
    try:
        with (
            httpx.Client(timeout=httpx.Timeout(8, connect=4), follow_redirects=False,
                         headers={"User-Agent": "LEAPER-arRNA-Designer/0.2",
                                  "Accept-Encoding": "identity"}) as client,
            client.stream("GET", EFETCH_API, params={
                "db": "nuccore", "id": accession, "rettype": "gb", "retmode": "xml",
            }) as response,
        ):
            response.raise_for_status()
            if response.headers.get("Content-Encoding", "identity").lower() != "identity":
                raise ReferenceAnnotationError("NCBI returned unsupported compressed reference data")
            content = bytearray()
            # Read raw chunks immediately: buffering to a fixed chunk size can
            # let a slow-drip response evade the total retrieval deadline.
            for chunk in response.iter_raw():
                if monotonic() > deadline:
                    raise ReferenceAnnotationError("NCBI reference retrieval exceeded its time limit")
                if len(content) + len(chunk) > REFERENCE_MAX_BYTES:
                    raise ReferenceAnnotationError("NCBI reference response exceeds the 5 MB limit")
                content.extend(chunk)
            return bytes(content)
    except httpx.HTTPError as exc:
        raise ReferenceAnnotationError(
            "NCBI reference retrieval failed or timed out; no reference features were assigned"
        ) from exc


def _reference_features(sequence: str, requested: str) -> tuple[list[SequenceFeature], str, list[str]]:
    raw = _fetch_reference_xml(requested)
    try:
        root = ElementTree.fromstring(raw, forbid_entities=True, forbid_external=True)
    except (ParseError, DefusedXmlException) as exc:
        raise ReferenceAnnotationError("NCBI returned invalid or unsafe reference XML") from exc
    records = root.findall("GBSeq")
    if len(records) != 1:
        raise ReferenceAnnotationError("NCBI did not return exactly one reference record")
    record = records[0]
    accession = record.findtext("GBSeq_accession-version", "").strip()
    if not re.fullmatch(r"[A-Z]{1,6}_?\d{5,12}\.\d{1,6}", accession):
        raise ReferenceAnnotationError("NCBI reference has no valid accession and version")
    if accession != requested and ("." in requested or accession.split(".")[0] != requested):
        raise ReferenceAnnotationError("NCBI returned a different accession or version than requested")
    reference = "".join(record.findtext("GBSeq_sequence", "").upper().split()).replace("U", "T")
    if not reference or len(reference) > REFERENCE_MAX_BASES or set(reference) - set("ACGTN"):
        raise ReferenceAnnotationError("NCBI reference sequence is unavailable, unsupported or too long")
    offset = reference.find(sequence)
    if offset < 0:
        raise ReferenceAnnotationError(
            "The submitted sequence has no exact forward match in this reference; "
            "no reference features were assigned"
        )
    if reference.find(sequence, offset + 1) >= 0:
        raise ReferenceAnnotationError(
            "The submitted sequence has multiple reference matches; mapping is ambiguous "
            "and no reference features were assigned"
        )
    features = []
    warnings = []
    records_features = record.findall("GBSeq_feature-table/GBFeature")
    if len(records_features) > 10_000:
        raise ReferenceAnnotationError("NCBI reference contains too many features")
    skipped = False
    for index, feature in enumerate(records_features):
        kind = feature.findtext("GBFeature_key", "").strip()[:64]
        if not kind or kind == "source":
            continue
        location = feature.findtext("GBFeature_location", "")
        intervals = feature.findall("GBFeature_intervals/GBInterval")
        # Approximate, between-base, reverse-strand and remote locations cannot
        # be promoted to exact transcript intervals. Keep joined parts separate.
        if any(marker in location for marker in ("<", ">", "^", "complement", "order")) or not intervals:
            skipped = True
            continue
        if len(intervals) > 1000:
            skipped = True
            continue
        qualifiers = {q.findtext("GBQualifier_name", ""): q.findtext("GBQualifier_value", "")[:500]
                      for q in feature.findall("GBFeature_quals/GBQualifier")}
        label = kind
        detail = (qualifiers.get("standard_name") or qualifiers.get("gene")
                  or qualifiers.get("product") or qualifiers.get("number"))
        if detail:
            label += f" {detail}"
        for part, interval in enumerate(intervals):
            remote = interval.findtext("GBInterval_accession", accession)
            orientation = interval.find("GBInterval_iscomp")
            if remote != accession or (orientation is not None and orientation.get("value") == "true"):
                skipped = True
                continue
            try:
                point = interval.findtext("GBInterval_point")
                start = int(interval.findtext("GBInterval_from") or point or "")
                end = int(interval.findtext("GBInterval_to") or point or "")
            except ValueError:
                skipped = True
                continue
            if not 1 <= start <= end <= len(reference):
                skipped = True
                continue
            local_start, local_end = max(1, start - offset), min(len(sequence), end - offset)
            if local_start > local_end:
                continue
            clipped = local_start != start - offset or local_end != end - offset
            description = (
                f"NCBI {kind} annotation at {accession}:{start}–{end}, mapped by a unique "
                "exact forward sequence match. Reference annotation does not demonstrate "
                "activity in the current cell type."
            )
            if len(intervals) > 1:
                description += f" Part {part + 1} of {len(intervals)}; intervening bases are excluded."
            if clipped:
                description += " Clipped to the submitted sequence boundaries."
            features.append(SequenceFeature(
                id=f"reference-{index}-{part}", start=local_start, end=local_end,
                kind=kind.lower(), label=label[:160], evidence="reference",
                source=f"NCBI GenBank {accession}", description=description,
                source_url=f"https://www.ncbi.nlm.nih.gov/nuccore/{accession}",
            ))
    if skipped:
        warnings.append("Some reference features had unsupported or inexact locations and were omitted")
    if not features:
        warnings.append("The sequence maps uniquely, but no supported reference features overlap it")
    return features, accession, warnings


def annotate_sequence(payload: AnnotationRequest) -> AnnotationResponse:
    features = [SequenceFeature(
        id=f"user-{index}", start=region.start, end=region.end, kind=region.kind,
        label=region.label or region.kind, evidence="user", source="User-defined region",
        description="Coordinates supplied by the user; not independently verified reference annotation.",
    ) for index, region in enumerate(payload.regions)]
    warnings = []
    accession = None
    if payload.transcript_accession:
        try:
            reference, accession, reference_warnings = _reference_features(
                payload.sequence, payload.transcript_accession,
            )
            features.extend(reference)
            warnings.extend(reference_warnings)
        except ReferenceAnnotationError as exc:
            warnings.append(str(exc))
    for matrix_index, matrix in enumerate(ESE_MATRICES):
        motif_length = len(matrix.weights["A"])
        for start in range(len(payload.sequence) - motif_length + 1):
            motif = payload.sequence[start:start + motif_length]
            score = sum(matrix.weights[base][position] for position, base in enumerate(motif))
            if score < matrix.threshold:
                continue
            features.append(SequenceFeature(
                id=f"predicted-{matrix_index}-{start + 1}", start=start + 1, end=start + motif_length,
                kind="sr_protein_motif", label=f"{matrix.name} motif", evidence="predicted",
                source="ESEfinder 3.0 published matrix", source_url=MATRIX_SOURCE,
                description=(f"Predicted SR-protein binding motif {motif}; matrix score "
                             f"{score:.3f} meets threshold {matrix.threshold:.3f}. "
                             "A motif match does not establish binding or splicing-enhancer activity."),
                score=round(score, 3), protein=PROTEINS[matrix.name],
            ))
    return AnnotationResponse(
        sequence=payload.sequence, features=sorted(features, key=lambda f: (f.start, f.end, f.id)),
        warnings=warnings, prediction_method=PREDICTION_METHOD, reference_accession=accession,
    )
