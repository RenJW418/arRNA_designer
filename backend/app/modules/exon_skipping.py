from __future__ import annotations

from dataclasses import dataclass
from math import ceil

from app.schemas.design import DesignProvenance, EngineInfo, RuleSetInfo
from app.schemas.exon_skipping import (
    ArrnaCandidate,
    ExonDesignSettings,
    EsePredictionSettings,
    EseMatrixSetting,
    EseHit,
    EseRegion,
    ExonSkippingDesignRequest,
    ExonSkippingDesignResponse,
    ExonSkippingNormalizedInput,
)


@dataclass(frozen=True)
class EseMatrix:
    name: str
    threshold: float
    weights: dict[str, list[float]]


ESE_MATRICES = (
    EseMatrix("SF2/ASF", 1.956, {
        "A": [-1.14, .62, -1.58, 1.32, -1.58, -1.58, .62],
        "C": [1.37, -1.1, .73, .33, .94, -1.58, -1.58],
        "G": [-.21, .17, .48, -1.58, .33, .99, -.11],
        "T": [-1.58, -.5, -1.58, -1.13, -1.58, -1.13, .27],
    }),
    EseMatrix("SF2/ASF IgM-BRCA1", 1.867, {
        "A": [-1.58, .15, -.97, .74, -1.19, -.75, .43],
        "C": [1.55, -.53, .79, .33, .72, -.62, -.99],
        "G": [-1.35, .44, .41, -.98, .51, 1.03, 0.0],
        "T": [-1.55, -.28, -1.28, -.92, -1.09, -.52, .20],
    }),
    EseMatrix("SC35", 2.383, {
        "A": [-.88, .09, -.06, -1.58, .09, -.41, -.06, .23],
        "C": [-1.16, -1.58, .95, 1.11, .56, .86, .32, -1.58],
        "G": [.87, .45, -1.36, -1.58, -.33, -.05, -1.36, .68],
        "T": [-1.18, -.2, .38, .88, -.2, -.86, .96, -1.58],
    }),
    EseMatrix("SRp40", 2.670, {
        "A": [-.13, -1.58, 1.28, -.33, .97, -.13, -1.58],
        "C": [.56, .68, -1.12, 1.24, -.77, .13, -.05],
        "G": [-1.58, -.14, -1.33, -.48, -1.58, .44, .8],
        "T": [.92, .37, .23, -1.14, .72, -1.58, -1.58],
    }),
    EseMatrix("SRp55", 2.676, {
        "A": [-.66, .11, -.66, .11, -1.58, .61],
        "C": [.39, -1.58, 1.48, -1.58, -1.58, .98],
        "G": [-1.58, .72, -1.58, .72, .21, -.79],
        "T": [1.22, -1.58, -.07, -1.58, 1.02, -1.58],
    }),
)

EXON_SKIPPING_PROVENANCE = DesignProvenance(
    engine=EngineInfo(name="leaper-arrna-engine", version="0.2.0"),
    ruleset=RuleSetInfo(
        id="leaper-exon-skipping",
        version="0.2.0",
    ),
)


def reverse_complement_rna(sequence: str) -> str:
    return sequence.translate(str.maketrans("ACGT", "UGCA"))[::-1]


def scan_ese(exon: str) -> list[EseHit]:
    hits: list[EseHit] = []
    for matrix in ESE_MATRICES:
        motif_length = len(matrix.weights["A"])
        for start in range(len(exon) - motif_length + 1):
            motif = exon[start:start + motif_length]
            if "A" not in motif:
                continue
            score = sum(matrix.weights[base][offset] for offset, base in enumerate(motif))
            if score >= matrix.threshold:
                hits.append(EseHit(
                    matrix=matrix.name,
                    score=round(score, 3),
                    start=start + 1,
                    end=start + motif_length,
                    sequence=motif,
                    a_positions=[start + i + 1 for i, base in enumerate(motif) if base == "A"],
                ))
    return sorted(hits, key=lambda hit: (hit.start, hit.end, hit.matrix))


