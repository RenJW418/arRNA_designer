# Sequence-first redesign Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans to implement task-by-task. Preserve existing local edits; no additional push or deployment is part of this implementation.

**Goal:** A sequence-first design website with a bottom Advanced workspace, sourced functional annotations, and real arRNA secondary-structure analysis.

**Architecture:** Keep current normal/exon scientific engines and result components. Introduce an input workspace and independent sequence/analysis components; new bounded FastAPI analysis endpoints supply reference annotations and ViennaRNA results.

**Tech Stack:** Existing React/TypeScript, FastAPI/Python, ViennaRNA Python bindings.

**Spec:** `docs/superpowers/specs/2026-10-11-sequence-first-redesign.md`

## Global constraints

- User-approved existing annotations + predictions; RNAfold analyzes the generated arRNA sequence.
- NP rules, baseline measurement provenance, and current scientific calculations remain intact.
- 1-based inclusive feature coordinates; RNAfold pair indices 1-based.
- Annotation <=20,000 nt; RNAfold 5–1001 nt. Explicit failure, no fabricated scientific outputs.
- Existing backup is verified on GitHub; preserve the current checkout and pending changes.

## Review focus

1. Editing a sequence or switching mode cannot retain stale target/exon/annotation/fold results.
2. Repeated reference sequence matches cannot be presented as unique reference mapping.
3. Dragging exon boundaries on touch must preserve nonempty upstream and downstream context.
4. Unknown RNAfold/reference services must not break basic design.
5. Candidate/custom-guide changes must update structure input and keep original experimental provenance.

### Task 1: Analysis API (backend owner)

Files: new `backend/app/schemas/sequence_analysis.py`, `backend/app/modules/sequence_analysis.py`, `backend/app/modules/rna_structure.py`, tests; update router and backend dependencies.

Interfaces: exactly the two POST contracts in the spec. Reuse ESEfinder matrices without changing exon candidate generation. Reference source is bounded NCBI retrieval with exact/unique sequence mapping.

- [x] Write and run failing tests for input validation, evidence categories, motif without A, reference mapping ambiguity and actual fold response invariants.
- [x] Implement annotations and RNAfold using real ViennaRNA, with resource limits and explicit unavailable-engine response.
- [x] Install the declared dependency in the existing backend environment and verify an actual fold.
- [x] Run the backend suite; report current implementation scope and sources.

### Task 2: Sequence and sheet UI primitives (frontend owner A)

Files: `SequenceExplorer.tsx`, `AdvancedSheet.tsx`, `sequenceExplorer.ts`, corresponding tests and dedicated CSS.

Interfaces: see component contracts communicated in the task. Sequence selection and exon region selection use parent-owned 1-based inclusive coordinates. Features use the shared interface.

- [x] Test normalization/FASTA and valid exon splitting, invalid/reversed boundaries, coordinate selection.
- [x] Implement keyboard/touch-capable sequence display, evidence-aware highlights, and a modal bottom sheet with focus/escape/backdrop controls.
- [x] Verify component compilation and meaningful helper tests.

### Task 3: Analysis panels (frontend owner B)

Files: shared `sequenceAnalysis.ts`, `FunctionalAnnotationsPanel.tsx`, `RnaStructurePanel.tsx`, dedicated CSS and tests.

Interfaces: backend contracts above; panels get sequence props and clear stale requests/results on changes. Annotation panel sends features upward to the sequence viewer. Structure panel visualizes supplied xy coordinates and MFE pairs, colors by unpaired probability and exposes machine-readable download.

- [x] Test response parsing/structure connectivity and race-safe sequence changes where practical.
- [x] Build source-aware annotation list/details and RNAfold structure/probability view with loading/error/empty states.
- [x] Verify local module tests and TypeScript integration.

### Task 4: Root integration and custom design

Files: new `SequenceDesignWorkspace.tsx`, dedicated CSS, app integration, optional result-component selection callback, compact custom structure editor using the existing validation and sequence builder, Help/Citation copy.

- [x] Replace landing-page cards with sequence-first workspace, segmented mode picker, Go, clickable A/exon boundaries and reference lookup in Advanced.
- [x] Preserve old share links/examples and result downloads/refinement entry.
- [x] Integrate annotations, coverage controls, manual bulge tools, and current selected-guide RNAfold with explicit model scope.
- [x] Add three citation entries and correct the previously identified old help length claim.
- [x] Run all suites and build; attempt UI inspection through Tabbit; obtain an independent review and address material issues. Browser visual acceptance remains pending because no Tabbit instance is available.

## Execution record

