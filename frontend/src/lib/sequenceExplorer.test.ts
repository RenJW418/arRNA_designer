import assert from "node:assert/strict";
import test from "node:test";
import { normalizeRestoredExonInput, parseSequenceInput, splitExonContext } from "./sequenceExplorer.ts";

test("normalizes case and whitespace without shifting DNA or RNA coordinates", () => {
  assert.deepEqual(parseSequenceInput(" acg\n tu\tA "), { sequence: "ACGTUA", error: null });
});

test("accepts one FASTA record and excludes its description from the sequence", () => {
  assert.deepEqual(parseSequenceInput("\n >NM_test sample 42\r\naCgT\r\n UAA \n"), {
    sequence: "ACGTUAA", error: null,
  });
});

test("rejects multiple FASTA records instead of silently joining their coordinates", () => {
  const result = parseSequenceInput(">one\nACGT\n>two\nAAAA");
  assert.ok(result.error);
  assert.equal(result.sequence, "");
});

test("rejects an embedded header after raw sequence", () => {
  assert.ok(parseSequenceInput("ACGU\n>second\nAAAA").error);
});

test("rejects ambiguous symbols, digits, punctuation and inline headers", () => {
  for (const raw of ["ACGN", "AU2C", "AC-G", "AU.G", "AC>GU", "ACXU"]) {
    const result = parseSequenceInput(raw);
    assert.ok(result.error, raw);
    assert.equal(result.sequence, "", raw);
  }
});

test("allows an empty editor but rejects an empty FASTA record", () => {
  assert.deepEqual(parseSequenceInput(" \n\t"), { sequence: "", error: null });
  assert.ok(parseSequenceInput(">missing\n").error);
});

test("splits 1-based inclusive exon boundaries with both flanks preserved", () => {
  assert.deepEqual(splitExonContext("AACCGGUU", { start: 3, end: 6 }), {
    upstreamIntron: "AA", targetExon: "CCGG", downstreamIntron: "UU",
  });
});

test("supports a one-base internal exon", () => {
  assert.deepEqual(splitExonContext("ACA", { start: 2, end: 2 }), {
    upstreamIntron: "A", targetExon: "C", downstreamIntron: "A",
  });
});

test("rejects reversed, fractional, missing-flank and out-of-sequence bounds", () => {
  for (const range of [
    { start: 5, end: 3 }, { start: 1, end: 3 }, { start: 2, end: 8 },
    { start: 0, end: 3 }, { start: 2, end: 9 }, { start: 2.5, end: 4 },
    { start: 2, end: Number.NaN }, { start: 2, end: Infinity },
  ]) assert.throws(() => splitExonContext("AACCGGUU", range), RangeError);
  assert.throws(() => splitExonContext("AA", { start: 2, end: 2 }), RangeError);
});

test("restores legacy exon coordinates using normalized region lengths", () => {
  assert.deepEqual(normalizeRestoredExonInput("AA\n", "CCC", "GG"), {
    sequence: "AACCCGG", exonRange: { start: 3, end: 5 }, error: null,
  });
});

test("restored boundaries count bases rather than whitespace or FASTA descriptions", () => {
  const restored = normalizeRestoredExonInput(
    ">upstream legacy\r\n a\tt \r\n", ">exon legacy\nc G\nu A ", ">downstream legacy\n g\r\nu",
  );
  assert.deepEqual(restored, {
    sequence: "ATCGUAGU", exonRange: { start: 3, end: 6 }, error: null,
  });
  assert.deepEqual(splitExonContext(restored.sequence, restored.exonRange!), {
    upstreamIntron: "AT", targetExon: "CGUA", downstreamIntron: "GU",
  });
});

test("restores the smallest internal exon with integer inclusive boundaries", () => {
  assert.deepEqual(normalizeRestoredExonInput(" a ", "\nc\n", " g\t"), {
    sequence: "ACG", exonRange: { start: 2, end: 2 }, error: null,
  });
});

test("rejects an empty restored exon or flank instead of creating endpoint boundaries", () => {
  for (const [upstream, exon, downstream] of [
    ["", "CCC", "GG"], ["AA", " \n\t", "GG"], ["AA", "CCC", "\n"], ["", "", ""],
  ]) {
    const restored = normalizeRestoredExonInput(upstream, exon, downstream);
    assert.equal(restored.sequence, "");
    assert.equal(restored.exonRange, null);
    assert.ok(restored.error);
  }
});

test("rejects invalid symbols or multiple FASTA records in any restored region", () => {
  for (const invalid of ["AN", "A2", "A-C", ">one\nAC\n>two\nGG", ">empty\n"]) {
    for (const index of [0, 1, 2]) {
      const parts = ["AA", "CCC", "GG"];
      parts[index] = invalid;
      const restored = normalizeRestoredExonInput(parts[0], parts[1], parts[2]);
      assert.equal(restored.sequence, "", `region ${index}: ${invalid}`);
      assert.equal(restored.exonRange, null, `region ${index}: ${invalid}`);
      assert.ok(restored.error, `region ${index}: ${invalid}`);
    }
  }
});
