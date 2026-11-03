import { buildCustomDesign, type CustomStructure } from "./customDesign.ts";
import { createAutoMismatchSequence, protocolPositionToInterval, type BulgeType } from "./bulgeOptimization.ts";
import type { NormalDesignEnvironment } from "./normalEditing.ts";

export interface ProtocolTable1Preset {
  id: string;
  side: "upstream" | "downstream";
  type: BulgeType;
  size: number;
  position: number;
  label: string;
  zh: string;
}

// Author-provided fixed Nature Protocols manuscript, Table 1, physical page 43.
// The protocol is under review; its DOI is pending and must not be invented.
export const PROTOCOL_TABLE1_SOURCE = { table: 1, page: 43, doi: null, status: "unpublished-protocol" } as const;
export const PROTOCOL_TABLE1_PRESETS: readonly ProtocolTable1Preset[] = [
  { id: "table1-upstream-insertion-14-30", side: "upstream", type: "insertion", size: 14, position: -30, label: "Upstream −30 · 0/14", zh: "上游 −30 · 0/14" },
  { id: "table1-downstream-insertion-11-35", side: "downstream", type: "insertion", size: 11, position: 35, label: "Downstream +35 · 0/11", zh: "下游 +35 · 0/11" },
  { id: "table1-upstream-insertion-12-30", side: "upstream", type: "insertion", size: 12, position: -30, label: "Upstream −30 · 0/12", zh: "上游 −30 · 0/12" },
  { id: "table1-downstream-insertion-9-35", side: "downstream", type: "insertion", size: 9, position: 35, label: "Downstream +35 · 0/9", zh: "下游 +35 · 0/9" },
  { id: "table1-upstream-insertion-9-31", side: "upstream", type: "insertion", size: 9, position: -31, label: "Upstream −31 · 0/9", zh: "上游 −31 · 0/9" },
  { id: "table1-downstream-insertion-6-35", side: "downstream", type: "insertion", size: 6, position: 35, label: "Downstream +35 · 0/6", zh: "下游 +35 · 0/6" },
  { id: "table1-upstream-insertion-7-30", side: "upstream", type: "insertion", size: 7, position: -30, label: "Upstream −30 · 0/7", zh: "上游 −30 · 0/7" },
  { id: "table1-downstream-insertion-5-35", side: "downstream", type: "insertion", size: 5, position: 35, label: "Downstream +35 · 0/5", zh: "下游 +35 · 0/5" },
  { id: "table1-upstream-insertion-5-30", side: "upstream", type: "insertion", size: 5, position: -30, label: "Upstream −30 · 0/5", zh: "上游 −30 · 0/5" },
  { id: "table1-downstream-insertion-3-35", side: "downstream", type: "insertion", size: 3, position: 35, label: "Downstream +35 · 0/3", zh: "下游 +35 · 0/3" },
  { id: "table1-upstream-deletion-30-31", side: "upstream", type: "deletion", size: 30, position: -31, label: "Upstream −31 · 30/0", zh: "上游 −31 · 30/0" },
  { id: "table1-downstream-deletion-13-34", side: "downstream", type: "deletion", size: 13, position: 34, label: "Downstream +34 · 13/0", zh: "下游 +34 · 13/0" },
  { id: "table1-upstream-deletion-26-32", side: "upstream", type: "deletion", size: 26, position: -32, label: "Upstream −32 · 26/0", zh: "上游 −32 · 26/0" },
  { id: "table1-downstream-deletion-11-33", side: "downstream", type: "deletion", size: 11, position: 33, label: "Downstream +33 · 11/0", zh: "下游 +33 · 11/0" },
  { id: "table1-upstream-deletion-22-31", side: "upstream", type: "deletion", size: 22, position: -31, label: "Upstream −31 · 22/0", zh: "上游 −31 · 22/0" },
  { id: "table1-downstream-deletion-9-33", side: "downstream", type: "deletion", size: 9, position: 33, label: "Downstream +33 · 9/0", zh: "下游 +33 · 9/0" },
  { id: "table1-upstream-deletion-18-31", side: "upstream", type: "deletion", size: 18, position: -31, label: "Upstream −31 · 18/0", zh: "上游 −31 · 18/0" },
  { id: "table1-downstream-deletion-6-34", side: "downstream", type: "deletion", size: 6, position: 34, label: "Downstream +34 · 6/0", zh: "下游 +34 · 6/0" },
  { id: "table1-upstream-deletion-14-31", side: "upstream", type: "deletion", size: 14, position: -31, label: "Upstream −31 · 14/0", zh: "上游 −31 · 14/0" },
  { id: "table1-downstream-deletion-3-34", side: "downstream", type: "deletion", size: 3, position: 34, label: "Downstream +34 · 3/0", zh: "下游 +34 · 3/0" },
  { id: "table1-upstream-mismatch-30-32", side: "upstream", type: "mismatch", size: 30, position: -32, label: "Upstream −32 · 30/30", zh: "上游 −32 · 30/30" },
  { id: "table1-downstream-mismatch-8-32", side: "downstream", type: "mismatch", size: 8, position: 32, label: "Downstream +32 · 8/8", zh: "下游 +32 · 8/8" },
  { id: "table1-upstream-mismatch-26-32", side: "upstream", type: "mismatch", size: 26, position: -32, label: "Upstream −32 · 26/26", zh: "上游 −32 · 26/26" },
  { id: "table1-downstream-mismatch-7-32", side: "downstream", type: "mismatch", size: 7, position: 32, label: "Downstream +32 · 7/7", zh: "下游 +32 · 7/7" },
  { id: "table1-upstream-mismatch-24-31", side: "upstream", type: "mismatch", size: 24, position: -31, label: "Upstream −31 · 24/24", zh: "上游 −31 · 24/24" },
  { id: "table1-downstream-mismatch-6-33", side: "downstream", type: "mismatch", size: 6, position: 33, label: "Downstream +33 · 6/6", zh: "下游 +33 · 6/6" },
  { id: "table1-upstream-mismatch-20-33", side: "upstream", type: "mismatch", size: 20, position: -33, label: "Upstream −33 · 20/20", zh: "上游 −33 · 20/20" },
  { id: "table1-downstream-mismatch-5-33", side: "downstream", type: "mismatch", size: 5, position: 33, label: "Downstream +33 · 5/5", zh: "下游 +33 · 5/5" },
  { id: "table1-upstream-mismatch-16-32", side: "upstream", type: "mismatch", size: 16, position: -32, label: "Upstream −32 · 16/16", zh: "上游 −32 · 16/16" },
  { id: "table1-downstream-mismatch-4-34", side: "downstream", type: "mismatch", size: 4, position: 34, label: "Downstream +34 · 4/4", zh: "下游 +34 · 4/4" },
];

