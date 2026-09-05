import {
  Bulge,
  MAX_BULGES,
  createAutoMismatchSequence,
  evaluateQualitativeEffect,
  validateBulgePlacement,
  type BulgeCandidate,
  type OptimizationGoal,
} from "./bulgeOptimization.ts";

export interface ObservedAdenosine {
  coordinate: number;
  absolutePosition: number;
  observedEfficiency: number;
}

export interface BulgeRecommendationScore {
  total: number;
  targetBenefit: number;
  targetRisk: number;
  bystanderBenefit: number;
  bystanderRisk: number;
  overlapPenalty: number;
  bulgeCountPenalty: number;
  pairingDisruptionPenalty: number;
  arRNALengthPenalty: number;
}

export interface BulgeRecommendationImpact {
  targetEffect: "none" | "increase" | "decrease" | "unresolved";
  increasedBystanders: ObservedAdenosine[];
  decreasedBystanders: ObservedAdenosine[];
  unresolvedSites: ObservedAdenosine[];
}

export interface BulgeRecommendation {
  id: string;
  addedBulges: Bulge[];
  allBulges: Bulge[];
  score: BulgeRecommendationScore;
  impact: BulgeRecommendationImpact;
}

export interface RecommendBulgeDesignsInput {
  candidates: BulgeCandidate[];
  initialBulges: Bulge[];
  targetWindow: string;
  targetIndex: number;
  sites: ObservedAdenosine[];
  maxResults?: number;
  beamWidth?: number;
  maximumBulges?: number;
  optimizationGoal?: OptimizationGoal;
}

interface SearchPlacement {
  bulge: Bulge;
  key: string;
}

interface SearchState {
  placementIndexes: number[];
  addedBulges: Bulge[];
  score: BulgeRecommendationScore;
  key: string;
}

const SCORE = {
  targetIncrease: 120,
  targetConcordantIncrease: 90,
  targetDecrease: 180,
  targetConflict: 220,
  bystanderIncreaseFloor: 10,
  concordantOverlap: 10,
  conflictingOverlap: 25,
  targetConcordantOverlap: 20,
  targetConflictingOverlap: 50,
  bulgeCount: 5,
  pairingDisruptionPerNt: 1.25,
  arRNALengthLossPerNt: 0.25,
} as const;

const MAX_PLACEMENTS_PER_CANDIDATE = 12;

function roundScore(value: number): number {
  return Math.round(value * 10) / 10;
}

