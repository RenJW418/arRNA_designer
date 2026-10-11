import pytest
from pydantic import ValidationError
from app.modules.exon_skipping import design_exon_skipping
from app.modules.ncbi import _get_gene_product, NcbiLookupError
from app.schemas.exon_skipping import ExonSkippingDesignRequest


def design(exon, length=151, **options):
    return design_exon_skipping(ExonSkippingDesignRequest(
        upstream_intron='T'*150+'AG', exon=exon, downstream_intron='C'*151,
        arrna_length=length, **options))


@pytest.mark.parametrize('n,want', [(69,'short'),(70,'medium'),(75,'medium'),(150,'medium'),(151,'long')])
def test_protocol_categories_do_not_change_with_guide_length(n,want):
    for length in (100,151,200):
        assert design('C'*n,length).length_class == want


def test_sa_covered_motifs_are_not_automatically_given_redundant_guides():
    result=design('CACACGA'*10+'T'*30)
    assert result.ese_regions
    assert [c.kind for c in result.candidates] == ['sa']


def test_short_exon_can_evaluate_sa_covered_ese_when_requested():
    result=design('CACACGA'*8,evaluate_covered_ese=True)
    assert [c.kind for c in result.candidates] == ['sa','ese']


def test_ese_candidates_cover_complete_regions_when_the_region_fits():
    result=design('CACACGA'*15)
    region=result.ese_regions[0]
    candidate=next(c for c in result.candidates if c.kind=='ese')
    assert candidate.exon_start <= region.start
    assert candidate.exon_end >= region.end


def test_long_ese_region_is_split_without_calling_partial_regions_full():
    result=design('CACACGA'*50)
    ese=[c for c in result.candidates if c.kind=='ese']
    assert len(ese)>1
    for c in ese:
        assert c.covered_region_indices == []
        assert c.partially_covered_region_indices == [1]
        assert c.covered_hit_indices
        for i in c.covered_hit_indices:
            hit=result.ese_hits[i-1]
            assert c.exon_start <= hit.start <= hit.end <= c.exon_end


def test_optional_ese_mismatch_only_changes_selected_adenosine():
    result=design('CACACGA'*15,ese_mismatch_positions=[2])
    c=next(c for c in result.candidates if c.kind=='ese')
    target_offset=len(result.normalized_upstream_intron)+2-c.global_start
    assert c.arrna_sequence[len(c.arrna_sequence)-1-target_offset] == 'C'
    assert c.mismatch_exon_positions == [2]


@pytest.mark.parametrize('positions', [[1],[999],[0]])
def test_ese_mismatch_coordinates_must_identify_exon_adenosines(positions):
    with pytest.raises(ValidationError):
        design('CACACGA'*15,ese_mismatch_positions=positions)


def test_result_records_design_and_prediction_settings():
    r=design('CACACGA'*15,evaluate_covered_ese=True)
    assert r.design_settings.evaluate_covered_ese is True
    assert r.prediction_settings.method == 'ESEfinder 3.0'
    assert len(r.prediction_settings.matrices)==5
    assert r.prediction_settings.matrices[0].threshold == 1.956


def test_explicit_transcript_selects_requested_isoform_from_ncbi_report():
    import httpx
    report={'reports':[{'product':{'transcripts':[
        {'accession_version':'NM_001.1','type':'PROTEIN_CODING','cds':{'range':[{'begin':1,'end':30}]},'select_category':'MANE_SELECT','length':30},
        {'accession_version':'NM_002.2','type':'PROTEIN_CODING','cds':{'range':[{'begin':1,'end':60}]},'length':60}
    ]}}]}
    with httpx.Client(transport=httpx.MockTransport(lambda req:httpx.Response(200,json=report))) as client:
        _, transcript, selection=_get_gene_product(client,'9606','GENE',transcript_accession='NM_002.2')
        assert transcript['accession_version']=='NM_002.2'
        assert selection=='user-selected transcript'
        with pytest.raises(NcbiLookupError):
            _get_gene_product(client,'9606','GENE',transcript_accession='NM_002.1')


def test_sa_candidate_records_full_and_partial_ese_coverage():
    result = design('CACACGA'*10+'T'*30)
    assert result.candidates[0].covered_region_indices == [1]
    assert result.candidates[0].covered_hit_indices
    partial = design('CACACGA'*15)
    assert partial.candidates[0].covered_region_indices == []
    assert partial.candidates[0].partially_covered_region_indices == [1]
