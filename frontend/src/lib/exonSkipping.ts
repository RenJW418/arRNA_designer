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
}

export interface ExonSkippingDesign {
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
}

export interface NcbiExonReference {
  species: string;
  gene: string;
  transcript: string;
  transcript_name: string;
  selection: "MANE Select" | "longest protein-coding";
  exon_number: number;
  exon_count: number;
  genomic_accession: string;
  orientation: "plus" | "minus";
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

const API = (import.meta.env.VITE_API_BASE_URL ?? "/api/v1").replace(/\/$/, "");

async function post<T>(path: string, body: object): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const detail = payload?.detail;
    throw new Error(typeof detail === "string" ? detail : detail?.[0]?.msg ?? "The request could not be completed.");
  }
  return response.json();
}

export function resolveNcbiExon(species: string, gene: string, exonNumber: number, flankLength: number) {
  return post<NcbiExonReference>("/references/ncbi/exon", {
    species, gene, exon_number: exonNumber, flank_length: flankLength,
  });
}

export function resolveNcbiCodingSequence(species: string, gene: string) {
  return post<NcbiCodingReference>("/references/ncbi/coding-sequence", { species, gene });
}

export function createExonSkippingDesign(
  upstreamIntron: string,
  exon: string,
  downstreamIntron: string,
  arrnaLength: number,
  reference?: NcbiExonReference,
) {
  return post<ExonSkippingDesign>("/exon-skipping/design", {
    upstream_intron: upstreamIntron,
    exon,
    downstream_intron: downstreamIntron,
    arrna_length: arrnaLength,
    transcript: reference?.transcript,
    exon_number: reference?.exon_number,
  });
}
