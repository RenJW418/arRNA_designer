"""Explicit windows must change only their selected, already generated candidate."""

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.modules.exon_skipping import design_exon_skipping
from app.schemas.exon_skipping import ExonSkippingDesignRequest


def input_data(**changes):
    return {
        "upstream_intron": "T" * 150 + "AG",
        "exon": "C" * 50 + "CACACGA" * 3 + "T" * 50 + "CACACGA" * 3 + "C" * 50,
        "downstream_intron": "C" * 151,
        "evaluate_covered_ese": True,
        **changes,
    }


def design(**changes):
    return design_exon_skipping(ExonSkippingDesignRequest(**input_data(**changes)))


def window(candidate_id, start, end):
    return {"candidate_id": candidate_id, "start": start, "end": end}


def candidate(result, candidate_id):
    return next(item for item in result.candidates if item.id == candidate_id)


def test_same_length_asymmetric_windows_reposition_sa_without_changing_other_candidates():
    baseline = design()
    left = design(candidate_windows=[window("sa-1", 90, 240)])
    right = design(candidate_windows=[window("sa-1", 100, 250)])
    shifted = candidate(right, "sa-1")
    assert (shifted.global_start, shifted.global_end) == (100, 250)
    assert len(shifted.arrna_sequence) == 151
    assert shifted.target_sequence != candidate(left, "sa-1").target_sequence
    assert shifted.arrna_sequence != candidate(left, "sa-1").arrna_sequence
    assert [item.model_dump() for item in right.candidates[1:]] == [
        item.model_dump() for item in baseline.candidates[1:]
    ]


def test_sa_window_preserves_target_and_antiparallel_mismatch_coordinate():
    result = design(candidate_windows=[window("sa-1", 100, 250)])
    sa = candidate(result, "sa-1")
    assert sa.mismatch_target_position == 151
    assert sa.mismatch_arrna_position == 100
    assert sa.target_sequence[51] == "A"
    assert sa.arrna_sequence[99] == "C"
    complement = {"A": "U", "C": "G", "G": "C", "T": "A"}
    for index, base in enumerate(sa.target_sequence):
        assert sa.arrna_sequence[-1 - index] == ("C" if index == 51 else complement[base])
    assert (sa.exon_start, sa.exon_end) == (1, 98)
    assert sa.covered_region_indices == [1]
    assert sa.partially_covered_region_indices == []
    assert sa.covered_hit_indices == list(range(1, 11))


def test_ese_override_recomputes_full_partial_hit_and_adenosine_coverage():
    partial = design(candidate_windows=[window("ese-1", 198, 218)], ese_mismatch_positions=[52])
    ese = candidate(partial, "ese-1")
    assert (ese.global_start, ese.global_end, ese.exon_start, ese.exon_end) == (198, 218, 46, 66)
    assert len(ese.target_sequence) == len(ese.arrna_sequence) == 21
    assert ese.covered_region_indices == []
    assert ese.partially_covered_region_indices == [1]
    assert ese.covered_hit_indices == list(range(1, 8))
    assert ese.covered_a_positions == [52, 54, 57, 59, 61, 64]
    assert ese.mismatch_exon_positions == [52]
    assert ese.arrna_sequence[14] == "C"  # exon A52 = global 204, guide position 15
    assert ese.mismatch_target_position is None
    assert ese.mismatch_arrna_position is None
    full = candidate(design(candidate_windows=[window("ese-1", 198, 228)]), "ese-1")
    assert full.covered_region_indices == [1]
    assert full.partially_covered_region_indices == []
    assert full.covered_hit_indices == list(range(1, 11))
    assert full.covered_a_positions == [52, 54, 57, 59, 61, 64, 66, 68, 71]


