import assert from "node:assert/strict";
import { it } from "node:test";
import * as optimization from "./bulgeOptimization.ts";
import { createOptimizedArrnaSequence, scoreBulgeDesign, recommendBulgeDesigns } from "./bulgeRecommendation.ts";
import { createTestedDuplex } from "./testedDuplex.ts";
import * as guided from "./guidedOptimization.ts";

it("uses the nearest evaluated-A edge for universal upstream deletion", () => {
  for (const environment of ["ADAR1", "ADAR2"] as const) {
    const b = new optimization.Bulge({ id: "universal", type: "deletion", start: -58, size: 28, source: "initial", effectZones: optimization.getCoreEffectZones(environment, "deletion", 28) });
    assert.equal(b.effectAt(0), "increase");
  }
});

it("projects positive distances from the right edge in the displayed effect range", () => {
  assert.deepEqual(optimization.createAbsoluteEffectZoneInterval({ start: -58, end: -31 }, { anchor: "start", minDistance: 29, maxDistance: 31, effect: "increase" }), { start: -2, end: 0 });
});

it("does not score an unmeasured bystander as measured zero", () => {
  const b = new optimization.Bulge({ id: "b", type: "mismatch", start: 10, size: 1, source: "user", mismatchBases: "A", effectZones: [{ anchor: "start", minDistance: 1, maxDistance: 2, effect: "increase" }] });
  assert.equal(scoreBulgeDesign([b], [{ coordinate: 11, absolutePosition: 12, observedEfficiency: 0, measurementStatus: "unmeasured" }]).bystanderRisk, 0);
  assert.equal(scoreBulgeDesign([b], [{ coordinate: 11, absolutePosition: 12, observedEfficiency: 0, measurementStatus: "measured" }]).bystanderRisk, 10);
});

it("allows manual A/G mismatches while rejecting complementary bases", () => {
  assert.equal(optimization.validateMismatchSequence("A", "G"), null);
  assert.notEqual(optimization.validateMismatchSequence("A", "U"), null);
});

it("can remove a starting structure in the proposal without mutating the tested array", () => {
  const baseline = [new optimization.Bulge({ id: "tested", type: "deletion", start: 3, size: 1, source: "initial", effectZones: [] })];
  assert.equal(optimization.removeRemovableBulge(baseline, "tested").length, 0);
  assert.equal(baseline.length, 1);
});

it("exports manual insertion bases in antiparallel order without changing target coverage", () => {
  const b = new optimization.Bulge({ id: "insert", type: "insertion", start: 2, size: 2, insertionBases: "AG", source: "user", effectSupport: "unsupported", effectZones: [] });
  // Target ACGT, baseline aligned UGCA; insert AG before target index 2.
  assert.equal(createOptimizedArrnaSequence("UGCA", "ACGT", 0, [b]), "ACGAGU");
  assert.equal(b.effectAt(1), null);
});

it("rejects an external bulge without ten truly paired flanking nucleotides", () => {
  assert.equal(typeof optimization.validateProtocolDuplex, "function");
  const terminal = new optimization.Bulge({ id: "edge", type: "deletion", start: -75, size: 28, source: "user", effectZones: [] });
  const report = optimization.validateProtocolDuplex("A".repeat(151), "U".repeat(75) + "C" + "U".repeat(75), 75, [terminal], "ADAR1");
  assert.equal(report.valid, false);
});

it("keeps small internal bulges permissible while flagging disrupted productive coverage", () => {
  assert.equal(typeof optimization.validateProtocolDuplex, "function");
  const baseline = "U".repeat(75) + "C" + "U".repeat(75);
  const small = new optimization.Bulge({ id: "internal", type: "deletion", start: 4, size: 1, source: "user", effectZones: [] });
  const report = optimization.validateProtocolDuplex("A".repeat(151), baseline, 75, [small], "ADAR1");
  assert.equal(report.valid, true);
  assert.ok(report.warnings.length > 0);
});

it("imports an inserted tested arRNA without losing its original sequence", () => {
  // Aligned UC[G]GAC at ACGUA, A0 is the first A; inserted G before position 2.
  const duplex = createTestedDuplex({ targetSequence: "ACGUA", arrnaSequence: "UACGGC", targetAPosition: 1, environment: "ADAR1" });
  assert.equal(duplex.arrnaSequence, "UACGGC");
  assert.ok(duplex.initialBulges.some((b) => b.type === "insertion"));
  assert.equal(duplex.alignedGuide.length, duplex.targetWindow.length);
});

