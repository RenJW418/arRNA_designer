from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.core.config import settings

app = FastAPI(
    title="LEAPER arRNA Designer API",
    version="0.1.0",
    description=(
        "Generate reproducible LEAPER arRNA candidates for normal RNA editing and "
        "exon skipping. Design responses include the normalized input and provenance."
    ),
    docs_url="/docs",
    openapi_url=f"{settings.api_prefix}/openapi",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5173", "http://localhost:5173"],
    allow_origin_regex=(
        r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$"
        if settings.app_env != "production"
        else None
    ),
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(api_router, prefix=settings.api_prefix)


@app.get("/health", tags=["operations"])
def health() -> dict[str, str]:
    return {"status": "ok", "service": "leaper-arrna-api"}
