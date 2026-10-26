import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createAppliedCustomCandidate, createNormalExportBundleWithCustom, serializeNormalCandidateCsv, buildCustomDesign, type CustomStructure } from "./customDesign.ts";
import { createNormalExportBundle, serializeCsv, serializeFasta, serializeJson } from "./exports.ts";
import type { NormalEditingResult } from "./api.ts";
import type { NormalArrnaVariant } from "./normalEditing.ts";

function fixture() {
  const result: NormalEditingResult = JSON.parse(readFileSync(new URL("../../public/examples/normal-output.json", import.meta.url), "utf8"));
  const source = result.candidates.find(candidate => candidate.id === "dual-deletion")!;
  const variant: NormalArrnaVariant = {
    id: source.id, label: source.label, shortLabel: source.short_label, description: source.description,
    arrnaSequence: source.arrna_sequence, alignedGuide: source.aligned_guide,
    deletionCoordinates: [...source.deletion_coordinates],
  };
  const specs: CustomStructure[] = [
    { id: "del", type: "deletion", position: 4, size: 1 },
    { id: "ins", type: "insertion", position: 8, size: 2, bases: "a t" },
    { id: "mis", type: "mismatch", position: 12, size: 2, bases: result.target_window.slice(result.target_index + 12, result.target_index + 14).replace(/T/g, "U") },
  ];
  return { result, variant, specs };
}

test("applied custom display keeps target columns, actual edits and an independent source snapshot", () => {
  const { result, variant, specs } = fixture();
  const applied = createAppliedCustomCandidate(result, variant, specs);
  assert.equal(applied.variant.id, "custom-1");
  assert.equal(applied.variant.label, "Custom 1");
  assert.equal(applied.variant.shortLabel, "Custom 1");
  assert.equal(applied.foldTopology, "linear");
  assert.equal(applied.variant.arrnaSequence.length, result.target_window.length + 1);
  assert.equal(applied.variant.arrnaSequence, applied.snapshot.arrna_sequence);
  assert.equal(applied.variant.alignedGuide.length, result.target_window.length);
  assert.equal(applied.variant.alignedGuide[result.target_index], "C");
  assert.equal(applied.variant.alignedGuide[result.target_index + 4], "-");
  assert.equal(applied.variant.alignedGuide.slice(result.target_index + 12, result.target_index + 14), specs[2].bases);
  assert.deepEqual(applied.variant.deletionCoordinates, [4]);
  assert.equal(applied.bulges.find(bulge => bulge.type === "insertion")?.insertionBases, "AU");
  assert.equal(applied.structures.find(structure => structure.type === "insertion")?.bases, "AU");
  specs[1].bases = "GG";
  variant.deletionCoordinates.push(999);
  result.provenance.engine.name = "mutated";
  assert.equal(applied.structures[1].bases, "AU");
  assert.equal(applied.snapshot.structures[1].bases, "AU");
  assert.equal(applied.snapshot.source_candidate.deletionCoordinates.includes(999), false);
  assert.notEqual(applied.snapshot.source_result.provenance.engine.name, "mutated");
});

