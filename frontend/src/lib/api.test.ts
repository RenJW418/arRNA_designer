import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createNormalEditingRequest, normalizeApiError } from "./api.ts";

describe("normal-editing API contract", () => {
  it("normalizes sequence and sends a reference snapshot without the CDS", () => {
    const request = createNormalEditingRequest("aug\ncca", 1, "ADAR2", {
      species: "Homo sapiens",
      gene: "TEST",
      transcript: "NM_000001.1",
      transcript_name: "TEST-201",
      selection: "MANE Select",
      cds_sequence: "ATGCCA",
      cds_start: 10,
      cds_end: 15,
    });

    assert.equal(request.sequence, "ATGCCA");
    assert.equal(request.adar_environment, "ADAR2");
    assert.ok(request.reference);
    assert.equal("cds_sequence" in request.reference, false);
  });

  it("turns FastAPI validation details into an actionable message", () => {
    assert.equal(
      normalizeApiError({ detail: [{ msg: "Value error, target position must identify an A" }] }),
      "target position must identify an A",
    );
  });

  it("sends the chosen protocol window and optional internal structure", () => {
    const request = createNormalEditingRequest("C".repeat(68) + "A" + "C".repeat(57), 69, "ADAR1", null, {
      windowStartRelative: -68,
      windowEndRelative: 57,
      includeInternalBulge: true,
      codingContext: false,
    });
    assert.equal(request.window_start_relative, -68);
    assert.equal(request.window_end_relative, 57);
    assert.equal(request.include_internal_bulge, true);
    assert.equal(request.coding_context, false);
  });

  it("uses concise fallbacks and hides transport details", () => {
    assert.equal(
      normalizeApiError(null),
      "The design could not be generated. Check the input and try again.",
    );
    assert.equal(
      normalizeApiError({ detail: "NCBI request failed: socket timeout" }),
      "The NCBI request failed. Please try again.",
    );
    assert.equal(
      normalizeApiError({ detail: { message: "Analysis is not available" } }),
      "Analysis is not available",
    );
  });
});
