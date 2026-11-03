import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createAnnotationRequest, normalizeAnalysisSequence, parseDotBracketPairs,
  structureBounds, validateAnnotationResult, validateRnaFoldResult,
  type RnaFoldResult,
} from "./sequenceAnalysis.ts";

const fold: RnaFoldResult = {
  sequence: "GCAAAGC", structure: "((...))", mfe: -0.5,
  ensemble_free_energy: -0.8, ensemble_diversity: 0.4,
  unpaired_probabilities: [0.1, 0.2, 1, 1, 1, 0.2, 0.1],
  mean_unpaired_probability: 3.6 / 7, mfe_unpaired_fraction: 3 / 7,
  pairs: [{ i: 1, j: 7, probability: 0.9 }, { i: 2, j: 6, probability: 0.8 }],
  coordinates: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 10 }, { x: 10, y: 20 }, { x: 0, y: 20 }, { x: -10, y: 10 }],
  engine: "ViennaRNA", version: "test-fixture", temperature: 37, topology: "linear",
};

describe("sequence analysis input boundaries", () => {
  it("normalizes a single FASTA sequence without turning a header into bases", () => {
    assert.equal(normalizeAnalysisSequence(">test transcript\nac gt\nu", "structure"), "ACGUU");
    assert.equal(normalizeAnalysisSequence("ac guu", "annotation"), "ACGTT");
    assert.throws(() => normalizeAnalysisSequence(">one\nACGTA\n>two\nACGTA", "annotation"));
    assert.throws(() => normalizeAnalysisSequence("ACG-N", "annotation"));
  });

  it("enforces bounded input for both endpoints", () => {
    assert.throws(() => normalizeAnalysisSequence("", "annotation"));
    assert.throws(() => normalizeAnalysisSequence("ACGU", "structure"));
    assert.equal(normalizeAnalysisSequence("A".repeat(1001), "structure").length, 1001);
    assert.throws(() => normalizeAnalysisSequence("A".repeat(1002), "structure"));
    assert.equal(normalizeAnalysisSequence("A".repeat(20000), "annotation").length, 20000);
    assert.throws(() => normalizeAnalysisSequence("A".repeat(20001), "annotation"));
  });

  it("keeps inclusive user coordinates and rejects reversed or out-of-range regions", () => {
    assert.deepEqual(createAnnotationRequest("acguu", " NM_123.4 ", [{ start: 2, end: 5, kind: "exon" }]), {
      sequence: "ACGTT", transcript_accession: "NM_123.4", regions: [{ start: 2, end: 5, kind: "exon" }],
    });
    for (const [start, end] of [[0, 5], [2, 6], [4, 3], [1.5, 3]]) {
      assert.throws(() => createAnnotationRequest("ACGUU", "", [{ start, end, kind: "exon" }]));
    }
    assert.deepEqual(createAnnotationRequest("ACGUU", "   "), { sequence: "ACGTT" });
  });
});

describe("RNAfold geometry and scientific result integrity", () => {
  it("extracts nested MFE pairs using 1-based coordinates", () => {
    assert.deepEqual(parseDotBracketPairs("((..).)"), [{ i: 1, j: 7 }, { i: 2, j: 5 }]);
    assert.deepEqual(parseDotBracketPairs("....."), []);
    for (const value of ["(..", "..)", "[...]"]) assert.throws(() => parseDotBracketPairs(value));
  });

  it("accepts consistent results and rejects stale sequence or topology responses", () => {
    assert.deepEqual(validateRnaFoldResult(fold, "GCAAAGC", "linear"), fold);
    assert.throws(() => validateRnaFoldResult(fold, "GCAAAGU", "linear"));
    assert.throws(() => validateRnaFoldResult(fold, "GCAAAGC", "circular"));
  });

  it("rejects missing coordinates, impossible probabilities and malformed connectivity", () => {
    const malformed = [
      { coordinates: fold.coordinates.slice(1) },
      { coordinates: [{ x: Number.NaN, y: 0 }, ...fold.coordinates.slice(1)] },
      { unpaired_probabilities: [-0.1, ...fold.unpaired_probabilities.slice(1)] },
      { unpaired_probabilities: fold.unpaired_probabilities.slice(1) },
      { mean_unpaired_probability: 0.9 },
      { structure: "((...))." }, { structure: "((....)" },
      { pairs: [{ i: 0, j: 7, probability: 0.5 }] },
      { pairs: [{ i: 1, j: 8, probability: 0.5 }] },
      { mfe: Number.NaN },
    ];
    for (const change of malformed) {
      assert.throws(() => validateRnaFoldResult({ ...fold, ...change }, fold.sequence, "linear"));
    }
  });

  it("fits actual coordinates with padding even when the structure is flat", () => {
    assert.deepEqual(structureBounds([{ x: -10, y: 0 }, { x: 90, y: 0 }]), { x: -34, y: -32, width: 148, height: 64 });
  });
});

describe("annotation evidence integrity", () => {
  const result = {
    sequence: "ACGTT", features: [{ id: "user-1", start: 2, end: 5, kind: "exon", label: "Target exon", evidence: "user", source: "User-defined", description: "Input region" }],
    warnings: [], prediction_method: "ESEfinder matrices", reference_accession: null,
  };
  it("preserves user provenance and refuses invalid feature coordinates or evidence", () => {
    assert.deepEqual(validateAnnotationResult(result, "ACGUU"), result);
    assert.throws(() => validateAnnotationResult({ ...result, sequence: "ACGTA" }, "ACGTT"));
    assert.throws(() => validateAnnotationResult({ ...result, features: [{ ...result.features[0], end: 6 }] }, "ACGTT"));
    assert.throws(() => validateAnnotationResult({ ...result, features: [{ ...result.features[0], evidence: "verified" }] }, "ACGTT"));
  });
});
