import {
  Bulge, bulgeEvidenceEnvironment, createInitialBulges, createManualBulge, createProposalAlignedGuide,
  intervalToProtocolPosition, protocolPositionToInterval, validateBulgePlacement, validateProtocolDuplex,
  type BulgeType,
} from "./bulgeOptimization.ts";
import { createOptimizedArrnaSequence } from "./bulgeRecommendation.ts";
import type { NormalDesignEnvironment, NormalArrnaVariant } from "./normalEditing.ts";
import type { NormalEditingResult } from "./api.ts";
import { createNormalExportBundle, serializeCsv, type DesignExportBundle, type ExportCandidate } from "./exports.ts";
import type { RnaTopology } from "./sequenceAnalysis.ts";

export interface CustomStructure {
  id: string;
  type: BulgeType;
  position: number;
  size: number;
  bases?: string;
}

export function initialCustomStructures(variant: NormalArrnaVariant, environment: NormalDesignEnvironment): CustomStructure[] {
  return createInitialBulges(variant.deletionCoordinates, environment).map((bulge) => ({
    id: bulge.id, type: bulge.type, position: intervalToProtocolPosition(bulge), size: bulge.size,
  }));
}

export function buildCustomDesign(target: string, targetIndex: number, environment: NormalDesignEnvironment, specs: CustomStructure[]) {
  const bulges: Bulge[] = [];
  try {
    if (!Number.isInteger(targetIndex) || target[targetIndex] !== "A") throw new Error("Choose a target A before customizing structures.");
    for (const spec of specs) {
      const interval = protocolPositionToInterval(spec.position, spec.size, spec.type);
      const bulge = createManualBulge({ ...spec, start: interval.start }, target, targetIndex, environment);
      const placement = validateBulgePlacement(bulges, bulge);
      if (!placement.valid) throw new Error(placement.reason);
      bulges.push(bulge);
    }
    const guide = createProposalAlignedGuide(target, targetIndex);
    const report = validateProtocolDuplex(target, guide, targetIndex, bulges, environment);
    return { ...report, bulges, sequence: report.valid ? createOptimizedArrnaSequence(guide, target, targetIndex, bulges) : "" };
  } catch (error) {
    return { valid: false, errors: [error instanceof Error ? error.message : String(error)], warnings: [] as string[], bulges, sequence: "" };
  }
}

export function createCustomDesignExport(result: NormalEditingResult, variant: NormalArrnaVariant, specs: CustomStructure[]) {
  const sourceCandidate = result.candidates.find(candidate => candidate.id === variant.id);
  if (!sourceCandidate || sourceCandidate.arrna_sequence !== variant.arrnaSequence
      || sourceCandidate.aligned_guide !== variant.alignedGuide
      || sourceCandidate.deletion_coordinates.length !== variant.deletionCoordinates.length
      || sourceCandidate.deletion_coordinates.some((coordinate, index) => coordinate !== variant.deletionCoordinates[index])) {
    throw new Error("The selected candidate does not match this source design. Select a current candidate before exporting.");
  }
  const draft = buildCustomDesign(result.target_window, result.target_index, result.pairing.adar_environment, specs);
  if (!draft.valid) throw new Error(draft.errors.join(" "));

  return {
    schema_version: "1.0" as const,
    application: "custom_arRNA" as const,
    generated_at: new Date().toISOString(),
    source_result: structuredClone(result),
    source_candidate: structuredClone(variant),
    source_candidate_aligned_guide_orientation: "3′→5′" as const,
    source_candidate_deletion_coordinate_system: "target_relative_to_A0" as const,
    sequence_orientation: "5′→3′" as const,
    target_sequence: result.target_window,
    target_sequence_orientation: "5′→3′" as const,
    target_index: result.target_index,
    target_index_coordinate_system: "target_window_0_based" as const,
    source_window: {
      start: result.window_start,
      end: result.window_end,
      coordinate_system: "source_sequence_1_based_inclusive" as const,
    },
    source_target_position: result.normalized_input.target_position,
    source_target_position_coordinate_system: "source_sequence_1_based" as const,
    adar: result.pairing.adar_environment,
    structures_coordinate_system: "target_relative_to_A0" as const,
    structure_bases_orientation: "3′→5′" as const,
    structures: draft.bulges.map((bulge, index) => ({
      id: bulge.id,
      type: bulge.type,
      position: specs[index].position,
      size: bulge.size,
      start: bulge.start,
      end: bulge.end,
      effect_data_environment: bulge.effectSupport === "unsupported" ? null : bulgeEvidenceEnvironment(result.pairing.adar_environment, bulge.start),
      position_semantics: bulge.type === "insertion" ? "boundary_before_target_base" as const : "tract_edge_nearest_A0" as const,
      ...(bulge.type === "insertion" ? { bases: bulge.insertionBases } : bulge.type === "mismatch" ? { bases: bulge.mismatchBases } : {}),
    })),
    arrna_sequence: draft.sequence,
    warnings: [...draft.warnings],
    observed_editing_efficiencies: {} as Record<string, number>,
    provenance: {
      source_design: structuredClone(result.provenance),
      customization: {
        method: "manual_structures" as const,
        sequence_builder: "buildCustomDesign" as const,
        status: "unmeasured_design_draft" as const,
      },
    },
  };
}

