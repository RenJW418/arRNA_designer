import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getBulgeFocusClass,
  getGuidedProgress,
  getManualGuideCandidate,
  getVisibleRecommendations,
} from "./guidedOptimization.ts";
import type { BulgeCandidate } from "./bulgeOptimization.ts";

describe("guided optimization progress", () => {
  it("keeps the next required action unambiguous", () => {
    assert.deepEqual(getGuidedProgress(false, false, 0), ["current", "pending", "pending"]);
    assert.deepEqual(getGuidedProgress(true, false, 0), ["complete", "current", "pending"]);
    assert.deepEqual(getGuidedProgress(true, true, 0), ["complete", "complete", "current"]);
    assert.deepEqual(getGuidedProgress(true, true, 3), ["complete", "complete", "complete"]);
  });
});

describe("guided recommendation disclosure", () => {
  it("shows only the top recommendation until comparison is requested", () => {
    const recommendations = [{ id: "r1" }, { id: "r2" }, { id: "r3" }];

    assert.deepEqual(getVisibleRecommendations(recommendations, false), [{ id: "r1" }]);
    assert.deepEqual(getVisibleRecommendations(recommendations, true), recommendations);
  });

  it("handles an empty result without creating a placeholder recommendation", () => {
    assert.deepEqual(getVisibleRecommendations([], false), []);
  });
});

describe("manual bulge focus", () => {
  it("highlights one bulge while muting the other placed bulges", () => {
    assert.equal(getBulgeFocusClass("b1", null), "");
    assert.equal(getBulgeFocusClass("b1", "b1"), "focused");
    assert.equal(getBulgeFocusClass("b2", "b1"), "dimmed");
  });
});

describe("manual design guide candidate selection", () => {
  const candidates: BulgeCandidate[] = [
    { id: "deletion-5", type: "deletion", size: 5, label: "5 nt deletion", effectZones: [] },
    { id: "deletion-10", type: "deletion", size: 10, label: "10 nt deletion", effectZones: [] },
    { id: "mismatch-3", type: "mismatch", size: 3, label: "3 nt mismatch", effectZones: [] },
    { id: "mismatch-5", type: "mismatch", size: 5, label: "5 nt mismatch", effectZones: [] },
  ];

  it("keeps a selected candidate when it belongs to the active type", () => {
    assert.equal(getManualGuideCandidate(candidates, "deletion", "deletion-5")?.id, "deletion-5");
  });

  it("falls back to the preferred size when the active type changes", () => {
    assert.equal(getManualGuideCandidate(candidates, "deletion", "mismatch-5")?.id, "deletion-10");
    assert.equal(getManualGuideCandidate(candidates, "mismatch", "deletion-10")?.id, "mismatch-5");
  });
});
