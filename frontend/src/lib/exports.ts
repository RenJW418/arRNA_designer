import type { DesignProvenance, NormalEditingResult } from "./api";
import type { OptimizationEvidenceState } from "./bulgeOptimization";
import type { ExonSkippingDesign } from "./exonSkipping";

export interface ExportCandidate {
  id: string;
  label: string;
  sequence: string;
  length: number;
  selected?: boolean;
}

export interface DesignExportBundle {
  schema_version: "1.0";
  application: "normal_editing" | "exon_skipping";
  generated_at: string;
  normalized_input: Record<string, unknown>;
  provenance: DesignProvenance;
  candidates: ExportCandidate[];
  evidence?: OptimizationEvidenceState;
  warnings?: string[];
}

export function createNormalExportBundle(
  result: NormalEditingResult,
  selectedCandidateId: string,
  evidence?: OptimizationEvidenceState,
): DesignExportBundle {
  return {
    schema_version: "1.0",
    application: result.application,
    generated_at: new Date().toISOString(),
    normalized_input: result.normalized_input,
    provenance: result.provenance,
    candidates: result.candidates.map((candidate) => ({
      id: candidate.id,
      label: candidate.label,
      sequence: candidate.arrna_sequence,
      length: candidate.arrna_sequence.length,
      selected: candidate.id === selectedCandidateId,
    })),
    evidence,
    warnings: result.warnings,
  };
}

export function createExonExportBundle(result: ExonSkippingDesign, selectedCandidateId: string): DesignExportBundle {
  return {
    schema_version: "1.0",
    application: result.application,
    generated_at: new Date().toISOString(),
    normalized_input: result.normalized_input,
    provenance: result.provenance,
    candidates: result.candidates.map((candidate) => ({
      id: candidate.id,
      label: candidate.label,
      sequence: candidate.arrna_sequence,
      length: candidate.arrna_sequence.length,
      selected: candidate.id === selectedCandidateId,
    })),
    warnings: result.warnings,
  };
}

function csvValue(value: string | number | boolean | undefined): string {
  const text = value === undefined ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function serializeFasta(bundle: DesignExportBundle): string {
  return bundle.candidates.map((candidate) =>
    `>LEAPER_${bundle.application}_${candidate.id}${candidate.selected ? "_selected" : ""}_5to3\n${candidate.sequence}`,
  ).join("\n");
}

export function serializeCsv(bundle: DesignExportBundle): string {
  const rows = bundle.candidates.map((candidate) => [
    bundle.application,
    candidate.id,
    candidate.label,
    candidate.sequence,
    candidate.length,
    candidate.selected ?? false,
    bundle.provenance.engine.name,
    bundle.provenance.engine.version,
    bundle.provenance.ruleset.id,
    bundle.provenance.ruleset.version,
  ].map(csvValue).join(","));
  return ["application,candidate_id,label,arrna_sequence_5to3,length_nt,selected,engine,engine_version,ruleset,ruleset_version", ...rows].join("\n");
}

export function serializeJson(bundle: DesignExportBundle): string {
  return JSON.stringify(bundle, null, 2);
}

export function downloadText(filename: string, content: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