- 2026-10-11: User confirmed functional-annotation evidence layering and initial arRNA-only folding. The previously accepted UI design and these answers authorize implementation. Proceed in the existing backed-up feature checkout; no repeated scope approval required.

## Completion evidence (2026-10-11)

- GitHub backup verified by `git ls-remote`: `backup/pre-homepage-redesign-20261011`, commit `e7ca2fad323360732165803ed59e6b4d254311d2`. No redesigned code has been pushed or deployed.
- Frontend library tests: 138 passed. Backend suite: 81 passed. New backend code passes targeted Ruff. Production TypeScript/Vite build succeeds; existing >500 kB bundle warning remains.
- React/jsdom interaction checks: 10 passed in `scripts/sequence_redesign_dom_smoke.mjs`. Temporary test dependency is outside the repository; reproducible setup is in the script header. These are DOM unit checks, not browser visual acceptance.
- Live frontend proxy on `http://127.0.0.1:5173/`: normal example returns four candidates; selected 113 nt arRNA folds through real ViennaRNA 2.7.2; exon example returns two candidates; annotation response includes user regions and predicted non-A motifs.
- Real NCBI accession mapping verified separately; real linear/circular RNAfold and 1001 nt bounds verified. Core normal/exon recommendation engines are unchanged from the backup.
- Independent review fixes: normalized legacy exon-link bounds; selection/coding reset after sequence replacement; stale requests invalidated on workspace exit; explicit persistent custom-draft output; complete source/coordinate provenance in custom JSON.
- Tabbit launcher reported exit 69 with no available instance. No fallback browser automation was used. Visual, real pointer/touch and browser focus acceptance remain pending. Codex preview opening was queued for the local URL.
- Local services started for review: frontend5173, backend8010. The remote server and its3000 port were not changed.

## Automatic annotation follow-up (2026-10-11)

- Valid sequence input now starts the existing annotation scan after a 500 ms pause. Optional reference lookup runs independently after 700 ms; local highlights remain visible while it loads or fails. Loaded reference transcript identifiers populate the annotation field.
- Input changes, invalid/over-limit sequences and workspace exit invalidate pending results and abort requests. Changing the selected A does not rescan or delay Go. Prediction/reference/user evidence remains distinct; remote predictions are excluded when merging reference results.
- The main sequence view keeps continuous highlights and a small status/source link. Detailed feature chips remain in Advanced. No annotation models or design algorithms changed.
- Local HTTP timing for the public 153 nt example: five requests, median 1.64 ms, range 1.34–25.69 ms, excluding browser rendering and without external reference lookup. A 1000 nt repeated public example had a 5.65 ms median.
- Verification: 16 React/jsdom interaction checks, 138 frontend library tests and TypeScript/Vite build pass. Browser visual acceptance remains separate from these DOM checks.

## Result simplification follow-up (2026-10-11)

- Removed result-page detail disclosures and the experimental refinement entry. Normal and exon results now end with the selected sequence and copy/download controls.
- Removed the refinement route, Advanced entry and Help/tutorial entry. Existing `refine` links resolve to the homepage. Historical scientific modules and data remain in the repository; design generation and exports are unchanged.
- Verification: 19 React/jsdom interaction checks and 138 frontend library tests pass. TypeScript/Vite production build passes (440.11 kB JavaScript, without the previous size warning). The local frontend on port 5173 responds with HTTP 200. No remote deployment or GitHub push was performed.

## Inline Advanced follow-up (2026-10-11)

- Advanced now expands below its trigger in normal page flow and focuses/scrolls into view using the same reduced-motion behavior as Go results. Removed the portal, backdrop, body scroll lock and modal focus trap. The card uses the homepage's Arial typography, rounded border and soft shadow.
- Closing preserves the settings and current tab; reopening scrolls again. External feature/draft links reveal their tab even if the panel is already open, while changes inside the panel do not trigger another scroll. Loading a reference returns focus to the updated sequence.
- Verification: 23 React/jsdom interaction checks, 138 frontend library tests and the production build pass. New interaction and reference-focus tests were confirmed failing before their fixes. Local Vite serves the updated inline component. Browser visual acceptance remains separate from these DOM checks.

## Neutral palette follow-up (2026-10-11)

