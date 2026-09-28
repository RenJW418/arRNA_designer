import assert from "node:assert/strict";
import test from "node:test";

import { decodeState, encodeState, type SharedState } from "./urlState.ts";

test("a design round-trips through the fragment unchanged", () => {
  const state: SharedState = {
    view: "design",
    application: "normal_editing",
    input: {
      mode: "sequence",
      adar: "ADAR1",
      sequence: `${"ATC".repeat(25)}CAC${"GCC".repeat(25)}`,
      position: "77",
    },
  };

  const decoded = decodeState(encodeState(state));

  assert.deepEqual(decoded, state);
});

test("an exon-skipping design round-trips with all three sequence regions", () => {
  const state: SharedState = {
    view: "design",
    application: "exon_skipping",
    input: {
      mode: "gene",
      adar: "ADAR2",
      gene: "DMD",
      species: "9606",
      exonNumber: "51",
      arrnaLength: "151",
    },
  };

  assert.deepEqual(decodeState(encodeState(state)), state);
});

test("the home view needs no fragment", () => {
  assert.equal(encodeState({ view: "home" }), "");
});

test("a link carrying a full-length coding sequence stays a usable length", () => {
  const fragment = encodeState({
    view: "design",
    application: "normal_editing",
    input: { mode: "sequence", adar: "ADAR1", sequence: "ACGT".repeat(150), position: "300" },
  });

  // 600 nt of sequence; a link people can still paste into a message.
  assert.ok(fragment.length < 1000, `fragment was ${fragment.length} characters`);
});

test("empty fields are dropped rather than encoded", () => {
  const withBlanks = encodeState({
    view: "design",
    input: { mode: "sequence", adar: "ADAR1", sequence: "ACGT", gene: "", targetExon: "" },
  });
  const without = encodeState({
    view: "design",
    input: { mode: "sequence", adar: "ADAR1", sequence: "ACGT" },
  });

  assert.equal(withBlanks, without);
});

test("a truncated or hand-edited fragment falls back to no state", () => {
  const valid = encodeState({ view: "design", application: "normal_editing" });

  assert.equal(decodeState(valid.slice(0, valid.length - 8)), null);
  assert.equal(decodeState("#s=not-base64!!"), null);
  assert.equal(decodeState("#something-else"), null);
  assert.equal(decodeState(""), null);
});

test("an unknown view is rejected instead of rendering", () => {
  const forged = encodeState({ view: "design" }).replace(/#s=.*/, () => {
    const payload = JSON.stringify({ v: "admin" });
    const bytes = new TextEncoder().encode(payload);
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return "#s=" + btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  });

  assert.equal(decodeState(forged), null);
});
