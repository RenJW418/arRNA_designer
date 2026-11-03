"""Public analysis contracts; every sequence coordinate is 1-based inclusive."""

import re
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


def normalize_sequence(value: str, *, maximum: int, minimum: int = 1, rna: bool = False) -> str:
    # Bound raw text as well as normalized bases, including FASTA header/whitespace.
    if len(value) > maximum * 4 + 1024:
        raise ValueError("Sequence text is too large")
    lines = value.strip().splitlines()
    if lines and lines[0].startswith(">"):
        lines = lines[1:]
    if any(">" in line for line in lines):
        raise ValueError("Provide one sequence or one FASTA record")
    sequence = "".join("".join(lines).upper().split()).replace("U", "T")
    if not minimum <= len(sequence) <= maximum:
        raise ValueError(f"Sequence must contain {minimum}–{maximum} bases")
    if set(sequence) - set("ACGT"):
        raise ValueError("Only unambiguous A, C, G, T or U bases are supported")
    return sequence.replace("T", "U") if rna else sequence


class UserRegion(BaseModel):
    start: int = Field(ge=1, strict=True)
    end: int = Field(ge=1, strict=True)
    kind: str = Field(min_length=1, max_length=64)
    label: str | None = Field(default=None, max_length=160)


class AnnotationRequest(BaseModel):
    sequence: str
    transcript_accession: str | None = Field(default=None, max_length=40)
    regions: list[UserRegion] = Field(default_factory=list, max_length=200)

    @field_validator("sequence")
    @classmethod
    def sequence_input(cls, value: str) -> str:
        return normalize_sequence(value, maximum=20_000)

    @field_validator("transcript_accession")
    @classmethod
    def exact_accession(cls, value: str | None) -> str | None:
        if value is None or not value.strip():
            return None
        accession = value.strip().upper()
        if not re.fullmatch(r"[A-Z]{1,6}_?\d{5,12}(?:\.\d{1,6})?", accession):
            raise ValueError("Provide one exact NCBI nucleotide accession, optionally with version")
        return accession

    @model_validator(mode="after")
    def region_coordinates(self) -> "AnnotationRequest":
        for region in self.regions:
            if not region.start <= region.end <= len(self.sequence):
                raise ValueError("Regions must have start <= end within the normalized sequence")
        return self


class SequenceFeature(BaseModel):
    id: str
    start: int
    end: int
    kind: str
    label: str
    evidence: Literal["reference", "predicted", "user"]
    source: str
    description: str
    source_url: str | None = None
    score: float | None = None
    protein: str | None = None


class AnnotationResponse(BaseModel):
    sequence: str
    features: list[SequenceFeature]
    warnings: list[str]
    prediction_method: str
    reference_accession: str | None = None


class RnaFoldRequest(BaseModel):
    sequence: str
    topology: Literal["linear", "circular"] = "linear"
    temperature: float = Field(default=37.0, ge=0, le=100, allow_inf_nan=False)

    @field_validator("sequence")
    @classmethod
    def sequence_input(cls, value: str) -> str:
        return normalize_sequence(value, minimum=5, maximum=1001, rna=True)


class StructurePair(BaseModel):
    i: int
    j: int
    probability: float = Field(ge=0, le=1)


class StructureCoordinate(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)
    x: float
    y: float


class RnaFoldResponse(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)
    sequence: str
    structure: str
    mfe: float
    ensemble_free_energy: float
    ensemble_diversity: float
    unpaired_probabilities: list[float]
    mean_unpaired_probability: float
    mfe_unpaired_fraction: float
    pairs: list[StructurePair]
    coordinates: list[StructureCoordinate]
    engine: str
    version: str
    temperature: float
    topology: Literal["linear", "circular"]