def merge_ese_regions(hits: list[EseHit]) -> list[EseRegion]:
    regions: list[dict[str, object]] = []
    for hit in hits:
        if not regions or hit.start > int(regions[-1]["end"]):
            regions.append({
                "start": hit.start,
                "end": hit.end,
                "a_positions": set(hit.a_positions),
                "matrices": {hit.matrix},
                "peak_score": hit.score,
            })
            continue
        region = regions[-1]
        region["end"] = max(int(region["end"]), hit.end)
        region["a_positions"].update(hit.a_positions)  # type: ignore[union-attr]
        region["matrices"].add(hit.matrix)  # type: ignore[union-attr]
        region["peak_score"] = max(float(region["peak_score"]), hit.score)
    return [EseRegion(
        start=int(region["start"]),
        end=int(region["end"]),
        a_positions=sorted(region["a_positions"]),  # type: ignore[arg-type]
        matrices=sorted(region["matrices"]),  # type: ignore[arg-type]
        peak_score=round(float(region["peak_score"]), 3),
    ) for region in regions]


def _window_around_group(first: int, last: int, length: int, total: int) -> tuple[int, int]:
    span = last - first + 1
    start = first - max(0, (length - span) // 2)
    start = max(0, min(start, total - length)) if total >= length else 0
    end = min(total, start + length)
    return start, end


def design_exon_skipping(payload: ExonSkippingDesignRequest) -> ExonSkippingDesignResponse:
    upstream, exon, downstream = payload.upstream_intron, payload.exon, payload.downstream_intron
    full_sequence = upstream + exon + downstream
    x = payload.arrna_length
    exon_length = len(exon)
    length_class = "short" if exon_length < 70 else "medium" if exon_length <= 150 else "long"
    warnings: list[str] = []
    candidates: list[ArrnaCandidate] = []
    exon_start_global = len(upstream)

    canonical_sa = upstream.endswith("AG")
    if canonical_sa:
        target_index = len(upstream) - 2
        center = ceil(x / 2)
        start = max(0, target_index - (center - 1))
        end = min(len(full_sequence), target_index + (x - center) + 1)
        target = full_sequence[start:end]
        arrna = list(reverse_complement_rna(target))
        arrna_index = len(target) - 1 - (target_index - start)
        arrna[arrna_index] = "C"
        candidates.append(ArrnaCandidate(
            id="sa-1", kind="sa", label="SA A–C mismatch", target_sequence=target,
            arrna_sequence="".join(arrna), global_start=start + 1, global_end=end,
            exon_start=max(1, start - exon_start_global + 1),
            exon_end=min(exon_length, end - exon_start_global),
            mismatch_target_position=target_index + 1,
            mismatch_arrna_position=arrna_index + 1,
        ))
        if len(target) < x:
            warnings.append(f"SA candidate is {len(target)} nt because the supplied flanking sequence is shorter than {x} nt.")
    else:
        warnings.append("Upstream intron does not end in canonical AG; no SA candidate was generated.")

    hits = scan_ese(exon)
    regions = merge_ese_regions(hits)
    sa = next((candidate for candidate in candidates if candidate.kind == "sa"), None)
    if sa is not None:
        sa.covered_region_indices = [i for i, region in enumerate(regions, 1)
                                     if sa.exon_start <= region.start and region.end <= sa.exon_end]
        sa.partially_covered_region_indices = [i for i, region in enumerate(regions, 1)
            if region.start <= sa.exon_end and region.end >= sa.exon_start
            and i not in sa.covered_region_indices]
        sa.covered_hit_indices = [i for i, hit in enumerate(hits, 1)
                                 if sa.exon_start <= hit.start and hit.end <= sa.exon_end]
        sa.covered_a_positions = sorted({p for i in sa.covered_hit_indices
                                        for p in hits[i - 1].a_positions})
    windows: set[tuple[int, int]] = set()
    for region in regions:
        first_global = exon_start_global + region.start - 1
        last_global = exon_start_global + region.end - 1
        if (not payload.evaluate_covered_ese and sa is not None
                and sa.global_start <= first_global + 1 and sa.global_end >= last_global + 1):
            continue
        if region.end - region.start + 1 <= x:
            windows.add(_window_around_group(first_global, last_global, x, len(full_sequence)))
            continue
        # A long merged region is covered by groups of complete motifs, not by A counts.
        region_hits = [hit for hit in hits if region.start <= hit.start and hit.end <= region.end]
        cursor = 0
        while cursor < len(region_hits):
            first = region_hits[cursor].start
            last = region_hits[cursor].end
            cursor += 1
            while cursor < len(region_hits) and region_hits[cursor].end - first + 1 <= x:
                last = max(last, region_hits[cursor].end)
                cursor += 1
            windows.add(_window_around_group(
                exon_start_global + first - 1, exon_start_global + last - 1, x, len(full_sequence)
            ))

    for candidate_number, (start, end) in enumerate(sorted(windows), 1):
        exon_start = max(1, start - exon_start_global + 1)
        exon_end = min(exon_length, end - exon_start_global)
        full_regions = [i for i, region in enumerate(regions, 1)
                        if exon_start <= region.start and region.end <= exon_end]
        partial_regions = [i for i, region in enumerate(regions, 1)
                           if region.start <= exon_end and region.end >= exon_start
                           and i not in full_regions]
        covered_hits = [i for i, hit in enumerate(hits, 1)
                        if exon_start <= hit.start and hit.end <= exon_end]
        covered_positions = sorted({p for i in covered_hits for p in hits[i - 1].a_positions})
        target = full_sequence[start:end]
        guide = list(reverse_complement_rna(target))
        mismatches = [p for p in payload.ese_mismatch_positions if exon_start <= p <= exon_end]
        for position in mismatches:
            guide[len(target) - 1 - (exon_start_global + position - 1 - start)] = "C"
        candidates.append(ArrnaCandidate(
            id=f"ese-{candidate_number}",
            kind="ese", label=f"ESE coverage {candidate_number}",
            target_sequence=target, arrna_sequence="".join(guide),
            global_start=start + 1, global_end=end, exon_start=exon_start, exon_end=exon_end,
            covered_a_positions=covered_positions, covered_region_indices=full_regions,
            partially_covered_region_indices=partial_regions, covered_hit_indices=covered_hits,
            mismatch_exon_positions=mismatches,
        ))
    if not regions:
        warnings.append("No above-threshold ESEfinder motif containing A was found in the target exon.")
    warnings.append("Predicted ESE motifs are candidates for experimental testing, not confirmed functional enhancers.")
    warnings.append("Test individual guides before combinations; compare with SA alone while keeping the total nucleic acid dose constant.")
    applied_positions = {p for c in candidates for p in c.mismatch_exon_positions}
    if set(payload.ese_mismatch_positions) - applied_positions:
        warnings.append("Some requested ESE A/C mismatches are outside the generated ESE guides and were not applied.")

    return ExonSkippingDesignResponse(
        normalized_input=ExonSkippingNormalizedInput(
            upstream_intron=upstream,
            exon=exon,
            downstream_intron=downstream,
            combined_length=len(full_sequence),
        ),
        normalized_upstream_intron=upstream,
        normalized_exon=exon,
        normalized_downstream_intron=downstream,
        arrna_length=x,
        exon_length=exon_length,
        length_class=length_class,
        sa_is_canonical=canonical_sa,
        warnings=warnings,
        ese_hits=hits,
        ese_regions=regions,
        candidates=candidates,
        transcript=payload.transcript,
        exon_number=payload.exon_number,
        provenance=EXON_SKIPPING_PROVENANCE,
        reference=payload.reference,
        design_settings=ExonDesignSettings(
            evaluate_covered_ese=payload.evaluate_covered_ese,
            ese_mismatch_positions=payload.ese_mismatch_positions,
        ),
        prediction_settings=EsePredictionSettings(matrices=[
            EseMatrixSetting(name=matrix.name, threshold=matrix.threshold) for matrix in ESE_MATRICES
        ]),
    )
