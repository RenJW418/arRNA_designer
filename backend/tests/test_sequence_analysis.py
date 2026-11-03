import math

import httpx
import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)
ANNOTATIONS = "/api/v1/analysis/annotations"
RNAFOLD = "/api/v1/analysis/rnafold"


def test_annotations_normalize_single_fasta_and_preserve_user_evidence() -> None:
    response = client.post(ANNOTATIONS, json={
        "sequence": ">one transcript\nacgu acgu\n",
        "regions": [{"start": 2, "end": 5, "kind": "exon", "label": "Target exon"}],
    })
    assert response.status_code == 200
    data = response.json()
    assert data["sequence"] == "ACGTACGT"
    user = [feature for feature in data["features"] if feature["evidence"] == "user"]
    assert len(user) == 1
    assert (user[0]["start"], user[0]["end"], user[0]["kind"]) == (2, 5, "exon")
    assert user[0]["label"] == "Target exon"
    assert user[0]["source"]
    assert data["reference_accession"] is None


@pytest.mark.parametrize("sequence", ["", "ACGN", "ACG1", ">a\nACGT\n>b\nACGT", "A" * 20001],
                         ids=["empty", "ambiguous", "digit", "multiple-fasta", "over-limit"])
def test_annotations_reject_invalid_or_unbounded_input(sequence: str) -> None:
    assert client.post(ANNOTATIONS, json={"sequence": sequence}).status_code == 422


@pytest.mark.parametrize("region", [
    {"start": 0, "end": 3, "kind": "exon"},
    {"start": 5, "end": 3, "kind": "exon"},
    {"start": 2, "end": 9, "kind": "intron"},
])
def test_annotations_reject_regions_outside_normalized_coordinates(region: dict) -> None:
    response = client.post(ANNOTATIONS, json={"sequence": "ACGTACGT", "regions": [region]})
    assert response.status_code == 422


@pytest.mark.parametrize("accession", ["https://example.com", "NM_000546 OR TP53", "1,2", "TP53"])
def test_annotations_require_one_exact_accession(accession: str) -> None:
    response = client.post(ANNOTATIONS, json={
        "sequence": "ACGTACGT", "transcript_accession": accession,
    })
    assert response.status_code == 422


def test_annotation_scan_includes_a_free_sr_motif_without_changing_design_scan() -> None:
    # The SRp55 score is 1.22 + .72 + 1.48 + .72 + 1.02 + .98 = 6.14.
    response = client.post(ANNOTATIONS, json={"sequence": "TGCGTC"})
    assert response.status_code == 200
    data = response.json()
    predicted = [f for f in data["features"] if f["evidence"] == "predicted"]
    hit = next(f for f in predicted if "SRp55" in f["label"])
    assert (hit["start"], hit["end"], hit["score"]) == (1, 6, 6.14)
    assert hit["protein"] and hit["source"] and hit["source_url"]
    assert "five" in data["prediction_method"].lower()
    from app.modules.exon_skipping import scan_ese
    assert scan_ese("TGCGTC") == []


@pytest.mark.parametrize("payload", [
    {"sequence": "ACGU"}, {"sequence": "A" * 1002}, {"sequence": "ACGUN"},
    {"sequence": "ACGUACGU", "topology": "unknown"},
    {"sequence": "ACGUACGU", "temperature": -1},
    {"sequence": "ACGUACGU", "temperature": 101},
])
def test_fold_rejects_unsupported_input(payload: dict) -> None:
    assert client.post(RNAFOLD, json=payload).status_code == 422