export type CustomDesignSnapshot = ReturnType<typeof createCustomDesignExport>;
export type CustomArrnaVariant = Omit<NormalArrnaVariant, "id"> & { id: `custom-${number}` };
export type AppliedCustomDesignSnapshot = CustomDesignSnapshot & {
  candidate_id: CustomArrnaVariant["id"];
  fold_topology: RnaTopology;
};

/** Display-only candidate; it is not a candidate returned by the design service. */
export interface AppliedCustomCandidate {
  variant: CustomArrnaVariant;
  bulges: Bulge[];
  structures: CustomStructure[];
  snapshot: CustomDesignSnapshot;
  foldTopology: RnaTopology;
}

export function createAppliedCustomCandidate(
  result: NormalEditingResult,
  sourceVariant: NormalArrnaVariant,
  specs: CustomStructure[],
  ordinal = 1,
  foldTopology: RnaTopology = "linear",
): AppliedCustomCandidate {
  if (!Number.isSafeInteger(ordinal) || ordinal < 1) throw new Error("Custom candidate number must be a positive integer.");
  if (foldTopology !== "linear" && foldTopology !== "circular") throw new Error("Choose a supported RNAfold topology.");
  const snapshot = createCustomDesignExport(result, sourceVariant, specs);
  const structures: CustomStructure[] = snapshot.structures.map(({ id, type, position, size, bases }) => ({
    id, type, position, size, ...(bases !== undefined ? { bases } : {}),
  }));
  const draft = buildCustomDesign(snapshot.target_sequence, snapshot.target_index, snapshot.adar, structures);
  if (!draft.valid) throw new Error(draft.errors.join(" "));
  const deletionCoordinates: number[] = [];
  // Keep one column per target base. Inserted guide bases belong to the structure
  // records, rather than shifting the target-aligned columns used by the diagram.
  const alignedGuide = createProposalAlignedGuide(snapshot.target_sequence, snapshot.target_index)
    .split("").map((base, index) => {
      const coordinate = index - snapshot.target_index;
      const structure = draft.bulges.find((bulge) => bulge.type !== "insertion"
        && coordinate >= bulge.start && coordinate <= bulge.end);
      if (structure?.type === "deletion") {
        deletionCoordinates.push(coordinate);
        return "-";
      }
      if (structure?.type === "mismatch") return structure.mismatchBases![coordinate - structure.start];
      return base;
    }).join("");
  return {
    variant: {
      id: `custom-${ordinal}`, label: `Custom ${ordinal}`, shortLabel: `Custom ${ordinal}`,
      description: "Manually customized arRNA; experimental effects have not been measured.",
      arrnaSequence: snapshot.arrna_sequence, alignedGuide, deletionCoordinates,
    },
    bulges: draft.bulges, structures, snapshot, foldTopology,
  };
}

