import coreEffectZoneData from "../data/bulgeCoreEffectZones.json" with { type: "json" };
import type { AdarEnvironment } from "./normalEditing.ts";

export type BulgeType = "deletion" | "mismatch";
export type BulgeSource = "initial" | "user";
export type BulgeEffectSupport = "supported" | "unsupported";
export type QualitativeDirection = "increase" | "decrease";
export type OptimizationGoal = "improve-target" | "preserve-target";
export type EffectAnchor = "start" | "upstream-edge" | "downstream-edge";

export interface RelativeEffectZone {
  anchor: EffectAnchor;
  minDistance: number;
  maxDistance: number;
  effect: QualitativeDirection;
}

export interface BulgeDefinition {
  id: string;
  type: BulgeType;
  start: number;
  size: number;
  source: BulgeSource;
  effectZones: RelativeEffectZone[];
  candidateId?: string;
  mismatchBases?: string;
  effectSupport?: BulgeEffectSupport;
}

export interface BulgeCandidate {
  id: string;
  type: BulgeType;
  size: number;
  label: string;
  effectZones: RelativeEffectZone[];
  provisional?: boolean;
}

export interface PlacementValidation {
  valid: boolean;
  reason?: string;
  conflictId?: string;
}

export interface AppliedQualitativeEffect {
  bulgeId: string;
  effect: QualitativeDirection;
}

export interface QualitativeEffectEvaluation {
  status: "none" | QualitativeDirection | "multiple";
  overlap: "none" | "concordant" | "conflicting";
  effects: AppliedQualitativeEffect[];
}

export interface QualitativeOverlapRun {
  start: number;
  end: number;
  kind: "concordant" | "conflicting";
  effects: AppliedQualitativeEffect[];
}

export interface QualitativePredictionRecord {
  bulge_id: string;
  bulge_type: BulgeType;
  start: number;
  size: number;
  effect_zones: RelativeEffectZone[];
  evidence_state: "qualitative_prediction";
}

export interface OptimizationEvidenceState {
  source_candidate_id?: string;
  observed_editing_efficiencies: Record<number, number>;
  observed_editing_status: Record<number, "default_zero" | "measured">;
  optimization_goal: OptimizationGoal;
  qualitative_predictions: QualitativePredictionRecord[];
  optimized_arrna_sequence?: string;
}

export function createOptimizationEvidenceState(
  sourceCandidateId: string | undefined,
  efficiencies: Record<number, number>,
  bulges: Bulge[],
  optimizedSequence?: string,
  confirmedPositions: ReadonlySet<number> = new Set(
    Object.keys(efficiencies).map(Number),
  ),
  optimizationGoal: OptimizationGoal = "improve-target",
): OptimizationEvidenceState {
  return {
    source_candidate_id: sourceCandidateId,
    observed_editing_efficiencies: { ...efficiencies },
    observed_editing_status: Object.fromEntries(
      Object.entries(efficiencies).map(([position, efficiency]) => [
        Number(position),
        confirmedPositions.has(Number(position)) || efficiency !== 0
          ? "measured"
          : "default_zero",
      ]),
    ),
    optimization_goal: optimizationGoal,
    qualitative_predictions: bulges.filter(({ effectSupport }) => effectSupport !== "unsupported").map((bulge) => ({
      bulge_id: bulge.id,
      bulge_type: bulge.type,
      start: bulge.start,
      size: bulge.size,
      effect_zones: bulge.effectZones.map((zone) => ({ ...zone })),
      evidence_state: "qualitative_prediction",
    })),
    optimized_arrna_sequence: optimizedSequence,
  };
}

export interface BulgeOverviewGeometry {
  startFraction: number;
  endFraction: number;
  centerFraction: number;
  widthFraction: number;
  visibleSize: number;
}

export interface EffectZoneInterval {
  start: number;
  end: number;
}

export interface EffectZoneOverviewGeometry extends BulgeOverviewGeometry {
  visibleStart: number;
  visibleEnd: number;
}

