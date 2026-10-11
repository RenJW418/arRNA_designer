import assert from "node:assert/strict";
import { test } from "node:test";
import { createOptimizationEvidenceState, parseMeasuredEfficiency } from "./bulgeOptimization.ts";

test("invalid percentages cannot be represented as measured experimental evidence", () => {
  assert.throws(() => createOptimizationEvidenceState(undefined, {76:110,86:-1}, []), /0.*100/);
});
test("nonfinite experimental evidence is rejected rather than silently lost", () => {
  assert.throws(() => createOptimizationEvidenceState(undefined, {76:Infinity}, []), /0.*100/);
});
test("unknown and explicitly measured zero remain distinct", () => {
  const evidence = createOptimizationEvidenceState(undefined, {76:0}, [], undefined, new Set([76]), "improve-target", undefined, [76,86]);
  assert.deepEqual(evidence.observed_editing_efficiencies, {76:0});
  assert.deepEqual(evidence.observed_editing_status, {76:"measured",86:"unmeasured"});
});

test("percentage parsing preserves valid boundaries and fractions without inventing measurements", () => {
  assert.equal(parseMeasuredEfficiency(""), undefined);
  assert.equal(parseMeasuredEfficiency("0"), 0);
  assert.equal(parseMeasuredEfficiency("100"), 100);
  assert.equal(parseMeasuredEfficiency("42.5"), 42.5);
  for (const value of ["-1", "110", "NaN", "Infinity"]) assert.throws(() => parseMeasuredEfficiency(value), RangeError);
});
