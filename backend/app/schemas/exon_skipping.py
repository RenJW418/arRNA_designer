from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.schemas.design import DesignProvenance


class ExonSkippingDesignRequest(BaseModel):
    upstream_intron: str = Field(min_length=1)
    exon: str = Field(min_length=1)
    downstream_intron: str = Field(min_length=1)
    arrna_length: int = Field(default=151, ge=21, le=1001)
    transcript: str | None = None
    exon_number: int | None = None

    @field_validator("upstream_intron", "exon", "downstream_intron")
    @classmethod
    def validate_sequence(cls, value: str) -> str:
        sequence = "".join(value.upper().split()).replace("U", "T")
        if not sequence or set(sequence) - set("ACGT"):
            raise ValueError("Only A, C, G, T or U are supported")
        return sequence


class EseHit(BaseModel):
    matrix: str
    score: float
    start: int
    end: int
    sequence: str
    a_positions: list[int]


class EseRegion(BaseModel):
    start: int
    end: int
    a_positions: list[int]
    matrices: list[str]
    peak_score: float


class ArrnaCandidate(BaseModel):
    id: str
    kind: Literal["sa", "ese"]
    label: str
    target_sequence: str
    arrna_sequence: str
    global_start: int
    global_end: int
    exon_start: int
    exon_end: int
    mismatch_target_position: int | None = None
    mismatch_arrna_position: int | None = None
    covered_a_positions: list[int] = []
    covered_region_indices: list[int] = []


class ExonSkippingNormalizedInput(BaseModel):
    upstream_intron: str
    exon: str
    downstream_intron: str
    combined_length: int
    coordinate_system: Literal["concatenated_sequence_1_based"] = (
        "concatenated_sequence_1_based"
    )


class ExonSkippingDesignResponse(BaseModel):
    schema_version: Literal["1.0"] = "1.0"
    application: Literal["exon_skipping"] = "exon_skipping"
    normalized_input: ExonSkippingNormalizedInput
    normalized_upstream_intron: str
    normalized_exon: str
    normalized_downstream_intron: str
    arrna_length: int
    exon_length: int
    length_class: Literal["short", "medium", "long"]
    sa_is_canonical: bool
    warnings: list[str]
    ese_hits: list[EseHit]
    ese_regions: list[EseRegion]
    candidates: list[ArrnaCandidate]
    transcript: str | None = None
    exon_number: int | None = None
    provenance: DesignProvenance


class NcbiExonRequest(BaseModel):
    species: str = Field(min_length=1)
    gene: str = Field(min_length=1)
    exon_number: int = Field(ge=2)
    flank_length: int = Field(default=151, ge=21, le=1001)


class NcbiExonResponse(BaseModel):
    species: str
    gene: str
    transcript: str
    transcript_name: str
    selection: Literal["MANE Select", "longest protein-coding"]
    exon_number: int
    exon_count: int
    genomic_accession: str
    orientation: Literal["plus", "minus"]
    upstream_intron: str
    exon: str
    downstream_intron: str


class NcbiCodingSequenceRequest(BaseModel):
    species: str = Field(min_length=1)
    gene: str = Field(min_length=1)


class NcbiCodingSequenceResponse(BaseModel):
    species: str
    gene: str
    transcript: str
    transcript_name: str
    selection: Literal["MANE Select", "longest protein-coding"]
    cds_sequence: str
    cds_start: int
    cds_end: int
