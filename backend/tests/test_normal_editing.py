import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.main import app
from app.modules.normal_editing import design_normal_editing
from app.schemas.design import NormalEditingRequest

client = TestClient(app)


def full_window_sequence() -> str:
    return "C" * 75 + "A" + "C" * 77


def test_normal_editing_request_normalizes_rna_and_whitespace():
    payload = NormalEditingRequest(
        sequence="aug auc aua",
        target_position=1,
        adar_environment="ADAR1",
    )

    assert payload.sequence == "ATGATCATA"


def test_normal_editing_request_rejects_non_coding_length():
    with pytest.raises(ValidationError, match="divisible by 3"):
        NormalEditingRequest(
            sequence="AAAA",
            target_position=1,
            adar_environment="ADAR1",
        )


def test_normal_editing_request_rejects_non_a_target():
    with pytest.raises(ValidationError, match="target position must identify an A"):
        NormalEditingRequest(
            sequence="ATGCCC",
            target_position=2,
            adar_environment="ADAR2",
        )


def test_design_normal_editing_returns_versioned_result():
    result = design_normal_editing(NormalEditingRequest(
        sequence=full_window_sequence(),
        target_position=76,
        adar_environment="ADAR1",
    ))

    assert result.schema_version == "1.0"
    assert result.normalized_input.coordinate_system == "sequence_1_based"
    assert result.provenance.engine.name == "leaper-arrna-engine"
    assert result.provenance.ruleset.id == "leaper-normal-editing"
    assert result.editing_site.position == 76
    assert result.candidates[0].arrna_sequence[75] == "C"


def test_full_window_design_returns_four_structural_variants():
    result = design_normal_editing(NormalEditingRequest(
        sequence=full_window_sequence(),
        target_position=76,
        adar_environment="ADAR2",
    ))

    assert [candidate.id for candidate in result.candidates] == [
        "baseline",
        "downstream-del10",
        "upstream-del28",
        "dual-deletion",
    ]
    assert len(result.candidates[0].arrna_sequence) == 151
    assert len(result.candidates[1].arrna_sequence) == 141
    assert len(result.candidates[2].arrna_sequence) == 123
    assert len(result.candidates[3].arrna_sequence) == 113
    assert result.pairing.is_satisfied


def test_normal_editing_endpoint_returns_authoritative_result():
    response = client.post("/api/v1/designs/normal-editing", json={
        "sequence": full_window_sequence(),
        "target_position": 76,
        "adar_environment": "ADAR1",
    })

    assert response.status_code == 200
    payload = response.json()
    assert payload["application"] == "normal_editing"
    assert payload["candidates"][0]["id"] == "baseline"
    assert payload["provenance"]["ruleset"]["version"] == "0.2.0"


@pytest.mark.parametrize('environment,upstream,downstream', [('ADAR1',4,25),('ADAR2',6,11)])
def test_protocol_binding_regions_are_sufficient(environment, upstream, downstream):
    sequence = 'C' * upstream + 'A' + 'C' * downstream
    sequence += 'C' * (-len(sequence) % 3)
    result = design_normal_editing(NormalEditingRequest(sequence=sequence, target_position=upstream+1, adar_environment=environment))
    assert result.pairing.is_satisfied
    assert result.candidates


@pytest.mark.parametrize('environment,upstream,downstream', [('ADAR1',20,6),('ADAR2',11,6)])
def test_missing_protocol_binding_coverage_returns_no_legal_candidates(environment, upstream, downstream):
    result = design_normal_editing(NormalEditingRequest(sequence='C'*upstream+'A'+'C'*downstream, target_position=upstream+1, adar_environment=environment))
    assert not result.pairing.is_satisfied
    assert result.candidates == []


def test_shorter_window_allows_external_bulges_with_ten_complementary_flanks():
    result = design_normal_editing(NormalEditingRequest(sequence='C'*68+'A'+'C'*54, target_position=69))
    assert [candidate.id for candidate in result.candidates] == ['baseline','downstream-del10','upstream-del28','dual-deletion']
    assert len(result.candidates[-1].arrna_sequence) == 85


def test_external_bulge_with_only_nine_distal_paired_bases_is_omitted():
    result = design_normal_editing(NormalEditingRequest(sequence='C'*67+'A'+'C'*52, target_position=68))
    assert [candidate.id for candidate in result.candidates] == ['baseline']


def test_adjustable_window_can_shift_and_extend_without_losing_binding_coverage():
    result = design_normal_editing(NormalEditingRequest(sequence='C'*120+'A'+'C'*122, target_position=121, window_start_relative=-30, window_end_relative=100))
    assert (result.window_start, result.window_end) == (91,221)
    assert len(result.candidates[0].arrna_sequence) == 131
    assert [candidate.id for candidate in result.candidates] == ['baseline','downstream-del10']


def test_optional_internal_bulge_preserves_baseline_control_and_a_c_mismatch():
    result = design_normal_editing(NormalEditingRequest(sequence=full_window_sequence(), target_position=76, include_internal_bulge=True))
    precise = next((c for c in result.candidates if c.id == 'dual-deletion-internal-del1'), None)
    assert precise is not None
    assert len(precise.arrna_sequence) == 112
    assert precise.aligned_guide[75] == 'C'
    assert precise.aligned_guide[79] == '-'
    assert result.candidates[0].deletion_coordinates == []


def test_window_must_contain_a0():
    with pytest.raises(ValidationError):
        NormalEditingRequest(sequence=full_window_sequence(), target_position=76, window_start_relative=1)


def test_general_rna_design_does_not_invent_a_codon_or_require_coding_length():
    response = client.post('/api/v1/designs/normal-editing', json={
        'sequence': 'C'*75+'A'+'C'*75, 'target_position':76, 'coding_context':False,
    })
    assert response.status_code == 200
    result = response.json()
    assert result['normalized_input']['coding_context'] is False
    assert result['editing_site']['category'] == 'rna'
    assert result['editing_site']['codon'] == ''
    assert result['editing_site']['amino_acid'] == ''
    assert len(result['candidates']) == 4
