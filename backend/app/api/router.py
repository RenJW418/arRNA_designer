from fastapi import APIRouter, HTTPException, status

from app.modules.exon_skipping import design_exon_skipping
from app.modules.ncbi import NcbiLookupError, resolve_ncbi_coding_sequence, resolve_ncbi_exon
from app.schemas.exon_skipping import (
    ExonSkippingDesignRequest,
    ExonSkippingDesignResponse,
    NcbiCodingSequenceRequest,
    NcbiCodingSequenceResponse,
    NcbiExonRequest,
    NcbiExonResponse,
)
from app.schemas.task import TaskCreate, TaskCreated
from app.services.analysis import AnalysisNotImplementedError, PlaceholderAnalysisEngine

api_router = APIRouter()
engine = PlaceholderAnalysisEngine()


@api_router.post("/exon-skipping/design", response_model=ExonSkippingDesignResponse, tags=["exon-skipping"])
def create_exon_skipping_design(payload: ExonSkippingDesignRequest) -> ExonSkippingDesignResponse:
    return design_exon_skipping(payload)


@api_router.post("/references/ncbi/exon", response_model=NcbiExonResponse, tags=["references"])
def fetch_ncbi_exon(payload: NcbiExonRequest) -> NcbiExonResponse:
    try:
        return resolve_ncbi_exon(payload)
    except NcbiLookupError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@api_router.post(
    "/references/ncbi/coding-sequence",
    response_model=NcbiCodingSequenceResponse,
    tags=["references"],
)
def fetch_ncbi_coding_sequence(payload: NcbiCodingSequenceRequest) -> NcbiCodingSequenceResponse:
    try:
        return resolve_ncbi_coding_sequence(payload)
    except NcbiLookupError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@api_router.post("/inputs/validate", tags=["inputs"])
def validate_input(payload: TaskCreate) -> dict[str, object]:
    return {"valid": True, "normalized": payload.model_dump(mode="json")}


@api_router.post(
    "/tasks",
    response_model=TaskCreated,
    status_code=status.HTTP_202_ACCEPTED,
    tags=["tasks"],
)
def create_task(payload: TaskCreate) -> TaskCreated:
    try:
        return engine.submit(payload)
    except AnalysisNotImplementedError as exc:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail={
                "code": "ANALYSIS_NOT_IMPLEMENTED",
                "message": str(exc),
                "retryable": False,
            },
        ) from exc