export class Bulge {
  readonly id: string;
  readonly type: BulgeType;
  readonly start: number;
  readonly size: number;
  readonly source: BulgeSource;
  readonly effectZones: RelativeEffectZone[];
  readonly candidateId?: string;
  readonly mismatchBases?: string;
  readonly effectSupport: BulgeEffectSupport;

  constructor(definition: BulgeDefinition) {
    if (!Number.isInteger(definition.start)) throw new Error("Bulge start must be an integer coordinate.");
    if (!Number.isInteger(definition.size) || definition.size < 1) throw new Error("Bulge size must be a positive integer.");
    this.id = definition.id;
    this.type = definition.type;
    this.start = definition.start;
    this.size = definition.size;
    this.source = definition.source;
    this.effectZones = definition.effectZones.map((zone) => ({ ...zone }));
    this.candidateId = definition.candidateId;
    this.mismatchBases = definition.mismatchBases;
    this.effectSupport = definition.effectSupport ?? "supported";
  }

  get end(): number {
    return this.start + this.size - 1;
  }

  effectAt(targetCoordinate: number): QualitativeDirection | null {
    return effectAtCoordinate(this, targetCoordinate);
  }

  withMismatchBases(mismatchBases: string): Bulge {
    return new Bulge({ ...this, mismatchBases });
  }
}

// Shared by Bulge.effectAt and by callers that must read an effect direction
// before a Bulge instance exists, such as a drag-over placement preview.
export function effectAtCoordinate(
  placement: { start: number; size: number; effectZones: RelativeEffectZone[] },
  targetCoordinate: number,
): QualitativeDirection | null {
  const end = placement.start + placement.size - 1;
  for (const zone of placement.effectZones) {
    const distance = zone.anchor === "start"
      ? targetCoordinate - placement.start
      : zone.anchor === "upstream-edge"
        ? placement.start - targetCoordinate
        : targetCoordinate - end;
    if (distance >= zone.minDistance && distance <= zone.maxDistance) return zone.effect;
  }
  return null;
}

export const MAX_BULGES = 4;

// The selected target adenosine A0 is the origin of the refinement coordinate
// system; upstream positions are negative and downstream positions positive.
export const TARGET_COORDINATE = 0;

export function chunkSequenceForDisplay<T>(items: T[], rowSize: number): T[][] {
  if (!Number.isInteger(rowSize) || rowSize < 1) throw new Error("Sequence row size must be a positive integer.");
  return Array.from({ length: Math.ceil(items.length / rowSize) }, (_, index) =>
    items.slice(index * rowSize, (index + 1) * rowSize));
}

export function createBulgeOverviewGeometry(
  bulge: Pick<Bulge, "start" | "end">,
  windowStart: number,
  windowEnd: number,
): BulgeOverviewGeometry {
  if (windowEnd < windowStart) throw new Error("Overview window end must not precede its start.");
  const windowLength = windowEnd - windowStart + 1;
  const visibleStart = Math.max(windowStart, Math.min(windowEnd + 1, bulge.start));
  const visibleEnd = Math.max(windowStart - 1, Math.min(windowEnd, bulge.end));
  const visibleSize = Math.max(0, visibleEnd - visibleStart + 1);
  const startFraction = (visibleStart - windowStart) / windowLength;
  const endFraction = (visibleEnd - windowStart + 1) / windowLength;
  return {
    startFraction,
    endFraction,
    centerFraction: (startFraction + endFraction) / 2,
    widthFraction: Math.max(0, endFraction - startFraction),
    visibleSize,
  };
}

export function createAbsoluteEffectZoneInterval(
  bulge: Pick<Bulge, "start" | "end">,
  zone: RelativeEffectZone,
): EffectZoneInterval {
  const bounds = zone.anchor === "start"
    ? [bulge.start + zone.minDistance, bulge.start + zone.maxDistance]
    : zone.anchor === "upstream-edge"
      ? [bulge.start - zone.maxDistance, bulge.start - zone.minDistance]
      : [bulge.end + zone.minDistance, bulge.end + zone.maxDistance];
  return { start: Math.min(...bounds), end: Math.max(...bounds) };
}