test("unified downloads preserve all candidates, custom provenance and selected state", () => {
  const { result, variant, specs } = fixture();
  const original = structuredClone(result);
  const applied = createAppliedCustomCandidate(result, variant, specs);
  const bundle = createNormalExportBundleWithCustom(result, "custom-1", [applied]);
  const parsed = JSON.parse(serializeJson(bundle));
  assert.equal(parsed.candidates.length, result.candidates.length + 1);
  assert.deepEqual(parsed.candidates.filter((candidate: { selected: boolean }) => candidate.selected).map((candidate: { id: string }) => candidate.id), ["custom-1"]);
  const custom = parsed.candidates.at(-1);
  assert.equal(custom.sequence, applied.variant.arrnaSequence);
  assert.equal(custom.arrna_sequence, custom.sequence);
  assert.equal(custom.aligned_guide, applied.variant.alignedGuide);
  assert.deepEqual(custom.deletion_coordinates, [4]);
  assert.equal(custom.validation.backend_validated, false);
  assert.equal(custom.validation.experimentally_tested, false);
  assert.equal(custom.validation.scope, "client_side_structural_checks");
  assert.equal(custom.origin, "manual_customization");
  assert.equal(custom.source_candidate_id, "dual-deletion");
  assert.deepEqual(custom.structures, applied.snapshot.structures);
  assert.deepEqual(parsed.custom_design, applied.snapshot);
  assert.equal(parsed.custom_designs[0].candidate_id, "custom-1");
  assert.equal(parsed.custom_designs[0].fold_topology, "linear");
  assert.deepEqual(parsed.custom_design.observed_editing_efficiencies, {});
  assert.equal(parsed.provenance_scope, "source_design_service");
  assert.match(serializeFasta(bundle), new RegExp(`>LEAPER_normal_editing_custom-1_selected_5to3\\n${custom.sequence}(?:\\n|$)`));
  const csv = serializeNormalCandidateCsv(bundle);
  const customCsv = csv.split("\n").find(row => row.startsWith("normal_editing,custom-1,"))!;
  assert.ok(customCsv.startsWith(`normal_editing,custom-1,Custom 1,${custom.sequence},${custom.sequence.length},true,buildCustomDesign (client-side),,`));
  assert.match(customCsv, /manual_customization,client_side_structural_checks,dual-deletion,/);
  assert.match(customCsv, /""type"":""insertion""/);
  assert.match(customCsv, /""bases"":""AU""/);
  assert.deepEqual(result, original);

  const baselineBundle = createNormalExportBundleWithCustom(result, "baseline", [applied]);
  assert.equal(baselineBundle.candidates.length, 5);
  assert.deepEqual(baselineBundle.candidates.filter(candidate => candidate.selected).map(candidate => candidate.id), ["baseline"]);
  assert.equal(baselineBundle.custom_design, undefined);
  assert.equal(baselineBundle.custom_designs?.[0].candidate_id, "custom-1");
  assert.equal(baselineBundle.custom_designs?.[0].arrna_sequence, applied.snapshot.arrna_sequence);
  assert.match(serializeFasta(baselineBundle), />LEAPER_normal_editing_custom-1_5to3\n/);
  assert.equal(serializeFasta(baselineBundle).includes("custom-1_selected"), false);
});

test("exports reject stale sources and altered applied settings", () => {
  const { result, variant, specs } = fixture();
  const applied = createAppliedCustomCandidate(result, variant, specs);
  const other = structuredClone(result);
  other.normalized_input.target_position += 1;
  assert.throws(() => createNormalExportBundleWithCustom(other, "custom-1", [applied]), /different input sequence or target/);
  applied.structures[1].bases = "GG";
  assert.throws(() => createNormalExportBundleWithCustom(result, "custom-1", [applied]), /saved structures/);
  assert.throws(() => createAppliedCustomCandidate(result, { ...variant, arrnaSequence: "AAAA" }, specs), /does not match this source design/);
  assert.throws(() => createAppliedCustomCandidate(result, variant, [{ id: "invalid", type: "deletion", position: 0, size: 1 }]), /A0/);
});

test("normal-only CSV remains unchanged and custom export objects do not alias applied metadata", () => {
  const { result, variant, specs } = fixture();
  assert.equal(serializeNormalCandidateCsv(createNormalExportBundleWithCustom(result, "baseline")), serializeCsv(createNormalExportBundle(result, "baseline")));
  const applied = createAppliedCustomCandidate(result, variant, specs);
  const bundle = createNormalExportBundleWithCustom(result, "custom-1", [applied]);
  bundle.custom_design!.source_candidate.label = "mutated export";
  bundle.custom_design!.structures[0].position = 99;
  assert.equal(applied.snapshot.source_candidate.label, variant.label);
  assert.equal(applied.snapshot.structures[0].position, 4);
});