@pytest.mark.parametrize("topology", ["linear", "circular"])
def test_real_fold_returns_consistent_structure_probabilities_and_coordinates(topology: str) -> None:
    sequence = "GGGAAACCCGGGAAACCC"
    response = client.post(RNAFOLD, json={"sequence": sequence, "topology": topology})
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["sequence"] == sequence
    assert len(data["structure"]) == len(sequence)
    assert set(data["structure"]) <= set(".()")
    assert len(data["unpaired_probabilities"]) == len(data["coordinates"]) == len(sequence)
    assert all(0 <= p <= 1 for p in data["unpaired_probabilities"])
    assert math.isclose(data["mean_unpaired_probability"],
                        sum(data["unpaired_probabilities"]) / len(sequence), abs_tol=1e-10)
    assert math.isclose(data["mfe_unpaired_fraction"],
                        data["structure"].count(".") / len(sequence), abs_tol=1e-10)
    assert all(math.isfinite(point[axis]) for point in data["coordinates"] for axis in ("x", "y"))
    assert data["ensemble_free_energy"] <= data["mfe"] + 1e-5
    assert data["ensemble_diversity"] >= 0
    assert data["engine"] == "ViennaRNA"
    assert data["version"] and data["topology"] == topology and data["temperature"] == 37
    stack = []
    expected_pairs = set()
    for index, symbol in enumerate(data["structure"], start=1):
        if symbol == "(":
            stack.append(index)
        elif symbol == ")":
            expected_pairs.add((stack.pop(), index))
    assert not stack
    assert {(pair["i"], pair["j"]) for pair in data["pairs"]} == expected_pairs
    assert all(0 <= pair["probability"] <= 1 for pair in data["pairs"])
    if topology == "linear":
        assert data["mfe"] < 0 and expected_pairs
        assert any(0 < p < 1 for p in data["unpaired_probabilities"])


def test_fold_fasta_normalization_and_temperature_are_used() -> None:
    response = client.post(RNAFOLD, json={"sequence": ">guide\ngggtttccc", "temperature": 25})
    assert response.status_code == 200
    assert response.json()["sequence"] == "GGGUUUCCC"
    assert response.json()["temperature"] == 25


def reference_xml(sequence: str, accession: str = "NM_000001.2", location: str = "3..10") -> str:
    return f"""<?xml version="1.0"?>
    <GBSet><GBSeq>
      <GBSeq_accession-version>{accession}</GBSeq_accession-version>
      <GBSeq_sequence>{sequence.lower()}</GBSeq_sequence>
      <GBSeq_feature-table><GBFeature>
        <GBFeature_key>exon</GBFeature_key><GBFeature_location>{location}</GBFeature_location>
        <GBFeature_intervals><GBInterval><GBInterval_from>3</GBInterval_from>
          <GBInterval_to>10</GBInterval_to><GBInterval_accession>{accession}</GBInterval_accession>
        </GBInterval></GBFeature_intervals>
        <GBFeature_quals><GBQualifier><GBQualifier_name>number</GBQualifier_name>
          <GBQualifier_value>2</GBQualifier_value></GBQualifier></GBFeature_quals>
      </GBFeature></GBSeq_feature-table>
    </GBSeq></GBSet>"""


@pytest.fixture
def ncbi_response(monkeypatch):
    """Replace only network transport: parsing, accession validation and mapping remain real."""
    real_client = httpx.Client

    def setup(body: str | Exception, status: int = 200):
        def handler(request):
            # Submitted bases must never be included in the reference service request.
            assert request.url.host == "eutils.ncbi.nlm.nih.gov"
            assert request.url.params["id"] == "NM_000001.2"
            assert set(request.url.params) <= {"id", "db", "rettype", "retmode", "tool"}
            assert not request.content
            if isinstance(body, Exception):
                raise body
            return httpx.Response(status, stream=httpx.ByteStream(body.encode()))
        monkeypatch.setattr(httpx, "Client", lambda **kwargs: real_client(
            transport=httpx.MockTransport(handler), **kwargs,
        ))
    return setup


def test_reference_features_map_to_unique_local_coordinates(ncbi_response) -> None:
    ncbi_response(reference_xml("TTACGTACGTTT"))
    response = client.post(ANNOTATIONS, json={
        "sequence": "ACGTACGT", "transcript_accession": "NM_000001.2",
    })
    assert response.status_code == 200
    data = response.json()
    features = [f for f in data["features"] if f["evidence"] == "reference"]
    assert len(features) == 1
    assert (features[0]["start"], features[0]["end"]) == (1, 8)
    assert features[0]["kind"] == "exon"
    assert "NM_000001.2" in features[0]["source"]
    assert data["reference_accession"] == "NM_000001.2"