export function createEffectZoneOverviewGeometry(
  bulge: Pick<Bulge, "start" | "end">,
  zone: RelativeEffectZone,
  windowStart: number,
  windowEnd: number,
): EffectZoneOverviewGeometry | null {
  if (windowEnd < windowStart) throw new Error("Overview window end must not precede its start.");
  const interval = createAbsoluteEffectZoneInterval(bulge, zone);
  const visibleStart = Math.max(windowStart, interval.start);
  const visibleEnd = Math.min(windowEnd, interval.end);
  if (visibleEnd < visibleStart) return null;
  return {
    ...createBulgeOverviewGeometry({ start: visibleStart, end: visibleEnd }, windowStart, windowEnd),
    visibleStart,
    visibleEnd,
  };
}

interface CoreEffectZoneDataset {
  zones: Record<AdarEnvironment, Record<BulgeType, Record<string, RelativeEffectZone[]>>>;
}

const CORE_EFFECT_ZONE_DATA = coreEffectZoneData as CoreEffectZoneDataset;

export function getCoreEffectZones(
  environment: AdarEnvironment,
  type: BulgeType,
  size: number,
): RelativeEffectZone[] {
  return (CORE_EFFECT_ZONE_DATA.zones[environment]?.[type]?.[String(size)] ?? [])
    .map((zone) => ({ ...zone }));
}

export function getBulgeCandidates(
  environment: AdarEnvironment,
): Record<BulgeType, BulgeCandidate[]> {
  const createCandidates = (type: BulgeType): BulgeCandidate[] => Object.keys(
    CORE_EFFECT_ZONE_DATA.zones[environment]?.[type] ?? {},
  )
    .map(Number)
    .filter(Number.isInteger)
    .sort((left, right) => left - right)
    .map((size) => ({
      id: `${type}-${size}`,
      type,
      size,
      label: `${size} nt ${type}`,
      provisional: false,
      effectZones: getCoreEffectZones(environment, type, size),
    }));
  return {
    deletion: createCandidates("deletion"),
    mismatch: createCandidates("mismatch"),
  };
}

// ADAR1 remains the compatibility default for callers that do not yet pass an
// environment. Interactive code should call getBulgeCandidates(environment).
export const BULGE_CANDIDATES = getBulgeCandidates("ADAR1");

export function createZeroInitializedEfficiencies(
  adenosinePositions: number[],
  targetPosition: number,
): Record<number, number> {
  return Object.fromEntries(
    [...new Set(adenosinePositions)]
      .filter((position) => position !== targetPosition)
      .map((position) => [position, 0]),
  );
}

export function intervalsOverlap(
  left: Pick<Bulge, "start" | "end">,
  right: { start: number; size: number },
): boolean {
  const rightEnd = right.start + right.size - 1;
  return left.start <= rightEnd && right.start <= left.end;
}

export function validateBulgePlacement(
  existing: Bulge[],
  proposed: { start: number; size: number },
  maximum = MAX_BULGES,
): PlacementValidation {
  if (!Number.isInteger(proposed.start) || !Number.isInteger(proposed.size) || proposed.size < 1) {
    return { valid: false, reason: "Bulge position and size must be positive-integer sequence coordinates." };
  }
  if (proposed.start <= TARGET_COORDINATE && proposed.start + proposed.size - 1 >= TARGET_COORDINATE) {
    return { valid: false, reason: "A bulge structure cannot cover the target A0. Place it entirely upstream or downstream." };
  }
  if (existing.length >= maximum) {
    return { valid: false, reason: `A design may contain no more than four bulges, including the starting arRNA.` };
  }
  const conflict = existing.find((bulge) => intervalsOverlap(bulge, proposed));
  if (conflict) {
    return { valid: false, reason: "This interval overlaps an existing bulge.", conflictId: conflict.id };
  }
  return { valid: true };
}

