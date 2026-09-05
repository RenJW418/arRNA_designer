# Spec: NAR submission foundation

## Objective

Turn the current LEAPER prototype into a submission-oriented foundation in which one backend engine owns formal design results, experimental observations are never confused with qualitative expectations, reviewers can run documented examples, and every candidate can be exported with reproducible provenance.

The intended users are experimental RNA-editing researchers and NAR Web Server reviewers. This phase does not claim that the provisional LEAPER rules are experimentally validated; it makes their implementation explicit, versioned and testable so the final validated rule set can replace them without changing the public result contract.

## Confirmed decisions

- Formal normal-editing and exon-skipping results require the FastAPI backend.
- The frontend must not silently fall back to an independent formal design algorithm.
- The current rules are labelled `provisional` until the final scientific rule list and validation data are supplied.
- User-entered percentages are `observed` experimental values.
- Bulge effects are qualitative only: `expected_increase`, `expected_decrease`, `unresolved` or `not_assessed`.
- User-downloaded JSON includes the complete normalized input sequence; the server does not retain it long-term.
- Source code uses Apache-2.0. Tutorials, examples and website editorial content use CC BY 4.0.
- Core use remains registration-free and research-use only.

## Architecture

The backend exposes typed design endpoints under `/api/v1/designs`. It validates all external inputs, computes candidates, and returns a versioned `DesignResult`. The frontend may compute lightweight input previews, but only a backend result may open a formal result page or be exported.

Every result contains:

- `schema_version`;
- `application`;
- normalized input and declared coordinate system;
- optional versioned NCBI reference;
- candidate sequences and structural annotations;
- warnings separated from hard validation errors;
- `ruleset` identifier, version, status and citations;
- engine name and version;
- export metadata.

Normal-editing and exon-skipping responses may retain application-specific fields, but they share the same provenance envelope. Existing endpoint changes are additive where practical.

## Public API contracts

### `POST /api/v1/designs/normal-editing`

Input:

```json
{
  "sequence": "ACGT...",
  "target_position": 104,
  "adar_environment": "ADAR1",
  "reference": null
}
```

Output contains normalized input, target metadata, the baseline plus available structural variants, pairing requirements, warnings and provenance.

### Existing exon-skipping endpoint

`POST /api/v1/exon-skipping/design` remains callable but gains the same versioned provenance envelope and normalized-input metadata. The frontend consumes that response as the authoritative exon-skipping result.

### Error contract

- Pydantic boundary failures use HTTP 422.
- Scientific eligibility failures use a stable code and a user-actionable message.
- External reference failures use HTTP 502/503 without exposing stack traces or raw upstream bodies.
- The frontend shows the error and preserves the user's form values.

## User experience

### Examples and help

- A `Try normal-editing example` action loads a deterministic demonstration sequence and target.
- A `Try exon-skipping example` action loads the DMD transcript workflow without presenting it as the only supported disease.
- English help explains inputs, coordinates, A-C mismatch, candidate types, observed efficiency, qualitative bulge expectations, downloads, privacy and limitations.
- Example data are explicitly labelled demonstration data until the published validation examples replace them.

### Experimental feedback

- The selected starting arRNA is always visible.
- Percentage inputs are labelled `Observed editing efficiency (%)`.
- Qualitative effects use words and patterns, never invented percentages.
- Overlapping effect ranges remain `Unresolved` until combination rules are supplied.
- Reset and export actions preserve the baseline/optimized distinction.

### Reproducible downloads

- FASTA contains candidate or optimized arRNA sequences with stable identifiers.
- CSV contains candidate-level fields suitable for ordering and comparison.
- JSON contains normalized input, reference, candidates, observations, bulges, warnings and provenance.
- All three formats are derived from the same in-memory result object.

## Tech stack and commands

- Frontend: React 19, TypeScript 5.9, Vite 7.
- Backend: FastAPI, Pydantic and pytest.

```powershell
cd website\backend
python -m pytest -q

cd website\frontend
npm test
npm run build
npm audit --audit-level=high
```

## Project structure

- `backend/app/schemas/`: typed request/result/provenance contracts.
- `backend/app/modules/`: deterministic scientific transformations.
- `backend/app/api/router.py`: validated HTTP boundaries.
- `backend/tests/`: unit and endpoint contract tests.
- `frontend/src/lib/api.ts`: typed API calls only.
- `frontend/src/lib/exports.ts`: pure FASTA/CSV/JSON serializers.
- `frontend/src/components/`: help, example and result UI.
- `frontend/src/lib/*.test.ts`: pure serializer and qualitative-state tests.

## Code style

```python
def design_normal_editing(payload: NormalEditingRequest) -> NormalEditingResult:
    """Return a deterministic, versioned result without persisting the input."""
```

Use explicit scientific names, one-based coordinates at the UI/API boundary, typed enums for scientific states, and no implicit coordinate conversion.

## Testing strategy

- Backend unit tests cover normalization, target validation, A-C placement, variant sequences and provenance.
- Backend endpoint tests cover schema validation and stable error responses.
- Frontend unit tests cover export round trips and observed/expected separation.
- Browser verification covers both example workflows, downloads, help, error recovery and responsive rendering.
- NCBI network behavior is mocked in automated tests; live reference smoke tests remain separate.

## Boundaries

Always:

- validate at API boundaries;
- omit raw sequences from logs;
- preserve full inputs only in the response and user-initiated local downloads;
- label provisional rules and qualitative effects honestly;
- generate all export formats from one result object.

Ask first:

- storing sequences or experimental measurements server-side;
- changing CORS or adding external services;
- introducing authentication;
- converting qualitative effects into numeric predictions;
- replacing the provisional scientific rule set.

Never:

- silently fall back to a different client-side formal algorithm;
- claim clinical, diagnostic or experimentally validated performance without evidence;
- invent editing percentages;
- log raw sequences or downloaded result contents.

## Success criteria

- Formal normal-editing results fail clearly when the backend is unavailable.
- Both formal workflows return versioned provenance.
- Observed percentages and qualitative expectations are visually and structurally distinct.
- Two one-click examples and an English interpretation guide are available.
- FASTA, CSV and JSON exports agree on candidate identifiers and sequences.
- Apache-2.0 and CC BY 4.0 notices are visible and included in the repository.
- Backend tests, frontend tests, build, dependency audit and browser checks pass.

