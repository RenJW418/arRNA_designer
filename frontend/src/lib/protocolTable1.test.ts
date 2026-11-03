import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildCustomDesign, createAppliedCustomCandidate, createNormalExportBundleWithCustom, serializeNormalCandidateCsv } from "./customDesign.ts";
import { serializeJson } from "./exports.ts";
import type { NormalEditingResult } from "./api.ts";
import type { NormalArrnaVariant } from "./normalEditing.ts";
import { createAutoMismatchSequence, protocolPositionToInterval } from "./bulgeOptimization.ts";
import { PROTOCOL_TABLE1_PRESETS, PROTOCOL_TABLE1_SOURCE, createProtocolPresetStructure, getProtocolPresetUnavailable } from "./protocolTable1.ts";

function fixture() {
  const result: NormalEditingResult = JSON.parse(readFileSync(new URL("../../public/examples/normal-output.json", import.meta.url), "utf8"));
  const source = result.candidates.find(candidate => candidate.id === "baseline")!;
  const variant: NormalArrnaVariant = {
    id: source.id, label: source.label, shortLabel: source.short_label, description: source.description,
    arrnaSequence: source.arrna_sequence, alignedGuide: source.aligned_guide,
    deletionCoordinates: [...source.deletion_coordinates],
  };
  return { result, variant };
}

test("Table 1 origin survives saving, candidate selection and JSON/CSV exports without aliasing", () => {
  const { result, variant } = fixture();
  const origin = {
    source: "protocol-table-1" as const, preset_id: "table1-upstream-deletion-14-31",
    table: 1 as const, doi: null, status: "unpublished-protocol" as const,
  };
  const specs = [{ id: "table1", type: "deletion" as const, position: -31, size: 14, preset_provenance: origin }];
  const applied = createAppliedCustomCandidate(result, variant, specs);
  assert.deepEqual(applied.snapshot.structures[0].preset_provenance, origin);
  assert.deepEqual(applied.structures[0].preset_provenance, origin);
  for (const selected of ["custom-1", "baseline"]) {
    const bundle = createNormalExportBundleWithCustom(result, selected, [applied]);
    const parsed = JSON.parse(serializeJson(bundle));
    const custom = parsed.candidates.find((candidate: { id: string }) => candidate.id === "custom-1");
    assert.deepEqual(custom.structures[0].preset_provenance, origin);
    assert.deepEqual(parsed.custom_designs[0].structures[0].preset_provenance, origin);
    assert.equal(custom.selected, selected === "custom-1");
    assert.match(serializeNormalCandidateCsv(bundle), /protocol-table-1/);
    assert.match(serializeNormalCandidateCsv(bundle), /table1-upstream-deletion-14-31/);
    custom.structures[0].preset_provenance.preset_id = "changed export";
    assert.equal(applied.snapshot.structures[0].preset_provenance!.preset_id, origin.preset_id);
  }
  origin.preset_id = "changed input";
  assert.equal(applied.snapshot.structures[0].preset_provenance!.preset_id, "table1-upstream-deletion-14-31");
});

const expectedRows = [
  ["insertion", "upstream", [[14, -30], [12, -30], [9, -31], [7, -30], [5, -30]]],
  ["insertion", "downstream", [[11, 35], [9, 35], [6, 35], [5, 35], [3, 35]]],
  ["deletion", "upstream", [[30, -31], [26, -32], [22, -31], [18, -31], [14, -31]]],
  ["deletion", "downstream", [[13, 34], [11, 33], [9, 33], [6, 34], [3, 34]]],
  ["mismatch", "upstream", [[30, -32], [26, -32], [24, -31], [20, -33], [16, -32]]],
  ["mismatch", "downstream", [[8, 32], [7, 32], [6, 33], [5, 33], [4, 34]]],
] as const;

function preset(type: "insertion" | "deletion" | "mismatch", size: number, position: number) {
  const found = PROTOCOL_TABLE1_PRESETS.find(p => p.type === type && p.size === size && p.position === position);
  assert.ok(found, `Missing ${type} ${size} at ${position}`);
  return found;
}

test("Table 1 catalogue matches every independent PDF cell and has no fabricated DOI", () => {
  assert.equal(PROTOCOL_TABLE1_PRESETS.length, 30);
  assert.equal(new Set(PROTOCOL_TABLE1_PRESETS.map(p => p.id)).size, 30);
  for (const [type, side, entries] of expectedRows) {
    assert.deepEqual(PROTOCOL_TABLE1_PRESETS.filter(p => p.type === type && p.side === side).map(p => [p.size, p.position]), entries);
  }
  assert.equal(PROTOCOL_TABLE1_SOURCE.doi, null);
  assert.equal(PROTOCOL_TABLE1_SOURCE.status, "unpublished-protocol");
  assert.equal(PROTOCOL_TABLE1_SOURCE.table, 1);
  assert.equal(PROTOCOL_TABLE1_SOURCE.page, 43);
});

test("insertion preset adds exactly five explicitly entered guide bases in the exported orientation", () => {
  const { result } = fixture();
  const spec = createProtocolPresetStructure(preset("insertion", 5, -30), "insert");
  assert.equal(spec.type, "insertion");
  assert.equal(spec.bases, "");
  const draft = buildCustomDesign(result.target_window, result.target_index, "combined", [{ ...spec, bases: "AAAAA" }]);
  assert.equal(draft.valid, true);
  assert.equal(draft.sequence.length, 156);
  assert.equal(draft.sequence, "UGAACUUGACCUCGGGGGGGAUAGACAUGGGUAUGGCCUCUAAAAACAUGGCCCCAGCAGCUUCAGUCCCUUUCUCGUCGAUGGUCAGCACAGCCUUAUGCACGGCAAAAACUUGGAGAGCUUCAGGGGUGCCUCCUCUGUGACCCCGGAGAGGUC");
});

