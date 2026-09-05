# Automatic Bulge Recommendations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate and display ten rule-ranked bulge combinations from a locked, experimentally tested arRNA.

**Architecture:** Add a pure TypeScript beam-search module beside the existing bulge domain model. Keep scoring and structural validation independent of React; the result component renders immutable recommendation records and asks the existing workspace to load a selected design.

**Tech Stack:** React 19, TypeScript 5.9, Node test runner, Vite.

**Spec:** `docs/plans/2026-08-29-automatic-bulge-recommendations-design.md`

## Global Constraints

- Effects remain qualitative; never generate predicted editing percentages.
- The target site is A0 and unentered non-target A values are zero.
- Existing bulges count toward the four-bulge maximum.
- Bulge intervals cannot overlap.
- Search only candidate sizes present in the selected ADAR rule set.
- Return at most ten structurally distinct recommendations.

---

### Task 1: Ranking contract and search engine

**Files:**
- Create: `frontend/src/lib/bulgeRecommendation.ts`
- Create: `frontend/src/lib/bulgeRecommendation.test.ts`

**Interfaces:**
- Consumes: `Bulge`, `BulgeCandidate`, `evaluateQualitativeEffect`, `validateBulgePlacement`.
- Produces: `recommendBulgeDesigns(input): BulgeRecommendation[]` and `materializeRecommendedBulges(recommendation, targetWindow, targetIndex): Bulge[]`.

- [ ] Write failing tests proving target increase outranks target decrease, high-efficiency bystander decrease is preferred, overlap/maximum-count constraints hold, and output is capped at ten distinct designs.
- [ ] Run `npm test -- bulgeRecommendation.test.ts` and verify failure because the module is missing.
- [ ] Implement canonical placement generation, transparent score components, bounded beam search, diversity filtering, and mismatch sequence materialization.
- [ ] Run the focused test and the full frontend unit suite.

### Task 2: Recommendation result component

**Files:**
- Create: `frontend/src/components/BulgeRecommendationResults.tsx`
- Modify: `frontend/src/components/BulgeOptimizationWorkspace.tsx`
- Modify: `frontend/src/styles.css`

**Interfaces:**
- Consumes: `BulgeRecommendation[]`, locked source label, and `onApply(recommendation)`.
- Produces: accessible ranked rows with a Recommended marker and `Use this design` action.

- [ ] Add the design button only after the experimental source is locked.
- [ ] Disable it until A0 has a valid observed value and show one concise explanation.
- [ ] Generate recommendations synchronously, announce the result count with `aria-live`, and render the ten rows below the sequence board.
- [ ] Applying a row must preserve observations and initial bulges while replacing user-added bulges.
- [ ] Style the results using the existing square, paper-like visual system and responsive breakpoints.

### Task 3: Copy, provenance, and state export

**Files:**
- Modify: `frontend/src/lib/i18n.ts`
- Modify: `frontend/src/lib/bulgeOptimization.ts`
- Modify: `frontend/src/lib/exports.test.ts` only if the existing evidence serialization does not already include applied bulges.

**Interfaces:**
- Consumes: existing `l()` translations and `createOptimizationEvidenceState`.
- Produces: complete English/Simplified Chinese UI copy and unchanged export compatibility.

- [ ] Add concise bilingual labels for the action, ranking explanation, score components, structural cost, empty state, and apply action.
- [ ] Ensure applying a recommendation flows through the existing optimization evidence serializer.
- [ ] Run export and optimization tests.

### Task 4: Verification

**Files:**
- No new production files.

- [ ] Run `npm test` in `frontend` and confirm zero failures.
- [ ] Run `npm run build` in `frontend` and confirm TypeScript and Vite succeed.
- [ ] Open the local site, run the normal-editing sample, lock a source arRNA, enter A0 and bystander values, generate ten designs, apply ranks 1 and 10, and confirm the sequence/structure update without changing observations.
- [ ] Verify the button and result list in English and Simplified Chinese and at desktop and narrow widths.

