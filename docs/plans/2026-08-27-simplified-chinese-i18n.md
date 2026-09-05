# Simplified Chinese Internationalization Implementation Plan

> **For Codex:** Execute this plan sequentially in the current shared workspace. Preserve all existing user changes and do not create commits unless requested.

**Goal:** Add an English/Simplified Chinese language switcher across the LEAPER arRNA design website while preserving the current design/result state during language changes.

**Architecture:** Store all user-facing copy in one typed, flat translation dictionary. A React context owns the selected language, persists it to `localStorage`, synchronizes the document `lang` attribute, and exposes a parameter-aware `t()` function. Components translate presentation copy only; scientific identifiers, sequences, coordinates, gene names, and export data remain unchanged.

**Tech Stack:** React 19, TypeScript, Vite, Node test runner, CSS.

---

### Task 1: Translation contract and language state

**Files:**
- Create: `frontend/src/lib/i18n.ts`
- Create: `frontend/src/lib/i18n.test.ts`
- Create: `frontend/src/components/LanguageProvider.tsx`
- Modify: `frontend/src/main.tsx`

1. Add failing tests for language normalization, English fallback, interpolation, and technical-term preservation.
2. Run the focused test and confirm it fails because the translation module does not exist.
3. Implement the typed dictionaries and translation helpers.
4. Add the provider with English default, `leaper-language` persistence, and `document.documentElement.lang` synchronization.
5. Run the focused test and confirm it passes.

### Task 2: Global language control and public pages

**Files:**
- Create: `frontend/src/components/LanguageSwitcher.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/LeaperMechanism.tsx`
- Modify: `frontend/src/components/MethodEvolution.tsx`
- Modify: `frontend/src/components/HelpGuide.tsx`
- Modify: `frontend/src/components/InfoTip.tsx`
- Modify: `frontend/src/styles.css`

1. Add an accessible `EN / 简中` segmented switch in the header.
2. Translate navigation, landing-page calls to action, explanatory content, privacy copy, help, footer, and tooltip accessibility labels.
3. Keep the switch visible on mobile and make the active language unmistakable.
4. Verify switching does not navigate or reset component state.

### Task 3: Design input workflow

**Files:**
- Modify: `frontend/src/components/DesignWorkspace.tsx`
- Modify: `frontend/src/components/DesignPreview.tsx`
- Modify: `frontend/src/components/TranscriptPreview.tsx`

1. Translate input modes, field labels, examples, actions, previews, validation guidance, loading states, and errors.
2. Localize known backend error messages at the presentation boundary while retaining dynamic technical details.
3. Leave DNA/RNA sequences, coordinates, NCBI identifiers, and editing terminology unchanged.
4. Exercise both sequence and gene/species input paths.

### Task 4: Normal editing and exon skipping results

**Files:**
- Modify: `frontend/src/components/InitialArrnaResult.tsx`
- Modify: `frontend/src/components/ExonSkippingResult.tsx`

1. Translate result hierarchy, candidate explanations, legends, actions, provenance, warnings, export labels, and empty states.
2. Localize candidate labels by stable candidate ID/type rather than modifying backend data.
3. Preserve exported FASTA/CSV/JSON scientific content and sequence orientation.
4. Confirm language switching retains selected candidate and result state.

### Task 5: Bulge optimization and structure visualization

**Files:**
- Modify: `frontend/src/components/BulgeOptimizationWorkspace.tsx`
- Modify: `frontend/src/components/BulgeStructureOverview.tsx`

1. Translate optimization instructions, qualitative effects, controls, dialogs, legends, and validation messages.
2. Preserve `Deletion`, `Mismatch`, arRNA, nucleotide symbols, coordinates, and sequence data where these function as scientific labels.
3. Confirm placed bulges, efficiency entries, and the locked starting design survive language switching.

### Task 6: Verification

**Files:**
- Modify as needed based on findings.

1. Run all frontend tests.
2. Run the production build and `git diff --check`.
3. In the browser, verify English default, persistence after reload, Chinese coverage on home/form/normal/exon/bulge/help, state preservation, and tooltip behavior.
4. Check 320, 768, 1024, and 1440 px widths for overflow and header usability.
5. Inspect console errors and repair any regressions before completion.
