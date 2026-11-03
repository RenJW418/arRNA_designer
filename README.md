# LEAPER arRNA Designer

LEAPER arRNA Designer implements normal RNA-editing designs, SA/ESE exon-skipping
designs and experimental-feedback refinement in a React/TypeScript interface with
a Python/FastAPI API. Scientific design instructions follow the **author-provided,
fixed Nature Protocols final manuscript**. Its journal acceptance/publication
status is unverified. See [protocol alignment](docs/NATURE_PROTOCOL_ALIGNMENT.md)
for coordinates, defaults, the protocol's internal 5/10-nt flank discrepancy and
the conservative 10-nt implementation.

设计原则一切以固定的 Nature Protocols final 为准。网站的结构搜索评分是定性软件
启发式；示例、软件测试和已有来源筛选不能证明新候选的编辑或外显子跳跃效率。

## Local development

Use Python 3.12 or later and Node.js 22.18 or later with npm. Vite requires a
[supported Node.js version](https://vite.dev/guide/); the test command also uses
Node's [TypeScript type stripping](https://nodejs.org/api/typescript.html).
Install dependencies from the checked-in Python project and npm lockfile.
The backend project includes the ViennaRNA Python bindings (`ViennaRNA>=2.7.2,<3`)
for local RNA folding and `defusedxml>=0.7.1,<1` for bounded NCBI XML parsing.
No separate RNAfold executable or external folding service is required.

From `website/`, start the backend in one terminal:

```bash
cd backend
python3 -m venv .venv
.venv/bin/python -m pip install -e '.[dev]'
.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8010
```

In a second terminal, also starting from `website/`:

```bash
cd frontend
npm ci
npm run dev -- --port 5173
```

Open <http://127.0.0.1:5173/>. The development frontend proxies `/api` and `/docs`
to backend port **8010**. Backend health is <http://127.0.0.1:8010/health>, Swagger
is <http://127.0.0.1:8010/docs>, and the actual schema route is
<http://127.0.0.1:8010/api/v1/openapi>. If port 5173 is occupied, Vite reports the
port it selected. On Windows, use `.venv\Scripts\python.exe` in place of
`.venv/bin/python`.

Run checks in their respective directories:

```bash
# backend/
.venv/bin/python -m pytest
```

```bash
# frontend/
npm test
npm run build
```

## Docker configurations

Copy `.env.example` to a local `.env` before using Compose. The default
`docker-compose.yml` starts **only the backend**, at port 8000. It does not start
the website, and its port differs from the frontend's development proxy target.
Use the two-terminal setup above for the documented development workflow.

The complete frontend/backend HTTP stack is defined separately. From `website/`,
set `APP_ENV=production` in your local `.env`, then run:

```bash
docker compose -f docker-compose.prod.yml up --build -d
```

This serves the application at <http://127.0.0.1:8008/>, including `/health`,
`/docs` and `/api/v1/openapi`. This configuration provides HTTP on port 8008.
The [optional HTTPS/443 configuration](docs/NAR_HTTPS_OPTIONAL.md) requires an
operator-supplied domain/upstream and actual certificate/public-access
verification. Preparing configuration does not establish a deployed TLS service.

## API, examples and scientific scope

The public API provides six POST services: normal design, exon-skipping design,
NCBI CDS lookup, NCBI exon lookup, sequence annotations and RNA structure analysis.
The live [OpenAPI schema](http://127.0.0.1:8010/api/v1/openapi) contains the current
request and response contracts. Refinement runs in the browser. The legacy
generic task route returns 501; the hidden input-validation route only validates
input and does not run an analysis.

| Analysis endpoint | Input and bounds | Result |
| --- | --- | --- |
| `POST /api/v1/analysis/annotations` | `sequence`: 1–20,000 bases; optional `transcript_accession`; optional `regions`: up to 200 `{start,end,kind,label?}` objects | Normalized sequence, sourced features with `user`, `predicted` or `reference` evidence, warnings, prediction method and resolved reference accession |
| `POST /api/v1/analysis/rnafold` | `sequence`: 5–1001 bases; optional `topology`: `linear` (default) or `circular`; optional `temperature`: 0–100 °C (default 37) | MFE dot-bracket structure and energy, ensemble free energy/diversity, per-base and mean unpaired probability, MFE unpaired fraction, MFE pairs with ensemble probabilities, plot coordinates and engine/version metadata |

Both endpoints accept plain sequence or a single FASTA record, remove whitespace,
and reject ambiguous bases or multiple records. Annotation output uses T;
folding output uses U. Feature coordinates and pair indices are 1-based;
coordinate and probability arrays follow normalized sequence order. Invalid
requests return HTTP 422. Folding also returns 422 when the engine cannot produce
a valid result, or 503 when ViennaRNA is unavailable or its per-process capacity
is busy.

The annotation scan uses the existing five ESEfinder matrices and thresholds,
including motifs without A; it reports predicted SR-protein motifs. User regions
remain user evidence. An optional accession retrieves one NCBI record and assigns
reference features only after verifying a unique exact forward sequence match
locally. Versioned accessions must match the requested version; unversioned
accessions report the resolved version. Failed retrieval, mismatches and ambiguous
mapping return warnings with no reference features. Unsupported/inexact feature
locations are omitted with a warning; overlapping supported intervals are clipped
to the submitted fragment. Neither these annotations nor RNAfold outputs are
editing-efficiency estimates. Folding uses only the submitted arRNA sequence and
the selected topology; it does not append a linker or other construct sequence.

The downloadable example below currently demonstrates the four design/reference
services; use the live API schema for the two analysis services.

- [Downloadable multi-service Python example](frontend/public/downloads/leaper_api_example.py)
- [Offline example inputs and recorded outputs](frontend/public/examples/)
- [Example regeneration script](docs/NAR_REGENERATE_EXAMPLES.py)
- [Repeatable browser verification](docs/NAR_BROWSER_SMOKE.mjs)
- [Current website readiness and remaining operator inputs](docs/NAR_WEBSITE_READINESS.md)

The Python example uses only the standard library. Run
`python3 frontend/public/downloads/leaper_api_example.py --help` from `website/`
for API-base and output options. Its optional NCBI branch depends on live external
access. Example provenance distinguishes synthetic teaching inputs, archived
reference sequences and measured versus unknown efficiencies.

## Privacy and licences

The application requires no account, registration or email, includes no analytics
or tracking cookies, and has no user-sequence database or public result gallery.
Design and analysis POST requests transmit sequences to the API; reference lookup
transmits identifiers to NCBI. The annotation endpoint sends only the accession
to NCBI and matches sequences locally; RNAfold executes locally in the backend.
Shared URL fragments encode sequences without encryption.
Actual deployment logs and retention remain operator-owned facts. The legacy
`TASK_RETENTION_HOURS`/`DATABASE_URL` configuration entries do not implement a
24-hour deletion service or database by themselves.

Source code is licensed under [Apache License 2.0](LICENSE). Tutorial text and
editorial content use [CC BY 4.0](CONTENT_LICENSE.md); reproduced manuscript or
third-party figures remain subject to their original reuse terms.

## Repository guide

`backend/` contains the API, scientific construction rules and tests; `frontend/`
contains the interface, browser refinement and downloadable examples. The
protocol-alignment and NAR-readiness documents above describe the current
implementation. `PROJECT_CONTEXT.md`, architecture, MVP and Cloudflare/Cloud Run
documents retain historical planning; their database, queue, retention and
deployment proposals are not evidence of current functionality.
