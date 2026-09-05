import type { AdarEnvironment, EditingCategory, InitialArrnaDesign, NormalArrnaVariant } from "./normalEditing";
import type { NcbiCodingReference } from "./exonSkipping";

export interface RuleCitation {
  label: string;
  doi: string | null;
}

export interface DesignProvenance {
  engine: { name: string; version: string };
  ruleset: {
    id: string;
    version: string;
    citations: RuleCitation[];
  };
}

export interface NormalEditingRequest {
  sequence: string;
  target_position: number;
  adar_environment: AdarEnvironment;
  reference?: Omit<NcbiCodingReference, "cds_sequence">;
}

export interface NormalEditingResult {
  schema_version: "1.0";
  application: "normal_editing";
  normalized_input: {
    sequence: string;
    length: number;
    target_position: number;
    coordinate_system: "sequence_1_based";
  };
  reference: Omit<NcbiCodingReference, "cds_sequence"> | null;
  editing_site: {
    position: number;
    codon: string;
    edited_codon: string;
    amino_acid: string;
    edited_amino_acid: string;
    category: EditingCategory;
  };
  target_window: string;
  window_start: number;
  window_end: number;
  target_index: number;
  upstream_length: number;
  downstream_length: number;
  has_full_flanks: boolean;
  pairing: {
    adar_environment: AdarEnvironment;
    required_upstream: number;
    required_downstream: number;
    is_satisfied: boolean;
    message: string;
  };
  candidates: Array<{
    id: NormalArrnaVariant["id"];
    label: string;
    short_label: string;
    description: string;
    arrna_sequence: string;
    aligned_guide: string;
    deletion_coordinates: number[];
  }>;
  warnings: string[];
  provenance: DesignProvenance;
}

const API = (import.meta.env?.VITE_API_BASE_URL ?? "/api/v1").replace(/\/$/, "");

export function normalizeApiError(payload: unknown): string {
  if (!payload || typeof payload !== "object" || !("detail" in payload)) return "The design could not be generated. Check the input and try again.";
  const detail = (payload as { detail: unknown }).detail;
  const message = typeof detail === "string"
    ? detail
    : Array.isArray(detail) && typeof detail[0]?.msg === "string"
      ? detail[0].msg
      : detail && typeof detail === "object" && "message" in detail && typeof (detail as { message: unknown }).message === "string"
        ? (detail as { message: string }).message
        : "The design could not be generated. Check the input and try again.";
  const cleaned = message.replace(/^Value error,\s*/i, "");
  if (/^NCBI request failed:/i.test(cleaned)) return "The NCBI request failed. Please try again.";
  return cleaned;
}

export async function apiPost<T>(path: string, body: object): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("The design service is temporarily unavailable. Please try again.");
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(normalizeApiError(payload));
  }
  return response.json() as Promise<T>;
}

export function createNormalEditingRequest(
  sequence: string,
  targetPosition: number,
  environment: AdarEnvironment,
  reference?: NcbiCodingReference | null,
): NormalEditingRequest {
  const normalized = sequence.toUpperCase().replace(/U/g, "T").replace(/\s/g, "");
  const referenceSnapshot = reference ? {
    species: reference.species,
    gene: reference.gene,
    transcript: reference.transcript,
    transcript_name: reference.transcript_name,
    selection: reference.selection,
    cds_start: reference.cds_start,
    cds_end: reference.cds_end,
  } : undefined;
  return { sequence: normalized, target_position: targetPosition, adar_environment: environment, reference: referenceSnapshot };
}

export function createNormalEditingDesign(
  sequence: string,
  targetPosition: number,
  environment: AdarEnvironment,
  reference?: NcbiCodingReference | null,
) {
  return apiPost<NormalEditingResult>("/designs/normal-editing", createNormalEditingRequest(sequence, targetPosition, environment, reference));
}

export function normalResultToDesign(result: NormalEditingResult): InitialArrnaDesign {
  return {
    targetPosition: result.normalized_input.target_position,
    targetWindow: result.target_window,
    arrnaSequence: result.candidates[0]?.arrna_sequence ?? "",
    windowStart: result.window_start,
    windowEnd: result.window_end,
    targetIndex: result.target_index,
    upstreamLength: result.upstream_length,
    downstreamLength: result.downstream_length,
    hasFullFlanks: result.has_full_flanks,
  };
}

export function normalResultToVariants(result: NormalEditingResult): NormalArrnaVariant[] {
  return result.candidates.map((candidate) => ({
    id: candidate.id,
    label: candidate.label,
    shortLabel: candidate.short_label,
    description: candidate.description,
    arrnaSequence: candidate.arrna_sequence,
    alignedGuide: candidate.aligned_guide,
    deletionCoordinates: candidate.deletion_coordinates,
  }));
}