function normalizedEfficiency(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function directionsFor(effects: Array<{ effect: "increase" | "decrease" }>): Set<"increase" | "decrease"> {
  return new Set(effects.map(({ effect }) => effect));
}

export function scoreBulgeDesign(
  bulges: Bulge[],
  sites: ObservedAdenosine[],
  optimizationGoal: OptimizationGoal = "improve-target",
): BulgeRecommendationScore {
  let targetBenefit = 0;
  let targetRisk = 0;
  let bystanderBenefit = 0;
  let bystanderRisk = 0;
  let overlapPenalty = 0;

  for (const site of sites) {
    const evaluation = evaluateQualitativeEffect(site.coordinate, bulges);
    if (evaluation.status === "none") continue;
    const directions = directionsFor(evaluation.effects);
    const isMultiple = evaluation.status === "multiple";

    if (site.coordinate === 0) {
      if (isMultiple) {
        overlapPenalty += evaluation.overlap === "conflicting"
          ? SCORE.targetConflictingOverlap
          : SCORE.targetConcordantOverlap;
        if (directions.size > 1) targetRisk += SCORE.targetConflict;
        else if (directions.has("increase")) {
          if (optimizationGoal === "improve-target") targetBenefit += SCORE.targetConcordantIncrease;
        } else targetRisk += SCORE.targetDecrease;
      } else if (evaluation.status === "increase") {
        if (optimizationGoal === "improve-target") targetBenefit += SCORE.targetIncrease;
      } else {
        targetRisk += SCORE.targetDecrease;
      }
      continue;
    }

    if (isMultiple) {
      overlapPenalty += evaluation.overlap === "conflicting"
        ? SCORE.conflictingOverlap
        : SCORE.concordantOverlap;
      continue;
    }

    const observed = normalizedEfficiency(site.observedEfficiency);
    if (evaluation.status === "decrease") bystanderBenefit += observed;
    else bystanderRisk += SCORE.bystanderIncreaseFloor + observed;
  }

  const addedBulges = bulges.filter(({ source }) => source === "user");
  const bulgeCountPenalty = addedBulges.length * SCORE.bulgeCount;
  const pairingDisruptionPenalty = addedBulges.reduce(
    (sum, { size }) => sum + size * SCORE.pairingDisruptionPerNt,
    0,
  );
  const arRNALengthPenalty = addedBulges.reduce(
    (sum, { size, type }) => sum + (type === "deletion" ? size * SCORE.arRNALengthLossPerNt : 0),
    0,
  );
  const total = targetBenefit + bystanderBenefit
    - targetRisk - bystanderRisk - overlapPenalty - bulgeCountPenalty
    - pairingDisruptionPenalty - arRNALengthPenalty;

  return {
    total: roundScore(total),
    targetBenefit: roundScore(targetBenefit),
    targetRisk: roundScore(targetRisk),
    bystanderBenefit: roundScore(bystanderBenefit),
    bystanderRisk: roundScore(bystanderRisk),
    overlapPenalty: roundScore(overlapPenalty),
    bulgeCountPenalty: roundScore(bulgeCountPenalty),
    pairingDisruptionPenalty: roundScore(pairingDisruptionPenalty),
    arRNALengthPenalty: roundScore(arRNALengthPenalty),
  };
}

function summarizeImpact(bulges: Bulge[], sites: ObservedAdenosine[]): BulgeRecommendationImpact {
  const impact: BulgeRecommendationImpact = {
    targetEffect: "none",
    increasedBystanders: [],
    decreasedBystanders: [],
    unresolvedSites: [],
  };
  for (const site of sites) {
    const evaluation = evaluateQualitativeEffect(site.coordinate, bulges);
    if (site.coordinate === 0) {
      impact.targetEffect = evaluation.status === "multiple" ? "unresolved" : evaluation.status;
    } else if (evaluation.status === "multiple") {
      impact.unresolvedSites.push({ ...site });
    } else if (evaluation.status === "increase") {
      impact.increasedBystanders.push({ ...site });
    } else if (evaluation.status === "decrease") {
      impact.decreasedBystanders.push({ ...site });
    }
  }
  return impact;
}

function compareStates(left: SearchState, right: SearchState): number {
  return right.score.total - left.score.total
    || left.addedBulges.length - right.addedBulges.length
    || left.addedBulges.reduce((sum, { size }) => sum + size, 0)
      - right.addedBulges.reduce((sum, { size }) => sum + size, 0)
    || left.key.localeCompare(right.key);
}

function createPlacement(
  candidate: BulgeCandidate,
  start: number,
  targetWindow: string,
  targetIndex: number,
): SearchPlacement {
  const startIndex = start + targetIndex;
  const targetSegment = targetWindow.slice(startIndex, startIndex + candidate.size);
  const key = `${candidate.type}:${candidate.size}:${start}`;
  return {
    key,
    bulge: new Bulge({
      id: `recommended-${candidate.type}-${candidate.size}-${start}`,
      candidateId: candidate.id,
      type: candidate.type,
      start,
      size: candidate.size,
      source: "user",
      effectZones: candidate.effectZones,
      mismatchBases: candidate.type === "mismatch"
        ? createAutoMismatchSequence(targetSegment)
        : undefined,
    }),
  };
}

function createPlacementPool(input: RecommendBulgeDesignsInput): SearchPlacement[] {
  const windowStart = -input.targetIndex;
  const initialBulges = input.initialBulges;
  const placements = input.candidates.flatMap((candidate) => {
    if (candidate.effectZones.length === 0 || candidate.size > input.targetWindow.length) return [];
    const windowEndStart = input.targetWindow.length - input.targetIndex - candidate.size;
    const useful: Array<SearchPlacement & { score: number }> = [];
    for (let start = windowStart; start <= windowEndStart; start += 1) {
      const end = start + candidate.size - 1;
      if (start <= 0 && end >= 0) continue;
      if (!validateBulgePlacement(initialBulges, { start, size: candidate.size }).valid) continue;
      const placement = createPlacement(candidate, start, input.targetWindow, input.targetIndex);
      if (!input.sites.some(({ coordinate }) => placement.bulge.effectAt(coordinate) !== null)) continue;
      useful.push({
        ...placement,
        score: scoreBulgeDesign(
          [...initialBulges, placement.bulge],
          input.sites,
          input.optimizationGoal,
        ).total,
      });
    }
    return useful
      .sort((left, right) => right.score - left.score || left.key.localeCompare(right.key))
      .slice(0, MAX_PLACEMENTS_PER_CANDIDATE)
      .map(({ score: _score, ...placement }) => placement);
  });
  return placements.sort((left, right) => left.key.localeCompare(right.key));
}

function canonicalKey(bulges: Bulge[]): string {
  return bulges
    .map(({ type, size, start }) => `${type}:${size}:${start}`)
    .sort()
    .join("|");
}

export function recommendBulgeDesigns(input: RecommendBulgeDesignsInput): BulgeRecommendation[] {
  const optimizationGoal = input.optimizationGoal ?? "improve-target";
  const maximumBulges = Math.max(1, Math.min(MAX_BULGES, input.maximumBulges ?? MAX_BULGES));
  const availableSlots = maximumBulges - input.initialBulges.length;
  const maxResults = Math.max(1, Math.min(50, input.maxResults ?? 10));
  const beamWidth = Math.max(maxResults, Math.min(400, input.beamWidth ?? 120));
  if (availableSlots <= 0 || input.sites.length === 0) return [];

  const placements = createPlacementPool(input);
  if (placements.length === 0) return [];

  const baselineScore = scoreBulgeDesign(input.initialBulges, input.sites, optimizationGoal);
  let beam: SearchState[] = [{
    placementIndexes: [],
    addedBulges: [],
    score: baselineScore,
    key: "",
  }];
  const completed = new Map<string, SearchState>();

  for (let depth = 1; depth <= availableSlots; depth += 1) {
    const nextByKey = new Map<string, SearchState>();
    for (const state of beam) {
      const minimumIndex = (state.placementIndexes.at(-1) ?? -1) + 1;
      for (let placementIndex = minimumIndex; placementIndex < placements.length; placementIndex += 1) {
        const placement = placements[placementIndex];
        const existing = [...input.initialBulges, ...state.addedBulges];
        if (!validateBulgePlacement(existing, placement.bulge).valid) continue;
        const addedBulges = [...state.addedBulges, placement.bulge];
        const allBulges = [...input.initialBulges, ...addedBulges];
        const key = canonicalKey(addedBulges);
        const nextState: SearchState = {
          placementIndexes: [...state.placementIndexes, placementIndex],
          addedBulges,
          score: scoreBulgeDesign(allBulges, input.sites, optimizationGoal),
          key,
        };
        const duplicate = nextByKey.get(key);
        if (!duplicate || compareStates(nextState, duplicate) < 0) nextByKey.set(key, nextState);
      }
    }
    beam = [...nextByKey.values()].sort(compareStates).slice(0, beamWidth);
    for (const state of beam) completed.set(state.key, state);
    if (beam.length === 0) break;
  }

  return [...completed.values()]
    .sort(compareStates)
    .map((state) => {
      const allBulges = [...input.initialBulges, ...state.addedBulges];
      return {
        id: state.key,
        addedBulges: state.addedBulges.map((item) => new Bulge({ ...item })),
        allBulges: allBulges.map((item) => new Bulge({ ...item })),
        score: { ...state.score },
        impact: summarizeImpact(allBulges, input.sites),
      };
    })
    .filter(({ impact, score }) => {
      const targetIsSafe = impact.targetEffect !== "decrease" && impact.targetEffect !== "unresolved";
      const targetMatchesGoal = optimizationGoal === "improve-target"
        ? impact.targetEffect === "increase"
        : targetIsSafe;
      return targetMatchesGoal && score.total > baselineScore.total;
    })
    .slice(0, maxResults);
}

export function createOptimizedArrnaSequence(
  alignedGuide: string,
  targetWindow: string,
  targetIndex: number,
  bulges: Bulge[],
): string {
  if (alignedGuide.length !== targetWindow.length) {
    throw new Error("Aligned arRNA and target window must have the same length.");
  }
  const aligned = alignedGuide.split("").map((base, index) => {
    const coordinate = index - targetIndex;
    const occupying = bulges.find(({ start, end }) => coordinate >= start && coordinate <= end);
    if (occupying?.type === "deletion") return "-";
    if (occupying?.type === "mismatch") {
      return occupying.mismatchBases?.[coordinate - occupying.start] ?? "?";
    }
    return base;
  });
  return aligned.filter((base) => base !== "-").reverse().join("");
}
