"""Small NCBI Datasets + E-utilities gateway for exon-skipping reference input."""

from __future__ import annotations

from urllib.parse import quote

import httpx

from app.schemas.exon_skipping import (
    NcbiCodingSequenceRequest,
    NcbiCodingSequenceResponse,
    NcbiExonRequest,
    NcbiExonResponse,
)

DATASETS_API = "https://api.ncbi.nlm.nih.gov/datasets/v2"
EFETCH_API = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi"


class NcbiLookupError(RuntimeError):
    pass


def _get_gene_product(
    client: httpx.Client, species: str, gene: str, *, require_genomic: bool = False
) -> tuple[dict, dict, str]:
    symbol = quote(gene.strip().upper(), safe="")
    taxon = quote(species.strip(), safe="")
    url = f"{DATASETS_API}/gene/symbol/{symbol}/taxon/{taxon}/product_report"
    response = client.get(url, params={"page_size": 1})
    response.raise_for_status()
    reports = response.json().get("reports", [])
    if not reports:
        raise NcbiLookupError("No NCBI Gene record matched this species and symbol")
    product = reports[0]["product"]
    transcripts = [
        transcript for transcript in product.get("transcripts", [])
        if transcript.get("type") == "PROTEIN_CODING"
        and transcript.get("cds")
        and (not require_genomic or transcript.get("genomic_locations"))
    ]
    if not transcripts:
        raise NcbiLookupError("No protein-coding RefSeq transcript with a CDS was found")
    mane = [transcript for transcript in transcripts if transcript.get("select_category") == "MANE_SELECT"]
    transcript = mane[0] if mane else max(transcripts, key=lambda item: int(item.get("length", 0)))
    selection = "MANE Select" if mane else "longest protein-coding"
    return product, transcript, selection


def _fetch_fasta(client: httpx.Client, accession: str) -> str:
    response = client.get(EFETCH_API, params={
        "db": "nuccore", "id": accession, "rettype": "fasta", "retmode": "text",
    })
    response.raise_for_status()
    lines = response.text.splitlines()
    if not lines or not lines[0].startswith(">"):
        raise NcbiLookupError("NCBI returned an invalid transcript sequence response")
    return "".join(lines[1:]).upper().replace("U", "T")


def _fetch_sequence(client: httpx.Client, accession: str, begin: int, end: int, strand: int) -> str:
    """Fetch a 0-based half-open genomic range in the requested transcription orientation."""
    if end <= begin:
        return ""
    response = client.get(EFETCH_API, params={
        "db": "nuccore", "id": accession, "seq_start": begin + 1, "seq_stop": end,
        "strand": strand, "rettype": "fasta", "retmode": "text",
    })
    response.raise_for_status()
    lines = response.text.splitlines()
    if not lines or not lines[0].startswith(">"):
        raise NcbiLookupError("NCBI returned an invalid genomic sequence response")
    return "".join(lines[1:]).upper().replace("U", "T")


def resolve_ncbi_exon(payload: NcbiExonRequest) -> NcbiExonResponse:
    try:
        with httpx.Client(timeout=30, headers={"User-Agent": "LEAPER-arRNA-Designer/0.1"}) as client:
            product, transcript, selection = _get_gene_product(
                client, payload.species, payload.gene, require_genomic=True
            )
            locations = transcript["genomic_locations"]
            location = next(
                (item for item in locations if "Primary Assembly" in item.get("sequence_name", "")),
                locations[0],
            )
            exons = sorted(location["exons"], key=lambda item: int(item["order"]))
            exon_index = payload.exon_number - 1
            if exon_index <= 0 or exon_index >= len(exons) - 1:
                raise NcbiLookupError(
                    f"Exon {payload.exon_number} cannot provide both an upstream and downstream intron; "
                    f"choose exon 2 through {len(exons) - 1}"
                )
            previous, current, following = exons[exon_index - 1:exon_index + 2]
            orientation = current["orientation"]
            strand = 1 if orientation == "plus" else 2
            flank = payload.flank_length
            if orientation == "plus":
                upstream_boundary = int(previous["end"])
                exon_begin = int(current["begin"]) - 1
                downstream_boundary = int(current["end"])
                following_begin = int(following["begin"]) - 1
                upstream_range = (max(upstream_boundary, exon_begin - flank), exon_begin)
                exon_range = (exon_begin, int(current["end"]))
                downstream_range = (downstream_boundary, min(following_begin, downstream_boundary + flank))
            else:
                upstream_boundary = int(current["end"])
                previous_begin = int(previous["begin"]) - 1
                exon_begin = int(current["begin"]) - 1
                downstream_boundary = int(following["end"])
                upstream_range = (upstream_boundary, min(previous_begin, upstream_boundary + flank))
                exon_range = (exon_begin, int(current["end"]))
                downstream_range = (max(downstream_boundary, exon_begin - flank), exon_begin)

            accession = location["genomic_accession_version"]
            upstream = _fetch_sequence(client, accession, *upstream_range, strand)
            exon = _fetch_sequence(client, accession, *exon_range, strand)
            downstream = _fetch_sequence(client, accession, *downstream_range, strand)
    except httpx.HTTPError as exc:
        raise NcbiLookupError(f"NCBI request failed: {exc}") from exc

    return NcbiExonResponse(
        species=product.get("taxname", payload.species), gene=product.get("symbol", payload.gene.upper()),
        transcript=transcript["accession_version"], transcript_name=transcript.get("name", ""),
        selection=selection, exon_number=payload.exon_number, exon_count=len(exons),
        genomic_accession=accession, orientation=orientation,
        upstream_intron=upstream, exon=exon, downstream_intron=downstream,
    )


def resolve_ncbi_coding_sequence(payload: NcbiCodingSequenceRequest) -> NcbiCodingSequenceResponse:
    try:
        with httpx.Client(timeout=30, headers={"User-Agent": "LEAPER-arRNA-Designer/0.1"}) as client:
            product, transcript, selection = _get_gene_product(client, payload.species, payload.gene)
            accession = transcript["accession_version"]
            transcript_sequence = _fetch_fasta(client, accession)
            cds_ranges = transcript["cds"].get("range", [])
            if len(cds_ranges) != 1:
                raise NcbiLookupError("The selected transcript does not have one continuous CDS range")
            cds_start = int(cds_ranges[0]["begin"]) - 1
            cds_end = int(cds_ranges[0]["end"])
            cds_sequence = transcript_sequence[cds_start:cds_end]
            if not cds_sequence or len(cds_sequence) % 3:
                raise NcbiLookupError("NCBI returned a CDS that is not in frame")
    except httpx.HTTPError as exc:
        raise NcbiLookupError(f"NCBI request failed: {exc}") from exc

    return NcbiCodingSequenceResponse(
        species=product.get("taxname", payload.species), gene=product.get("symbol", payload.gene.upper()),
        transcript=accession, transcript_name=transcript.get("name", ""), selection=selection,
        cds_sequence=cds_sequence, cds_start=cds_start + 1, cds_end=cds_end,
    )
