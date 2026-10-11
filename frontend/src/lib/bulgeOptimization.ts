import coreEffectZoneData from "../data/bulgeCoreEffectZones.json" with { type: "json" };
import type { AdarEnvironment } from "./normalEditing.ts";

export type BulgeType = "deletion" | "mismatch" | "insertion";
export type BulgeSource = "initial" | "user";
export type BulgeEffectSupport = "supported" | "unsupported";
export type QualitativeDirection = "increase" | "decrease";
export type OptimizationGoal = "improve-target" | "preserve-target";
export type EffectAnchor = "nearest-edge" | "start" | "upstream-edge" | "downstream-edge";

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
  insertionBases?: string;
  effectSupport?: BulgeEffectSupport;
}

export interface BulgeCandidate {
  id: string;
  type: BulgeType;
  size: number;
  label: string;
  effectZones: RelativeEffectZone[];
  provisional?: boolean;
  effectSupport?: BulgeEffectSupport;
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
  observed_editing_status: Record<number, "default_zero" | "unmeasured" | "measured">;
  optimization_goal: OptimizationGoal;
  qualitative_predictions: QualitativePredictionRecord[];
  optimized_arrna_sequence?: string;
  tested_baseline?: { arrna_sequence: string; aligned_guide: string; structures: BulgeDefinition[]; editing_efficiencies?: Record<number, number>; editing_status?: Record<number, "default_zero" | "unmeasured" | "measured"> };
  proposed_structures?: BulgeDefinition[];
}

/** Empty input is unknown; a measured percentage must be finite and in range. */
export function parseMeasuredEfficiency(value: string): number | undefined {
  if (value.trim() === "") return undefined;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0 || numeric > 100) {
    throw new RangeError("Editing efficiency must be a finite percentage between 0 and 100.");
  }
  return numeric;
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
  testedBaseline?: OptimizationEvidenceState["tested_baseline"],
  adenosinePositions: readonly number[] = Object.keys(efficiencies).map(Number),
): OptimizationEvidenceState {
  for (const value of Object.values(efficiencies)) parseMeasuredEfficiency(String(value));
  const measuredEntries = Object.entries(efficiencies).filter(([p, value]) =>
    Number.isFinite(value) && (confirmedPositions.has(Number(p)) || value !== 0));
  const measured = Object.fromEntries(measuredEntries);
  const measuredPositions = new Set(measuredEntries.map(([p]) => Number(p)));
  const status = Object.fromEntries([...new Set([...adenosinePositions, ...Object.keys(efficiencies).map(Number)])]
    .map((p) => [p, measuredPositions.has(p) ? "measured" as const : "unmeasured" as const]));
  return {
    source_candidate_id: sourceCandidateId,
    tested_baseline: testedBaseline ? { ...structuredClone(testedBaseline), editing_efficiencies: { ...measured }, editing_status: { ...status } } : undefined,
    proposed_structures: bulges.map((bulge) => ({ ...bulge, effectZones: bulge.effectZones.map((z) => ({ ...z })) })),
    observed_editing_efficiencies: measured,
    observed_editing_status: status,
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
  readonly insertionBases?: string;
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
    this.insertionBases = definition.insertionBases;
    this.effectSupport = definition.type === "insertion" ? "unsupported" : definition.effectSupport ?? "supported";
    if (this.effectSupport === "unsupported") this.effectZones = [];
  }

  get end(): number {
    return this.type === "insertion" ? this.start : this.start + this.size - 1;
  }

  effectAt(targetCoordinate: number): QualitativeDirection | null {
    return effectAtCoordinate(this, targetCoordinate);
  }

  withMismatchBases(mismatchBases: string): Bulge {
    return new Bulge({ ...this, source: "user", mismatchBases, effectSupport: mismatchBases === this.mismatchBases ? this.effectSupport : "unsupported" });
  }
}

