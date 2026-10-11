import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { serializeCsv, serializeFasta, serializeJson, type DesignExportBundle } from "./exports.ts";

const bundle: DesignExportBundle = {
  schema_version: "1.0",
  application: "normal_editing",
  generated_at: "2026-08-27T00:00:00.000Z",
  normalized_input: { sequence: "AAACCC", target_position: 1 },
  provenance: { engine: { name: "test", version: "1" }, ruleset: { id: "r", version: "1", citations: [] } },
  candidates: [{ id: "baseline", label: "Baseline", sequence: "GGGUUC", length: 6 }],
  evidence: {
    observed_editing_efficiencies: { 1: 42 },
    observed_editing_status: { 1: "measured" },
    optimization_goal: "improve-target",
    qualitative_predictions: [],
  },
};

describe("reproducible exports", () => {
  it("uses the same candidate identifier and sequence in FASTA, CSV and JSON", () => {
    for (const output of [serializeFasta(bundle), serializeCsv(bundle), serializeJson(bundle)]) {
      assert.match(output, /baseline/);
      assert.match(output, /GGGUUC/);
    }
  });

  it("keeps the full normalized raw input in JSON", () => {
    assert.equal(JSON.parse(serializeJson(bundle)).normalized_input.sequence, "AAACCC");
  });
});

it("retains the complete exon reference, prediction settings and candidate coordinates in JSON", async () => {
  const { createExonExportBundle } = await import("./exports.ts");
  const result = {
    schema_version: "1.0", application: "exon_skipping",
    normalized_input: { upstream_intron: "AG", exon: "ACA", downstream_intron: "GT", combined_length: 7, coordinate_system: "concatenated_sequence_1_based" },
    normalized_upstream_intron: "AG", normalized_exon: "ACA", normalized_downstream_intron: "GT",
    arrna_length: 151, exon_length: 3, length_class: "short", sa_is_canonical: true,
    transcript: "NM_001.2", exon_number: 2, reference: { transcript: "NM_001.2", genomic_accession: "NC_001.1", exon_genomic_start: 10, exon_genomic_end: 12 },
    design_settings: { evaluate_covered_ese: true, ese_mismatch_positions: [1] },
    prediction_settings: { method: "ESEfinder 3.0", matrices: [{ name: "SF2/ASF", threshold: 1.956 }] },
    ese_hits: [{ matrix: "SF2/ASF", start: 1, end: 3 }], ese_regions: [{ start: 1, end: 3 }],
    candidates: [{ id: "ese-1", label: "ESE coverage 1", kind: "ese", target_sequence: "ACA", arrna_sequence: "UGC", global_start: 3, global_end: 5, exon_start: 1, exon_end: 3, covered_a_positions: [1,3], covered_region_indices: [1] }],
    provenance: bundle.provenance, warnings: [],
  };
  const parsed = JSON.parse(serializeJson(createExonExportBundle(result as any, "ese-1")));
  assert.equal(parsed.transcript, "NM_001.2");
  assert.equal(parsed.exon_number, 2);
  assert.equal(parsed.reference.exon_genomic_start, 10);
  assert.equal(parsed.prediction_settings.matrices[0].threshold, 1.956);
  assert.deepEqual(parsed.ese_hits, result.ese_hits);
  assert.equal(parsed.candidates[0].global_start, 3);
  assert.equal(parsed.candidates[0].target_sequence, "ACA");
});
