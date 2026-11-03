# Minimum ESE coverage algorithm review — 2026-11-03

Scope: independent read-only review of the minimum-cover implementation, DMD fixture and tests. No production or test-source edits.

## Verdict

No blocking issues found. The implementation solves the minimum number of freely positioned equal-length default ESE guides for its required coverage intervals. The DMD result SA75–225 plus ESE231–381 covers all11 regions/37hits; one additional ESE is necessary and sufficient because the residual R5–R11 span242–370=129nt.

## Correctness

A required half-open interval[a,b) fits a widthW guide starting at integerp exactly when max(0,b−W)≤p≤min(a,total−W). The code computes this feasible interval and sorts by its right endpoint. Choosing the earliest right endpoint stabs the first unmet interval. In any optimal solution, a point inside that interval can be moved right to that endpoint without uncovering another interval whose right endpoint is at least as large. The usual exchange argument therefore proves minimum cardinality.

Every assigned group contains a common feasible start, so its target hull has span≤W. Re-centering the hull with _window_around_group preserves complete containment; boundary clamping keeps the hull inside the same valid widthW window. Re-centering cannot create a smaller optimum or lose coverage. Empty inputs, total<W, nested/duplicate requirements and end-clamped windows are handled correctly.

Short merged regions are required atomically. Long regions are decomposed into complete motif intervals; complete motifs already covered by SA are removed only under the default evaluate_covered_ese=False policy. This retains the distinction between complete motif coverage and partial merged-region coverage.

Sorting is O(M log M), grouping/recentering O(M); the pre-existing long-region lookup scans hits per long region. No exponential search or new dependency is introduced. Optional mismatch and manual-window policies remain explicitly scoped to returned defaults/final edited candidates, without inferring minimum coverage after arbitrary manual edits.

## Independent verification

Ran2200 additional brute-force comparisons on the actual production helper: total1–11, length1–total+2,1–8 randomly generated duplicate/nested/overlapping target intervals per case. Exhaustively enumerated all integer-positioned guide combinations independently of feasible-start logic. All counts matched the brute-force minimum, all targets were fully contained, including total<length cases. Source tests also cover the real DMD fixture, complete motif coverage for long regions, explicit covered-region evaluation and stable candidate identities through manual SA edits.
