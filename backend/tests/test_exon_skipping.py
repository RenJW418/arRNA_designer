from app.modules.exon_skipping import design_exon_skipping, reverse_complement_rna, scan_ese
from app.schemas.exon_skipping import ExonSkippingDesignRequest


def request(upstream: str, exon: str, downstream: str, length: int = 151):
    return ExonSkippingDesignRequest(
        upstream_intron=upstream, exon=exon, downstream_intron=downstream, arrna_length=length
    )


def test_rna_reverse_complement():
    assert reverse_complement_rna("ATGC") == "GCAU"


def test_short_exon_generates_only_centered_sa_candidate():
    result = design_exon_skipping(request("T" * 98 + "AG", "A" * 50, "C" * 100))
    assert result.length_class == "short"
    assert [candidate.kind for candidate in result.candidates] == ["sa"]
    candidate = result.candidates[0]
    assert len(candidate.arrna_sequence) == 151
    assert candidate.mismatch_target_position == 99
    assert candidate.mismatch_arrna_position == 76
    assert candidate.arrna_sequence[75] == "C"
    assert set(candidate.arrna_sequence) <= set("ACGU")


def test_short_upstream_keeps_center_and_returns_106_nt():
    result = design_exon_skipping(request("T" * 30 + "AG", "C" * 100, "G" * 100))
    candidate = result.candidates[0]
    assert len(candidate.arrna_sequence) == 106
    assert candidate.mismatch_arrna_position == 76


def test_noncanonical_sa_only_generates_ese_candidates():
    result = design_exon_skipping(request("T" * 100, "AAAAAAC" * 30, "C" * 100))
    assert not result.sa_is_canonical
    assert all(candidate.kind == "ese" for candidate in result.candidates)


def test_short_noncanonical_exon_still_generates_ese_candidate():
    result = design_exon_skipping(request("T" * 100, "CACACGA" * 8, "C" * 100))
    assert result.length_class == "short"
    assert result.candidates and all(candidate.kind == "ese" for candidate in result.candidates)


def test_ese_hits_require_an_a():
    assert all("A" in hit.sequence for hit in scan_ese("C" * 50))


def test_even_length_uses_left_middle_coordinate():
    result = design_exon_skipping(request("T" * 98 + "AG", "C" * 100, "G" * 100, 150))
    candidate = result.candidates[0]
    assert candidate.target_sequence[74] == "A"
    assert candidate.mismatch_arrna_position == 76
