"""The default ESE set must achieve complete coverage with the fewest guides."""

import json
import random
from itertools import combinations
from pathlib import Path

from app.modules import exon_skipping
from app.schemas.exon_skipping import ExonSkippingDesignRequest


def dmd_request(**changes):
    payload = json.loads((Path(__file__).parent / "fixtures/dmd_exon51_mincover.json").read_text())
    return ExonSkippingDesignRequest(**(payload | changes))


def test_dmd_all_regions_are_covered_by_sa_and_one_repositioned_ese_guide():
    result = exon_skipping.design_exon_skipping(dmd_request())
    ese = [candidate for candidate in result.candidates if candidate.kind == "ese"]
    assert len(ese) == 1  # R5–R11 span 129 nt, so one freely positioned151nt guide fits.
    assert len(ese[0].arrna_sequence) == 151
    assert ese[0].global_start <= 242 and ese[0].global_end >= 370
    assert ese[0].covered_region_indices == list(range(5, 12))
    assert set().union(*(set(c.covered_region_indices) for c in result.candidates)) == set(range(1, 12))
    assert set().union(*(set(c.covered_hit_indices) for c in result.candidates)) == set(range(1, 38))
    assert len(result.ese_hits) == 37 and len(result.ese_regions) == 11


def test_minimum_cover_matches_independent_exhaustive_search():
    # Enumerate every integer-positioned window, rather than reusing the selector's logic.
    rng = random.Random(405)
    for _ in range(40):
        total, length = 12, 5
        targets = []
        for _ in range(rng.randint(1, 6)):
            start = rng.randrange(total)
            targets.append((start, rng.randint(start + 1, min(start + length, total))))
        windows = [(s, s + length) for s in range(total - length + 1)]
        optimum = next(k for k in range(1, len(windows) + 1)
                       if any(all(any(s <= a and b <= e for s, e in subset)
                                  for a, b in targets)
                              for subset in combinations(windows, k)))
        actual = exon_skipping._minimum_ese_windows(targets, length, total)
        assert len(actual) == optimum
        assert all(any(s <= a and b <= e for s, e in actual) for a, b in targets)
        assert all(0 <= s < e <= total and e - s == length for s, e in actual)


def test_minimum_cover_handles_empty_short_and_end_clamped_inputs():
    select = exon_skipping._minimum_ese_windows
    assert select([], 5, 12) == []
    assert select([(0, 2), (3, 4)], 7, 4) == [(0, 4)]
    for targets in [[(0, 2), (2, 3)], [(9, 12)], [(0, 5), (7, 12)]]:
        windows = select(targets, 5, 12)
        assert all(any(s <= a and b <= e for s, e in windows) for a, b in targets)
        assert all(0 <= s < e <= 12 for s, e in windows)


def test_long_regions_retain_every_complete_motif_in_the_selected_guides():
    result = exon_skipping.design_exon_skipping(ExonSkippingDesignRequest(
        upstream_intron="T" * 150 + "AG", exon="CACACGA" * 50,
        downstream_intron="C" * 151, evaluate_covered_ese=True,
    ))
    ese = [c for c in result.candidates if c.kind == "ese"]
    assert len(ese) == 3
    assert all(c.covered_region_indices == [] for c in ese)
    assert all(c.partially_covered_region_indices == [1] for c in ese)
    assert set().union(*(set(c.covered_hit_indices) for c in ese)) == set(range(1, len(result.ese_hits) + 1))


def test_manual_sa_apply_keeps_minimum_ese_candidate_id_and_sequence():
    baseline = exon_skipping.design_exon_skipping(dmd_request())
    shifted = exon_skipping.design_exon_skipping(dmd_request(
        candidate_windows=[{"candidate_id": "sa-1", "start": 105, "end": 255}],
    ))
    assert shifted.candidates[1:] == baseline.candidates[1:]
    assert shifted.candidates[0].mismatch_target_position == 150
    assert shifted.candidates[0].covered_region_indices == [1, 2, 3, 4, 5]


def test_evaluate_covered_ese_requires_independent_ese_region_coverage():
    result = exon_skipping.design_exon_skipping(dmd_request(evaluate_covered_ese=True))
    ese = [c for c in result.candidates if c.kind == "ese"]
    assert len(ese) == 2  # R1–R11 span216nt, exceeding one151nt guide.
    assert set().union(*(set(c.covered_region_indices) for c in ese)) == set(range(1, 12))
