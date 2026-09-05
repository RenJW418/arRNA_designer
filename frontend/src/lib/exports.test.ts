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