def test_multiple_windows_are_independent_and_recorded_without_changing_input_reference():
    windows = [window("sa-1", 100, 250), window("ese-1", 198, 218)]
    reference = {"transcript": "NM_fixture.1", "genomic_accession": "NC_fixture.1",
                 "orientation": "minus", "exon_genomic_start": 1001, "exon_genomic_end": 1192}
    baseline = design(reference=reference)
    result = design(candidate_windows=windows, reference=reference)
    assert candidate(result, "sa-1").global_start == 100
    assert candidate(result, "ese-1").global_start == 198
    assert candidate(result, "ese-2") == candidate(baseline, "ese-2")
    assert result.normalized_input == baseline.normalized_input
    assert result.reference == baseline.reference
    assert result.ese_hits == baseline.ese_hits
    assert result.ese_regions == baseline.ese_regions
    assert result.design_settings.model_dump()["candidate_windows"] == windows


def test_empty_windows_keep_existing_default_design():
    baseline = design()
    explicit_empty = design(candidate_windows=[])
    assert explicit_empty.model_dump() == baseline.model_dump()
    assert [(item.id, item.global_start, item.global_end) for item in baseline.candidates] == [
        ("sa-1", 76, 226), ("ese-1", 136, 286), ("ese-2", 212, 362)
    ]
    assert baseline.design_settings.model_dump()["candidate_windows"] == []


@pytest.mark.parametrize("windows", [
    [window("sa-1", 0, 151)],
    [window("sa-1", 100, 496)],  # total input is 495 nt
    [window("sa-1", 160, 140)],
    [window("sa-1", 140, 159)],
    [window("sa-1", 1, 1002)],
    [window("sa-1", 100.5, 250)],
    [window("sa-1", True, 250)],
    [window("sa-1", 200, 250)],
    [window("ese-1", 1, 21)],
    [window("ese-1", 182, 202)],  # intersects the first hit but contains none completely
    [window("missing", 100, 250)],
    [window("sa-1", 100, 250), window("sa-1", 90, 240)],
])
def test_invalid_windows_are_rejected_as_api_validation_errors(windows):
    with TestClient(app) as client:
        response = client.post("/api/v1/exon-skipping/design", json=input_data(candidate_windows=windows))
    assert response.status_code == 422
    assert response.json().get("detail")


def test_explicit_window_replaces_stale_short_sa_warning():
    options = {"upstream_intron": "T" * 30 + "AG", "exon": "C" * 100}
    baseline = design(**options)
    assert any("SA candidate is 106 nt" in message for message in baseline.warnings)
    result = design(**options, candidate_windows=[window("sa-1", 1, 151)])
    assert len(candidate(result, "sa-1").arrna_sequence) == 151
    assert not any("SA candidate is" in message for message in result.warnings)


def test_unapplied_mismatch_warning_uses_final_overridden_windows():
    result = design(ese_mismatch_positions=[71], candidate_windows=[
        window("ese-1", 198, 218), window("ese-2", 198, 218)
    ])
    assert all(not item.mismatch_exon_positions for item in result.candidates)
    assert any("outside the generated ESE guides" in message for message in result.warnings)


def test_sa_window_ending_at_target_has_empty_exon_coverage():
    sa = candidate(design(candidate_windows=[window("sa-1", 131, 151)]), "sa-1")
    assert sa.mismatch_arrna_position == 1
    assert sa.arrna_sequence[0] == "C"
    assert (sa.exon_start, sa.exon_end) == (1, 0)
    assert sa.covered_region_indices == sa.partially_covered_region_indices == []
    assert sa.covered_hit_indices == sa.covered_a_positions == []


def test_explicit_maximum_length_is_checked_independently_of_input_bounds():
    options = {"downstream_intron": "C" * 1500}
    accepted = design(**options, candidate_windows=[window("sa-1", 1, 1001)])
    assert len(candidate(accepted, "sa-1").arrna_sequence) == 1001
    with TestClient(app) as client:
        rejected = client.post("/api/v1/exon-skipping/design", json=input_data(
            **options, candidate_windows=[window("sa-1", 1, 1002)]
        ))
    assert rejected.status_code == 422
