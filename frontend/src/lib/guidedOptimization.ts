import type { BulgeCandidate, BulgeType } from "./bulgeOptimization";

export type GuidedStepState = "complete" | "current" | "pending";

export function getGuidedProgress(
  sourceLocked: boolean,
  targetMeasured: boolean,
  recommendationCount: number,
): [GuidedStepState, GuidedStepState, GuidedStepState] {
  if (!sourceLocked) return ["current", "pending", "pending"];
  if (!targetMeasured) return ["complete", "current", "pending"];
  if (recommendationCount === 0) return ["complete", "complete", "current"];
  return ["complete", "complete", "complete"];
}

export function getVisibleRecommendations<T>(recommendations: T[], showAll: boolean): T[] {
  return showAll ? recommendations : recommendations.slice(0, 1);
}

export function getBulgeFocusClass(bulgeId: string, focusedBulgeId: string | null): "" | "focused" | "dimmed" {
  if (!focusedBulgeId) return "";
  return bulgeId === focusedBulgeId ? "focused" : "dimmed";
}

export function getManualGuideCandidate(
  candidates: BulgeCandidate[],
  type: BulgeType,
  selectedId: string | null,
): BulgeCandidate | null {
  const candidatesOfType = candidates.filter((candidate) => candidate.type === type);
  const selected = candidatesOfType.find(({ id }) => id === selectedId);
  if (selected) return selected;
  const preferredSize = type === "deletion" ? 10 : 5;
  return candidatesOfType.find(({ size }) => size === preferredSize) ?? candidatesOfType[0] ?? null;
}