it("exports the tested guide independently of a modified proposal", () => {
  const baseline = { arrna_sequence: "ACGU", aligned_guide: "UGCA", structures: [] };
  const evidence = optimization.createOptimizationEvidenceState("tested", { 2: 30 }, [], "AGGU", new Set([2]), "improve-target", baseline);
  baseline.arrna_sequence = "AAAA";
  assert.equal(evidence.tested_baseline?.arrna_sequence, "ACGU");
  assert.equal(evidence.optimized_arrna_sequence, "AGGU");
});

it("classifies a manual A/G tract as unknown and same-base as rule-supported", () => {
  assert.equal(typeof optimization.createManualBulge, "function");
  const input = { id: "manual", type: "mismatch", start: 4, size: 1, bases: "G" };
  const unknown = optimization.createManualBulge(input, "A".repeat(151), 75, "ADAR1");
  assert.equal(unknown.effectSupport, "unsupported");
  assert.equal(unknown.effectAt(0), null);
  const supported = optimization.createManualBulge({ ...input, bases: "A" }, "A".repeat(151), 75, "ADAR1");
  assert.equal(supported.effectSupport, "supported");
});

it("restores complementary bases after moving a tested deletion in a proposal", () => {
  assert.equal(typeof optimization.createProposalAlignedGuide, "function");
  const aligned = optimization.createProposalAlignedGuide("ACGUA", 0);
  const moved = new optimization.Bulge({ id: "moved", type: "deletion", start: 3, size: 1, source: "user", effectZones: [] });
  assert.equal(createOptimizedArrnaSequence(aligned, "ACGUA", 0, [moved]), "UCGC");
});

it("requires paired flanks rather than merely ten target bases on each side", () => {
  const external = new optimization.Bulge({ id: "external", type: "deletion", start: 34, size: 10, source: "user", effectZones: [] });
  const interrupted = new optimization.Bulge({ id: "interrupt", type: "mismatch", start: 30, size: 1, mismatchBases: "A", source: "user", effectZones: [] });
  const baseline = "U".repeat(75) + "C" + "U".repeat(75);
  assert.equal(optimization.validateProtocolDuplex("A".repeat(151), baseline, 75, [external], "ADAR1").valid, true);
  assert.equal(optimization.validateProtocolDuplex("A".repeat(151), baseline, 75, [external, interrupted], "ADAR1").valid, false);
});

it("keeps original measurements in tested provenance when proposing a different sequence", () => {
  const evidence = optimization.createOptimizationEvidenceState("tested", { 4: 0, 7: 35 }, [], "AGGU", new Set([7]), "improve-target", { arrna_sequence: "ACGU", aligned_guide: "UGCA", structures: [] });
  assert.deepEqual(evidence.tested_baseline?.editing_efficiencies, { 7: 35 });
  assert.deepEqual(evidence.tested_baseline?.editing_status, { 4: "unmeasured", 7: "measured" });
});

it("applies all recommended proposal structures without restoring a removed tested position", () => {
  const tested = new optimization.Bulge({ id: "tested", type: "deletion", start: 34, size: 1, source: "initial", effectZones: [] });
  const moved = new optimization.Bulge({ ...tested, start: 4, source: "user" });
  const recommendations = recommendBulgeDesigns({ candidates: [{ id: "mis", type: "mismatch", size: 1, label: "mis", effectZones: [{ anchor: "nearest-edge", minDistance: -10, maxDistance: -10, effect: "increase" }] }], initialBulges: [moved], targetWindow: "A".repeat(151), targetIndex: 75, sites: [{ coordinate: 0, absolutePosition: 76, observedEfficiency: 30, measurementStatus: "measured" }] });
  assert.ok(recommendations.length > 0);
  assert.equal(typeof guided.createRecommendedProposal, "function");
  const applied = guided.createRecommendedProposal(recommendations[0]);
  assert.ok(applied.some((b) => b.id === "tested" && b.start === 4));
  assert.ok(!applied.some((b) => b.start === 34));
  assert.equal(tested.start, 34);
  assert.notEqual(applied[0], recommendations[0].allBulges[0]);
});

it("retains inserted bases beyond the final target column when reconstructing an imported guide", () => {
  for (const arrnaSequence of ["GUACGC", "GGUACGC", "GUACGCG"]) {
    const d = createTestedDuplex({ targetSequence: "ACGUA", arrnaSequence, targetAPosition: 1, environment: "ADAR1" });
    assert.equal(createOptimizedArrnaSequence(d.alignedGuide, d.targetWindow, d.targetIndex, d.initialBulges), arrnaSequence);
  }
});

