import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  Bulge,
  chunkSequenceForDisplay,
  createAutoMismatchSequence,
  createAbsoluteEffectZoneInterval,
  createBulgeOverviewGeometry,
  createEffectZoneOverviewGeometry,
  createInitialBulges,
  createOptimizationEvidenceState,
  createQualitativeOverlapRuns,
  createZeroInitializedEfficiencies,
  evaluateQualitativeEffect,
  getBulgeCandidates,
  getCoreEffectZones,
  validateBulgePlacement,
  validateMismatchSequence,
} from "./bulgeOptimization.ts";

describe("Bulge", () => {
  it("calculates upstream and downstream effects relative to the bulge edges", () => {
    const bulge = new Bulge({
      id: "b1",
      type: "deletion",
      start: 100,
      size: 5,
      source: "user",
      effectZones: [
        { anchor: "upstream-edge", minDistance: 3, maxDistance: 10, effect: "decrease" },
        { anchor: "downstream-edge", minDistance: 2, maxDistance: 8, effect: "increase" },
      ],
    });

    assert.equal(bulge.end, 104);
    assert.equal(bulge.effectAt(97), "decrease");
    assert.equal(bulge.effectAt(106), "increase");
    assert.equal(bulge.effectAt(98), null);
  });
});

describe("initial bulges", () => {
  it("groups contiguous deletion coordinates into locked bulges", () => {
    const bulges = createInitialBulges([-31, -32, -33, 34, 35]);

    assert.equal(bulges.length, 2);
    assert.deepEqual(bulges.map(({ start, end }) => [start, end]), [[-33, -31], [34, 35]]);
    assert.ok(bulges.every((bulge) => bulge.source === "initial"));
  });
});

describe("bulge placement", () => {
  it("rejects a structural overlap but permits an adjacent interval", () => {
    const existing = [new Bulge({
      id: "existing",
      type: "deletion",
      start: 10,
      size: 5,
      source: "initial",
      effectZones: [],
    })];

    assert.equal(validateBulgePlacement(existing, { start: 14, size: 3 }).valid, false);
    assert.equal(validateBulgePlacement(existing, { start: 15, size: 3 }).valid, true);
  });

  it("counts initial and user bulges toward the four-bulge maximum", () => {
    const existing = Array.from({ length: 4 }, (_, index) => new Bulge({
      id: `b${index}`,
      type: "mismatch",
      start: index * 10,
      size: 2,
      source: index < 2 ? "initial" : "user",
      effectZones: [],
    }));

    const result = validateBulgePlacement(existing, { start: 50, size: 2 });
    assert.equal(result.valid, false);
    assert.match(result.reason ?? "", /four/i);
  });
});

describe("qualitative effects", () => {
  it("keeps overlapping bulge effects unresolved", () => {
    const bulges = [
      new Bulge({
        id: "increase",
        type: "deletion",
        start: 10,
        size: 2,
        source: "user",
        effectZones: [{ anchor: "downstream-edge", minDistance: 1, maxDistance: 5, effect: "increase" }],
      }),
      new Bulge({
        id: "decrease",
        type: "mismatch",
        start: 18,
        size: 2,
        source: "user",
        effectZones: [{ anchor: "upstream-edge", minDistance: 3, maxDistance: 6, effect: "decrease" }],
      }),
    ];

    const result = evaluateQualitativeEffect(14, bulges);
    assert.equal(result.status, "multiple");
    assert.equal(result.overlap, "conflicting");
    assert.equal(result.effects.length, 2);
  });

  it("distinguishes concordant overlap without claiming a stronger effect", () => {
    const bulges = ["first", "second"].map((id, index) => new Bulge({
      id,
      type: "mismatch",
      start: index * 2,
      size: 1,
      source: "user",
      effectZones: [{ anchor: "start", minDistance: 3 - index * 2, maxDistance: 5 - index * 2, effect: "increase" }],
    }));

    const result = evaluateQualitativeEffect(4, bulges);
    assert.equal(result.status, "multiple");
    assert.equal(result.overlap, "concordant");
    assert.deepEqual(result.effects.map(({ bulgeId }) => bulgeId), ["first", "second"]);
  });

  it("groups adjacent coordinates only when the same bulges and directions overlap", () => {
    const first = new Bulge({
      id: "first",
      type: "deletion",
      start: 0,
      size: 1,
      source: "user",
      effectZones: [{ anchor: "start", minDistance: 1, maxDistance: 4, effect: "increase" }],
    });
    const second = new Bulge({
      id: "second",
      type: "mismatch",
      start: 0,
      size: 1,
      source: "user",
      effectZones: [{ anchor: "start", minDistance: 3, maxDistance: 5, effect: "increase" }],
    });

    assert.deepEqual(createQualitativeOverlapRuns([first, second], 0, 6), [{
      start: 3,
      end: 4,
      kind: "concordant",
      effects: [
        { bulgeId: "first", effect: "increase" },
        { bulgeId: "second", effect: "increase" },
      ],
    }]);
  });
});

