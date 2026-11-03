import assert from "node:assert/strict";
import test from "node:test";

import { decodeState, encodeState, pathForView, resolveView, restoredStateFor, staticViewFromPath, type SharedState } from "./urlState.ts";

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

test("static pages are routed by path, home and design keep the root path", () => {
  assert.equal(pathForView("help"), "/help");
  assert.equal(pathForView("citation"), "/citation");
  assert.equal(pathForView("method"), "/method");
  assert.equal(pathForView("home"), "/");
  assert.equal(pathForView("design"), "/");
  assert.equal(pathForView("refine"), "/");
});

test("static views resolve from their paths and no other path leaks a view", () => {
  assert.equal(staticViewFromPath("/help"), "help");
  assert.equal(staticViewFromPath("/citation"), "citation");
  assert.equal(staticViewFromPath("/method"), "method");
  assert.equal(staticViewFromPath("/"), null);
  assert.equal(staticViewFromPath("/design"), null);
  assert.equal(staticViewFromPath("/api/v1/designs/normal-editing"), null);
});

test("an old #s= link whose view is help still resolves to the help page", () => {
  const legacyHelp = encodeState({ view: "help" });
  assert.ok(legacyHelp.startsWith("#s="));
  assert.equal(decodeState(legacyHelp)?.view, "help");

  const legacyCitation = encodeState({ view: "citation" });
  assert.equal(decodeState(legacyCitation)?.view, "citation");

  const legacyMethod = encodeState({ view: "method" });
  assert.equal(decodeState(legacyMethod)?.view, "method");
});

test("resolveView prefers the static path, then the fragment, then home", () => {
  assert.equal(resolveView("/help", ""), "help");
  assert.equal(resolveView("/help/", ""), "help");
  assert.equal(resolveView("/", encodeState({ view: "help" })), "help");
  assert.equal(resolveView("/", ""), "home");
  assert.equal(resolveView("/nonsense", ""), "home");
});

test("resolveView normalizes trailing slashes and casing for static paths", () => {
  assert.equal(resolveView("/Help", ""), "help");
  assert.equal(resolveView("/HELP/", ""), "help");
  assert.equal(resolveView("/citation/", ""), "citation");
  assert.equal(resolveView("/METHOD", ""), "method");
  assert.equal(resolveView("", ""), "home");
});

test("resolveView lands a removed refinement link on home", () => {
  assert.equal(resolveView("/", encodeState({ view: "refine" })), "home");
});

test("staticViewFromPath normalizes trailing slashes and casing", () => {
  assert.equal(staticViewFromPath("/help/"), "help");
  assert.equal(staticViewFromPath("/Help"), "help");
  assert.equal(staticViewFromPath("/HELP/"), "help");
  assert.equal(staticViewFromPath("/CITATION/"), "citation");
  assert.equal(staticViewFromPath("/Method/"), "method");
  assert.equal(staticViewFromPath(""), null);
  assert.equal(staticViewFromPath("/"), null);
});

test("restoredStateFor refuses to restore design state under a static path", () => {
  const design = { view: "design", application: "normal_editing" } as const;

  assert.equal(restoredStateFor("/help", encodeState(design)), null);
  assert.equal(restoredStateFor("/method", encodeState(design)), null);
  assert.equal(restoredStateFor("/citation", encodeState(design)), null);
});

test("restoredStateFor treats a trailing slash as the static page too", () => {
  const design = { view: "design", application: "normal_editing" } as const;

  assert.equal(restoredStateFor("/help/", encodeState(design)), null);
});

test("restoredStateFor restores a design on the root path", () => {
  const state: SharedState = { view: "design", application: "normal_editing" };
  const restored = restoredStateFor("/", encodeState(state));

  assert.notEqual(restored, null);
  assert.equal(restored?.view, "design");
  assert.equal(restored?.application, "normal_editing");
});