interface CustomExportCandidate extends ExportCandidate {
  id: CustomArrnaVariant["id"];
  short_label: string;
  description: string;
  arrna_sequence: string;
  aligned_guide: string;
  aligned_guide_orientation: "3′→5′";
  aligned_guide_semantics: "one_column_per_target_base; insertions_recorded_in_structures";
  deletion_coordinates: number[];
  deletion_coordinate_system: "target_relative_to_A0";
  structures: CustomDesignSnapshot["structures"];
  source_candidate_id: NormalArrnaVariant["id"];
  source_window: CustomDesignSnapshot["source_window"];
  source_target_position: number;
  target_sequence: string;
  target_index: number;
  target_index_coordinate_system: "target_window_0_based";
  adar: NormalDesignEnvironment;
  fold_topology: RnaTopology;
  origin: "manual_customization";
  validation: {
    scope: "client_side_structural_checks";
    valid: true;
    backend_validated: false;
    experimentally_tested: false;
  };
  provenance: CustomDesignSnapshot["provenance"];
  warnings: string[];
}

export interface NormalExportBundleWithCustom extends DesignExportBundle {
  candidates: Array<ExportCandidate | CustomExportCandidate>;
  /** The standard provenance identifies the original service result. */
  provenance_scope?: "source_design_service";
  custom_designs?: AppliedCustomDesignSnapshot[];
  /** Compatibility alias for the selected custom only; the list is authoritative. */
  custom_design?: CustomDesignSnapshot;
  window_start?: number;
  window_end?: number;
  target_window?: string;
  target_index?: number;
  pairing?: NormalEditingResult["pairing"];
  reference?: NormalEditingResult["reference"];
}

export function createNormalExportBundleWithCustom(
  result: NormalEditingResult,
  selectedCandidateId: string,
  appliedCandidates: AppliedCustomCandidate[] = [],
): NormalExportBundleWithCustom {
  const bundle = createNormalExportBundle(structuredClone(result), selectedCandidateId);
  if (!appliedCandidates.length) return bundle;
  const ids = new Set<string>();
  const customDesigns: AppliedCustomDesignSnapshot[] = [];
  const customCandidates: CustomExportCandidate[] = [];
  let selectedSnapshot: CustomDesignSnapshot | undefined;
  for (const applied of appliedCandidates) {
    const source = applied.snapshot.source_result;
    if (source.normalized_input.sequence !== result.normalized_input.sequence
        || source.normalized_input.target_position !== result.normalized_input.target_position) {
      throw new Error("The custom candidate belongs to a different input sequence or target.");
    }
    if (ids.has(applied.variant.id)) throw new Error("Custom candidates must have distinct identifiers.");
    ids.add(applied.variant.id);
    const ordinal = Number(applied.variant.id.replace(/^custom-/, ""));
    // Each applied card remains tied to its own service result, including its
    // window and ADAR settings. Later ordinary results cannot replace that source.
    const checked = createAppliedCustomCandidate(source, applied.snapshot.source_candidate, applied.structures, ordinal, applied.foldTopology);
    if (checked.variant.id !== applied.variant.id
        || checked.variant.arrnaSequence !== applied.snapshot.arrna_sequence
        || JSON.stringify(checked.snapshot.structures) !== JSON.stringify(applied.snapshot.structures)) {
      throw new Error("The applied custom candidate no longer matches its saved structures. Apply the draft again before exporting.");
    }
    const snapshot = structuredClone(applied.snapshot);
    customDesigns.push({ ...snapshot, candidate_id: checked.variant.id, fold_topology: applied.foldTopology });
    if (selectedCandidateId === checked.variant.id) selectedSnapshot = structuredClone(snapshot);
    customCandidates.push({
      id: checked.variant.id, label: checked.variant.label, short_label: checked.variant.shortLabel,
      description: checked.variant.description,
      sequence: checked.variant.arrnaSequence, length: checked.variant.arrnaSequence.length,
      selected: selectedCandidateId === checked.variant.id,
      arrna_sequence: checked.variant.arrnaSequence, aligned_guide: checked.variant.alignedGuide,
      aligned_guide_orientation: "3′→5′",
      aligned_guide_semantics: "one_column_per_target_base; insertions_recorded_in_structures",
      deletion_coordinates: [...checked.variant.deletionCoordinates],
      deletion_coordinate_system: "target_relative_to_A0",
      structures: snapshot.structures,
      source_candidate_id: snapshot.source_candidate.id,
      source_window: snapshot.source_window,
      source_target_position: snapshot.source_target_position,
      target_sequence: snapshot.target_sequence,
      target_index: snapshot.target_index,
      target_index_coordinate_system: snapshot.target_index_coordinate_system,
      adar: snapshot.adar,
      fold_topology: applied.foldTopology,
      origin: "manual_customization",
      validation: { scope: "client_side_structural_checks", valid: true, backend_validated: false, experimentally_tested: false },
      provenance: snapshot.provenance,
      warnings: [...snapshot.warnings],
    });
  }
  return {
    ...bundle,
    provenance_scope: "source_design_service",
    candidates: [...bundle.candidates, ...customCandidates],
    custom_designs: customDesigns,
    ...(selectedSnapshot ? { custom_design: selectedSnapshot } : {}),
    warnings: [...new Set([...(bundle.warnings ?? []), ...customCandidates.flatMap(candidate => candidate.warnings)])],
  };
}