describe("automatic mismatch bases", () => {
  it("creates the project-defined same-base mismatch for every target base", () => {
    const target = "ACGTAC";
    const mismatch = createAutoMismatchSequence(target);

    assert.equal(mismatch, "ACGUAC");
  });

  it("rejects a non-complementary tract that is not a same-base mismatch", () => {
    assert.equal(validateMismatchSequence("AC", "AC"), null);
    assert.match(
      validateMismatchSequence("AC", "CC") ?? "",
      /same-base mismatch/i,
    );
  });
});

describe("experimental core-effect zones", () => {
  it("loads only the ADAR1 5-nt mismatch core strong-effect intervals", () => {
    assert.deepEqual(getCoreEffectZones("ADAR1", "mismatch", 5), [
      { anchor: "start", minDistance: 25, maxDistance: 29, effect: "increase" },
      { anchor: "start", minDistance: -36, maxDistance: -26, effect: "increase" },
      { anchor: "start", minDistance: -20, maxDistance: 3, effect: "decrease" },
    ]);
  });

  it("changes candidate effects with the selected ADAR environment", () => {
    const adar1Candidates = getBulgeCandidates("ADAR1");
    const adar2Candidates = getBulgeCandidates("ADAR2");
    const adar1 = adar1Candidates.mismatch.find(({ size }) => size === 5)!;
    const adar2 = adar2Candidates.mismatch.find(({ size }) => size === 5)!;

    assert.equal(adar1.id, "mismatch-5");
    assert.equal(adar2.id, "mismatch-5");
    assert.notDeepEqual(adar1.effectZones, adar2.effectZones);
    assert.ok(adar1.effectZones.length > 0);
    assert.equal(adar1.provisional, false);
    assert.deepEqual(adar1Candidates.deletion.map(({ size }) => size), Array.from({ length: 30 }, (_, index) => index + 1));
    assert.deepEqual(adar1Candidates.mismatch.map(({ size }) => size), Array.from({ length: 30 }, (_, index) => index + 1));
  });

  it("evaluates source-table ranges relative to the bulge start coordinate", () => {
    const bulge = new Bulge({
      id: "experimental",
      type: "mismatch",
      start: 100,
      size: 5,
      source: "user",
      effectZones: getCoreEffectZones("ADAR1", "mismatch", 5),
    });

    assert.equal(bulge.effectAt(80), "decrease");
    assert.equal(bulge.effectAt(74), "increase");
    assert.equal(bulge.effectAt(125), "increase");
    assert.equal(bulge.effectAt(105), null);
  });

  it("attaches the matching deletion rule to starting arRNA bulges", () => {
    const bulges = createInitialBulges([-31, -30, -29, -28, -27], "ADAR1");

    assert.equal(bulges[0].size, 5);
    assert.deepEqual(
      bulges[0].effectZones,
      getCoreEffectZones("ADAR1", "deletion", 5),
    );
  });
});

