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
    assert payload["provenance"]["ruleset"]["version"] == "0.1.0"