- Replaced the blue interface theme with a warm-white/graphite palette and pale-gold selection accents. Shared tokens in `theme.css` cover the homepage, sequence selector, both result modes, Advanced and analysis controls; the new palette loads after the legacy global stylesheet.
- Evidence-category colors, RNAfold probability colors, errors and scientific structural markers stay distinct. No design logic changed. The earlier readable italic wordmark remains in use, now in graphite.
- Verification: seven stylesheets parse with all palette tokens defined; checked primary/muted/gold text pairs have contrast ratios of at least 4.64:1 and the focus indicator has 4.34:1 contrast against white. The production build and all 23 existing React/jsdom interaction checks pass. Local Vite serves the new stylesheet; no remote deployment or GitHub push.

## Homepage text simplification (2026-10-11)

- Removed the subtitle and repeated sequence heading, length/range, static selection instructions and coordinate footer from the main picker. Keyboard/coordinate descriptions remain accessible; exon boundary feedback and feature evidence remain available. Advanced retains its detailed sequence view.
- Combined the feature count and source link into one action. Scan/reference loading and error states remain visible. Main controls use 13–14 px type and position labels 10–11 px. Sequence letters retain their original 14 px size following the user's correction: reduce excess text without enlarging bases. Hover/focus context appears only during interaction, without a floating overlay. The homepage picker uses equal 20 px padding; empty context, the final row margin and unused final-row tick space no longer add extra bottom whitespace. Row numbers align with the left content edge.
- Verification: production build and all 23 existing React/jsdom interaction checks pass. These checks cover selection, exon boundaries, annotation state and inline navigation; they do not replace browser visual acceptance. No remote deployment or GitHub push.

## Exon selection color correction (2026-10-11)

- The previous feature fill treated all three user-defined sequence regions as green annotations, obscuring the exon selection. Region details remain available, while the selected exon now uses pale gold and graphite letters. Overlapping functional annotations appear as thin evidence-colored underlines inside the selection, with categorical backgrounds elsewhere.
- Annotation rendering and detail selection share a fixed evidence priority, independent of feature response order. Exon-mode selectable bases no longer inherit the gold/bold A style from normal mode. No annotation or design algorithms changed.

## Advanced Features removal (2026-10-11)

- Removed the Features tab and its panel from Advanced, along with the homepage count link that opened it. The three remaining tabs are Design, RNAfold and Reference. Removed the empty status row's layout space after annotation succeeds.
- Kept automatic annotation, main sequence highlights and feature details, as well as loading/error messages. Reference sequences loaded through the Reference tab still trigger reference annotations. The historical panel component and analysis engine remain in the repository.

## Visual window and applied RNAfold results (2026-10-11)

- Added a visual window selector in Advanced: fixed A0, draggable start/end handles, keyboard movement, exact relative numeric inputs and Reset. Interactive bounds stay within the supplied sequence and span the target. Initial clipping does not silently rewrite the existing window defaults.
- Design and RNAfold settings remain drafts until Apply. A successful Apply commits the validated design, custom structures and folding model together, closes Advanced and scrolls to the updated result. Failed or stale requests preserve the previous result and its exports. Clearing or temporarily invalidating a numeric field also cancels a pending Apply. Custom exports read the applied structure snapshot.
- Every normal/exon candidate automatically displays an RNAfold thumbnail; the selected candidate has a large diagram after its sequence. Card/detail requests share a bounded cache keyed by normalized sequence and model, with two concurrent requests and explicit error/retry handling. Model changes in Advanced take effect only on Apply. Biological design rules and the folding engine are unchanged.
- Exon exports now identify the currently displayed fallback candidate if an Apply removes the previously selected candidate.
- The local Vite server on port 5173 serves the updated components. Real linear and circular requests through its API proxy returned HTTP 200 from ViennaRNA 2.7.2 with matching coordinate/probability lengths. This checks live service integration, not browser rendering; Tabbit visual acceptance remains pending because the available launcher has no running instance.
- Verification: 143 frontend library tests and 27 integrated React/jsdom checks passed. Review fixes then passed two additional targeted regressions (the DOM script now contains 29 checks). The final TypeScript/Vite build and `git diff --check` pass. No remote deployment or GitHub push was performed for this follow-up.

## Compact structure previews and annotated window (2026-10-11)

