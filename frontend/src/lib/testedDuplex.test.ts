import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createTestedDuplex,
  createGeneratedTestedDuplex,
  normalizeTestedSequence,
} from "./testedDuplex.ts";
import { designInitialArrna, designNormalArrnaVariants } from "./normalEditing.ts";

describe("tested arRNA sequence normalization", () => {
  it("normalizes DNA/RNA input to an RNA alphabet", () => {
    assert.equal(normalizeTestedSequence(" a c T\nug "), "ACUUG");
  });

  it("rejects characters outside the nucleotide alphabet", () => {
    assert.throws(() => normalizeTestedSequence("ACNX"), /A, C, G, T or U/i);
  });
});

describe("tested target-arRNA alignment", () => {
  it("aligns an antiparallel arRNA and preserves the required A-C editing mismatch", () => {
    const duplex = createTestedDuplex({
      targetSequence: "GGACUU",
      arrnaSequence: "AAGCCC",
      targetAPosition: 3,
      environment: "ADAR1",
    });

    assert.equal(duplex.targetWindow, "GGACUU");
    assert.equal(duplex.alignedGuide, "CCCGAA");
    assert.equal(duplex.targetIndex, 2);
    assert.equal(duplex.initialBulges.length, 0);
    assert.equal(duplex.unsupportedStructures.length, 0);
  });

  it("imports a same-base mismatch as a locked supported bulge", () => {
    const duplex = createTestedDuplex({
      targetSequence: "GGACUU",
      arrnaSequence: "AAGCCG",
      targetAPosition: 3,
      environment: "ADAR1",
    });

    assert.equal(duplex.initialBulges.length, 1);
    assert.equal(duplex.initialBulges[0].type, "mismatch");
    assert.equal(duplex.initialBulges[0].effectSupport, "supported");
    assert.equal(duplex.initialBulges[0].source, "initial");
  });

  it("retains another mismatch as locked unsupported structure without an effect range", () => {
    const duplex = createTestedDuplex({
      targetSequence: "GGACUU",
      arrnaSequence: "AAGCCA",
      targetAPosition: 3,
      environment: "ADAR1",
    });

    assert.equal(duplex.initialBulges.length, 1);
    assert.equal(duplex.initialBulges[0].effectSupport, "unsupported");
    assert.deepEqual(duplex.initialBulges[0].effectZones, []);
    assert.equal(duplex.unsupportedStructures.length, 1);
  });

  it("recognizes an arRNA deletion as a locked starting bulge", () => {
    const duplex = createTestedDuplex({
      targetSequence: "GGACUUCG",
      arrnaSequence: "CGAGCCC",
      targetAPosition: 3,
      environment: "ADAR1",
    });

    assert.ok(duplex.initialBulges.some((bulge) => bulge.type === "deletion"));
    assert.equal(duplex.alignedGuide.length, duplex.targetWindow.length);
  });

  it("requires the selected target coordinate to contain A", () => {
    assert.throws(() => createTestedDuplex({
      targetSequence: "GGACUU",
      arrnaSequence: "AAGCCC",
      targetAPosition: 2,
      environment: "ADAR1",
    }), /must contain A/i);
  });

  it("round-trips a generated deletion arRNA through the standalone import model", () => {
    const target = `${"G".repeat(75)}A${"G".repeat(75)}`;
    const initial = designInitialArrna(target, 76);
    assert.ok(initial);
    const generated = designNormalArrnaVariants(initial).find(({ id }) => id === "downstream-del10");
    assert.ok(generated);

    const duplex = createGeneratedTestedDuplex({
      targetSequence: target,
      arrnaSequence: generated.arrnaSequence,
      targetAPosition: 76,
      environment: "ADAR1",
      targetWindow: initial.targetWindow,
      alignedGuide: generated.alignedGuide,
      windowStart: initial.windowStart,
      targetIndex: initial.targetIndex,
      deletionCoordinates: generated.deletionCoordinates,
    });

    assert.ok(duplex.initialBulges.some(({ type, size }) => type === "deletion" && size === 10));
    assert.equal(duplex.arrnaSequence, generated.arrnaSequence);
  });
});