describe("observed efficiency defaults", () => {
  it("initializes every non-target A to zero and leaves the target A unmeasured", () => {
    assert.deepEqual(createZeroInitializedEfficiencies([101, 104, 104, 109], 104), {
      101: 0,
      109: 0,
    });
  });

  it("exports default zero separately from an explicitly measured zero", () => {
    const evidence = createOptimizationEvidenceState(
      "source-1",
      { 101: 0, 104: 0 },
      [],
      "ACGU",
      new Set([104]),
      "preserve-target",
    );

    assert.deepEqual(evidence.observed_editing_status, {
      101: "default_zero",
      104: "measured",
    });
    assert.equal(evidence.optimization_goal, "preserve-target");
  });

  it("does not export an effect prediction for a locked unsupported mismatch", () => {
    const unsupported = new Bulge({
      id: "external-mismatch",
      type: "mismatch",
      start: -4,
      size: 2,
      source: "initial",
      effectSupport: "unsupported",
      effectZones: [],
      mismatchBases: "AG",
    });

    const evidence = createOptimizationEvidenceState("external", {}, [unsupported]);
    assert.deepEqual(evidence.qualitative_predictions, []);
  });
});

describe("sequence display chunks", () => {
  it("shows every nucleotide and keeps the final partial row left aligned", () => {
    const sequence = Array.from({ length: 151 }, (_, index) => index + 1);
    const chunks = chunkSequenceForDisplay(sequence, 30);

    assert.deepEqual(chunks.map((chunk) => chunk.length), [30, 30, 30, 30, 30, 1]);
    assert.deepEqual(chunks.flat(), sequence);
    assert.equal(chunks.at(-1)?.[0], 151);
  });
});

describe("bulge overview geometry", () => {
  it("maps an inclusive bulge interval onto the full arRNA overview", () => {
    const bulge = new Bulge({
      id: "mapped",
      type: "mismatch",
      start: -5,
      size: 5,
      source: "user",
      effectZones: [],
    });

    const geometry = createBulgeOverviewGeometry(bulge, -75, 75);
    assert.equal(geometry.startFraction, 70 / 151);
    assert.equal(geometry.endFraction, 75 / 151);
    assert.equal(geometry.widthFraction, 5 / 151);
    assert.equal(geometry.centerFraction, 72.5 / 151);
  });

  it("clamps a preview interval to the visible arRNA window", () => {
    const bulge = new Bulge({
      id: "clamped",
      type: "deletion",
      start: 73,
      size: 6,
      source: "user",
      effectZones: [],
    });

    const geometry = createBulgeOverviewGeometry(bulge, -75, 75);
    assert.equal(geometry.endFraction, 1);
    assert.equal(geometry.visibleSize, 3);
  });

  it("maps a start-relative core-effect interval and preserves its inclusive width", () => {
    const bulge = new Bulge({
      id: "effect",
      type: "mismatch",
      start: 0,
      size: 5,
      source: "user",
      effectZones: [],
    });
    const zone = { anchor: "start" as const, minDistance: -20, maxDistance: 3, effect: "decrease" as const };

    assert.deepEqual(createAbsoluteEffectZoneInterval(bulge, zone), { start: -20, end: 3 });
    const geometry = createEffectZoneOverviewGeometry(bulge, zone, -75, 75);
    assert.equal(geometry?.startFraction, 55 / 151);
    assert.equal(geometry?.endFraction, 79 / 151);
    assert.ok(Math.abs((geometry?.widthFraction ?? 0) - 24 / 151) < Number.EPSILON);
  });

  it("clips an effect interval at the overview edge and omits an invisible interval", () => {
    const bulge = new Bulge({
      id: "edge-effect",
      type: "deletion",
      start: -70,
      size: 5,
      source: "user",
      effectZones: [],
    });
    const clippedZone = { anchor: "start" as const, minDistance: -10, maxDistance: 2, effect: "increase" as const };
    const hiddenZone = { anchor: "start" as const, minDistance: -30, maxDistance: -20, effect: "increase" as const };

    const geometry = createEffectZoneOverviewGeometry(bulge, clippedZone, -75, 75);
    assert.equal(geometry?.visibleStart, -75);
    assert.equal(geometry?.visibleEnd, -68);
    assert.equal(createEffectZoneOverviewGeometry(bulge, hiddenZone, -75, 75), null);
  });
});
