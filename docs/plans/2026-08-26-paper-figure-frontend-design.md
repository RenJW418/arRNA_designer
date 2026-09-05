# Paper-figure frontend integration

## Objective

Place responsive vector crops exported directly from the manuscript artwork into the interface without
showing full A4 pages or implying that the pending analysis engine is functional.

## Selected approach

Adapt the interface to the scientific artwork and add three focused original-artwork components:

1. The original Figure 2a mechanism comparison on the homepage.
2. Crops of the four original Figure 1 panels covering mismatch targeting, circular arRNA,
   structural control and exon skipping.
3. An application-aware workspace preview using the original Figure 4 universal, custom and
   exon-skipping design panels. Normal editing displays the 115-nt design; exon skipping displays
   the 151-nt circular-arRNA design.

The source `.ai` figures remain unchanged. Illustrator exports each panel as SVG through a temporary
artboard boundary, converts text to vector outlines and closes the source without saving. No scientific
diagram is redrawn or generated, and each panel links to its resolution-independent vector export.

## Visual alignment

The interface follows the artwork instead of framing it with a separate editorial style. The
arRNA blue is the primary interaction colour, target-adenosine red is reserved for sequence and
validation emphasis, and bulge teal plus protein green/orange are supporting scientific colours.
Headings use a compact bold sans-serif treatment compatible with the figure labels. Figure cards
use white artboard surfaces, thin grey rules and a two-column layout that gives horizontal panels
enough width to remain readable.

The reproducible exporter is `scripts/export_manuscript_figures.ps1`. It opens each source in
Illustrator, applies temporary artboard bounds, exports text as vector outlines, removes the one
cross-panel transition arrow from the isolated LEAPER 3.0 panel, and closes without saving.

## Boundaries

- NCBI content remains clearly labelled as demonstrative.
- Candidate generation, scoring and downloads remain unavailable until the validated engine is
  integrated.
- The interface distinguishes the 115-nt universal design from the 151-nt exon-skipping design.
- Target sites and structural features are explained with text as well as colour.
- Existing sequence normalization, IUPAC feedback and reference preview behaviour are preserved.

## Verification

- TypeScript and Vite production build.
- Existing FastAPI tests and Ruff checks.
- Browser inspection at desktop and mobile widths, including the homepage, sequence mode, gene
  mode and submitted prototype state.
