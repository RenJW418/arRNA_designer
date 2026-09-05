# Bulge structure overview

## Purpose

Give users an immediate whole-arRNA view of every structural bulge while they place candidates on the nucleotide-level sequence.

## Approved representation

- Place a compact target RNA/arRNA double-strand overview above the wrapped sequence rows.
- Keep the target RNA in the 5′→3′ direction and the aligned arRNA in the 3′→5′ direction.
- Mark the editing-site target A and arRNA C directly on their respective strands, joined by a thin neutral solid connector rather than a circle or dashed marker.
- Draw a deletion bulge as an upward target-RNA arch with a gap in the corresponding arRNA interval.
- Draw a mismatch bulge as two outward arches: target RNA upward and arRNA downward.
- Place the full `Deletion n` label directly in the arRNA gap, and spell out mismatch labels as `Mismatch n` rather than abbreviating them.
- Label every bulge with type, size and target-relative start/end coordinates.
- Distinguish initial locked bulges from user-added bulges with text/pattern as well as colour.
- Update the overview from the same `Bulge[]` state used by placement validation and sequence rendering.

## Scope

The overview shows structural position and type only. Qualitative A-effect ranges will be added later when the experimental rule set is supplied.
