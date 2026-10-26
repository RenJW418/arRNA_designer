from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator


class RuleCitation(BaseModel):
    label: str
    doi: str | None = None


class RuleSetInfo(BaseModel):
    id: str
    version: str
    citations: list[RuleCitation] = Field(default_factory=list)
    # Whether the ruleset's evidence has been peer-reviewed and published.
    status: Literal["published", "provisional", "unpublished-protocol"] = "unpublished-protocol"


class EngineInfo(BaseModel):
    name: str
    version: str


class DesignProvenance(BaseModel):
    engine: EngineInfo
    ruleset: RuleSetInfo


class NormalReferenceSnapshot(BaseModel):
    species: str
    gene: str
    transcript: str
    transcript_name: str
    selection: Literal["MANE Select", "longest protein-coding"]
    cds_start: int = Field(ge=1)
    cds_end: int = Field(ge=1)


class NormalEditingRequest(BaseModel):
    sequence: str = Field(min_length=3, max_length=200_000)
    target_position: int = Field(ge=1)
    adar_environment: Literal["combined", "ADAR1", "ADAR2"] = "combined"
    window_start_relative: int = Field(default=-75, le=0)
    window_end_relative: int = Field(default=75, ge=0)
    include_internal_bulge: bool = False
    coding_context: bool = True
    reference: NormalReferenceSnapshot | None = None

    @field_validator("adar_environment")
    @classmethod
    def normalize_adar_environment(cls, value: str) -> Literal["combined"]:
        """Accept archived clients while using the same design profile for every request."""
        return "combined"

    @field_validator("sequence")
    @classmethod
    def normalize_sequence(cls, value: str) -> str:
        sequence = "".join(value.upper().split()).replace("U", "T")
        if not sequence or set(sequence) - set("ACGT"):
            raise ValueError("Only A, C, G, T or U are supported")
        return sequence

    @model_validator(mode="after")
    def validate_target(self) -> "NormalEditingRequest":
        if self.coding_context and len(self.sequence) % 3:
            raise ValueError("Coding-sequence length must be divisible by 3")
        if self.target_position > len(self.sequence):
            raise ValueError("target position is outside the submitted sequence")
        if self.sequence[self.target_position - 1] != "A":
            raise ValueError("target position must identify an A")
        return self


class NormalizedSequenceInput(BaseModel):
    sequence: str
    length: int
    target_position: int
    coordinate_system: Literal["sequence_1_based"] = "sequence_1_based"
    window_start_relative: int = -75
    window_end_relative: int = 75
    include_internal_bulge: bool = False
    coding_context: bool = True


class EditingSiteResult(BaseModel):
    position: int
    codon: str
    edited_codon: str
    amino_acid: str
    edited_amino_acid: str
    category: Literal["blocked_ga", "synonymous", "editable", "rna"]


class BulgeSources(BaseModel):
    upstream: Literal["ADAR2"] = "ADAR2"
    downstream: Literal["ADAR1"] = "ADAR1"


class PairingRequirements(BaseModel):
    adar_environment: Literal["combined"]
    bulge_sources: BulgeSources = Field(default_factory=BulgeSources)
    required_upstream: int
    required_downstream: int
    is_satisfied: bool
    message: str


class NormalEditingCandidate(BaseModel):
    id: str
    label: str
    short_label: str
    description: str
    arrna_sequence: str
    aligned_guide: str
    deletion_coordinates: list[int] = Field(default_factory=list)


class NormalEditingResult(BaseModel):
    schema_version: Literal["1.0"] = "1.0"
    application: Literal["normal_editing"] = "normal_editing"
    normalized_input: NormalizedSequenceInput
    reference: NormalReferenceSnapshot | None = None
    editing_site: EditingSiteResult
    target_window: str
    window_start: int
    window_end: int
    target_index: int
    upstream_length: int
    downstream_length: int
    has_full_flanks: bool
    pairing: PairingRequirements
    candidates: list[NormalEditingCandidate]
    warnings: list[str] = Field(default_factory=list)
    provenance: DesignProvenance