it("draws insertion at a target boundary without assigning it target nucleotide coverage", () => {
  const b = new optimization.Bulge({ id: "insert", type: "insertion", start: 4, size: 6, insertionBases: "ACGUAC", source: "user", effectZones: [] });
  const geometry = optimization.createBulgeOverviewGeometry(b, -75, 75);
  assert.equal(geometry.widthFraction, 0);
  assert.equal(geometry.centerFraction, 79 / 151);
});

it("maps NP bulge position to an outward-extending interval and back", () => {
  assert.equal(typeof optimization.protocolPositionToInterval, "function");
  assert.deepEqual(optimization.protocolPositionToInterval(-31, 28), { start: -58, end: -31 });
  assert.deepEqual(optimization.protocolPositionToInterval(34, 10), { start: 34, end: 43 });
  assert.deepEqual(optimization.protocolPositionToInterval(-1, 2), { start: -2, end: -1 });
  assert.deepEqual(optimization.protocolPositionToInterval(1, 2), { start: 1, end: 2 });
  assert.equal(optimization.intervalToProtocolPosition({ start: -58, end: -31 }), -31);
  assert.equal(optimization.intervalToProtocolPosition({ start: 34, end: 43 }), 34);
  assert.throws(() => optimization.protocolPositionToInterval(0, 2), /A0|zero/i);
});

it("keeps insertion boundary independent of insertion length", () => {
  assert.equal(typeof optimization.protocolPositionToInterval, "function");
  assert.deepEqual(optimization.protocolPositionToInterval(-31, 28, "insertion"), { start: -31, end: -31 });
  assert.equal(optimization.intervalToProtocolPosition({ start: -31, end: -31, type: "insertion" }), -31);
});

it("starts bystanders as unknown instead of numeric zero", () => {
  assert.deepEqual(optimization.createZeroInitializedEfficiencies([3, 5, 8], 5), {});
});

it("exports every unmeasured A status without fabricating a numeric zero", () => {
  const evidence = optimization.createOptimizationEvidenceState("tested", { 3: 0, 5: 30 }, [], "ACGU", new Set([3, 5]), "preserve-target", { arrna_sequence: "ACGU", aligned_guide: "UGCA", structures: [] }, [3, 5, 8]);
  assert.deepEqual(evidence.observed_editing_status, { 3: "measured", 5: "measured", 8: "unmeasured" });
  assert.deepEqual(evidence.observed_editing_efficiencies, { 3: 0, 5: 30 });
  assert.deepEqual(evidence.tested_baseline?.editing_status, { 3: "measured", 5: "measured", 8: "unmeasured" });
  assert.deepEqual(evidence.tested_baseline?.editing_efficiencies, { 3: 0, 5: 30 });
});

it("sanitizes a legacy unconfirmed default zero to unknown when re-exporting", () => {
  const evidence = optimization.createOptimizationEvidenceState("legacy", { 3: 0, 5: 30 }, [], undefined, new Set([5]), "improve-target", undefined, [3, 5]);
  assert.deepEqual(evidence.observed_editing_status, { 3: "unmeasured", 5: "measured" });
  assert.deepEqual(evidence.observed_editing_efficiencies, { 5: 30 });
});

it("recovers balanced insertion and deletion in an equal-length tested guide", () => {
  const target = "UGCACGUACUGAC";
  const baseline = optimization.createProposalAlignedGuide(target, 3);
  const structures = [
    new optimization.Bulge({ id: "insert", type: "insertion", start: 1, size: 1, source: "user", insertionBases: "A", effectZones: [] }),
    new optimization.Bulge({ id: "delete", type: "deletion", start: 8, size: 1, source: "user", effectZones: [] }),
  ];
  const guide = createOptimizedArrnaSequence(baseline, target, 3, structures);
  assert.equal(guide, "GCAGUACGACGCA");
  const duplex = createTestedDuplex({ targetSequence: target, arrnaSequence: guide, targetAPosition: 4, environment: "ADAR1" });
  assert.deepEqual(duplex.initialBulges.map((b) => [b.type, b.start, b.size, b.insertionBases]), [
    ["insertion", 1, 1, "A"], ["deletion", 8, 1, undefined],
  ]);
  assert.equal(duplex.ambiguous, false);
  assert.equal(duplex.alignedGuide[duplex.targetIndex], "C");
  assert.equal(createOptimizedArrnaSequence(duplex.alignedGuide, duplex.targetWindow, duplex.targetIndex, duplex.initialBulges), guide);
});