export function createInitialBulges(
  deletionCoordinates: number[],
  environment: AdarEnvironment = "ADAR1",
): Bulge[] {
  const sorted = [...new Set(deletionCoordinates)].sort((left, right) => left - right);
  const intervals = sorted.reduce<Array<{ start: number; end: number }>>((groups, coordinate) => {
    const last = groups.at(-1);
    if (!last || coordinate > last.end + 1) groups.push({ start: coordinate, end: coordinate });
    else last.end = coordinate;
    return groups;
  }, []);

  return intervals.map((interval, index) => new Bulge({
    id: `initial-${index + 1}`,
    type: "deletion",
    start: interval.start,
    size: interval.end - interval.start + 1,
    source: "initial",
    effectZones: getCoreEffectZones(
      environment,
      "deletion",
      interval.end - interval.start + 1,
    ),
  }));
}

export function evaluateQualitativeEffect(
  targetCoordinate: number,
  bulges: Bulge[],
): QualitativeEffectEvaluation {
  const effects = bulges.flatMap<AppliedQualitativeEffect>((bulge) => {
    const effect = bulge.effectAt(targetCoordinate);
    return effect ? [{ bulgeId: bulge.id, effect }] : [];
  });
  if (effects.length === 0) return { status: "none", overlap: "none", effects };
  if (effects.length > 1) {
    const directions = new Set(effects.map(({ effect }) => effect));
    return {
      status: "multiple",
      overlap: directions.size === 1 ? "concordant" : "conflicting",
      effects,
    };
  }
  return { status: effects[0].effect, overlap: "none", effects };
}

export function createQualitativeOverlapRuns(
  bulges: Bulge[],
  windowStart: number,
  windowEnd: number,
): QualitativeOverlapRun[] {
  if (windowEnd < windowStart) throw new Error("Overlap window end must not precede its start.");
  const runs: QualitativeOverlapRun[] = [];
  for (let coordinate = windowStart; coordinate <= windowEnd; coordinate += 1) {
    const evaluation = evaluateQualitativeEffect(coordinate, bulges);
    if (evaluation.overlap === "none") continue;
    const signature = evaluation.effects
      .map(({ bulgeId, effect }) => `${bulgeId}:${effect}`)
      .sort()
      .join("|");
    const previous = runs.at(-1);
    const previousSignature = previous?.effects
      .map(({ bulgeId, effect }) => `${bulgeId}:${effect}`)
      .sort()
      .join("|");
    if (previous && previous.end + 1 === coordinate && previous.kind === evaluation.overlap && previousSignature === signature) {
      previous.end = coordinate;
    } else {
      runs.push({
        start: coordinate,
        end: coordinate,
        kind: evaluation.overlap,
        effects: evaluation.effects.map((effect) => ({ ...effect })),
      });
    }
  }
  return runs;
}

const SAME_BASE_MISMATCH: Record<string, string> = {
  A: "A",
  C: "C",
  G: "G",
  T: "U",
  U: "U",
};

export function createAutoMismatchSequence(targetSequence: string): string {
  const normalized = targetSequence.toUpperCase();
  if (/[^ACGTU]/.test(normalized)) throw new Error("Target sequence may contain only A, C, G, T or U.");
  return normalized.split("").map((base) => SAME_BASE_MISMATCH[base]).join("");
}

export function validateMismatchSequence(targetSequence: string, mismatchSequence: string): string | null {
  const target = targetSequence.toUpperCase();
  const mismatch = mismatchSequence.toUpperCase().replace(/T/g, "U");
  if (mismatch.length !== target.length) return `Enter exactly ${target.length} RNA bases.`;
  if (/[^ACGU]/.test(mismatch)) return "Mismatch sequence may contain only A, C, G or U.";
  const expected = createAutoMismatchSequence(target);
  const unsupportedIndex = mismatch.split("").findIndex((base, index) => base !== expected[index]);
  return unsupportedIndex >= 0
    ? "Mismatch bases must form same-base mismatches with the aligned target bases."
    : null;
}
