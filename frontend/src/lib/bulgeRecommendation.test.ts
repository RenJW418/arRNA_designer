import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Bulge, type BulgeCandidate } from "./bulgeOptimization.ts";
import {
  createOptimizedArrnaSequence,
  recommendBulgeDesigns,
  scoreBulgeDesign,
} from "./bulgeRecommendation.ts";

function bulge(
  id: string,
  start: number,
  effect: "increase" | "decrease",
  source: "initial" | "user" = "user",
): Bulge {
  return new Bulge({
    id,
    type: "mismatch",
    start,
    size: 1,
    source,
    effectZones: [{ anchor: "start", minDistance: -20, maxDistance: 20, effect }],
    mismatchBases: "A",
  });
}

function candidate(
  id: string,
  type: "deletion" | "mismatch",
  size: number,
  effect: "increase" | "decrease",
  minDistance = 0,
  maxDistance = 0,
): BulgeCandidate {
  return {
    id,
    type,
    size,
    label: `${size} nt ${type}`,
    effectZones: [{ anchor: "start", minDistance, maxDistance, effect }],
  };
}

describe("qualitative bulge recommendation scoring", () => {
  it("ranks a target-A increase above a target-A decrease", () => {
    const sites = [{ coordinate: 0, absolutePosition: 101, observedEfficiency: 25 }];

    const increased = scoreBulgeDesign([bulge("increase", -1, "increase")], sites);
    const decreased = scoreBulgeDesign([bulge("decrease", -1, "decrease")], sites);

    assert.ok(increased.total > decreased.total);
    assert.ok(increased.targetBenefit > 0);
    assert.ok(decreased.targetRisk > 0);
  });

  it("rewards decreasing a highly edited bystander more than a weakly edited bystander", () => {
    const highEfficiency = scoreBulgeDesign([bulge("decrease-high", 10, "decrease")], [
      { coordinate: 0, absolutePosition: 101, observedEfficiency: 40 },
      { coordinate: 10, absolutePosition: 111, observedEfficiency: 80 },
    ]);
    const lowEfficiency = scoreBulgeDesign([bulge("decrease-low", 10, "decrease")], [
      { coordinate: 0, absolutePosition: 101, observedEfficiency: 40 },
      { coordinate: 10, absolutePosition: 111, observedEfficiency: 5 },
    ]);

    assert.ok(highEfficiency.bystanderBenefit > lowEfficiency.bystanderBenefit);
    assert.ok(highEfficiency.total > lowEfficiency.total);
  });

  it("does not convert overlapping qualitative effects into a combined benefit", () => {
    const sites = [
      { coordinate: 0, absolutePosition: 101, observedEfficiency: 40 },
      { coordinate: 10, absolutePosition: 111, observedEfficiency: 80 },
    ];
    const single = scoreBulgeDesign([bulge("single", 10, "decrease")], sites);
    const overlapping = scoreBulgeDesign([
      bulge("first", 10, "decrease"),
      bulge("second", 11, "decrease"),
    ], sites);

    assert.equal(overlapping.bystanderBenefit, 0);
    assert.ok(overlapping.overlapPenalty > single.overlapPenalty);
  });

  it("does not trade a large loss of annealing for one modest bystander benefit", () => {
    const sites = [
      { coordinate: 0, absolutePosition: 101, observedEfficiency: 25 },
      { coordinate: 20, absolutePosition: 121, observedEfficiency: 30 },
    ];
    const compact = new Bulge({
      id: "compact",
      type: "mismatch",
      start: -1,
      size: 1,
      source: "user",
      effectZones: [{ anchor: "start", minDistance: 1, maxDistance: 1, effect: "increase" }],
      mismatchBases: "A",
    });
    const large = new Bulge({
      id: "large",
      type: "mismatch",
      start: 1,
      size: 30,
      source: "user",
      effectZones: [
        { anchor: "start", minDistance: -1, maxDistance: -1, effect: "increase" },
        { anchor: "start", minDistance: 19, maxDistance: 19, effect: "decrease" },
      ],
      mismatchBases: "A".repeat(30),
    });

    assert.ok(scoreBulgeDesign([compact], sites).total > scoreBulgeDesign([large], sites).total);
  });

  it("does not reward a target increase when the goal is to preserve A0", () => {
    const sites = [{ coordinate: 0, absolutePosition: 101, observedEfficiency: 85 }];

    const improved = scoreBulgeDesign([bulge("increase", -1, "increase")], sites, "improve-target");
    const preserved = scoreBulgeDesign([bulge("increase", -1, "increase")], sites, "preserve-target");

    assert.ok(improved.targetBenefit > 0);
    assert.equal(preserved.targetBenefit, 0);
  });

  it("prefers preserving arRNA length when deletion and mismatch have the same qualitative effect", () => {
    const sites = [{ coordinate: 0, absolutePosition: 101, observedEfficiency: 25 }];
    const effectZones = [{ anchor: "start" as const, minDistance: 5, maxDistance: 5, effect: "increase" as const }];
    const mismatch = new Bulge({
      id: "mismatch",
      type: "mismatch",
      start: -5,
      size: 5,
      source: "user",
      effectZones,
      mismatchBases: "AAAAA",
    });
    const deletion = new Bulge({
      id: "deletion",
      type: "deletion",
      start: -5,
      size: 5,
      source: "user",
      effectZones,
    });

    assert.ok(scoreBulgeDesign([mismatch], sites).total > scoreBulgeDesign([deletion], sites).total);
  });
});

