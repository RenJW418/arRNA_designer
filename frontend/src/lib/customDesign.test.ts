import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildCustomDesign, createCustomDesignExport } from "./customDesign.ts";
import type { NormalEditingResult } from "./api.ts";
import type { NormalArrnaVariant } from "./normalEditing.ts";
import { createInitialBulges, getCoreEffectZones } from "./bulgeOptimization.ts";

const target = "C".repeat(75) + "A" + "C".repeat(75);
const upstream = { id: "up", type: "deletion" as const, position: -31, size: 28 };
const downstream = { id: "down", type: "deletion" as const, position: 34, size: 10 };

test("combined custom and initial structures use ADAR2 upstream and ADAR1 downstream", () => {
  const draft = buildCustomDesign(target, 75, "combined", [upstream, downstream]);
  assert.equal(draft.valid, true);
  assert.deepEqual(draft.bulges[0].effectZones, getCoreEffectZones("ADAR2", "deletion", 28));
  assert.deepEqual(draft.bulges[1].effectZones, getCoreEffectZones("ADAR1", "deletion", 10));
  const initial = createInitialBulges([-58, -57, 34, 35], "combined");
  assert.deepEqual(initial[0].effectZones, getCoreEffectZones("ADAR2", "deletion", 2));
  assert.deepEqual(initial[1].effectZones, getCoreEffectZones("ADAR1", "deletion", 2));
});

test("combined custom window requires both upstream and downstream coverage boundaries", () => {
  assert.equal(buildCustomDesign("C".repeat(6) + "A" + "C".repeat(25), 6, "combined", []).valid, true);
  for (const [up, down] of [[5, 25], [6, 24]]) {
    const draft = buildCustomDesign("C".repeat(up) + "A" + "C".repeat(down), up, "combined", []);
    assert.equal(draft.valid, false);
    assert.equal(draft.sequence, "");
  }
});

test("custom design preserves the target mismatch and restores removed deletions", () => {
  const dual = buildCustomDesign(target, 75, "ADAR1", [upstream, downstream]);
  assert.equal(dual.valid, true);
  assert.equal(dual.sequence.length, 113);
  assert.equal(dual.sequence[65], "C");
  const revised = buildCustomDesign(target, 75, "ADAR1", [downstream]);
  assert.equal(revised.sequence.length, 141);
  assert.equal(revised.sequence, "G".repeat(65) + "C" + "G".repeat(75));
});

test("invalid custom structures never expose an exportable guide", () => {
  for (const specs of [
    [{ ...downstream, position: 0 }],
    [downstream, { ...downstream, id: "overlap", position: 35 }],
    [{ ...upstream, position: -50 }],
    [{ ...downstream, size: 1.5 }],
  ]) {
    const result = buildCustomDesign(target, 75, "ADAR1", specs);
    assert.equal(result.valid, false);
    assert.equal(result.sequence, "");
    assert.ok(result.errors.length);
  }
});

test("manual insertion uses the specified antiparallel bases and keeps predictions unknown", () => {
  const result = buildCustomDesign(target, 75, "ADAR1", [{ id: "ins", type: "insertion", position: 5, size: 2, bases: "AU" }]);
  assert.equal(result.valid, true);
  assert.equal(result.sequence.length, 153);
  assert.equal(result.bulges[0].effectSupport, "unsupported");
  assert.equal(result.sequence, "G".repeat(71) + "UA" + "G".repeat(4) + "C" + "G".repeat(75));
});

function exportSource(): { result: NormalEditingResult; variant: NormalArrnaVariant } {
  const result: NormalEditingResult = JSON.parse(readFileSync(new URL("../../public/examples/normal-output.json", import.meta.url), "utf8"));
  result.reference = { species: "Homo sapiens", gene: "TEST", transcript: "NM_123456.7", transcript_name: "Test transcript", selection: "Exact accession", cds_start: 10, cds_end: 162 };
  const candidate = result.candidates[0];
  return { result, variant: { id: candidate.id, label: candidate.label, shortLabel: candidate.short_label, description: candidate.description, arrnaSequence: candidate.arrna_sequence, alignedGuide: candidate.aligned_guide, deletionCoordinates: [...candidate.deletion_coordinates] } };
}

