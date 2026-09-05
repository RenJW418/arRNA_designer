# Normal editing result: progressive disclosure

## Goal

Reduce the cognitive load of the Normal editing result without removing scientific information.

## Information order

1. Identify the target and design context.
2. Choose one available arRNA variant.
3. Read, copy or download the selected arRNA.
4. Confirm the selected variant in a compact structure schematic.
5. Open target-site or base-by-base evidence only when it is needed.

## Layout

- The header uses four compact facts instead of six equal-weight metrics.
- Variant cards are the first primary section. Cards show the variant name, length and deletion size; the full explanation is shown only for the selected card.
- The selected sequence and export actions sit immediately below the cards.
- The pairing schematic remains visible because it explains the structural consequence of the selection.
- The target/codon explorer and full base pairing are native `details` disclosures, closed by default and keyboard accessible.

## Constraints

- Do not change candidate generation, target classification or deletion coordinates.
- Preserve target switching from the sequence explorer.
- Preserve copy and FASTA export.
- Use the existing manuscript-derived visual system and semantic colors.

## Verification

- Production build and existing backend tests pass.
- Variant selection updates the sequence, length, description and schematic.
- Both disclosures open with keyboard and pointer input.
- The first viewport communicates the result without requiring the user to interpret the full nucleotide alignment.