test("deletion preset removes fourteen guide nucleotides without changing A0 cytidine", () => {
  const { result } = fixture();
  const spec = createProtocolPresetStructure(preset("deletion", 14, -31), "delete");
  assert.equal(spec.type, "deletion");
  assert.equal("bases" in spec, false);
  const draft = buildCustomDesign(result.target_window, result.target_index, "combined", [spec]);
  assert.equal(draft.valid, true);
  assert.equal(draft.sequence.length, 137);
  assert.equal(draft.sequence, "UGAACUUGACCUCGGGGGGGAUAGACAUGGGUAUGGCCUCUAAAAACAUGGCCCCAGCAGCUUCAGUCCCUUUCUCGUCGAUGGUCAGCACAGCCUUAUGCACGGCGGGGUGCCUCCUCUGUGACCCCGGAGAGGUC");
});

test("mismatch preset retains length and changes all six specified bases to noncomplementary nucleotides", () => {
  const { result } = fixture();
  const spec = createProtocolPresetStructure(preset("mismatch", 6, 33), "mismatch");
  assert.equal(spec.type, "mismatch");
  assert.equal(spec.bases, "");
  const segment = result.target_window.slice(result.target_index + 33, result.target_index + 39);
  const bases = createAutoMismatchSequence(segment);
  assert.equal(bases, "UUAGAG");
  const draft = buildCustomDesign(result.target_window, result.target_index, "combined", [{ ...spec, bases }]);
  assert.equal(draft.valid, true);
  assert.equal(draft.sequence.length, 151);
  assert.equal(draft.sequence, "UGAACUUGACCUCGGGGGGGAUAGACAUGGGUAUGGCGAGAUUAAACAUGGCCCCAGCAGCUUCAGUCCCUUUCUCGUCGAUGGUCAGCACAGCCUUAUGCACGGCCUUGGAGAGCUUCAGGGGUGCCUCCUCUGUGACCCCGGAGAGGUC");
  const baseline = buildCustomDesign(result.target_window, result.target_index, "combined", []).sequence;
  assert.equal([...draft.sequence].filter((base, index) => base !== baseline[index]).length, 6);
});

test("preset geometry preview never supplies bases to the real draft or permits an incomplete Apply", () => {
  const { result, variant } = fixture();
  for (const p of PROTOCOL_TABLE1_PRESETS.filter(p => p.type !== "deletion")) {
    const spec = createProtocolPresetStructure(p, "empty-bases");
    assert.equal(getProtocolPresetUnavailable(p, result.target_window, result.target_index, "combined", []), "");
    assert.equal(spec.bases, "");
    assert.equal(buildCustomDesign(result.target_window, result.target_index, "combined", [spec]).valid, false);
    assert.throws(() => createAppliedCustomCandidate(result, variant, [spec]), /Enter exactly/);
  }
});

test("availability preserves paired-flank constraints in a shortened target window", () => {
  const { result } = fixture();
  assert.equal(PROTOCOL_TABLE1_PRESETS.filter(p => !getProtocolPresetUnavailable(p, result.target_window, 75, "combined", [])).length, 30);
  const target = result.target_window.slice(7, 129);
  const blocked = PROTOCOL_TABLE1_PRESETS.filter(p => getProtocolPresetUnavailable(p, target, 68, "combined", []));
  assert.deepEqual(blocked.map(p => `${p.type}:${p.size}:${p.position}`).sort(), ["deletion:13:34", "deletion:30:-31", "mismatch:30:-32"]);
  for (const p of blocked) assert.match(getProtocolPresetUnavailable(p, target, 68, "combined", []), /10 complementary/);
});

test("existing Three bulges are never silently replaced when an alternative conflicts", () => {
  const { result } = fixture();
  const existing = [
    { id: "up", type: "deletion" as const, position: -31, size: 28 },
    { id: "internal", type: "deletion" as const, position: 4, size: 1 },
    { id: "down", type: "deletion" as const, position: 34, size: 10 },
  ];
  const before = structuredClone(existing);
  assert.equal(PROTOCOL_TABLE1_PRESETS.length, 30);
  for (const p of PROTOCOL_TABLE1_PRESETS) {
    assert.ok(getProtocolPresetUnavailable(p, result.target_window, 75, "combined", existing));
  }
  assert.deepEqual(existing, before);
});

test("preset preview retains validation of an incomplete existing structure and the bulge-count limit", () => {
  const { result } = fixture();
  const p = preset("deletion", 14, -31);
  const incomplete = [{ id: "pending", type: "insertion" as const, position: 12, size: 2, bases: "" }];
  assert.match(getProtocolPresetUnavailable(p, result.target_window, 75, "combined", incomplete), /Enter exactly 2/);
  const four = [4, 7, 10, 13].map((position, index) => ({ id: `existing-${index}`, type: "deletion" as const, position, size: 1 }));
  assert.match(getProtocolPresetUnavailable(p, result.target_window, 75, "combined", four), /four bulges/);
});

test("preset preview rejects target-window overflow instead of generating hidden placeholder bases", () => {
  const { result } = fixture();
  const target = result.target_window.slice(45, 106);
  for (const p of [preset("deletion", 30, -31), preset("mismatch", 30, -32), preset("insertion", 11, 35)]) {
    assert.match(getProtocolPresetUnavailable(p, target, 30, "combined", []), /beyond the target window/);
  }
});
