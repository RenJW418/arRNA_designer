# Information-density reduction

## Goal

Make the result and bulge workflows readable at a glance without removing scientific traceability.

## Decisions

- Use one accessible `InfoTip` component for optional explanations. It opens on mouse hover,
  keyboard focus and touch/click, and closes with Escape or blur.
- Keep result values, candidate identities, warnings and rule-set status visible.
- Move explanatory sentences, rule interpretation and interaction instructions behind `?` controls.
- Use Arial for English interface text. Preserve a monospaced face only for nucleotide sequences and
  coordinate rulers, where alignment is functional.
- Increase page titles, section titles, candidate values and primary sequence output; never compensate
  for density by reducing secondary text below a readable size.
- Apply the first pass to normal-editing results, exon-skipping results and bulge optimization.

## Acceptance criteria

- The primary result path can be scanned without reading a paragraph.
- Every hidden explanation remains available by pointer, keyboard and touch.
- Tooltips do not contain required warnings or interactive controls.
- Desktop and mobile layouts have no clipped tooltip content or horizontal page overflow.