test("custom export preserves independent source and candidate snapshots with no invented measurements", () => {
  const { result, variant } = exportSource();
  const record = createCustomDesignExport(result, variant, []);
  assert.deepEqual(record.source_result, result);
  assert.deepEqual(record.source_candidate, variant);
  assert.equal(record.arrna_sequence, variant.arrnaSequence);
  assert.deepEqual(record.observed_editing_efficiencies, {});
  assert.deepEqual(record.provenance.source_design, result.provenance);
  result.reference!.transcript = "NM_999999.1";
  result.candidates[0].arrna_sequence = "AAAAA";
  result.provenance.engine.version = "changed";
  variant.deletionCoordinates.push(4);
  assert.equal(record.source_result.reference.transcript, "NM_123456.7");
  assert.notEqual(record.source_result.candidates[0].arrna_sequence, "AAAAA");
  assert.notEqual(record.provenance.source_design.engine.version, "changed");
  assert.deepEqual(record.source_candidate.deletionCoordinates, []);
});

test("custom export identifies source coordinates and stores actual normalized antiparallel bases", () => {
  const { result, variant } = exportSource();
  result.normalized_input.sequence = "TTTT" + result.normalized_input.sequence;
  result.normalized_input.length += 4;
  result.normalized_input.target_position += 4;
  result.editing_site.position += 4;
  result.window_start += 4;
  result.window_end += 4;
  const record = createCustomDesignExport(result, variant, [{ id: "ins", type: "insertion", position: 5, size: 2, bases: "a t" }]);
  assert.equal(record.target_index, 75);
  assert.equal(record.target_index_coordinate_system, "target_window_0_based");
  assert.deepEqual(record.source_window, { start: 5, end: 155, coordinate_system: "source_sequence_1_based_inclusive" });
  assert.equal(record.source_target_position, 80);
  assert.equal(record.structures_coordinate_system, "target_relative_to_A0");
  assert.equal(record.structure_bases_orientation, "3′→5′");
  assert.equal(record.sequence_orientation, "5′→3′");
  assert.equal(record.structures[0].bases, "AU");
  assert.equal(record.structures[0].effect_data_environment, null);
  assert.equal(record.structures[0].start, 5);
  assert.equal(record.structures[0].end, 5);
  assert.equal(record.structures[0].position_semantics, "boundary_before_target_base");
  assert.equal(record.arrna_sequence, variant.arrnaSequence.slice(0, 71) + "UA" + variant.arrnaSequence.slice(71));
});

test("combined custom export records the distinct evidence sources without changing the selected source result", () => {
  const { result, variant } = exportSource();
  result.pairing.adar_environment = "combined";
  const record = createCustomDesignExport(result, variant, [upstream, downstream]);
  assert.equal(record.adar, "combined");
  assert.deepEqual(record.structures.map(s => s.effect_data_environment), ["ADAR2", "ADAR1"]);
  assert.equal(record.source_result.pairing.adar_environment, "combined");
});

test("custom export records upstream tract coordinates without exporting unused deletion bases", () => {
  const { result, variant } = exportSource();
  const record = createCustomDesignExport(result, variant, [{ ...upstream, bases: "unused" }]);
  assert.equal(record.structures[0].start, -58);
  assert.equal(record.structures[0].end, -31);
  assert.equal(record.structures[0].position, -31);
  assert.equal(record.structures[0].position_semantics, "tract_edge_nearest_A0");
  assert.equal("bases" in record.structures[0], false);
  assert.equal(record.arrna_sequence.length, 123);
});

test("custom export rejects invalid drafts and a candidate from a different source result", () => {
  const { result, variant } = exportSource();
  assert.throws(() => createCustomDesignExport(result, variant, [{ ...upstream, position: 0 }]));
  assert.throws(() => createCustomDesignExport(result, { ...variant, arrnaSequence: "AAAAA" }, []));
});