describe("automatic bulge combination search", () => {
  it("returns at most ten distinct legal recommendations without replacing A0", () => {
    const recommendations = recommendBulgeDesigns({
      candidates: [
        candidate("increase-upstream", "mismatch", 1, "increase", 1, 1),
        candidate("decrease-bystander", "deletion", 1, "decrease", 2, 2),
      ],
      initialBulges: [],
      targetWindow: "AAAAAAAAAAA",
      targetIndex: 5,
      sites: [
        { coordinate: 0, absolutePosition: 101, observedEfficiency: 20 },
        { coordinate: 2, absolutePosition: 103, observedEfficiency: 70 },
        { coordinate: -2, absolutePosition: 99, observedEfficiency: 15 },
      ],
      maxResults: 10,
      beamWidth: 40,
    });

    assert.ok(recommendations.length > 0);
    assert.ok(recommendations.length <= 10);
    assert.equal(new Set(recommendations.map(({ id }) => id)).size, recommendations.length);
    assert.ok(recommendations.every(({ addedBulges }) =>
      addedBulges.every((item) => item.end < 0 || item.start > 0)));
    assert.ok(recommendations.every(({ allBulges }) => allBulges.length <= 4));
    assert.ok(recommendations.every(({ allBulges }) => allBulges.every((left, leftIndex) =>
      allBulges.every((right, rightIndex) => leftIndex === rightIndex || left.end < right.start || right.end < left.start))));
  });

  it("counts starting bulges toward the maximum and never overlaps them", () => {
    const initialBulges = [-5, -3, 3].map((start, index) => new Bulge({
      id: `initial-${index}`,
      type: "deletion",
      start,
      size: 1,
      source: "initial",
      effectZones: [],
    }));
    const recommendations = recommendBulgeDesigns({
      candidates: [candidate("target-increase", "mismatch", 1, "increase", 1, 1)],
      initialBulges,
      targetWindow: "AAAAAAAAAAA",
      targetIndex: 5,
      sites: [{ coordinate: 0, absolutePosition: 101, observedEfficiency: 20 }],
      maxResults: 10,
      beamWidth: 20,
    });

    assert.ok(recommendations.length > 0);
    assert.ok(recommendations.every(({ addedBulges, allBulges }) => addedBulges.length === 1 && allBulges.length === 4));
    assert.ok(recommendations.every(({ addedBulges }) => ![-5, -3, 3].includes(addedBulges[0].start)));
  });

  it("returns no recommendation when every legal combination decreases A0", () => {
    const recommendations = recommendBulgeDesigns({
      candidates: [candidate("target-decrease", "deletion", 1, "decrease", 1, 1)],
      initialBulges: [],
      targetWindow: "AAAAAAAAAAA",
      targetIndex: 5,
      sites: [{ coordinate: 0, absolutePosition: 101, observedEfficiency: 20 }],
      maxResults: 10,
    });

    assert.deepEqual(recommendations, []);
  });

  it("can reduce a measured bystander without requiring an A0 increase in preserve-target mode", () => {
    const input = {
      candidates: [candidate("decrease-bystander", "mismatch" as const, 1, "decrease" as const, 0, 0)],
      initialBulges: [],
      targetWindow: "AAAAAAAAAAA",
      targetIndex: 5,
      sites: [
        { coordinate: 0, absolutePosition: 101, observedEfficiency: 85 },
        { coordinate: 2, absolutePosition: 103, observedEfficiency: 70 },
      ],
      maxResults: 10,
    };

    assert.deepEqual(recommendBulgeDesigns({ ...input, optimizationGoal: "improve-target" }), []);
    const preserved = recommendBulgeDesigns({ ...input, optimizationGoal: "preserve-target" });
    assert.ok(preserved.length > 0);
    assert.equal(preserved[0].impact.targetEffect, "none");
    assert.equal(preserved[0].impact.decreasedBystanders[0].coordinate, 2);
  });
});

describe("recommended sequence materialization", () => {
  it("applies deletions and same-base mismatches while preserving 5-to-3 output orientation", () => {
    const optimized = createOptimizedArrnaSequence(
      "UGCAU",
      "ACGTA",
      2,
      [
        new Bulge({
          id: "delete",
          type: "deletion",
          start: -2,
          size: 1,
          source: "user",
          effectZones: [],
        }),
        new Bulge({
          id: "mismatch",
          type: "mismatch",
          start: 1,
          size: 1,
          source: "user",
          effectZones: [],
          mismatchBases: "U",
        }),
      ],
    );

    assert.equal(optimized, "UUCG");
  });
});