/** Geometry is sourced from Table 1; the required guide bases remain the user's choice. */
export function createProtocolPresetStructure(preset: ProtocolTable1Preset, id: string): CustomStructure {
  return {
    id, type: preset.type, position: preset.position, size: preset.size,
    ...(preset.type !== "deletion" ? { bases: "" } : {}),
    preset_provenance: {
      source: "protocol-table-1", preset_id: preset.id,
      table: PROTOCOL_TABLE1_SOURCE.table, doi: PROTOCOL_TABLE1_SOURCE.doi,
      status: PROTOCOL_TABLE1_SOURCE.status,
    },
  };
}

/** Check geometry using temporary valid bases; never persist or export those placeholders. */
export function getProtocolPresetUnavailable(
  preset: ProtocolTable1Preset, target: string, targetIndex: number,
  environment: NormalDesignEnvironment, specs: CustomStructure[],
): string {
  if (specs.some(s => s.type === preset.type && s.position === preset.position && s.size === preset.size)) return "Already added";
  const interval = protocolPositionToInterval(preset.position, preset.size, preset.type);
  if (interval.start < -targetIndex || interval.end > target.length - targetIndex - 1) return "A structure extends beyond the target window.";
  const proposed = createProtocolPresetStructure(preset, "protocol-preset-preview");
  const preview = preset.type === "insertion" ? { ...proposed, bases: "A".repeat(preset.size) }
    : preset.type === "mismatch" ? { ...proposed, bases: createAutoMismatchSequence(target.slice(interval.start + targetIndex, interval.end + targetIndex + 1)) }
    : proposed;
  // Existing draft structures keep their real bases and all existing validation still runs.
  return buildCustomDesign(target, targetIndex, environment, [...specs, preview]).errors.join(" ");
}