@pytest.mark.parametrize("body", [
    reference_xml("ACGTACGTACGT"),  # Matches overlap at offsets 0 and 4.
    reference_xml("TTTTTTTTTTTT"),
    reference_xml("TTACGTACGTTT", accession="NM_000002.2"),
    reference_xml("TTACGTACGTTT", accession="NM_000001.3"),
    "<GBSet><broken>",
    '<!DOCTYPE foo [<!ENTITY x "ACGTACGT">]><GBSet>&x;</GBSet>',
], ids=["ambiguous", "no-match", "wrong-accession", "wrong-version", "malformed", "entity"])
def test_reference_failures_never_emit_reference_evidence_and_keep_user_regions(ncbi_response, body) -> None:
    ncbi_response(body)
    response = client.post(ANNOTATIONS, json={
        "sequence": "ACGTACGT", "transcript_accession": "NM_000001.2",
        "regions": [{"start": 1, "end": 8, "kind": "exon"}],
    })
    assert response.status_code == 200
    data = response.json()
    assert not [f for f in data["features"] if f["evidence"] == "reference"]
    assert len([f for f in data["features"] if f["evidence"] == "user"]) == 1
    assert data["warnings"] and data["reference_accession"] is None


def test_reference_network_failure_is_explicit_but_annotations_remain_usable(ncbi_response) -> None:
    ncbi_response(httpx.ReadTimeout("network timeout"))
    response = client.post(ANNOTATIONS, json={
        "sequence": "TGCGTC", "transcript_accession": "NM_000001.2",
    })
    assert response.status_code == 200
    data = response.json()
    assert data["warnings"] and data["reference_accession"] is None
    assert any(f["evidence"] == "predicted" for f in data["features"])


def test_reference_boundary_is_clipped_to_submitted_fragment(ncbi_response) -> None:
    ncbi_response(reference_xml("TTACGTACGTTT"))
    response = client.post(ANNOTATIONS, json={
        "sequence": "GTAC", "transcript_accession": "NM_000001.2",
    })
    assert response.status_code == 200
    features = [f for f in response.json()["features"] if f["evidence"] == "reference"]
    assert [(f["start"], f["end"]) for f in features] == [(1, 4)]
    assert "clip" in features[0]["description"].lower()


def test_reference_response_size_is_bounded(ncbi_response) -> None:
    ncbi_response(" " * (5_000_001))
    response = client.post(ANNOTATIONS, json={
        "sequence": "TGCGTC", "transcript_accession": "NM_000001.2",
    })
    assert response.status_code == 200
    assert response.json()["warnings"] and response.json()["reference_accession"] is None


def test_slow_reference_stream_checks_deadline_before_buffering_all_chunks(monkeypatch) -> None:
    from app.modules import sequence_analysis
    clock = {"seconds": 0}
    real_client = httpx.Client

    class SlowStream(httpx.SyncByteStream):
        def __iter__(self):
            for _ in range(100):
                clock["seconds"] += 1
                yield b" "

    monkeypatch.setattr(sequence_analysis, "monotonic", lambda: clock["seconds"])
    monkeypatch.setattr(httpx, "Client", lambda **kwargs: real_client(
        transport=httpx.MockTransport(lambda request: httpx.Response(200, stream=SlowStream())),
        **kwargs,
    ))
    response = client.post(ANNOTATIONS, json={
        "sequence": "TGCGTC", "transcript_accession": "NM_000001.2",
    })
    assert response.status_code == 200
    assert response.json()["warnings"] and response.json()["reference_accession"] is None
    assert clock["seconds"] <= 13


def test_missing_fold_engine_returns_explicit_unavailable_error(monkeypatch) -> None:
    from app.modules import rna_structure
    def unavailable(name):
        raise ImportError("engine not installed")
    monkeypatch.setattr(rna_structure, "import_module", unavailable)
    response = client.post(RNAFOLD, json={"sequence": "GGGAAACCC"})
    assert response.status_code == 503
    assert "unavailable" in response.json()["detail"].lower()


@pytest.mark.parametrize("topology", ["linear", "circular"])
def test_minimum_length_unpairable_rna_has_unit_unpaired_probabilities(topology) -> None:
    response = client.post(RNAFOLD, json={"sequence": "AAAAA", "topology": topology})
    assert response.status_code == 200
    data = response.json()
    assert data["structure"] == "....." and data["pairs"] == []
    assert data["unpaired_probabilities"] == [1.0] * 5
    if topology == "linear":
        assert data["mfe"] == 0