// Shared by Bulge.effectAt and by callers that must read an effect direction
// before a Bulge instance exists, such as a drag-over placement preview.
export function effectAtCoordinate(
  placement: { start: number; size: number; effectZones: RelativeEffectZone[]; effectSupport?: BulgeEffectSupport },
  targetCoordinate: number,
): QualitativeDirection | null {
  if (placement.effectSupport === "unsupported") return null;
  const end = placement.start + placement.size - 1;
  for (const zone of placement.effectZones) {
    // Legacy start-labelled screening ranges were already proximal-edge distances.
    const distance = zone.anchor === "start" || zone.anchor === "nearest-edge"
      ? targetCoordinate - Math.max(placement.start, Math.min(targetCoordinate, end))
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
  bulge: Pick<Bulge, "start" | "end"> & { type?: BulgeType },
  windowStart: number,
  windowEnd: number,
): BulgeOverviewGeometry {
  if (windowEnd < windowStart) throw new Error("Overview window end must not precede its start.");
  const windowLength = windowEnd - windowStart + 1;
  if (bulge.type === "insertion") {
    const fraction = Math.max(0, Math.min(1, (bulge.start - windowStart) / windowLength));
    return { startFraction: fraction, endFraction: fraction, centerFraction: fraction, widthFraction: 0, visibleSize: bulge.start >= windowStart && bulge.start <= windowEnd + 1 ? 1 : 0 };
  }
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
  const bounds = zone.anchor === "start" || zone.anchor === "nearest-edge"
    ? [
      (zone.minDistance > 0 ? bulge.end : bulge.start) + zone.minDistance,
      (zone.maxDistance < 0 ? bulge.start : bulge.end) + zone.maxDistance,
    ]
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
  zones: Record<AdarEnvironment, Partial<Record<BulgeType, Record<string, RelativeEffectZone[]>>>>;
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
    insertion: Array.from({ length: 30 }, (_, i) => ({ id: `insertion-${i + 1}`, type: "insertion" as const, size: i + 1, label: `${i + 1} nt insertion`, effectZones: [], effectSupport: "unsupported" as const })),
  };
}

// ADAR1 remains the compatibility default for callers that do not yet pass an
// environment. Interactive code should call getBulgeCandidates(environment).
export const BULGE_CANDIDATES = getBulgeCandidates("ADAR1");

export function createUnmeasuredEfficiencies(): Record<number, number> {
  return {};
}

/** Legacy entry point: new sessions now keep all missing measurements absent. */
export function createZeroInitializedEfficiencies(
  _adenosinePositions: number[], _targetPosition: number,
): Record<number, number> {
  return createUnmeasuredEfficiencies();
}

export function intervalsOverlap(
  left: Pick<Bulge, "start" | "end">,
  right: { start: number; size: number; type?: BulgeType },
): boolean {
  const rightEnd = right.type === "insertion" ? right.start : right.start + right.size - 1;
  return left.start <= rightEnd && right.start <= left.end;
}