// Parse quoted JSON cells as well as ordinary cells so per-row source assertions
// do not accidentally read commas inside the saved structure descriptions.
function csvRecords(csv: string): Record<string, string>[] {
  const rows = csv.split("\n").map(line => {
    const cells: string[] = [];
    let text = "";
    let quoted = false;
    for (let index = 0; index < line.length; index += 1) {
      if (line[index] === '"') {
        if (quoted && line[index + 1] === '"') { text += '"'; index += 1; }
        else quoted = !quoted;
      } else if (line[index] === "," && !quoted) { cells.push(text); text = ""; }
      else text += line[index];
    }
    cells.push(text);
    return cells;
  });
  const header = rows.shift()!;
  return rows.map(cells => Object.fromEntries(header.map((name, index) => [name, cells[index]])));
}

test("numbered customs keep independent windows, current and archived profiles, models and provenance", () => {
  const first = fixture();
  first.result.provenance.engine.version = "source-one";
  first.result.provenance.ruleset.version = "rules-one";
  const custom1 = createAppliedCustomCandidate(first.result, first.variant, first.specs, 1, "linear");

  const secondResult = structuredClone(first.result);
  secondResult.target_window = first.result.target_window.slice(10, 136);
  secondResult.target_index -= 10;
  secondResult.window_start += 10;
  secondResult.window_end -= 15;
  secondResult.upstream_length = 65;
  secondResult.downstream_length = 60;
  secondResult.normalized_input.window_start_relative = -65;
  secondResult.normalized_input.window_end_relative = 60;
  secondResult.pairing = { ...secondResult.pairing, adar_environment: "ADAR2", required_upstream: 6, required_downstream: 11 };
  secondResult.provenance.engine.version = "source-two";
  secondResult.provenance.ruleset.version = "rules-two";
  const baseline = buildCustomDesign(secondResult.target_window, secondResult.target_index, "ADAR2", []);
  const baselineSource = first.result.candidates.find(candidate => candidate.id === "baseline")!;
  secondResult.candidates = [{ ...baselineSource, arrna_sequence: baseline.sequence, aligned_guide: baseline.sequence.split("").reverse().join(""), deletion_coordinates: [] }];
  const secondVariant: NormalArrnaVariant = {
    id: "baseline", label: baselineSource.label, shortLabel: baselineSource.short_label,
    description: baselineSource.description, arrnaSequence: baseline.sequence,
    alignedGuide: secondResult.candidates[0].aligned_guide, deletionCoordinates: [],
  };
  const custom2 = createAppliedCustomCandidate(secondResult, secondVariant, [{ id: "second-del", type: "deletion", position: 4, size: 1 }], 2, "circular");
  assert.equal(custom1.variant.id, "custom-1");
  assert.equal(custom2.variant.id, "custom-2");
  assert.equal(custom2.variant.label, "Custom 2");
  assert.notEqual(custom1.variant.arrnaSequence, custom2.variant.arrnaSequence);

  const snapshotsBefore = JSON.stringify([custom1, custom2]);
  for (const selected of ["custom-1", "custom-2", "baseline"]) {
    const bundle = createNormalExportBundleWithCustom(secondResult, selected, [custom1, custom2]);
    assert.deepEqual(bundle.candidates.filter(candidate => candidate.selected).map(candidate => candidate.id), [selected]);
    assert.deepEqual(bundle.custom_designs?.map(snapshot => snapshot.candidate_id), ["custom-1", "custom-2"]);
    const firstSnapshot = bundle.custom_designs![0];
    const secondSnapshot = bundle.custom_designs![1];
    assert.equal(firstSnapshot.arrna_sequence, custom1.variant.arrnaSequence);
    assert.equal(secondSnapshot.arrna_sequence, custom2.variant.arrnaSequence);
    assert.deepEqual(firstSnapshot.source_window, custom1.snapshot.source_window);
    assert.deepEqual(secondSnapshot.source_window, custom2.snapshot.source_window);
    assert.equal(firstSnapshot.adar, "combined");
    assert.equal(secondSnapshot.adar, "ADAR2");
    assert.equal(firstSnapshot.fold_topology, "linear");
    assert.equal(secondSnapshot.fold_topology, "circular");
    assert.equal(firstSnapshot.provenance.source_design.engine.version, "source-one");
    assert.equal(secondSnapshot.provenance.source_design.engine.version, "source-two");
    assert.deepEqual(bundle.custom_design, selected === "baseline" ? undefined : selected === "custom-1" ? custom1.snapshot : custom2.snapshot);
    const csv = csvRecords(serializeNormalCandidateCsv(bundle));
    const firstRow = csv.find(row => row.candidate_id === "custom-1")!;
    const secondRow = csv.find(row => row.candidate_id === "custom-2")!;
    assert.equal(firstRow.arrna_sequence_5to3, custom1.variant.arrnaSequence);
    assert.equal(firstRow.source_engine_version, "source-one");
    assert.equal(firstRow.ruleset_version, "rules-one");
    assert.equal(firstRow.source_window_start, String(custom1.snapshot.source_window.start));
    assert.equal(firstRow.target_index_0based, String(custom1.snapshot.target_index));
    assert.equal(firstRow.adar, "combined");
    assert.equal(firstRow.fold_topology, "linear");
    assert.equal(secondRow.arrna_sequence_5to3, custom2.variant.arrnaSequence);
    assert.equal(secondRow.source_engine_version, "source-two");
    assert.equal(secondRow.ruleset_version, "rules-two");
    assert.equal(secondRow.source_window_start, String(custom2.snapshot.source_window.start));
    assert.equal(secondRow.target_index_0based, String(custom2.snapshot.target_index));
    assert.equal(secondRow.adar, "ADAR2");
    assert.equal(secondRow.fold_topology, "circular");
    assert.equal(csv.filter(row => row.selected === "true").length, 1);
    assert.match(serializeFasta(bundle), />LEAPER_normal_editing_custom-1(?:_selected)?_5to3\n/);
    assert.match(serializeFasta(bundle), />LEAPER_normal_editing_custom-2(?:_selected)?_5to3\n/);
  }
  assert.equal(JSON.stringify([custom1, custom2]), snapshotsBefore);

  const custom3 = createAppliedCustomCandidate(custom1.snapshot.source_result, custom1.snapshot.source_candidate, custom1.structures, 3, "circular");
  const appended = createNormalExportBundleWithCustom(secondResult, "custom-3", [custom1, custom2, custom3]);
  assert.deepEqual(appended.custom_designs?.map(snapshot => snapshot.candidate_id), ["custom-1", "custom-2", "custom-3"]);
  assert.deepEqual(appended.candidates.filter(candidate => candidate.selected).map(candidate => candidate.id), ["custom-3"]);
  assert.equal(custom1.foldTopology, "linear");
});

test("candidate numbers are explicit, positive and unique without silently renumbering saved cards", () => {
  const { result, variant, specs } = fixture();
  for (const ordinal of [0, -1, 1.5, NaN]) assert.throws(() => createAppliedCustomCandidate(result, variant, specs, ordinal), /positive integer/);
  const custom7 = createAppliedCustomCandidate(result, variant, specs, 7);
  assert.equal(custom7.variant.id, "custom-7");
  assert.equal(custom7.variant.shortLabel, "Custom 7");
  assert.throws(() => createNormalExportBundleWithCustom(result, "custom-7", [custom7, custom7]), /distinct identifiers/);
  assert.equal(createNormalExportBundleWithCustom(result, "custom-7", [custom7]).candidates.at(-1)?.id, "custom-7");
});
