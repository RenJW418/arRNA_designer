from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator


class RuleCitation(BaseModel):
    label: str
    doi: str | None = None


class RuleSetInfo(BaseModel):
    id: str
    version: str
    citations: list[RuleCitation] = Field(default_factory=list)


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
    adar_environment: Literal["ADAR1", "ADAR2"] = "ADAR1"
    reference: NormalReferenceSnapshot | None = None

    @field_validator("sequence")
    @classmethod
    def normalize_sequence(cls, value: str) -> str:
        sequence = "".join(value.upper().split()).replace("U", "T")
        if not sequence or set(sequence) - set("ACGT"):
            raise ValueError("Only A, C, G, T or U are supported")
        if len(sequence) % 3:
            raise ValueError("Coding-sequence length must be divisible by 3")
        return sequence

    @model_validator(mode="after")
    def validate_target(self) -> "NormalEditingRequest":
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


class EditingSiteResult(BaseModel):
    position: int
    codon: str
    edited_codon: str
    amino_acid: str
    edited_amino_acid: str
    category: Literal["blocked_ga", "synonymous", "editable"]


class PairingRequirements(BaseModel):
    adar_environment: Literal["ADAR1", "ADAR2"]
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
