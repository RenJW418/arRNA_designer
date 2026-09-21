# Six-panel layout refactor implementation plan

Scope: reorganize the existing React interface while preserving the current visual system,
scientific algorithms, API contracts, exports, and evidence boundaries.

## Baseline

- Branch: `feature/automatic-bulge-ranking`
- HEAD: `9ba9f632e685faadb7299eb75c0ec38fe888a025`
- Existing worktree changes: seven modified frontend components plus untracked `ExportMenu.tsx`.
- Public baseline screenshots: `NAR/figures/ui-layout-refactor/before/`.
- Public CSS asset on 2026-09-10: `/assets/index-Dms9ihxj.css`, SHA-256
  `7727904037C5A75431D3C932F1F90AC82DC6C856AAF3CF4725488F266EF13A22`.
- Local pre-refactor build CSS: SHA-256
  `8CD6A5FF1E377D0C92B15177C1A4043837BEF7F10496169E55D9B11438205B30`.
- Public and local bundles are not identical; scientific behavior and current uncommitted work are
  taken from local source, while visual tokens are cross-checked against both stylesheets.

## Visual source record

The later `:root` block in the public and local stylesheet is the active LEAPER visual baseline:

| Token | Value | Source |
|---|---|---|
| `--ink` | `#20262a` | public CSS + local `styles.css` |
| `--muted` | `#68747d` | public CSS + local `styles.css` |
| `--paper` | `#f3f6f8` | public CSS + local `styles.css` |
| `--surface` | `#ffffff` | public CSS + local `styles.css` |
| `--line` | `#ced7dc` | public CSS + local `styles.css` |
| `--accent` | `#0d739f` | public CSS + local `styles.css` |
| `--accent-dark` | `#075777` | public CSS + local `styles.css` |
| `--target` | `#d9364b` | public CSS + local `styles.css` |
| `--green` | `#398b73` | public CSS + local `styles.css` |
| `--guide` | `#0d80ae` | public CSS + local `styles.css` |
| `--guide-soft` | `#79c5be` | public CSS + local `styles.css` |

Typography uses Arial for English and Microsoft YaHei/PingFang SC with Arial fallback for Chinese.
Existing controls use square or 2 px radii, 1 px borders, flat surfaces, Lucide icons, and restrained
shadows. Sequence and scientific-state colors remain component-specific and are not replaced by the
brand color.

## Steps

### Step 1 — Shared task shells

- Output: reusable narrow step navigation for input pages and shared candidate/sidebar/result shell.
- Test: semantic current state, keyboard-accessible candidates, 320–1440 px CSS behavior.

### Step 2 — Normal editing input and result

- Output: left task steps + single right workspace; compact result summary + left candidate list +
  right pairing/sequence/export.
- Test: example input, target-A selection, ADAR change, candidate switch, copy/export object sync.

### Step 3 — Home and exon skipping

- Output: compact three-task homepage; exon input uses the same step shell; exon results use the same
  candidate/result shell.
- Test: independent entry points, real NCBI state, SA/ESE selection and coverage synchronization.

### Step 4 — Refinement

- Output: import/confirm workspace with narrow steps; measured A inputs remain in the pairing board;
  automatic and manual result states retain all current functionality.
- Test: external import, A0 requirement, default/measured zero, recommendation and manual design.

### Step 5 — i18n, responsive, regression, screenshots

- Output: localized new UI text, responsive layouts, after screenshots and delivery record.
- Test: production build, all frontend unit tests, backend tests in the project environment, browser
  walkthrough at 1440/1366/768/375/320 px, and candidate/sequence regression checks.

No deployment, push, algorithm change, score change, rule-data change, or persistence change is part
of this plan.

## Completion record

- Shared task navigation and result layouts implemented for Normal editing and Exon skipping.
- Standalone refinement retained as an independent import/confirm/measure/recommend/manual workflow.
- Manual-design fallback opens the effect-range comparison before entering the placement workspace.
- Citation page added with four method DOIs verified against PubMed on 2026-09-10.
- Frontend production build and 61 unit tests pass; backend project venv passes 18 tests.
- Chrome and Edge walkthroughs cover 1440/1366/768/375/320 px with no page-level horizontal overflow.
- Firefox and Safari/WebKit remain unverified because their runtimes are not installed on this Windows host.
- Help examples, local Swagger UI, both design operations in OpenAPI, and Simplified Chinese citation
  copy are included in the browser assertions.
- After screenshots: `NAR/figures/ui-layout-refactor/after/`.
- No commit, push, deployment, scientific algorithm change, or persistence change was performed.
