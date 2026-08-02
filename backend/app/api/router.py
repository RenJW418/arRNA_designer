from fastapi import APIRouter, HTTPException, status

from app.schemas.task import TaskCreate, TaskCreated
from app.services.analysis import AnalysisNotImplementedError, PlaceholderAnalysisEngine

api_router = APIRouter()
engine = PlaceholderAnalysisEngine()


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
