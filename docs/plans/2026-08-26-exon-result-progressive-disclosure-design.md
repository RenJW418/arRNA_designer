# Exon skipping result: progressive disclosure

## Goal

Apply the validated Normal editing result hierarchy to Exon skipping while preserving its locus-specific information.

## Primary flow

1. Read the exon and splice-site summary.
2. Choose an SA or ESE candidate on the local pre-mRNA map.
3. Read and export the selected arRNA.
4. Review its coverage coordinates and mismatch metadata.

## Supporting details

- Full base-by-base pairing is closed by default.
- Sequence and ESEfinder provenance is closed by default.
- Warnings remain visible because they may change candidate interpretation.

## Constraints

- Do not change SA, ESEfinder or candidate-generation logic.
- Preserve the spatial intron–exon–intron map and candidate coverage tracks.
- Preserve candidate selection, copy and FASTA download.
- Reuse the existing result disclosures and visual tokens.

## Verification

- Candidate selection updates output sequence, length, coordinates and disclosure labels.
- Both details sections are keyboard accessible.
- Desktop and mobile layouts keep the candidate map readable.
