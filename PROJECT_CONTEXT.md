# Project Context and Handoff Memory

Last updated: 2026-08-02

This file is the durable project memory for contributors and future coding-agent sessions. It
records product intent, decisions, current implementation state, and known gaps. It contains no
credentials or private biological sequences.

## Product objective

Build a professional research-facing Web tool for LEAPER arRNA design. Users should be able to:

1. enter a DNA/RNA sequence directly, or choose a gene and species;
2. resolve versioned NCBI gene, transcript, exon, CDS, and genomic context;
3. choose a target editing position;
4. choose normal editing or exon skipping;
5. run a Python analysis pipeline;
6. inspect sequence/transcript visualizations and download reproducible results.

Reference products discussed during discovery:

- https://radars.bio
- https://search-synonymous-mutations.streamlit.app

The visual direction is a restrained Nature Methods-style scientific interface: warm white
background, charcoal typography, muted red emphasis, explicit reference context, responsive
layout, and no generic purple-gradient dashboard styling.

## Confirmed user decisions

- Repository root is this `website` directory.
- Raw user sequences must not be retained long-term.
- Default temporary-data upper bound is 24 hours; delete earlier after success/error when possible.
- Logs must never contain raw sequences or uploaded FASTA contents.
- The actual arRNA design algorithm is intentionally left unimplemented until supplied later.
- The codebase should remain clean, modular, and suitable for future commercialization.

## Architecture decision

Recommended production architecture:

```text
Cloudflare DNS and HTTPS
        |
React + TypeScript + Vite frontend
Cloudflare Pages
        |
FastAPI REST API
Google Cloud Run Service
        |
NCBI gateway + validation + coordinate normalization
        |
AnalysisEngine interface (algorithm pending)
        |
Supabase Postgres for non-sensitive task metadata
Cloud Run Jobs for reliable medium/long tasks
```

Why:

- React supports the transcript/exon/sequence interactions and a durable product UI better than
  Streamlit.
- FastAPI provides explicit schemas and keeps the Python scientific pipeline modular.
- Cloud Run can scale to zero and reuse the same container for HTTP and Jobs.
- Redis/Celery are deliberately excluded from the MVP. Introduce them only if advanced queue
  semantics become necessary.
- SQLite is for local development only; production containers are ephemeral.

Architecture records are in `docs/adr/`.

## Coordinate and reference rules

- The UI displays one-based coordinates.
- Every stored or transferred position must declare its coordinate system: `sequence`, `genomic`,
  `transcript`, or `cds`.
- Reference-derived designs must record NCBI Gene ID, taxonomy ID, assembly accession,
  chromosome accession where applicable, transcript accession **including version**, and strand.
- Gene mode should prefer MANE Select/RefSeq Select when available but must let the user inspect and
  choose alternatives.
- Exon skipping requires explicit exon choice plus exon boundary, splice donor/acceptor context,
  exon length, CDS phase, and predicted reading-frame effect.

## Current implementation

### Frontend

Location: `frontend/`

Implemented prototype:

- research-style landing page;
- Sequence Mode and Gene/Species Mode switch;
- nucleotide input normalization and basic IUPAC feedback;
- target-position input and local sequence-context highlighting;
- normal editing / exon skipping switch;
- DMD transcript/exon example visualization;
- explicit prototype result state explaining that the analysis algorithm is pending;
- responsive desktop/mobile styling.

Important: Gene/Species data is currently demonstrative UI data. It does not yet call NCBI.

### Backend

Location: `backend/`

Implemented:

- FastAPI application and `/health` endpoint;
- `/api/v1/inputs/validate` schema validation;
- `/api/v1/tasks` boundary;
- typed task, target, coordinate, reference, and application schemas;
- `AnalysisEngine` protocol and placeholder implementation;
- module boundaries for NCBI, sequence, coordinates, and exon logic;
- local frontend CORS configuration;
- Dockerfile and basic tests.

The task endpoint intentionally returns `ANALYSIS_NOT_IMPLEMENTED` until a scientifically validated
pipeline is integrated.

### Documentation

- `docs/ARCHITECTURE.md`: platform comparison and system architecture.
- `docs/PRODUCT_SPEC.md`: user flows and transcript/exon interaction design.
- `docs/DATA_AND_API.md`: coordinate model, entities, and REST contract.
- `docs/DEPLOYMENT.md`: Cloudflare/Cloud Run/domain/privacy operations.
- `docs/MVP_PLAN.md`: seven-day MVP and commercialization path.
- `docs/adr/`: accepted architectural decisions.

## Local development

Backend:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -e ".[dev]"
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8010
```

Frontend:

```powershell
cd frontend
npm install
npm run dev -- --port 5174 --strictPort
```

Port history: `5173` was already occupied on the original development computer by an unrelated
project, so LEAPER was tested on `5174`. Port `8000` was also occupied, so the API was tested on
`8010`. These are local circumstances, not production requirements.

## Validation history

At the time of initial scaffold:

- backend tests: 2 passed;
- Ruff checks: passed;
- frontend TypeScript/Vite production build: passed;
- npm audit: zero known vulnerabilities at that time;
- frontend and backend local health checks: HTTP 200;
- local browser/API CORS origin was validated.

Always rerun current checks; this section is history, not evidence that future commits pass.

## Next implementation priorities

1. Implement robust sequence normalization and validation with tests.
2. Implement the NCBI client with API key support, timeouts, retries, caching, and source-version
   records.
3. Parse transcript/exon/CDS structures into the unified coordinate model.
4. Replace demonstration transcript data with real NCBI responses.
5. Add coordinate-conversion tests, especially minus-strand and exon-boundary cases.
6. Add the scientifically validated arRNA algorithm behind `AnalysisEngine`.
7. Implement Postgres task state and automatic 24-hour cleanup.
8. Move medium/long tasks to Cloud Run Jobs.
9. Add result tables, provenance, CSV/JSON/FASTA downloads, error states, and end-to-end tests.
10. Add deployment automation only after cloud accounts, domain, and budgets are confirmed.

## Safety and product constraints

- Research use only; do not claim clinical or diagnostic validity.
- Do not silently guess transcript versions or coordinate systems.
- Do not send user sequences to analytics, error monitoring, or external APIs unless explicitly
  required and disclosed.
- Validate filenames, content, size, and nucleotide alphabet for uploads.
- Avoid shell command construction from biological inputs.
- Preserve reference and pipeline versions in every result for reproducibility.
- Free-hosting policies change; re-check official limits before deployment.

## Commercialization path

Planned evolution includes ORCID/email authentication, project and task history, team workspaces,
quotas, memberships, API keys and metering, paid batch processing, audit trails, and private
deployment. Retaining private sequences must remain opt-in and requires a new privacy/security
review.