/** Standard columns remain first; custom rows identify their actual builder. */
export function serializeNormalCandidateCsv(bundle: NormalExportBundleWithCustom): string {
  if (!bundle.custom_designs?.length) return serializeCsv(bundle);
  const csvCell = (value: string | number | boolean) => {
    const text = String(value);
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const rows = bundle.candidates.map((candidate) => {
    const custom = "origin" in candidate && candidate.origin === "manual_customization" ? candidate as CustomExportCandidate : null;
    const sourceProvenance = custom?.provenance.source_design ?? bundle.provenance;
    const customSnapshot = custom ? bundle.custom_designs?.find(snapshot => snapshot.candidate_id === custom.id) : undefined;
    return [
      bundle.application, candidate.id, candidate.label, candidate.sequence, candidate.length, candidate.selected ?? false,
      custom ? "buildCustomDesign (client-side)" : bundle.provenance.engine.name,
      custom ? "" : bundle.provenance.engine.version,
      sourceProvenance.ruleset.id, sourceProvenance.ruleset.version,
      custom ? custom.origin : "design_service",
      custom ? custom.validation.scope : "design_service_output",
      custom?.source_candidate_id ?? "",
      custom ? JSON.stringify(custom.structures) : "",
      custom?.source_window.start ?? bundle.window_start ?? "",
      custom?.source_window.end ?? bundle.window_end ?? "",
      custom?.target_sequence ?? bundle.target_window ?? "",
      custom?.target_index ?? bundle.target_index ?? "",
      custom?.source_target_position ?? String(bundle.normalized_input.target_position ?? ""),
      custom?.adar ?? bundle.pairing?.adar_environment ?? "",
      custom?.fold_topology ?? "",
      sourceProvenance.engine.name, sourceProvenance.engine.version,
      JSON.stringify(customSnapshot ? customSnapshot.source_result.reference : bundle.reference ?? null),
    ].map(csvCell).join(",");
  });
  return ["application,candidate_id,label,arrna_sequence_5to3,length_nt,selected,engine,engine_version,ruleset,ruleset_version,candidate_origin,validation_scope,source_candidate_id,structures_json,source_window_start,source_window_end,target_window,target_index_0based,source_target_position_1based,adar,fold_topology,source_engine,source_engine_version,source_reference_json", ...rows].join("\n");
}
