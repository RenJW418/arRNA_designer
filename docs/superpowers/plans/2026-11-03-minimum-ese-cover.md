# Minimum ESE coverage implementation plan

**Goal:** Generate the fewest fixed-length ESE guides that completely cover the predicted ESE regions not already covered by the default SA guide, with freely positioned windows.

**Architecture:** A full predicted region that fits in the guide is an indivisible requirement. For a longer region, its complete motif hits are requirements. Each requirement defines an interval of feasible guide starts; rightmost-point interval stabbing gives an exact minimum number. Recenter each assigned group without losing full coverage. Assign deterministic IDs, then apply explicit windows as before.

**Tech stack:** Python/FastAPI/Pydantic, existing React frontend, Matplotlib figure exports.

**Constraints:** Preserve motif scanning, merged regions, coordinates, SA mismatch and manual Apply behavior. Default `evaluate_covered_ese=False` counts SA coverage; True requires independent ESE coverage. Keep optional mismatch application and out-of-window warning behavior. No efficacy ranking. Existing dirty files and frozen figures/manuscript remain intact. No deployment requested in this turn.

**Review focus:** Full region containment rather than any overlap; long-region complete motifs; short input and sequence boundaries; stable candidate IDs during Apply; exact minimum beyond the old centered-window pool.

- [x] Add a DMD regression: one ESE151nt window fully covers R5–R11, SA+ESE cover all11regions, all37hits retained. Observe failure against current seven-guide output.
- [x] Add independent brute-force checks on small interval problems and boundary/long-region tests.
- [x] Implement minimum feasible-start cover and group recentering in `backend/app/modules/exon_skipping.py`; keep window overrides after default generation.
- [x] Update tests whose old fixtures relied on redundant candidates; preserve independent-Apply coverage with genuinely separated targets.
- [x] Run the complete backend suite and lint; update brief HelpGuide description and verify frontend tests/build.
- [x] Reproduce DMD responses from the changed code; make a separate Figure3 revision with SA+oneESE and a compact window comparison, retaining the existing molecular/ESE style.
- [x] Audit exported figure/source data and document the new default; preserve prior versions and record the manuscript's old count as pending synchronization.
