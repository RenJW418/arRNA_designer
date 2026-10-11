export interface EseRegion {
  start: number;
  end: number;
  a_positions: number[];
  matrices: string[];
  peak_score: number;
}

export interface ExonSkippingCandidate {
  id: string;
  kind: "sa" | "ese";
  label: string;
  target_sequence: string;
  arrna_sequence: string;
  global_start: number;
  global_end: number;
  exon_start: number;
  exon_end: number;
  mismatch_target_position: number | null;
  mismatch_arrna_position: number | null;
  covered_a_positions: number[];
  covered_region_indices: number[];
  partially_covered_region_indices?: number[];
  covered_hit_indices?: number[];
  mismatch_exon_positions?: number[];
}

export interface ExonSkippingDesign {
  schema_version: "1.0";
  application: "exon_skipping";
  normalized_input: {
    upstream_intron: string;
    exon: string;
    downstream_intron: string;
    combined_length: number;
    coordinate_system: "concatenated_sequence_1_based";
  };
  normalized_upstream_intron: string;
  normalized_exon: string;
  normalized_downstream_intron: string;
  arrna_length: number;
  exon_length: number;
  length_class: "short" | "medium" | "long";
  sa_is_canonical: boolean;
  warnings: string[];
  ese_hits: unknown[];
  ese_regions: EseRegion[];
  candidates: ExonSkippingCandidate[];
  transcript: string | null;
  exon_number: number | null;
  provenance: import("./api").DesignProvenance;
  reference?: ExonReferenceSnapshot | null;
  design_settings?: { evaluate_covered_ese: boolean; ese_mismatch_positions: number[] };
  prediction_settings?: {
    method: string;
    matrices: { name: string; threshold: number }[];
    motif_filter: string;
    region_merging: string;
    coordinate_system: string;
  };
}

export interface ExonReferenceSnapshot {
  transcript: string;
  species?: string;
  gene?: string;
  genomic_accession?: string;
  orientation?: "plus" | "minus";
  exon_genomic_start?: number;
  exon_genomic_end?: number;
  exon_number?: number;
  selection?: string;
}

export interface ExonDesignOptions {
  evaluateCoveredEse?: boolean;
  eseMismatchPositions?: number[];
}

export interface NcbiExonReference {
  species: string;
  gene: string;
  transcript: string;
  transcript_name: string;
  selection: "MANE Select" | "longest protein-coding" | "user-selected transcript";
  exon_number: number;
  exon_count: number;
  genomic_accession: string;
  orientation: "plus" | "minus";
  exon_genomic_start?: number;
  exon_genomic_end?: number;
  upstream_intron: string;
  exon: string;
  downstream_intron: string;
}

export interface NcbiCodingReference {
  species: string;
  gene: string;
  transcript: string;
  transcript_name: string;
  selection: "MANE Select" | "longest protein-coding";
  cds_sequence: string;
  cds_start: number;
  cds_end: number;
}

import { apiPost } from "./api";

export function resolveNcbiExon(species: string, gene: string, exonNumber: number, flankLength: number, transcriptAccession?: string) {
  return apiPost<NcbiExonReference>("/references/ncbi/exon", {
    species, gene, exon_number: exonNumber, flank_length: flankLength,
    transcript_accession: transcriptAccession || undefined,
  });
}

export function resolveNcbiCodingSequence(species: string, gene: string) {
  return apiPost<NcbiCodingReference>("/references/ncbi/coding-sequence", { species, gene });
}

export function createExonSkippingDesign(
  upstreamIntron: string,
  exon: string,
  downstreamIntron: string,
  arrnaLength: number,
  reference?: NcbiExonReference,
  options: ExonDesignOptions = {},
) {
  return apiPost<ExonSkippingDesign>("/exon-skipping/design", {
    upstream_intron: upstreamIntron,
    exon,
    downstream_intron: downstreamIntron,
    arrna_length: arrnaLength,
    transcript: reference?.transcript,
    exon_number: reference?.exon_number,
    reference: reference ? {
      transcript: reference.transcript, species: reference.species, gene: reference.gene,
      genomic_accession: reference.genomic_accession, orientation: reference.orientation,
      exon_genomic_start: reference.exon_genomic_start, exon_genomic_end: reference.exon_genomic_end,
      exon_number: reference.exon_number, selection: reference.selection,
    } : undefined,
    evaluate_covered_ese: options.evaluateCoveredEse ?? false,
    ese_mismatch_positions: options.eseMismatchPositions ?? [],
  });
}
