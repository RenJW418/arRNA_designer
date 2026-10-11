from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from app.schemas.design import DesignProvenance


class ExonReferenceSnapshot(BaseModel):
    transcript: str
    species: str | None = None
    gene: str | None = None
    genomic_accession: str | None = None
    orientation: Literal["plus", "minus"] | None = None
    exon_genomic_start: int | None = None
    exon_genomic_end: int | None = None
    exon_number: int | None = None
    selection: str | None = None


class ExonDesignSettings(BaseModel):
    evaluate_covered_ese: bool = False
    ese_mismatch_positions: list[int] = Field(default_factory=list)


class EseMatrixSetting(BaseModel):
    name: str
    threshold: float


class EsePredictionSettings(BaseModel):
    method: str = "ESEfinder 3.0"
    matrices: list[EseMatrixSetting]
    motif_filter: str = "above-threshold motifs containing A"
    region_merging: str = "overlapping motifs"
    coordinate_system: str = "exon_1_based"


class ExonSkippingDesignRequest(BaseModel):
    upstream_intron: str = Field(min_length=1)
    exon: str = Field(min_length=1)
    downstream_intron: str = Field(min_length=1)
    arrna_length: int = Field(default=151, ge=21, le=1001)
    transcript: str | None = None
    exon_number: int | None = None
    reference: ExonReferenceSnapshot | None = None
    evaluate_covered_ese: bool = False
    ese_mismatch_positions: list[int] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_mismatches(self) -> "ExonSkippingDesignRequest":
        for position in self.ese_mismatch_positions:
            if position < 1 or position > len(self.exon) or self.exon[position - 1] != "A":
                raise ValueError("ESE mismatch positions must identify exon adenosines (1-based)")
        self.ese_mismatch_positions = sorted(set(self.ese_mismatch_positions))
        return self

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
    covered_region_indices: list[int] = Field(default_factory=list)
    partially_covered_region_indices: list[int] = Field(default_factory=list)
    covered_hit_indices: list[int] = Field(default_factory=list)
    mismatch_exon_positions: list[int] = Field(default_factory=list)


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
    reference: ExonReferenceSnapshot | None = None
    design_settings: ExonDesignSettings
    prediction_settings: EsePredictionSettings


class NcbiExonRequest(BaseModel):
    species: str = Field(min_length=1)
    gene: str = Field(min_length=1)
    exon_number: int = Field(ge=2)
    flank_length: int = Field(default=151, ge=21, le=1001)
    transcript_accession: str | None = None


class NcbiExonResponse(BaseModel):
    species: str
    gene: str
    transcript: str
    transcript_name: str
    selection: Literal["MANE Select", "longest protein-coding", "user-selected transcript"]
    exon_number: int
    exon_count: int
    genomic_accession: str
    orientation: Literal["plus", "minus"]
    exon_genomic_start: int
    exon_genomic_end: int
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
    selection: Literal["MANE Select", "longest protein-coding", "user-selected transcript"]
    cds_sequence: str
    cds_start: int
    cds_end: int