- User correction: keep the candidate name and length on the same line, replace the separate result structure panel with a clickable thumbnail, show annotation colors in the window selector, and merge RNAfold settings into Design.
- Candidate cards now separate the candidate-selection button from the thumbnail button. The thumbnail opens the existing detailed structure in a dialog, sharing its cached result. Close, Escape and backdrop dismissal return focus to the trigger; background interaction is disabled while viewing. Normal, exon and custom outputs use this compact presentation.
- Card headers reserve one column for the unwrapped length; the grid changes to two or one columns as the result container narrows. Full candidate labels remain accessible, including the optional internal structure suffix.
- Advanced now contains only Design and Reference. The RNAfold model sits beside ADAR or arRNA length in Design and keeps the existing draft/Apply behavior. The window overview consumes the same annotation data as the main sequence and preserves evidence-specific colors while its boundaries move.
- Review fixes: pending Go scroll frames respect the preview dialog's inert background; Advanced reveal frames preserve focus already inside the panel, including an annotation tooltip. Deterministic tests hold and release those frames to verify both cases.
- Final verification: all 143 frontend library tests and all 31 React/jsdom checks pass, as do the TypeScript/Vite production build and `git diff --check`. Local Vite serves the updated components. These checks do not constitute browser pixel/visual acceptance; no remote deployment or GitHub push was performed.

## Consistent recommended defaults (2026-10-12)

- Centralized the existing design defaults, including A0-centered −75…+75 coverage (151 nt). New sequences, examples, mode changes and newly loaded references restore these defaults; changing the target A recenters only the window. Explicit saved-link parameters still restore, and reopening Advanced preserves draft settings.
- Added Restore defaults alongside Apply. It resets draft design options and custom structures without replacing applied results or changing the target, sequence or coding/reference context. Apply remains the point that commits and scrolls to the updated result. Reset also clears incomplete numeric window input.
- New exon examples/reference sequences clear an inherited CDS flag; reference retrieval uses the recommended 151 nt length. Interactive sequence-boundary clipping remains visible without moving A0 or rewriting the requested default window.
- Verification: TypeScript/Vite build, 143 frontend library tests, all 35 React/jsdom interaction checks and `git diff --check` pass. Checks cover saved overrides, target changes, input reset paths, reference requests and draft/applied-result isolation. No remote deployment or GitHub push.

## Separate Go defaults from Advanced Apply (2026-10-12)

- Every homepage Go now restores the recommended form values and submits an explicit recommended snapshot. Advanced Apply alone submits the current custom draft. This avoids using stale React state immediately after a reset and prevents old saved/window/model settings leaking into Go.
- Go resets custom structures, folding topology and the selected candidate on successful completion. Exon candidate selection remounts only after a successful Go; Apply retains its existing selection behavior. Input sequence, target/exon boundaries and reference context remain intact; the coding checkbox returns to the context declared for the current input.
- Failed or superseded requests preserve the previous applied output; an earlier Apply cannot replace a newer Go result.
- Verification: TypeScript/Vite build, all 39 React/jsdom interaction checks and `git diff --check` passed. No design-engine changes, remote deployment or GitHub push.

## Compact normal pairing overview (2026-10-12)

- The normal pairing diagram is centered at a maximum of 1000px, with strands 24 schematic units apart and fine pairing links. Unpaired target spans form rounded gold loops with narrow openings, using approximate arc-length spacing for A markers. Screen positions compress these spans; source coordinates and deletion counts remain unchanged in data and hover titles. Help and SVG descriptions explicitly identify the schematic as not to scale. The target A and actual aligned guide character remain prominent. Baseline diagrams omit space reserved for loops. The warm-white panel and Arial labels match the result UI.
- Preserved candidate selection, output/export data, strand directions and deletion-coordinate mapping. Small containers keep readable labels with internal horizontal scrolling. SVG titles/descriptions use unique accessible IDs per instance.
- Verification: production build and all 41 React/jsdom checks passed, including source-coordinate/deletion coverage, paired-site order and alignment, loop bounds, connector exclusions and SVG accessibility. The actual baseline/dual-deletion SVGs were rasterized for visual inspection; this is not whole-browser visual acceptance. The local Vite server returns the updated stylesheet. No backend changes, remote deployment or GitHub push.

## Shared Advanced pairing preview (2026-10-12)

- Extracted the approved result drawing into DuplexPairingSchematic and reused it in Custom structures. The Advanced preview now has the same centered compact strands, round loops, target highlight and styling. Insertions curve below the guide strand; internal mismatches bend both strands outward, with distinct colors and count labels.
- Draft changes and Reset update the preview; Apply still controls the applied output. Class-backed structure interval getters are copied explicitly. Out-of-range or nonfinite draft regions are omitted from display without changing validation errors. Shared insertion boundaries distinguish their before/after display positions so adjacent loops meet without overlapping.
- Verification: production build and 42 React/jsdom checks, including draft/reset isolation, all three loop types, invalid display ranges and adjacent insertion boundaries. Actual default and mixed-structure SVGs were rasterized and inspected; this does not replace full browser visual acceptance. No design-engine changes or remote deployment.
