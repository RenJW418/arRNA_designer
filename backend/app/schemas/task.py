from enum import StrEnum
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, Field, model_validator


class InputMode(StrEnum):
    SEQUENCE = "sequence"
    GENE = "gene"


class ApplicationType(StrEnum):
    NORMAL_EDITING = "normal_editing"
    EXON_SKIPPING = "exon_skipping"


class CoordinateSystem(StrEnum):
    SEQUENCE = "sequence"
    GENOMIC = "genomic"
    TRANSCRIPT = "transcript"
    CDS = "cds"


class ReferenceInput(BaseModel):
    species_taxon_id: int
    gene_id: str
    assembly_accession: str
    transcript_accession: str


class TargetPosition(BaseModel):
    coordinate_system: CoordinateSystem
    position: Annotated[int, Field(gt=0)]
    indexing: Literal["one_based"] = "one_based"
    strand: Literal["+", "-"]
    exon_id: str | None = None


class TaskCreate(BaseModel):
    mode: InputMode
    application_type: ApplicationType
    sequence: str | None = Field(default=None, max_length=200_000)
    reference: ReferenceInput | None = None
    target: TargetPosition
    parameters: dict[str, object] = Field(default_factory=dict)

    @model_validator(mode="after")
    def validate_mode_payload(self) -> "TaskCreate":
        if self.mode is InputMode.SEQUENCE and not self.sequence:
            raise ValueError("Sequence mode requires sequence.")
        if self.mode is InputMode.GENE and self.reference is None:
            raise ValueError("Gene mode requires a versioned reference.")
        if self.application_type is ApplicationType.EXON_SKIPPING and not self.target.exon_id:
            raise ValueError("Exon skipping requires exon_id.")
        return self


class TaskCreated(BaseModel):
    task_id: UUID
    status: Literal["queued"]
    status_url: str
    expires_at: str
