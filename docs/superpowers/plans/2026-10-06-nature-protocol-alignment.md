# Nature Protocols final alignment

Authority: `../NatureProtocol/final/20180_1_art_file_302613_tm8fj0.pdf` (47 pages). The user approved the preceding comparison and instructed that Nature Protocols controls all design choices. Apply the changes to the existing feature checkout; preserve the fixed manuscript PDF. No deployment is part of this implementation.

## Decisions

- Target RNA coordinates are 5′ to 3′, A0 = 0. Required coverage: ADAR1 [-4,+25], ADAR2 [-6,+11].
- Universal: A/C at A0, 28/0 at -31 (target footprint [-58,-31]), 10/0 at +34 (footprint [34,43]); optional 1/0 at +4.
- Bulge rule distance uses the edge nearest the evaluated A. Do not shift the underlying screening dataset to compensate for a consumer error.
- Final text/dimension labels say external complementary flanks >=5 nt; Fig.4c prose says >=10 nt. Ruling: use >=10 nt as the conservative condition satisfying both, and document the final's ambiguity.
- Normal design supports shifting/shortening/extending the target window while preserving required coverage. Clearly distinguish target coverage length from final guide length. Prefer available universal as the initial selection, retain baseline as a control.
- Exon groups <70, 70–150, >150 are descriptive categories independent of guide length. Default length 151 nt. Generate SA first, then ESE regions not fully covered; permit evaluating covered ESEs when SA activity is insufficient. Cover entire candidate regions, not only their A positions. ESE A/C is optional.
- Do not claim the approximate figure ranges are experimentally validated hard limits. Show recommended ranges while allowing justified length exploration.
- Structural choices include n/0, 0/n, n/n and bystander A/G. Unsupported rule effects remain explicitly unknown; do not invent data for insertion or arbitrary mismatches.
- Permit changes to starting structures in a proposed next design while preserving the tested pair and measured profile as immutable provenance.
- Missing bystander measurements remain unknown in scoring. Search limits and ranking are software heuristics, not protocol-derived biological rules.

## Task 1 — Normal engine (parallel owner: manuscript_understanding)

Backend normal module/schema and frontend normal helper: red tests for exact required coverage, failure on insufficient coverage, shorter legal external flanks, adjustable windows and optional +4. Implement the minimal corresponding API/helper changes; preserve working coding annotation or expose its scope honestly. Run backend normal tests and relevant frontend tests.

## Task 2 — Exon engine and records (parallel owner: website_understanding)

Backend exon module/schema/NCBI and frontend exon helper/exports: red tests for category boundaries, short-exon extra evaluation, exclusion of SA-covered regions, whole-region coverage, optional A/C and full export provenance. Add optional reference accession selection if supported by existing NCBI response. Run backend exon/public API and frontend exon/export tests.

## Task 3 — Refinement (parallel owner: data_understanding)

Bulge optimization/recommendation/tested-duplex helpers and their dedicated UI: red tests for universal near-edge effects, external flanks, missing measurement handling and added structural choices. Support modifications of original structures without changing original experimental evidence. Permit manual unsupported structures, label their effects unknown. Run dedicated tests; do not change screening measurements.

## Task 4 — Root integration and documentation

Update main design/result UI for the new parameters and consistent default selection, regenerate design panels from the fixed PDF, correct displayed reference/paired context, update bilingual copy and help with functional coverage and empirical validation. Record final scientific conventions in `docs/NATURE_PROTOCOL_ALIGNMENT.md`.

## Task 5 — Verification and review

Run full backend pytest, full frontend tests, TypeScript/Vite build, lint if configured, and browser smoke checks for all three workflows. Review actual diff against this list, obtain an independent review, address consequential findings, and report verified behavior and remaining limitations accurately.

## Progress

- Audit and parallel engine/refinement implementation completed; root integrated the API, UI, bilingual guidance and original Figure 4 panels.
- Independent reviews corrected recommendation application restoring obsolete structures, terminal insertion loss, share-link target updates and stale NCBI source metadata.
- Missing measurements now remain absent, with complete unmeasured/measured status in JSON; measured zero is preserved.
- Numeric comparison confirms all 431 original effect intervals and thresholds unchanged; generator metadata is synchronized.
- Balanced insertion/deletion import now uses alignment even when target and guide lengths match; only a fully complementary baseline retains the safe fast path.
- Backend 44/44 tests passed. Frontend 102/102 tests passed. TypeScript/Vite build passed. All 9 browser checks passed with real design API responses; NCBI cache checks use a mocked reference read. Diff whitespace and original-PDF pixel checks passed.
- Tasks 1–5 completed; detailed decisions, scope and verification are recorded in `docs/NATURE_PROTOCOL_ALIGNMENT.md`. No deployment or commit performed.