export function validateBulgePlacement(
  existing: Bulge[],
  proposed: { start: number; size: number; type?: BulgeType },
  maximum = MAX_BULGES,
): PlacementValidation {
  if (!Number.isInteger(proposed.start) || !Number.isInteger(proposed.size) || proposed.size < 1) {
    return { valid: false, reason: "Bulge position and size must be positive-integer sequence coordinates." };
  }
  if (proposed.type !== "insertion" && proposed.start <= TARGET_COORDINATE && proposed.start + proposed.size - 1 >= TARGET_COORDINATE) {
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

// Proposal changes are separate from the immutable experimentally tested baseline.
export function removeRemovableBulge(bulges: Bulge[], id: string): Bulge[] {
  return bulges.filter((bulge) => bulge.id !== id);
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
  const complement: Record<string, string> = { A: "U", C: "G", G: "C", T: "A", U: "A" };
  return mismatch.split("").some((base, i) => base === complement[target[i]])
    ? "Each selected mismatch base must be non-complementary to the target."
    : null;
}

export function validateProtocolDuplex(
  target: string, alignedGuide: string, targetIndex: number, bulges: Bulge[], environment: AdarEnvironment,
): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const [coreStart, coreEnd] = environment === "ADAR1" ? [-4, 25] : [-6, 11];
  const windowStart = -targetIndex;
  const windowEnd = target.length - targetIndex - 1;
  if (windowStart > coreStart || windowEnd < coreEnd) errors.push(`${environment} requires target coverage ${coreStart}…+${coreEnd}.`);
  const complement: Record<string, string> = { A: "U", C: "G", G: "C", T: "A", U: "A" };
  const paired = (coordinate: number, ignoreInsertion?: string) => {
    const i = coordinate + targetIndex;
    if (i < 0 || i >= target.length || coordinate === 0) return false;
    if (bulges.some((b) => b.type === "insertion" ? b.id !== ignoreInsertion && b.start === coordinate : coordinate >= b.start && coordinate <= b.end)) return false;
    return alignedGuide[i]?.replace(/T/g, "U") === complement[target[i]];
  };
  for (const b of bulges) {
    if (b.start < windowStart || b.end > windowEnd) errors.push("A structure extends beyond the target window.");
    const external = b.end < coreStart || b.start > coreEnd;
    if (external) {
      const left = b.start - 1;
      const right = b.type === "insertion" ? b.start : b.end + 1;
      const good = Array.from({ length: 10 }, (_, i) => paired(left - i, b.id) && paired(right + i, b.id)).every(Boolean);
      if (!good) errors.push(`External ${b.type} at ${b.start} requires at least 10 complementary nucleotides on each side.`);
    } else {
      warnings.push(`Internal ${b.type} perturbs the ${environment} productive region; compare target and bystander editing experimentally.`);
    }
  }
  if (bulges.some((b) => b.effectSupport === "unsupported")) warnings.push("Some structural effects are unknown; no rule-based activity is assigned to them.");
  return { valid: errors.length === 0, errors, warnings };
}

export function createProposalAlignedGuide(target: string, targetIndex: number): string {
  const complement: Record<string, string> = { A: "U", C: "G", G: "C", T: "A", U: "A" };
  return target.toUpperCase().split("").map((base, i) => i === targetIndex ? "C" : complement[base]).join("");
}

export function createManualBulge(
  input: { id: string; type: BulgeType; start: number; size: number; bases?: string },
  target: string, targetIndex: number, environment: AdarEnvironment,
): Bulge {
  const bases = input.bases?.toUpperCase().replace(/T/g, "U").replace(/\s/g, "");
  if (input.type !== "deletion" && (!bases || bases.length !== input.size || /[^ACGU]/.test(bases))) throw new Error(`Enter exactly ${input.size} A, C, G or U bases in aligned arRNA 3′→5′ order.`);
  const segment = target.slice(input.start + targetIndex, input.start + targetIndex + input.size);
  if (input.type === "mismatch") {
    const error = validateMismatchSequence(segment, bases!);
    if (error) throw new Error(error);
  }
  const supported = input.type === "deletion" || (input.type === "mismatch" && bases === createAutoMismatchSequence(segment));
  return new Bulge({ ...input, source: "user", mismatchBases: input.type === "mismatch" ? bases : undefined,
    insertionBases: input.type === "insertion" ? bases : undefined,
    effectSupport: supported && input.size <= 30 ? "supported" : "unsupported",
    effectZones: supported ? getCoreEffectZones(environment, input.type, input.size) : [],
  });
}

/** NP position is the tract edge nearest design A0; insertion uses an explicit target boundary. */
export function protocolPositionToInterval(position: number, size: number, type: BulgeType = "deletion"): EffectZoneInterval {
  if (!Number.isInteger(position) || !Number.isInteger(size) || size < 1) throw new Error("Position must be an integer and size a positive integer.");
  if (type === "insertion") return { start: position, end: position };
  if (position === 0) throw new Error("A bulge position at A0 (zero) is not allowed.");
  return position < 0 ? { start: position - size + 1, end: position } : { start: position, end: position + size - 1 };
}

export function intervalToProtocolPosition(bulge: Pick<Bulge, "start" | "end"> & { type?: BulgeType }): number {
  if (bulge.type === "insertion") return bulge.start;
  if (bulge.end < 0) return bulge.end;
  if (bulge.start > 0) return bulge.start;
  throw new Error("The structural interval must not cover A0.");
}
