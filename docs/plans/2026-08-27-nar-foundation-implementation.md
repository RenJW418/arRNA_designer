# NAR Submission Foundation Implementation Plan

> **For implementation:** Execute task-by-task with test-driven development and verify each checkpoint before continuing.

**Goal:** Establish a backend-authoritative, versioned LEAPER result pipeline with honest evidence states, NAR-ready examples/help and reproducible multi-format downloads.

**Architecture:** FastAPI owns formal scientific results and returns a shared provenance envelope. React consumes the typed contract, handles only presentation/interaction, and serializes downloads from the returned result plus user-local observations and bulges.

**Tech Stack:** Python/FastAPI/Pydantic/pytest; React/TypeScript/Vite/node:test.

---

### Task 1: Define provenance and normal-editing contracts

**Files:**
- Create: `backend/app/schemas/design.py`
- Test: `backend/tests/test_normal_editing.py`

1. Write failing schema and endpoint-contract tests for normalized input, candidates, `ruleset`, engine version and provisional status.
2. Run `python -m pytest tests/test_normal_editing.py -q` and confirm failure.
3. Add typed Pydantic request/result models with one-based target coordinates and bounded sequence length.
4. Run the focused test and confirm it passes.

### Task 2: Implement the backend normal-editing engine

**Files:**
- Create: `backend/app/modules/normal_editing.py`
- Modify: `backend/app/api/router.py`
- Test: `backend/tests/test_normal_editing.py`

1. Add failing tests for sequence normalization, non-A rejection, A-C mismatch placement, baseline sequence and available deletion variants.
2. Confirm failures.
3. Port the current deterministic transformations to Python without changing the provisional rule behavior.
4. Add `POST /api/v1/designs/normal-editing` and stable error semantics.
5. Run focused and full backend tests.

### Task 3: Add provenance to exon-skipping results

**Files:**
- Modify: `backend/app/schemas/exon_skipping.py`
- Modify: `backend/app/modules/exon_skipping.py`
- Test: `backend/tests/test_exon_skipping.py`

1. Add failing assertions for schema version, normalized input and ruleset/engine provenance.
2. Implement additive fields without changing current candidate calculations.
3. Run focused and full backend tests.

### Task 4: Migrate the frontend to backend-authoritative normal results

**Files:**
- Create: `frontend/src/lib/api.ts`
- Modify: `frontend/src/components/DesignWorkspace.tsx`
- Modify: `frontend/src/components/InitialArrnaResult.tsx`
- Test: `frontend/src/lib/api.test.ts`

1. Write failing tests for request construction and error normalization.
2. Add typed request/response contracts.
3. Replace client-side formal candidate generation with the backend response; retain lightweight target-site preview only.
4. Preserve form input and show an actionable backend-unavailable state.
5. Run frontend tests and build.

### Task 5: Separate observed and qualitative evidence states

**Files:**
- Modify: `frontend/src/lib/bulgeOptimization.ts`
- Modify: `frontend/src/components/BulgeOptimizationWorkspace.tsx`
- Modify: `frontend/src/styles.css`
- Test: `frontend/src/lib/bulgeOptimization.test.ts`

1. Add failing tests for `observed`, `expected_increase`, `expected_decrease`, `unresolved` and `not_assessed` serialization.
2. Implement typed evidence-state objects without numeric inference.
3. Relabel efficiency inputs as observed and qualitative overlays as expectations.
4. Add a visible explanation and accessible non-colour labels.
5. Run unit tests, build and browser visual checks.

### Task 6: Implement reproducible exports

**Files:**
- Create: `frontend/src/lib/exports.ts`
- Create: `frontend/src/lib/exports.test.ts`
- Modify: `frontend/src/components/InitialArrnaResult.tsx`
- Modify: `frontend/src/components/ExonSkippingResult.tsx`

1. Write failing tests asserting identifier/sequence agreement across FASTA, CSV and JSON.
2. Implement pure serializers with CSV escaping and versioned JSON.
3. Include normalized input, local observations, bulges, warnings and provenance in JSON.
4. Add explicit `Download FASTA`, `Download CSV` and `Download JSON` actions.
5. Run tests and build.

### Task 7: Add examples, English help and licensing

**Files:**
- Create: `frontend/src/components/HelpGuide.tsx`
- Create: `frontend/src/lib/examples.ts`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/DesignWorkspace.tsx`
- Modify: `frontend/src/styles.css`
- Create: `LICENSE`
- Create: `CONTENT_LICENSE.md`

1. Add deterministic normal-editing and transcript-based exon-skipping example loaders.
2. Add English help sections for inputs, coordinates, results, observations, qualitative expectations, downloads, privacy and limitations.
3. Link sample actions from the landing page and form.
4. Add Apache-2.0 and CC BY 4.0 notices to the landing page/help/footer and repository.
5. Verify keyboard access and responsive layouts.

### Task 8: Submission-foundation verification

1. Run `python -m pytest -q` in `website/backend`.
2. Run `npm test`, `npm run build` and `npm audit --audit-level=high` in `website/frontend`.
3. Run `git diff --check` for all touched files.
4. In the browser, execute both examples; verify result provenance, evidence labels and three downloads.
5. Inspect console logs and responsive views at 320, 768, 1024 and 1440 px.
6. Update `PROJECT_CONTEXT.md` and the NAR draft-status notes so they reflect implemented behavior without overstating validation.

