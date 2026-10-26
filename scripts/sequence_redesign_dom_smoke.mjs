/**
 * Component interaction checks in jsdom, not a real-browser smoke test.
 * Uses the installed frontend React/esbuild packages; install jsdom externally:
 *   npm install --prefix /tmp/leaper-sequence-dom-test-deps --no-package-lock --no-audit --no-fund jsdom@26.1.0
 *   LEAPER_DOM_TEST_DEPS=/tmp/leaper-sequence-dom-test-deps node --test --test-reporter=spec scripts/sequence_redesign_dom_smoke.mjs
 * Network responses use checked-in public example fixtures. No API service,
 * sequence submission, browser backend or repository dependency change is needed.
 */
import assert from "node:assert/strict";
import { after, afterEach, beforeEach, test } from "node:test";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const frontendDirectory = join(rootDirectory, "frontend");
const frontendRequire = createRequire(join(frontendDirectory, "package.json"));
const domRequire = process.env.LEAPER_DOM_TEST_DEPS
  ? createRequire(join(resolve(process.env.LEAPER_DOM_TEST_DEPS), "package.json"))
  : frontendRequire;
let JSDOM;
try { ({ JSDOM } = domRequire("jsdom")); }
catch { throw new Error("jsdom is not installed. Follow the two setup/run commands at the top of scripts/sequence_redesign_dom_smoke.mjs."); }

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://leaper-dom.test/", pretendToBeVisual: true,
});
for (const name of ["window", "document", "navigator", "HTMLElement", "HTMLInputElement", "HTMLTextAreaElement", "Element", "Node", "Event", "MouseEvent", "KeyboardEvent", "MutationObserver", "getComputedStyle"]) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: dom.window[name] });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
// jsdom has no layout or real scrolling. These adapters only satisfy effects;
// assertions below concern state, events and DOM output, not visual geometry.
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
dom.window.scrollTo = () => {};
const scrollLog = [];
let reducedMotion = false;
dom.window.HTMLElement.prototype.scrollIntoView = function (options) { scrollLog.push({ element: this, options }); };
dom.window.matchMedia = (query) => ({ matches: reducedMotion && query.includes("prefers-reduced-motion"), media: query });
Object.defineProperty(dom.window.navigator, "clipboard", { value: { writeText: async () => {} } });

const React = frontendRequire("react");
const { act } = React;
const { createRoot } = frontendRequire("react-dom/client");
const { build } = frontendRequire("esbuild");
const bundle = await build({
  stdin: {
    contents: "export { App } from './src/App'; export { LanguageProvider } from './src/components/LanguageProvider'; export { DuplexPairingSchematic } from './src/components/DuplexPairingSchematic'; export { encodeState, decodeState } from './src/lib/urlState'; export { clearRnaFoldCache } from './src/lib/rnaFoldCache';",
    resolveDir: frontendDirectory, loader: "tsx",
  },
  bundle: true, write: false, platform: "node", format: "cjs", jsx: "automatic", packages: "external",
  define: { "import.meta.env": "{}" },
  loader: { ".css": "empty" },
});
const bundledModule = { exports: {} };
new Function("require", "module", "exports", bundle.outputFiles[0].text)(frontendRequire, bundledModule, bundledModule.exports);
const { App, LanguageProvider, DuplexPairingSchematic, encodeState, decodeState, clearRnaFoldCache } = bundledModule.exports;
const fixture = async (name) => JSON.parse(await readFile(join(frontendDirectory, "public/examples", name), "utf8"));
const normalInput = await fixture("normal-input.json");
const normalOutput = await fixture("normal-output.json");
const combinedPairing = {
  ...normalOutput.pairing, adar_environment: "combined", required_upstream: 6, required_downstream: 25,
  bulge_sources: { upstream: "ADAR2", downstream: "ADAR1" },
};
normalOutput.pairing = combinedPairing;
const exonInput = await fixture("exon-input.json");
const exonOutput = await fixture("exon-output.json");
const codingReference = { species: "Homo sapiens", gene: "FIXTURE", transcript: "NM_000001.1",
  transcript_name: "Static test transcript", selection: "MANE Select", cds_sequence: normalInput.sequence,
  cds_start: 10, cds_end: normalInput.sequence.length + 9 };
const exonReference = { species: "Mus musculus", gene: "FIXTURE", transcript: "NM_000002.2",
  transcript_name: "Static exon transcript", selection: "user-selected transcript", exon_number: 2, exon_count: 3,
  genomic_accession: "NC_000001.1", orientation: "minus", exon_genomic_start: 501, exon_genomic_end: 556,
  upstream_intron: exonInput.upstream_intron, exon: exonInput.exon, downstream_intron: exonInput.downstream_intron };
const response = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const requestLog = [];
const designRequests = () => requestLog.filter(({ url }) => url.endsWith("/designs/normal-editing") || url.endsWith("/exon-skipping/design"));
const foldRequests = () => requestLog.filter(({ url }) => url.endsWith("/analysis/rnafold"));
// Deliberately synthetic, valid display data. This fixture does not predict a
// biological structure or run a folding/design algorithm.
const foldResponse = ({ sequence, topology }) => response({
  sequence, topology, structure: ".".repeat(sequence.length), mfe: 0,
  ensemble_free_energy: 0, ensemble_diversity: 0, temperature: 37,
  unpaired_probabilities: Array(sequence.length).fill(1), mean_unpaired_probability: 1,
  mfe_unpaired_fraction: 1, pairs: [], engine: "DOM display fixture", version: "1",
  coordinates: Array.from(sequence, (_, index) => ({ x: index * 12, y: index % 2 * 5 })),
});
// A second static display fixture uses the existing example with its first five
// columns trimmed. It lets Apply tests distinguish old/new UI without a backend.
const shorterNormalOutput = {
  ...normalOutput,
  normalized_input: { ...normalOutput.normalized_input, window_start_relative: -70, coding_context: false },
  window_start: 6, target_window: normalOutput.target_window.slice(5), target_index: 70, upstream_length: 70,
  candidates: normalOutput.candidates.map(candidate => ({ ...candidate,
    arrna_sequence: candidate.arrna_sequence.slice(0, -5), aligned_guide: candidate.aligned_guide.slice(5),
  })),
};
// Trim already returned columns to represent a server-applied window. This is
// display data only: no design, mismatch selection or scoring is performed.
function windowedExonOutput(overrides = []) {
  return { ...exonOutput, design_settings: { ...exonOutput.design_settings, candidate_windows: overrides },
    candidates: exonOutput.candidates.map(candidate => {
      const range = overrides.find(item => item.candidate_id === candidate.id);
      if (!range) return candidate;
      assert.ok(range.start >= candidate.global_start && range.end <= candidate.global_end);
      const from = range.start - candidate.global_start, to = range.end - candidate.global_start + 1;
      return { ...candidate, global_start: range.start, global_end: range.end,
        target_sequence: candidate.target_sequence.slice(from, to),
        arrna_sequence: Array.from(candidate.arrna_sequence).reverse().slice(from, to).reverse().join(""),
      };
    }) };
}
const annotationLog = [];
let respondAnnotations;
const annotationResponse = (body, extra = {}) => ({
  sequence: body.sequence, prediction_method: "DOM fixture motifs", warnings: [], reference_accession: null,
  features: [
    ...(body.sequence.length >= 4 ? [{ id: "fixture-motif", start: 2, end: 4, kind: "motif", label: "Fixture motif", evidence: "predicted", source: "DOM fixture", description: "Fixture annotation for display checks." }] : []),
    ...(body.regions ?? []).map((region, i) => ({ ...region, id: `user-${i}`, evidence: "user", source: "User-defined region", description: "User supplied region." })),
  ], ...extra,
});
let respond;
let reactRoot;
let container;
let reactErrors;
const originalConsoleError = console.error;

beforeEach(() => {
  clearRnaFoldCache();
  document.body.replaceChildren();
  window.localStorage.clear();
  window.history.replaceState(null, "", "/");
  requestLog.length = 0;
  annotationLog.length = 0;
  scrollLog.length = 0;
  reducedMotion = false;
  reactErrors = [];
  console.error = (...args) => { reactErrors.push(args.map(String).join(" ")); };
  respond = async (url, body) => {
    if (url.endsWith("/designs/normal-editing")) {
      return response({ ...normalOutput, pairing: combinedPairing, normalized_input: { ...normalOutput.normalized_input, coding_context: body.coding_context, include_internal_bulge: body.include_internal_bulge } });
    }
    if (url.endsWith("/exon-skipping/design")) return response(exonOutput);
    if (url.endsWith("/analysis/rnafold")) return response({ detail: "RNAfold unavailable in this DOM fixture." }, 503);
    throw new Error(`Unexpected network request: ${url}`);
  };
  respondAnnotations = async (body) => response(annotationResponse(body));
  globalThis.fetch = async (url, options) => {
    const body = JSON.parse(options.body);
    if (String(url).endsWith("/analysis/annotations")) {
      annotationLog.push(body);
      return respondAnnotations(body);
    }
    requestLog.push({ url: String(url), body });
    return respond(String(url), body);
  };
});

afterEach(async () => {
  if (reactRoot) await act(async () => reactRoot.unmount());
  reactRoot = null;
  console.error = originalConsoleError;
  assert.deepEqual(reactErrors, [], "React/component errors were emitted");
});
after(() => { dom.window.close(); });

async function mount(state) {
  if (state) window.history.replaceState(null, "", encodeState(state));
  container = document.createElement("div");
  document.body.append(container);
  reactRoot = createRoot(container);
  await act(async () => reactRoot.render(React.createElement(LanguageProvider, null, React.createElement(App))));
}

function query(selector, scope = document) {
  const element = scope.querySelector(selector);
  assert.ok(element, `Missing DOM element: ${selector}`);
  return element;
}
function button(name, scope = document) {
  const element = Array.from(scope.querySelectorAll("button")).find((candidate) =>
    candidate.getAttribute("aria-label") === name || candidate.textContent.trim() === name);
  assert.ok(element, `Missing button: ${name}`);
  return element;
}
function labeledField(name, scope = document) {
  const label = Array.from(scope.querySelectorAll("label")).find(element => element.textContent.trim() === name);
  const field = label?.control;
  assert.ok(field && scope.contains(field), `Missing labeled field: ${name}`);
  return field;
}
const entryBase = (position) => query(`.sf-entry [data-seq-position="${position}"]`);
const targetField = () => query('input[aria-label="Target A position"]');
const exonStart = () => query('input[aria-label="Exon start"]');
const exonEnd = () => query('input[aria-label="Exon end"]');
const textarea = () => query('textarea[aria-label="Target sequence"]');
async function click(element) {
  await act(async () => {
    if (typeof element.click === "function") element.click();
    else element.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
  });
}
async function enter(element, value) {
  const prototype = element instanceof window.HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype
    : element instanceof window.HTMLSelectElement ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(prototype, "value").set.call(element, value);
    element.dispatchEvent(new window.Event(element instanceof window.HTMLSelectElement ? "change" : "input", { bubbles: true }));
  });
}
async function submit() {
  await act(async () => query(".sf-entry-form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true })));
}
async function startNormal() {
  await enter(textarea(), normalInput.sequence);
  await click(entryBase(normalInput.target_position));
}
async function flushScroll() {
  await act(async () => new Promise((resolveFrame) => window.requestAnimationFrame(() => window.requestAnimationFrame(resolveFrame))));
}
async function settlePastAnnotationDelay() { await act(async () => new Promise(resolve => setTimeout(resolve, 850))); }
async function settleRequests() { await act(async () => new Promise(resolve => setTimeout(resolve, 0))); }
const windowStartField = () => query('input[aria-label="Window start relative to target"]');
const windowEndField = () => query('input[aria-label="Window end relative to target"]');
const exonWindowStartField = () => query('#sf-panel-design input[aria-label="Window start"]');
const exonWindowEndField = () => query('#sf-panel-design input[aria-label="Window end"]');
function assertExonWindowOnly() {
  const settings = query("#sf-panel-design");
  assert.ok(!settings.querySelector('.sf-settings-grid, input[type="checkbox"], input[placeholder="12, 28"]'), "Exon Advanced must expose only the candidate window, without global length or ESE controls");
  assert.ok(query(".exon-window-selector", settings));
}
function assertRecommendedExonRequest(request) {
  assert.equal(request.arrna_length, 151);
  assert.equal(request.evaluate_covered_ese, false);
  assert.deepEqual(request.ese_mismatch_positions, []);
  assert.deepEqual(request.candidate_windows, []);
}
const applySettings = () => click(button("Apply settings"));
function assertNoAdarChoice() {
  assert.equal(document.querySelector('select[aria-label="ADAR"]'), null, "The unified profile must not expose an ADAR1/2 selector");
}
function assertFixedLinearFolding() {
  assert.equal(document.querySelector('select[aria-label="Folding model"]'), null, "Folding uses the fixed linear model without a selector");
  assert.ok(foldRequests().every(({ body }) => body.topology === "linear"), "Every submitted fold must use the fixed linear model");
}
function assertNoCodingCheckbox() {
  assert.ok(!Array.from(document.querySelectorAll('#sf-panel-design input[type="checkbox"]')).some(input =>
    input.closest("label")?.textContent.includes("In-frame coding sequence")), "Coding context comes from the input source, without a manual checkbox");
}
function assertRecommendedNormalSettings() {
  assertNoAdarChoice();
  assert.equal(windowStartField().value, "-75");
  assert.equal(windowEndField().value, "75");
  assertFixedLinearFolding();
}
function assertRecommendedNormalRequest(request, codingContext = false) {
  assert.equal(request.adar_environment, "combined");
  assert.equal(request.window_start_relative, -75);
  assert.equal(request.window_end_relative, 75);
  assert.equal(request.include_internal_bulge, false);
  assert.equal(request.coding_context, codingContext);
}
function pairingAnchor(svg) {
  const translate = element => {
    const match = element.getAttribute("transform").match(/^translate\(([-\d.e]+)[ ,]+([-\d.e]+)\)$/);
    assert.ok(match, "The selected base must expose finite SVG translation coordinates");
    const [x, y] = match.slice(1).map(Number);
    assert.ok(Number.isFinite(x) && Number.isFinite(y));
    return { x, y };
  };
  const target = translate(query('.normal-schematic-a[data-relative="0"]', svg));
  const guide = translate(query(".normal-schematic-target-guide", svg));
  const connector = query(".normal-schematic-target-pair", svg);
  assert.ok(Math.abs(target.x - guide.x) < 1e-8, "A and its guide base must remain vertically aligned");
  for (const attribute of ["x1", "x2"]) assert.ok(Math.abs(Number(connector.getAttribute(attribute)) - target.x) < 1e-8, "The dedicated connector must follow the A–C anchor");
  assert.ok(target.y < guide.y);
  return { target, guide };
}
function assertPairingAnchor(svg, expected, context) {
  const actual = pairingAnchor(svg);
  for (const strand of ["target", "guide"]) for (const axis of ["x", "y"]) {
    assert.ok(Math.abs(actual[strand][axis] - expected[strand][axis]) < 1e-8,
      `${context}: ${strand} ${axis} must remain fixed (${actual[strand][axis]} versus ${expected[strand][axis]})`);
  }
}
const candidateCards = () => Array.from(document.querySelectorAll(".normal-candidate-card"));
const customCandidateCard = (id = "custom-1") => document.querySelector(`.normal-candidate-card[data-candidate-id="${id}"]`);
const customCandidateCards = () => Array.from(document.querySelectorAll('.normal-candidate-card[data-candidate-id^="custom-"]'));
const thumbnailTrigger = (index) => query(".rna-fold-thumbnail-trigger", candidateCards()[index]);
const foldDialog = () => query('.rna-fold-modal[role="dialog"]');
const closeFoldDialog = () => click(button("Close RNAfold structure", foldDialog()));

test("NCBI retrieval is an input action and never generates a design automatically", async () => {
  const defaultRespond = respond;
  respond = async (url, body) => {
    if (url.endsWith("/references/ncbi/coding-sequence")) return response(codingReference);
    const original = await defaultRespond(url, body);
    return url.endsWith("/designs/normal-editing") ? response({ ...await original.json(), reference: body.reference ?? null }) : original;
  };
  await mount();
  assert.equal(requestLog.length, 0);
  await startNormal();
  await click(query(".sf-advanced-trigger"));
  await enter(windowStartField(), "-60");
  const trigger = button("Fetch sequence from NCBI");
  assert.ok(query(".sf-entry").contains(trigger), "NCBI retrieval belongs beside sequence input");
  assert.ok(!query(".advanced-inline-panel").contains(trigger));
  await click(trigger);
  const panel = query("#sf-ncbi-input");
  assert.ok(!panel.hidden);
  await enter(labeledField("Gene symbol", panel), "FIXTURE");
  const fetchEnter = new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
  await act(async () => labeledField("Gene symbol", panel).dispatchEvent(fetchEnter));
  assert.equal(fetchEnter.defaultPrevented, true, "Enter in a retrieval field must not submit the outer Go form");
  await settleRequests();
  assert.deepEqual(requestLog.filter(({ url }) => url.includes("/references/")).map(({ body }) => body), [{ species: "9606", gene: "FIXTURE" }]);
  assert.equal(designRequests().length, 0, "Fetching only loads an editable sequence; the user still chooses Go");
  assert.equal(textarea().value, normalInput.sequence.replace(/T/g, "U"));
  assert.equal(targetField().value, "", "A fetched CDS still requires an explicit editing target");
  assertNoAdarChoice();
  const source = query(".sf-ncbi-source");
  assert.ok(source.textContent.includes(codingReference.gene) && source.textContent.includes(codingReference.transcript));
  assert.match(source.textContent, /CDS/);
  assert.ok(document.activeElement === textarea());
  assert.ok(!document.querySelector(".sf-inline-results"));
  await click(entryBase(normalInput.target_position));
  assertRecommendedNormalSettings();
  await submit();
  const request = designRequests().at(-1).body;
  assertRecommendedNormalRequest(request, true);
  assert.equal(request.sequence, normalInput.sequence);
  assert.equal(request.reference.transcript, codingReference.transcript);
  assert.equal(request.reference.cds_start, codingReference.cds_start);
  assert.ok(!("cds_sequence" in request.reference));
  const createObjectURL = URL.createObjectURL, revokeObjectURL = URL.revokeObjectURL, anchorClick = window.HTMLAnchorElement.prototype.click;
  const downloads = [];
  try {
    URL.createObjectURL = blob => { downloads.push(blob); return "blob:leaper-dom.test/reference"; };
    URL.revokeObjectURL = () => {};
    window.HTMLAnchorElement.prototype.click = () => {};
    await click(button("Download", query(".normal-result-page")));
    await click(button("JSON", query(".export-menu-options")));
    assert.deepEqual(JSON.parse(await downloads[0].text()).reference, request.reference);
  } finally {
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;
    window.HTMLAnchorElement.prototype.click = anchorClick;
  }
  await enter(textarea(), normalInput.sequence);
  assert.ok(!document.querySelector(".sf-ncbi-source"), "A manual sequence edit clears fetched provenance");
  await click(entryBase(normalInput.target_position));
  await submit();
  assert.equal(designRequests().at(-1).body.reference, undefined);
  assert.equal(designRequests().at(-1).body.coding_context, false);
  await click(trigger);
  await click(button("Fetch sequence", panel));
  assert.ok(query(".sf-ncbi-source"));
  await click(button("Try an example"));
  assert.ok(!document.querySelector(".sf-ncbi-source"), "Loading an example clears the fetched source");
  await submit();
  assert.equal(designRequests().at(-1).body.reference, undefined);
});

test("NCBI Exon retrieval fills RNA boundaries and carries reference context until the input changes", async () => {
  const defaultRespond = respond;
  respond = async (url, body) => {
    if (url.endsWith("/references/ncbi/exon")) return response(exonReference);
    const original = await defaultRespond(url, body);
    return url.endsWith("/exon-skipping/design") ? response({ ...await original.json(), reference: body.reference, transcript: body.transcript, exon_number: body.exon_number }) : original;
  };
  await mount();
  await click(button("Exon skipping", query(".sf-mode-switch")));
  await click(button("Fetch sequence from NCBI"));
  const panel = query("#sf-ncbi-input");
  await enter(labeledField("Gene symbol", panel), "FIXTURE");
  await enter(labeledField("Species", panel), "10090");
  assert.equal(labeledField("Exon number", panel).value, "2");
  await click(button("Specify transcript", panel));
  await enter(labeledField("Transcript accession (optional)", panel), exonReference.transcript);
  await click(button("Fetch sequence", panel));
  await settleRequests();
  assert.deepEqual(requestLog.find(({ url }) => url.endsWith("/references/ncbi/exon")).body, {
    species: "10090", gene: "FIXTURE", exon_number: 2, flank_length: 151, transcript_accession: exonReference.transcript,
  });
  assert.equal(designRequests().length, 0);
  const combined = exonInput.upstream_intron + exonInput.exon + exonInput.downstream_intron;
  assert.equal(textarea().value, combined.replace(/T/g, "U"));
  assert.equal(exonStart().value, "153");
  assert.equal(exonEnd().value, "208");
  assert.ok(entryBase(153).classList.contains("in-exon") && entryBase(208).classList.contains("in-exon"));
  assert.ok(query(".sf-ncbi-source").textContent.includes(exonReference.transcript));
  await submit();
  const request = designRequests().at(-1).body;
  assert.equal(request.transcript, exonReference.transcript);
  assert.equal(request.exon_number, 2);
  assert.equal(request.reference.genomic_accession, exonReference.genomic_accession);
  assert.equal(request.reference.orientation, "minus");
  assert.equal(request.arrna_length, 151);
  assert.equal(request.evaluate_covered_ese, false);
  assert.equal(decodeState(window.location.hash).input.codingContext, false);
  await enter(exonStart(), "154");
  assert.ok(!document.querySelector(".sf-ncbi-source"));
  await submit();
  assert.equal(designRequests().at(-1).body.reference, undefined, "Changed exon boundaries must not reuse old genomic provenance");
  await click(button("Fetch sequence from NCBI"));
  await click(button("Fetch sequence", panel));
  assert.ok(query(".sf-ncbi-source"));
  await click(button("Normal", query(".sf-mode-switch")));
  assert.ok(!document.querySelector(".sf-ncbi-source"), "Switching workflow clears incompatible fetched provenance");
  assertNoAdarChoice();
});

test("failed NCBI retrieval preserves the existing input and applied results", async () => {
  const defaultRespond = respond;
  respond = async (url, body) => url.includes("/references/") ? response({ detail: "NCBI request failed: fixture timeout" }, 503) : defaultRespond(url, body);
  await mount();
  await startNormal();
  await submit();
  await flushScroll();
  const output = query(".normal-sequence-text"), originalHash = window.location.hash;
  await click(button("Fetch sequence from NCBI"));
  const panel = query("#sf-ncbi-input");
  await enter(labeledField("Gene symbol", panel), "FIXTURE");
  await click(button("Fetch sequence", panel));
  assert.equal(textarea().value, normalInput.sequence);
  assert.equal(targetField().value, String(normalInput.target_position));
  assert.ok(query(".normal-sequence-text") === output);
  assert.equal(window.location.hash, originalHash);
  assert.equal(designRequests().length, 1);
  assert.match(panel.textContent, /NCBI request failed|could not be loaded|temporarily unavailable/i);
  assert.equal(button("Fetch sequence", panel).disabled, false);
  await click(button("Close NCBI input", panel));
  assert.ok(document.activeElement === button("Fetch sequence from NCBI"));
});

test("late NCBI responses cannot overwrite edited criteria, input, mode, closed panels or Citation", async () => {
  const defaultRespond = respond;
  let finish;
  respond = async (url, body) => url.includes("/references/") ? new Promise(resolveResponse => { finish = resolveResponse; }) : defaultRespond(url, body);
  const changes = [
    ["criteria", async panel => enter(labeledField("Gene symbol", panel), "NEWGENE")],
    ["raw input", async () => enter(textarea(), "AACCGGUU")],
    ["mode", async () => click(button("Exon skipping", query(".sf-mode-switch")))],
    ["close", async panel => click(button("Close NCBI input", panel))],
    ["Citation", async () => click(button("Citation", query(".site-header nav")))],
    ["unmount", async () => { await act(async () => reactRoot.unmount()); reactRoot = null; }],
  ];
  for (const [name, change] of changes) {
    await mount();
    await startNormal();
    await click(button("Fetch sequence from NCBI"));
    const panel = query("#sf-ncbi-input");
    await enter(labeledField("Gene symbol", panel), "FIXTURE");
    finish = undefined;
    await click(button("Fetch sequence", panel));
    assert.equal(typeof finish, "function");
    assert.equal(query(".sf-go").disabled, true);
    await change(panel);
    const input = document.querySelector('textarea[aria-label="Target sequence"]')?.value;
    const hash = window.location.hash;
    if (name === "Citation") assert.equal(decodeState(hash).view, "citation");
    await act(async () => finish(response(codingReference)));
    await settleRequests();
    assert.equal(window.location.hash, hash, `${name}: the late response must not navigate`);
    assert.equal(document.querySelector('textarea[aria-label="Target sequence"]')?.value, input, `${name}: the late response must not replace the input`);
    assert.ok(!document.querySelector(".sf-ncbi-source"), `${name}: stale reference provenance must not be applied`);
    assert.equal(designRequests().length, 0);
    if (name === "close") assert.ok(document.activeElement === button("Fetch sequence from NCBI"));
    if (reactRoot) await act(async () => reactRoot.unmount());
    reactRoot = null;
    window.history.replaceState(null, "", "/");
  }
});

test("Advanced opens inline with the main page remaining interactive", async () => {
  await mount();
  const panel = query(".advanced-inline-panel");
  assert.equal(panel.id, "advanced-settings");
  assert.equal(panel.hidden, true);
  const trigger = query(".sf-advanced-trigger");
  assert.equal(trigger.getAttribute("aria-controls"), panel.id);
  assert.equal(trigger.getAttribute("aria-expanded"), "false");
  assert.equal(trigger.hasAttribute("aria-haspopup"), false);
  assert.ok(!panel.querySelector('[role="tablist"], [role="tab"], [role="tabpanel"], #sf-panel-reference'), "Advanced must show design settings directly without tabs or a Reference panel");
  const settings = query("#sf-panel-design", panel);
  assert.equal(settings.hidden, false);
  assert.match(settings.textContent, /Design settings/);
  assert.ok(button("Apply settings", panel));
  assert.ok(button("Restore recommended settings", panel));
  assert.ok(!Array.from(panel.querySelectorAll("button")).some(control => /Reference|Load from NCBI/.test(control.textContent)), "The removed Reference entry must not be available");
  assert.ok(!panel.querySelector("#sf-tab-structure, #sf-panel-structure"), "The removed structure/model tab must not return");
  assertNoAdarChoice();
  assertFixedLinearFolding();
  assert.ok(!panel.querySelector("#sf-tab-annotations, #sf-panel-annotations"), "Features must not remain in Advanced");
  await click(trigger);
  await flushScroll();
  assert.equal(panel.hidden, false);
  assert.ok(!settings.closest("[hidden]"));
  assert.ok(query(".window-range-selector", settings));
  assert.ok(!button("Apply settings", panel).closest("[hidden]"));
  assert.ok(!button("Restore recommended settings", panel).closest("[hidden]"));
  assert.ok(query(".sequence-first-workspace").contains(panel), "Advanced must stay within the workspace, not a portal");
  assert.ok(query(".sf-bottom").compareDocumentPosition(panel) & window.Node.DOCUMENT_POSITION_FOLLOWING, "Advanced must expand below its trigger");
  assert.equal(trigger.getAttribute("aria-expanded"), "true");
  assert.ok(document.activeElement === panel, "Advanced should receive focus");
  assert.ok(scrollLog.at(-1)?.element === panel, "Advanced should scroll into view");
  assert.equal(scrollLog.at(-1)?.options.behavior, "smooth");
  assert.ok(!document.querySelector(".advanced-sheet-overlay, [role='dialog'], [aria-modal='true'], [inert]"));
  assert.notEqual(document.body.style.overflow, "hidden");
  await enter(textarea(), "AACCGGTT");
  assert.equal(textarea().value, "AACCGGTT");
  await click(button("Exon skipping", query(".sf-mode-switch")));
  if (panel.hidden) await click(trigger);
  assert.ok(!settings.closest("[hidden]"));
  assert.ok(!panel.querySelector('[role="tablist"], [role="tab"], [role="tabpanel"], #sf-panel-reference'));
  assert.ok(!settings.querySelector('.sf-settings-grid, input[type="checkbox"], input[placeholder="12, 28"]'), "Exon Advanced must expose only the candidate window, without global length or ESE controls");
  assert.match(settings.textContent, /Window/);
  assert.ok(!button("Apply settings", panel).closest("[hidden]"), "Exon settings expose Apply directly");
  assert.ok(!button("Restore recommended settings", panel).closest("[hidden]"), "Exon settings expose Restore directly");
});

test("Advanced retains settings when closed and only scrolls on explicit reveal", async () => {
  await mount();
  await startNormal();
  const trigger = query(".sf-advanced-trigger");
  const panel = query(".advanced-inline-panel");
  const scrollCount = () => scrollLog.filter(({ element }) => element === panel).length;
  await click(trigger);
  await flushScroll();
  assert.equal(scrollCount(), 1);
  const windowStart = windowStartField();
  await enter(windowStart, "-70");
  await enter(windowEndField(), "70");
  await flushScroll();
  assert.equal(scrollCount(), 1, "Editing settings must not move the page");
  await click(button("Close advanced settings"));
  assert.equal(panel.hidden, true);
  assert.equal(trigger.getAttribute("aria-expanded"), "false");
  assert.ok(document.activeElement === trigger, "Closing should restore focus to Advanced");
  await click(trigger);
  await flushScroll();
  assert.equal(panel.hidden, false);
  assert.equal(scrollCount(), 2, "Reopening should scroll to Advanced again");
  assert.equal(windowEndField().value, "70");
  assert.equal(windowStartField(), windowStart, "Settings stay mounted while closed");
  assert.equal(windowStart.value, "-70");
  await click(trigger);
  await flushScroll();
  assert.equal(panel.hidden, true, "Advanced trigger should also collapse the panel");
  assert.equal(trigger.getAttribute("aria-expanded"), "false");
  assert.equal(scrollCount(), 2);
});

test("Advanced respects reduced motion when reopened and field changes do not scroll", async () => {
  reducedMotion = true;
  await mount();
  await startNormal();
  const panel = query(".advanced-inline-panel");
  const trigger = query(".sf-advanced-trigger");
  await click(trigger);
  await flushScroll();
  assert.equal(panel.hidden, false);
  assert.ok(document.activeElement === panel);
  assert.deepEqual(scrollLog.filter(({ element }) => element === panel).map(({ options }) => options), [{ behavior: "instant", block: "start" }]);
  await enter(windowEndField(), "70");
  await flushScroll();
  assert.equal(scrollLog.filter(({ element }) => element === panel).length, 1);
  await click(trigger);
  await flushScroll();
  assert.equal(panel.hidden, true);
  assert.equal(scrollLog.filter(({ element }) => element === panel).length, 1);
  await click(trigger);
  await flushScroll();
  assert.equal(windowEndField().value, "70");
  assert.equal(scrollLog.filter(({ element }) => element === panel).length, 2, "Reopening should reveal Advanced again");
  assert.equal(scrollLog.at(-1).options.behavior, "instant");
});

test("legacy gene links never load NCBI and can still design an already supplied sequence", async () => {
  await mount({ view: "design", application: "normal_editing", input: {
    mode: "gene", adar: "ADAR2", gene: "SERPINA1", species: "9606", transcriptAccession: "NM_000295.5",
  } });
  await settlePastAnnotationDelay();
  assert.equal(textarea().value, "");
  assert.equal(query(".sf-go").disabled, true);
  assert.equal(query(".advanced-inline-panel").hidden, true, "A retired gene link must not open a removed Reference screen");
  assert.ok(!document.querySelector('#sf-panel-reference, [role="tablist"]'));
  assert.equal(requestLog.length, 0, "A gene identifier alone must not trigger an NCBI lookup");
  await act(async () => {
    window.history.replaceState(null, "", encodeState({ view: "design", application: "normal_editing", input: {
      mode: "gene", adar: "ADAR2", gene: "SERPINA1", transcriptAccession: "NM_000295.5",
      sequence: normalInput.sequence, position: String(normalInput.target_position), codingContext: true,
    } }));
    window.dispatchEvent(new window.PopStateEvent("popstate"));
  });
  assert.equal(textarea().value, normalInput.sequence);
  assert.equal(targetField().value, String(normalInput.target_position));
  assert.equal(query(".sf-go").disabled, false);
  assert.equal(requestLog.length, 0);
  await submit();
  assertRecommendedNormalRequest(designRequests().at(-1).body, true);
  assert.ok(query(".normal-result-page"));
  assert.equal(requestLog.filter(({ url }) => url.includes("/references/")).length, 0);
});

test("normal results end at sequence export, with no extra disclosures or refinement entry", async () => {
  await mount();
  await startNormal();
  await submit();
  const result = query(".normal-result-page");
  assert.ok(!result.querySelector("details"), "Result disclosures must be removed");
  assert.ok(!result.querySelector(".normal-refine-row"), "Result refinement entry must be removed");
  assert.ok(query(".normal-pairing-schematic", result));
  await click(button("Copy", result));
  assert.ok(button("Copied", result));
  await click(button("Download", result));
  assert.deepEqual(Array.from(result.querySelectorAll(".export-menu-options button"), b => b.textContent), ["FASTA", "CSV", "JSON"]);
  await click(query(".sf-advanced-trigger"));
  assert.equal(document.querySelector(".sf-refine-link"), null);
});

test("normal pairing markers, deletion arcs and strand directions retain their coordinates across candidate switches", async () => {
  await mount();
  await startNormal();
  await submit();
  const expectedSites = Array.from(normalOutput.target_window).flatMap((base, index) => base === "A"
    ? [{ position: normalOutput.window_start + index, relative: index - normalOutput.target_index, index }] : []);
  const dualIndex = normalOutput.candidates.findIndex(candidate => candidate.id === "dual-deletion");
  const inspect = (candidate) => {
    const svg = query('.normal-pairing-schematic svg[role="img"]');
    const guideLine = query(".normal-schematic-guide-line", svg);
    const left = Number(svg.dataset.left);
    const right = Number(svg.dataset.right);
    assert.ok(Number.isFinite(left) && Number.isFinite(right) && left < right);
    const bulges = Array.from(svg.querySelectorAll("g.normal-schematic-bulge"));
    const loopGeometry = bulges.map(bulge => {
      const geometry = Object.fromEntries(["start", "end", "startX", "endX", "centerX", "radiusX"].map(key => [key, Number(bulge.dataset[key])]));
      assert.ok(Object.values(geometry).every(Number.isFinite), "Each displayed loop needs finite sequence and screen coordinates");
      assert.ok(geometry.startX >= left - 1e-8 && geometry.endX <= right + 1e-8 && geometry.startX < geometry.endX);
      assert.ok(geometry.centerX >= geometry.startX && geometry.centerX <= geometry.endX && geometry.radiusX > 0);
      return geometry;
    });
    const markers = Array.from(svg.querySelectorAll(".normal-schematic-a"));
    assert.deepEqual(markers.map(marker => ({ position: Number(marker.dataset.position), relative: Number(marker.dataset.relative) })),
      expectedSites.map(({ position, relative }) => ({ position, relative })), "Every in-window A must have exactly one marker with its original coordinates");
    const target = query('.normal-schematic-a[data-relative="0"]', svg);
    const transform = element => element.getAttribute("transform").match(/^translate\(([-\d.e]+)[ ,]+([-\d.e]+)\)$/).slice(1).map(Number);
    const [targetX, targetY] = transform(target);
    const orderedPairedPoints = [];
    for (const [index, marker] of markers.entries()) {
      const expected = expectedSites[index];
      const [x, y] = transform(marker);
      assert.ok(Number.isFinite(x) && Number.isFinite(y) && x >= left - 1e-8 && x <= right + 1e-8, `A${expected.position} must have finite coordinates within the diagram`);
      const loop = loopGeometry.find(({ start, end }) => expected.relative >= start && expected.relative <= end);
      if (loop) {
        assert.ok(y < targetY, "Deleted A sites must rise above the paired target strand");
        assert.ok(x >= loop.centerX - loop.radiusX - 1e-8 && x <= loop.centerX + loop.radiusX + 1e-8, "A deleted marker must lie within its own rounded loop");
      } else {
        assert.equal(y, targetY, "Paired sites must remain on the target strand");
        orderedPairedPoints.push({ relative: expected.relative, x });
      }
      assert.ok(query("title", marker).textContent.includes(`A${expected.position}`));
      if (expected.relative === 0) {
        assert.equal(query("text", marker).textContent, "A");
        assert.ok(query("circle.normal-schematic-target-node", marker));
      } else {
        assert.ok(query("circle.normal-schematic-site-dot", marker));
        assert.equal(marker.querySelector("text"), null, "Other A sites should be dots, not repeated base labels");
        assert.equal(y < targetY, candidate.deletion_coordinates.includes(expected.relative), "Only deleted coordinates should rise onto the target bulge");
      }
    }
    assert.equal(query(".normal-schematic-target-guide text", svg).textContent, candidate.aligned_guide[normalOutput.target_index]);
    const [targetGuideX, targetGuideY] = transform(query(".normal-schematic-target-guide", svg));
    assert.equal(targetGuideX, targetX, "The target and its aligned guide character must share an x coordinate");
    assert.equal(targetGuideY, Number(svg.dataset.guideY));
    assert.equal(targetY, Number(svg.dataset.targetY));
    assert.ok(guideLine.getAttribute("d"), "The guide strand must remain visible when represented as a path");
    const shownDeleted = bulges.flatMap(bulge => {
      const start = Number(bulge.dataset.start);
      const end = Number(bulge.dataset.end);
      assert.equal(Number(bulge.dataset.count), end - start + 1);
      assert.ok(query("title", bulge).textContent.includes(String(end - start + 1)));
      return Array.from({ length: end - start + 1 }, (_, index) => start + index);
    });
    assert.deepEqual(shownDeleted, [...candidate.deletion_coordinates].sort((a, b) => a - b), "Bulges must cover exactly the candidate's deleted coordinates");
    if (candidate.id === "dual-deletion") assert.deepEqual(bulges.map(bulge => Number(bulge.dataset.count)), [28, 10]);
    if (candidate.id === "baseline") assert.equal(bulges.length, 0);
    const pairs = Array.from(svg.querySelectorAll(".normal-schematic-pair"));
    assert.ok(pairs.length > 0);
    for (const pair of pairs) {
      const relative = Number(pair.dataset.relative);
      assert.ok(Number.isInteger(relative));
      assert.notEqual(relative, 0, "A0 has its own highlighted connector");
      assert.ok(!candidate.deletion_coordinates.includes(relative), "Generic connectors must not cross deleted positions");
      assert.ok(relative >= -normalOutput.target_index && relative < normalOutput.target_window.length - normalOutput.target_index);
      const x = Number(pair.getAttribute("x1"));
      assert.ok(Number.isFinite(x) && x >= left - 1e-8 && x <= right + 1e-8);
      assert.ok(["y1", "y2"].every(attribute => Number.isFinite(Number(pair.getAttribute(attribute)))));
      orderedPairedPoints.push({ relative, x });
      assert.equal(pair.getAttribute("x1"), pair.getAttribute("x2"));
    }
    orderedPairedPoints.sort((a, b) => a.relative - b.relative);
    for (let index = 1; index < orderedPairedPoints.length; index++) {
      const previous = orderedPairedPoints[index - 1];
      const point = orderedPairedPoints[index];
      if (point.relative === previous.relative) assert.ok(Math.abs(point.x - previous.x) < 1e-8, "Dots and connectors at the same sequence position must align");
      else assert.ok(point.x > previous.x, "Compression must preserve the order of paired sequence positions");
    }
    assert.equal(svg.querySelectorAll(".normal-schematic-target-pair").length, 1);
    const targetPair = query(".normal-schematic-target-pair", svg);
    assert.equal(Number(targetPair.getAttribute("x1")), targetX);
    assert.equal(Number(targetPair.getAttribute("x2")), targetX);
    assert.deepEqual(Array.from(svg.querySelectorAll(".normal-schematic-direction:not(.guide)"), node => node.textContent), ["5′", "3′"]);
    assert.deepEqual(Array.from(svg.querySelectorAll(".normal-schematic-direction.guide"), node => node.textContent), ["3′", "5′"]);
    assert.equal(query(".normal-sequence-text").textContent, candidate.arrna_sequence);
    return markers.map(marker => ({ position: marker.dataset.position, relative: marker.dataset.relative, transform: marker.getAttribute("transform") }));
  };
  const initialMarkers = inspect(normalOutput.candidates[dualIndex]);
  const fixedAnchor = pairingAnchor(query('.normal-result-page .normal-pairing-schematic svg'));
  for (const [index, candidate] of normalOutput.candidates.entries()) {
    await click(query(".normal-candidate-option", candidateCards()[index]));
    inspect(candidate);
    assertPairingAnchor(query('.normal-result-page .normal-pairing-schematic svg'), fixedAnchor, `Switching to ${candidate.id}`);
  }
  await click(query(".normal-candidate-option", candidateCards()[dualIndex]));
  assert.deepEqual(inspect(normalOutput.candidates[dualIndex]), initialMarkers);
  assert.equal(designRequests().length, 1, "Changing the representation must not regenerate designs");
});

test("result A–C anchors retain the window fraction across cropped displays and custom structure types", async () => {
  // Reuse the checked-in result and its existing cropped display fixture. These
  // changes exercise geometry only; no target sequence or design is generated.
  container = document.createElement("div");
  document.body.append(container);
  reactRoot = createRoot(container);
  const displayStructures = [
    { id: "anchor-deletion", type: "deletion", start: -25, end: -23, size: 3 },
    { id: "anchor-insertion", type: "insertion", start: -10, end: -10, size: 4 },
    { id: "anchor-mismatch", type: "mismatch", start: 12, end: 14, size: 3 },
  ];
  for (const display of [normalOutput, shorterNormalOutput]) {
    const baseline = display.candidates.find(candidate => candidate.id === "baseline");
    const design = {
      targetPosition: display.window_start + display.target_index, targetWindow: display.target_window,
      arrnaSequence: baseline.arrna_sequence, windowStart: display.window_start, windowEnd: display.window_end,
      targetIndex: display.target_index, upstreamLength: display.upstream_length,
      downstreamLength: display.downstream_length, hasFullFlanks: true,
    };
    const sites = Array.from(display.target_window).flatMap((base, index) => base === "A" ? [{
      position: display.window_start + index, category: "rna", codon: "", editedCodon: "", aminoAcid: "", editedAminoAcid: "",
    }] : []);
    const render = (candidate, structures) => act(async () => reactRoot.render(React.createElement(LanguageProvider, null,
      React.createElement(DuplexPairingSchematic, { design, sites, structures, variant: {
        shortLabel: candidate.label, alignedGuide: candidate.aligned_guide, deletionCoordinates: candidate.deletion_coordinates,
      } }))));
    await render(baseline);
    const svg = () => query(".normal-pairing-schematic svg");
    const fixedAnchor = pairingAnchor(svg());
    const left = Number(svg().dataset.left), right = Number(svg().dataset.right);
    const expectedFraction = display.target_index / (display.target_window.length - 1);
    const observedFraction = (fixedAnchor.target.x - left) / (right - left);
    assert.ok(Math.abs(observedFraction - expectedFraction) < 1e-8, "A0 must retain its original fraction along this window");
    if (display === shorterNormalOutput) assert.ok(Math.abs(observedFraction - .5) > .01, "A cropped asymmetric window must not force A0 to the midpoint");
    for (const candidate of display.candidates) {
      await render(candidate);
      assertPairingAnchor(svg(), fixedAnchor, `${display.window_start}: ${candidate.id}`);
    }
    const firstRelative = -display.target_index;
    const lastRelative = display.target_window.length - display.target_index - 1;
    const edgeStructures = ["mismatch", "deletion"].flatMap(type => [firstRelative, lastRelative].map(position => ({
      id: `edge-${type}-${position}`, type, start: position, end: position, size: 1,
    })));
    const adjacentInsertions = [-1, 1].map(position => ({ id: `adjacent-${position}`, type: "insertion", start: position, end: position, size: 1 }));
    const cases = [...displayStructures.map(structure => [structure]), displayStructures,
      ...edgeStructures.map(structure => [structure]), ...adjacentInsertions.map(structure => [structure]), adjacentInsertions, []];
    for (const structures of cases) {
      await render(baseline, structures);
      const context = `${display.window_start}: custom ${structures.map(structure => `${structure.type}@${structure.start}`).join("/") || "cleared"}`;
      assertPairingAnchor(svg(), fixedAnchor, context);
      for (const selector of [".normal-schematic-target-line", ".normal-schematic-guide-line"]) {
        const coordinates = Array.from(query(selector, svg()).getAttribute("d").matchAll(/-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi), match => Number(match[0]));
        assert.ok(coordinates.every(Number.isFinite));
        assert.equal(coordinates[0], left, `${context}: the strand must begin at its original left endpoint`);
        assert.equal(coordinates.at(-2), right, `${context}: the strand must end at its original right endpoint`);
      }
      const loops = Array.from(svg().querySelectorAll("g.normal-schematic-bulge"));
      assert.equal(loops.length, structures.length);
      for (const loop of loops) {
        const start = Number(loop.dataset.start), end = Number(loop.dataset.end);
        const startX = Number(loop.dataset.startX), endX = Number(loop.dataset.endX);
        assert.ok(Number.isFinite(startX) && Number.isFinite(endX) && startX < endX);
        assert.ok(startX >= left - 1e-8 && endX <= right + 1e-8, `${context}: loop endpoints must remain inside the original strand bounds`);
        if (start === firstRelative) assert.ok(Math.abs(startX - left) < 1e-8, `${context}: a first-base loop must meet the left endpoint`);
        if (end === lastRelative) assert.ok(Math.abs(endX - right) < 1e-8, `${context}: a last-base loop must meet the right endpoint`);
        if (loop.dataset.type === "insertion" && start === -1) assert.ok(endX < fixedAnchor.target.x, "An insertion immediately before A0 must remain on its upstream side");
        if (loop.dataset.type === "insertion" && start === 1) assert.ok(startX > fixedAnchor.target.x, "An insertion immediately after A0 must remain on its downstream side");
      }
      const pairs = Array.from(svg().querySelectorAll(".normal-schematic-pair"));
      assert.ok(pairs.length > 0);
      for (const pair of pairs) {
        const relative = Number(pair.dataset.relative), x = Number(pair.getAttribute("x1"));
        const y1 = Number(pair.getAttribute("y1")), y2 = Number(pair.getAttribute("y2"));
        assert.ok(Number.isFinite(x) && x >= left - 1e-8 && x <= right + 1e-8);
        assert.equal(Number(pair.getAttribute("x2")), x);
        assert.ok(y1 > fixedAnchor.target.y && y2 < fixedAnchor.guide.y && y1 < y2);
        assert.ok(relative !== 0 && !structures.some(structure => structure.type !== "insertion" && relative >= structure.start && relative <= structure.end));
        if (relative === firstRelative) assert.ok(Math.abs(x - left) < 1e-8, `${context}: the first paired base must align with the strand endpoint`);
        if (relative === lastRelative) assert.ok(Math.abs(x - right) < 1e-8, `${context}: the last paired base must align with the strand endpoint`);
      }
    }
  }
  assert.equal(requestLog.length, 0, "Display geometry must not submit a design or folding request");
});

test("Advanced keeps its A–C anchor fixed while bulges are added, changed and removed", async () => {
  await mount();
  await startNormal();
  await submit();
  await click(query('.normal-candidate-card[data-candidate-id="baseline"] .normal-candidate-option'));
  await click(query(".sf-advanced-trigger"));
  const editor = query(".custom-structure-editor");
  const svg = () => query(".wrs-duplex-panel svg", editor);
  const fixedAnchor = pairingAnchor(svg());
  const assertFixed = context => assertPairingAnchor(svg(), fixedAnchor, context);
  await click(query(".sf-external-presets summary", editor));
  await click(button("Upstream −31 · 28/0", editor));
  assertFixed("Adding an external bulge");
  await click(button("Internal bulge", editor));
  assertFixed("Adding an internal bulge");
  const added = Array.from(editor.querySelectorAll(".sf-structure-row")).at(-1);
  await enter(query("select", added), "mismatch");
  assertFixed("Changing a custom structure type");
  for (const row of Array.from(editor.querySelectorAll(".sf-structure-row"))) {
    await click(query("button.sf-icon-button", row));
    assertFixed("Removing a bulge");
  }
  assert.equal(svg().querySelectorAll("g.normal-schematic-bulge").length, 0);
  assert.equal(designRequests().length, 1, "Preview-only structure edits must not regenerate candidates");
});

test("pairing diagrams use distinct accessible SVG descriptions and read the actual aligned guide character", async () => {
  // Static display sentinel: crop three existing columns so A0 falls on the
  // sparse connector grid, and replace the baseline guide label with U. This
  // checks rendering of supplied data, without running a design algorithm.
  const displayOutput = {
    ...normalOutput, window_start: 4, target_window: normalOutput.target_window.slice(3), target_index: 72, upstream_length: 72,
    candidates: normalOutput.candidates.map(candidate => ({ ...candidate,
      arrna_sequence: candidate.arrna_sequence.slice(0, -3),
      aligned_guide: candidate.id === "baseline"
        ? candidate.aligned_guide.slice(3, 75) + "U" + candidate.aligned_guide.slice(76)
        : candidate.aligned_guide.slice(3),
    })),
  };
  const defaultRespond = respond;
  respond = async (url, body) => url.endsWith("/designs/normal-editing")
    ? response({ ...displayOutput, normalized_input: { ...displayOutput.normalized_input, coding_context: body.coding_context } })
    : defaultRespond(url, body);
  await mount({ view: "design", application: "normal_editing", input: {
    mode: "sequence", adar: "ADAR1", sequence: normalInput.sequence, position: String(normalInput.target_position), codingContext: false,
  } });
  await act(async () => reactRoot.render(React.createElement(LanguageProvider, null,
    React.createElement(App, { key: "first" }), React.createElement(App, { key: "second" }))));
  const workspaces = Array.from(document.querySelectorAll(".sequence-first-workspace"));
  assert.equal(workspaces.length, 2);
  for (const workspace of workspaces) {
    await act(async () => query(".sf-entry-form", workspace).dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true })));
  }
  const ids = [];
  for (const workspace of workspaces) {
    const svg = query('.normal-pairing-schematic svg[role="img"]', workspace);
    for (const [attribute, tag] of [["aria-labelledby", "title"], ["aria-describedby", "desc"]]) {
      const id = svg.getAttribute(attribute);
      assert.ok(id, `The schematic requires ${attribute}`);
      const text = document.getElementById(id);
      assert.ok(text && svg.contains(text), "Accessible text must belong to this SVG instance");
      assert.equal(text.tagName.toLowerCase(), tag);
      assert.ok(text.textContent.trim());
      if (tag === "desc") assert.match(text.textContent, /not to scale/i, "The compressed diagram must disclose that its spacing is schematic");
      ids.push(id);
    }
    assert.equal(svg.querySelector('.normal-schematic-pair[data-relative="0"]'), null, "Even when A0 is on the sparse marker grid, only its dedicated connector should render");
    assert.equal(svg.querySelectorAll(".normal-schematic-target-pair").length, 1);
  }
  assert.equal(new Set(ids).size, ids.length, "Simultaneous result instances must not share title or description IDs");
  await click(query(".normal-candidate-option", workspaces[0]));
  assert.equal(query(".normal-schematic-target-guide text", workspaces[0]).textContent, "U", "The guide character must come from aligned_guide rather than a hardcoded C");
  assert.equal(query(".normal-schematic-target-guide text", workspaces[1]).textContent, "C");
  assert.deepEqual(Array.from(workspaces, workspace => {
    const svg = query(".normal-pairing-schematic svg", workspace);
    return [svg.getAttribute("aria-labelledby"), svg.getAttribute("aria-describedby")];
  }).flat(), ids, "Candidate selection should retain this instance's accessible labels");
});

test("exon results use the compact shared layout while retaining diagnostics and exports", async () => {
  const diagnostic = "Some requested ESE A/C mismatches are outside the generated ESE guides and were not applied.";
  const defaultRespond = respond;
  respond = async (url, body) => url.endsWith("/exon-skipping/design")
    ? response({ ...exonOutput, warnings: [...exonOutput.warnings, diagnostic] }) : defaultRespond(url, body);
  await mount();
  await click(button("Exon skipping", query(".sf-mode-switch")));
  await enter(textarea(), exonInput.upstream_intron + exonInput.exon + exonInput.downstream_intron);
  await click(entryBase(153));
  await click(entryBase(208));
  await submit();
  await flushScroll();
  const result = query(".exon-result");
  assert.ok(!result.querySelector(".arrna-result-header, .normal-tool-header, h1, .normal-selected-note"), "Exon results must use the same compact presentation as Normal without duplicate title or selected-candidate text");
  assert.ok(!Array.from(result.querySelectorAll("button")).some(control => control.textContent.trim() === "Revise input"), "A populated result does not need a redundant revise control");
  for (const warning of exonOutput.warnings) assert.ok(!result.textContent.includes(warning), "Generic boilerplate must not appear as a result warning");
  assert.ok(result.textContent.includes(diagnostic), "A real unapplied-mismatch diagnostic must remain visible");
  assert.ok(!result.querySelector("details"), "Exon result disclosures must be removed");
  assert.ok(query(".exon-pairing-overview", result));
  assert.ok(query(".normal-sequence-text", result));
  await click(button("Copy", result));
  assert.ok(button("Copied", result));
  await click(button("Download", result));
  assert.equal(result.querySelectorAll(".export-menu-options button").length, 3);
  assert.equal(result.querySelector(".rna-fold-panel"), null);
  assert.equal(result.querySelectorAll(".rna-fold-thumbnail-trigger").length, exonOutput.candidates.length);
  const lastCandidate = exonOutput.candidates.at(-1);
  const lastTrigger = thumbnailTrigger(exonOutput.candidates.length - 1);
  await click(lastTrigger);
  assert.equal(query(".normal-sequence-text", result).textContent, lastCandidate.arrna_sequence);
  assert.match(query(".rna-fold-modal-header", foldDialog()).textContent, new RegExp(lastCandidate.label));
  await closeFoldDialog();
  assert.ok(document.activeElement === lastTrigger);
});

test("exon pairing preserves actual bases, context coordinates and exported data across candidate switches", async () => {
  // This excerpt reuses returned fixture columns; no design or prediction runs.
  // Its original mismatch lies outside the excerpt, so it is a perfect duplex.
  const source = exonOutput.candidates.find(candidate => candidate.kind === "ese");
  const first = 170, last = 190, from = first - source.global_start, to = last - source.global_start + 1;
  const perfect = { ...source, id: "ese-perfect-display", label: "Perfect-match display fixture",
    target_sequence: source.target_sequence.slice(from, to),
    arrna_sequence: Array.from(source.arrna_sequence).reverse().slice(from, to).reverse().join(""),
    global_start: first, global_end: last, exon_start: 18, exon_end: 38,
    mismatch_target_position: null, mismatch_arrna_position: null, mismatch_exon_positions: [],
  };
  const displayOutput = { ...exonOutput, candidates: [...exonOutput.candidates, perfect] };
  const defaultRespond = respond;
  respond = async (url, body) => url.endsWith("/exon-skipping/design") ? response(displayOutput) : defaultRespond(url, body);
  await mount();
  await click(button("Exon skipping", query(".sf-mode-switch")));
  await enter(textarea(), exonInput.upstream_intron + exonInput.exon + exonInput.downstream_intron);
  await click(entryBase(153));
  await click(entryBase(208));
  await submit();
  const result = query(".exon-result");
  const approximate = (actual, expected) => assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) < 1e-7, `${actual} differs from ${expected}`);
  const translate = element => element.getAttribute("transform").match(/-?\d+(?:\.\d+)?/g).map(Number);
  const inspect = candidate => {
    assert.equal(query(".normal-sequence-text", result).textContent, candidate.arrna_sequence);
    assert.equal(query('.normal-candidate-card[data-selected="true"]', result).dataset.candidateId, candidate.id);
    const svg = query(".exon-pairing-svg", result);
    assert.deepEqual([Number(svg.dataset.start), Number(svg.dataset.end)], [candidate.global_start, candidate.global_end]);
    const left = Number(svg.dataset.left), right = Number(svg.dataset.right);
    const x = position => left + (position - candidate.global_start) / (candidate.target_sequence.length - 1) * (right - left);
    const guide = Array.from(candidate.arrna_sequence).reverse();
    const aPositions = Array.from(candidate.target_sequence).flatMap((base, index) => base === "A" ? [candidate.global_start + index] : []);
    const mismatches = aPositions.filter(position => guide[position - candidate.global_start] === "C");
    const nodes = Array.from(svg.querySelectorAll(".normal-schematic-a"));
    assert.deepEqual(nodes.map(node => Number(node.dataset.position)), aPositions, "Every returned A must retain its absolute position");
    for (const node of nodes) {
      const position = Number(node.dataset.position), mismatch = mismatches.includes(position);
      const [nodeX, nodeY] = translate(node);
      approximate(nodeX, x(position));
      assert.equal(nodeY, Number(svg.dataset.targetY));
      assert.equal(node.dataset.mismatch, String(mismatch));
      assert.equal(!!node.querySelector(".normal-schematic-target-node"), mismatch);
      assert.equal(!!node.querySelector(".normal-schematic-site-dot"), !mismatch);
      if (!mismatch) assert.ok(!node.querySelector("text"), "Other A sites should be dots, not duplicate letter labels");
    }
    const guideNodes = Array.from(svg.querySelectorAll(".exon-schematic-guide-base"));
    assert.deepEqual(guideNodes.map(node => Number(node.dataset.position)), mismatches, "Only actual returned A–C pairs get a guide node");
    for (const node of guideNodes) {
      assert.equal(node.dataset.base, "C");
      const [nodeX, nodeY] = translate(node);
      approximate(nodeX, x(Number(node.dataset.position)));
      assert.equal(nodeY, Number(svg.dataset.guideY));
    }
    assert.deepEqual(Array.from(svg.querySelectorAll(".normal-schematic-target-pair"), node => Number(node.dataset.position)), mismatches);
    for (const line of svg.querySelectorAll(".normal-schematic-pair")) {
      const position = Number(line.dataset.position);
      assert.ok(position >= candidate.global_start && position <= candidate.global_end && !mismatches.includes(position));
      approximate(Number(line.getAttribute("x1")), x(position));
      approximate(Number(line.getAttribute("x2")), x(position));
    }
    const boundaries = [["SA", 152.5], ["SD", 208.5]].filter(([, position]) => position >= candidate.global_start && position <= candidate.global_end);
    assert.deepEqual(Array.from(svg.querySelectorAll(".exon-schematic-splice"), node => [node.dataset.boundary, Number(node.dataset.position)]), boundaries);
    for (const node of svg.querySelectorAll(".exon-schematic-splice")) approximate(Number(query("line", node).getAttribute("x1")), x(Number(node.dataset.position)));
    const ese = query(".exon-schematic-ese-region", svg);
    const start = Math.max(153, candidate.global_start), end = Math.min(208, candidate.global_end);
    assert.deepEqual([Number(ese.dataset.start), Number(ese.dataset.end)], [start, end]);
    approximate(Number(ese.getAttribute("x")), x(Math.max(candidate.global_start, start - .5)));
    approximate(Number(ese.getAttribute("width")), x(Math.min(candidate.global_end, end + .5)) - x(Math.max(candidate.global_start, start - .5)));
    assert.deepEqual(Array.from(svg.querySelectorAll(".normal-schematic-direction"), node => node.textContent), ["5′", "3′", "3′", "5′"]);
    const ids = [svg.getAttribute("aria-labelledby"), svg.getAttribute("aria-describedby")];
    assert.equal(new Set(ids).size, 2);
    for (const id of ids) assert.ok(id && svg.contains(document.getElementById(id)), "Accessible labels must belong to the displayed pairing SVG");
    const context = query(".exon-context-track", result), total = Number(context.dataset.sequenceLength);
    assert.equal(total, exonInput.upstream_intron.length + exonInput.exon.length + exonInput.downstream_intron.length);
    for (const [selector, start, end] of [[".exon-context-exon", 153, 208], [".exon-context-ese", 153, 208], [".exon-context-coverage", candidate.global_start, candidate.global_end]]) {
      const region = query(selector, context);
      assert.deepEqual([Number(region.dataset.start), Number(region.dataset.end)], [start, end]);
      approximate(Number(region.getAttribute("x")), 96 + (start - 1) / total * 860);
      approximate(Number(region.getAttribute("width")), (end - start + 1) / total * 860);
    }
    return { markers: nodes.map(node => [node.dataset.position, node.dataset.mismatch, node.getAttribute("transform")]), ids };
  };
  const original = inspect(displayOutput.candidates[0]);
  for (const candidate of displayOutput.candidates.slice(1)) {
    await click(query(`.normal-candidate-card[data-candidate-id="${candidate.id}"] .normal-candidate-option`, result));
    inspect(candidate);
  }
  assert.ok(!result.querySelector(".exon-schematic-mismatch, .exon-schematic-guide-base, .exon-schematic-splice"), "The perfect-match excerpt must not invent mismatches or splice boundaries");
  assert.doesNotMatch(query(".exon-pairing-svg", result).textContent, /\bA0\b/);
  const originalCreateObjectURL = URL.createObjectURL, originalRevokeObjectURL = URL.revokeObjectURL;
  const originalAnchorClick = window.HTMLAnchorElement.prototype.click;
  const downloads = [];
  try {
    URL.createObjectURL = blob => { downloads.push(blob); return `blob:leaper-dom.test/exon-${downloads.length}`; };
    URL.revokeObjectURL = () => {};
    window.HTMLAnchorElement.prototype.click = () => {};
    await click(button("Download", result));
    await click(button("JSON", query(".export-menu-options", result)));
    const exported = JSON.parse(await downloads[0].text());
    assert.deepEqual(exported.warnings, exonOutput.warnings, "Presentation-only filtering must not remove exported guidance");
    assert.deepEqual(exported.candidates.map(candidate => [candidate.id, candidate.sequence]), displayOutput.candidates.map(candidate => [candidate.id, candidate.arrna_sequence]));
    assert.deepEqual(exported.candidates.filter(candidate => candidate.selected).map(candidate => candidate.id), [perfect.id]);
  } finally {
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    window.HTMLAnchorElement.prototype.click = originalAnchorClick;
  }
  await click(query(`.normal-candidate-card[data-candidate-id="${displayOutput.candidates[0].id}"] .normal-candidate-option`, result));
  assert.deepEqual(inspect(displayOutput.candidates[0]), original, "Returning to a candidate must preserve its geometry and accessible labels");
});

test("empty exon results retain actionable diagnostics and recover the unchanged input", async () => {
  const diagnostic = "Upstream intron does not end in canonical AG; no SA candidate was generated.";
  const defaultRespond = respond;
  respond = async (url, body) => url.endsWith("/exon-skipping/design")
    ? response({ ...exonOutput, candidates: [], sa_is_canonical: false, warnings: [...exonOutput.warnings, diagnostic] }) : defaultRespond(url, body);
  await mount();
  await click(button("Exon skipping", query(".sf-mode-switch")));
  const sequence = exonInput.upstream_intron + exonInput.exon + exonInput.downstream_intron;
  await enter(textarea(), sequence);
  await click(entryBase(153));
  await click(entryBase(208));
  await submit();
  await flushScroll();
  const result = query(".exon-result");
  assert.ok(query(".exon-result-notices", result).textContent.includes(diagnostic));
  for (const warning of exonOutput.warnings) assert.ok(!result.textContent.includes(warning));
  assert.ok(!result.querySelector(".normal-candidate-card, .normal-sequence-text, .rna-fold-thumbnail-trigger, .exon-pairing-overview"), "An empty result must not expose stale candidate content");
  await click(button("Revise input", query(".exon-empty-result", result)));
  await settleRequests();
  assert.ok(!document.querySelector(".exon-result"));
  assert.equal(textarea().value, sequence);
  assert.equal(exonStart().value, "153");
  assert.equal(exonEnd().value, "208");
  assert.ok(document.activeElement === textarea());
  assert.equal(query(".sf-go").disabled, false);
  respond = defaultRespond;
  await submit();
  assert.equal(document.querySelectorAll(".exon-result .normal-candidate-card").length, exonOutput.candidates.length);
});

test("retired refinement links fall back to home and Help offers only the two design workflows", async () => {
  await mount({ view: "refine" });
  assert.ok(!query(".sf-entry").closest("[hidden]"), "Retired links should display the home workspace");
  assert.equal(document.querySelector(".refinement-tool-page"), null);
  await act(async () => {
    window.history.replaceState(null, "", encodeState({ view: "help" }));
    window.dispatchEvent(new window.PopStateEvent("popstate"));
  });
  assert.equal(decodeState(window.location.hash).view, "help");
  assert.equal(document.querySelector("#refine-guide"), null);
  assert.equal(document.querySelectorAll(".tutorial-example-grid article").length, 2);
  assert.doesNotMatch(query(".help-guide").textContent, /Refinement|Refine a tested|Optimize this tested/i);
});

test("sequence input and Exon selection work without automatic annotation requests", async () => {
  const assertNoAnnotationUi = () => {
    assert.equal(annotationLog.length, 0, "The design workspace must not submit automatic annotation requests");
    assert.equal(document.querySelector('.sf-annotation-status, .sf-entry .has-feature, .sf-entry .has-annotation, .sf-entry .evidence-predicted, .sf-entry .sequence-explorer-features'), null, "The removed annotation step must not leave status text or sequence highlights");
  };
  await mount();
  await enter(textarea(), "AACCGGTT");
  await startNormal();
  assert.equal(query(".sf-go").disabled, false);
  await submit();
  assert.ok(query(".normal-result-page"));
  assert.ok(entryBase(normalInput.target_position).classList.contains("is-target"));
  await settlePastAnnotationDelay();
  assertNoAnnotationUi();

  await click(button("Exon skipping", query(".sf-mode-switch")));
  await enter(textarea(), exonInput.upstream_intron + exonInput.exon + exonInput.downstream_intron);
  await click(entryBase(153));
  await click(entryBase(208));
  assert.equal(exonStart().value, "153");
  assert.equal(exonEnd().value, "208");
  assert.ok(entryBase(160).classList.contains("in-exon"), "Manual exon selection must retain its selected region styling");
  await settlePastAnnotationDelay();
  assertNoAnnotationUi();
  assert.equal(query(".sf-go").disabled, false);
  await submit();
  assert.ok(query(".exon-result"));
  assert.deepEqual(designRequests().at(-1).body.ese_mismatch_positions, []);
  assertNoAnnotationUi();
});

test("Go keeps the input mounted and expands results below it, scrolling only for a new result", async () => {
  await mount();
  await startNormal();
  const input = textarea();
  await submit();
  await flushScroll();
  assert.equal(textarea(), input, "Go must preserve the existing input node");
  assert.equal(input.value, normalInput.sequence);
  assert.equal(targetField().value, String(normalInput.target_position));
  const results = query(".sf-inline-results");
  assert.ok(query(".sf-entry").compareDocumentPosition(results) & window.Node.DOCUMENT_POSITION_FOLLOWING);
  assert.equal(document.activeElement, results);
  assert.deepEqual(scrollLog.filter(({ element }) => element === results).map(({ options }) => options), [{ behavior: "smooth", block: "start" }]);
  await click(document.querySelectorAll(".normal-candidate-option")[1]);
  await flushScroll();
  assert.equal(scrollLog.filter(({ element }) => element === results).length, 1, "Switching candidates must not move the page again");
  await submit();
  await flushScroll();
  assert.equal(scrollLog.filter(({ element }) => element === results).length, 2, "A new Go result should scroll into view again");
});

test("exon Go keeps the sequence and bounds above results and respects reduced motion", async () => {
  reducedMotion = true;
  await mount();
  await click(button("Exon skipping", query(".sf-mode-switch")));
  const sequence = exonInput.upstream_intron + exonInput.exon + exonInput.downstream_intron;
  await enter(textarea(), sequence);
  await click(entryBase(153));
  await click(entryBase(208));
  const input = textarea();
  await submit();
  await flushScroll();
  assert.equal(textarea(), input);
  assert.equal(input.value, sequence);
  assert.equal(exonStart().value, "153");
  assert.equal(exonEnd().value, "208");
  const results = query(".sf-inline-results");
  assert.ok(query(".exon-result", results));
  assert.deepEqual(scrollLog.filter(({ element }) => element === results).map(({ options }) => options), [{ behavior: "instant", block: "start" }]);
});

test("clicking an A submits that target; candidate changes share automatic RNAfold and retry only the selected sequence", async () => {
  await mount();
  assert.equal(query(".sf-go").disabled, true);
  await enter(textarea(), normalInput.sequence);
  await click(entryBase(1)); // G: selecting it must never set the editing target.
  assert.equal(targetField().value, "");
  await click(entryBase(76));
  assert.equal(targetField().value, "76");
  assert.equal(query(".sf-go").disabled, false);
  await submit();
  assert.equal(requestLog[0].body.target_position, 76);
  assert.equal(requestLog[0].body.sequence, normalInput.sequence);
  assert.equal(requestLog[0].body.coding_context, false);
  const candidates = Array.from(document.querySelectorAll(".normal-candidate-option"));
  assert.equal(candidates.length, normalOutput.candidates.length);
  await click(candidates[0]);
  assert.equal(query(".normal-sequence-text").textContent, normalOutput.candidates[0].arrna_sequence);
  await click(candidates[1]);
  const chosen = normalOutput.candidates[1].arrna_sequence;
  assert.equal(query(".normal-sequence-text").textContent, chosen);
  await settleRequests();
  assert.equal(foldRequests().length, normalOutput.candidates.length);
  assert.ok(foldRequests().some(({ body }) => body.sequence === chosen && body.topology === "linear"));
  assert.equal(document.querySelector(".rna-fold-panel"), null, "The results must not include a permanent large plot");
  await click(thumbnailTrigger(1));
  const foldPanel = query('.rna-fold-panel[data-status="error"]', foldDialog());
  assert.match(query('[role="alert"]', foldPanel).textContent, /unavailable/i);
  await click(button("Retry RNAfold", foldPanel));
  await settleRequests();
  assert.equal(foldRequests().length, normalOutput.candidates.length + 1);
  assert.equal(foldRequests().at(-1).body.sequence, chosen);
  assert.equal(foldRequests().at(-1).body.topology, "linear");
  await closeFoldDialog();
});

test("mode switches preserve sequence and clear previous target and exon boundaries", async () => {
  await mount();
  const sequence = "AACCCGGUAA";
  await enter(textarea(), sequence);
  await click(entryBase(2));
  await click(button("Exon skipping", query(".sf-mode-switch")));
  assert.equal(textarea().value, sequence);
  assert.equal(exonStart().value, "");
  assert.equal(exonEnd().value, "");
  await click(entryBase(7));
  await click(entryBase(3));
  assert.equal(exonStart().value, "3");
  assert.equal(exonEnd().value, "7");
  await click(button("Normal", query(".sf-mode-switch")));
  assert.equal(textarea().value, sequence);
  assert.equal(targetField().value, "");
  await click(button("Exon skipping", query(".sf-mode-switch")));
  assert.equal(textarea().value, sequence);
  assert.equal(exonStart().value, "");
  assert.equal(exonEnd().value, "");
  assert.doesNotMatch(query(".sf-entry").textContent, /User-defined upstream intron/);
});

test("two clicked exon boundaries produce exact inclusive API and shared-link regions", async () => {
  await mount();
  await click(button("Exon skipping", query(".sf-mode-switch")));
  await enter(textarea(), exonInput.upstream_intron + exonInput.exon + exonInput.downstream_intron);
  await click(entryBase(153));
  await click(entryBase(208));
  assert.equal(exonStart().value, "153");
  assert.equal(exonEnd().value, "208");
  await submit();
  assert.equal(requestLog[0].url, "/api/v1/exon-skipping/design");
  assert.equal(requestLog[0].body.upstream_intron, exonInput.upstream_intron);
  assert.equal(requestLog[0].body.exon, exonInput.exon);
  assert.equal(requestLog[0].body.downstream_intron, exonInput.downstream_intron);
  const state = decodeState(window.location.hash);
  assert.equal(state.application, "exon_skipping");
  assert.equal(state.input.targetExon, exonInput.exon);
  assert.equal(state.input.upstreamIntron, exonInput.upstream_intron);
  assert.ok(query(".exon-result"));
});

test("a pending design cannot reopen or rewrite Citation after the workspace becomes inactive", async () => {
  let finish;
  respond = () => new Promise((resolveResponse) => { finish = resolveResponse; });
  await mount();
  await startNormal();
  await submit();
  assert.equal(typeof finish, "function");
  await click(button("Citation", query(".site-header nav")));
  const citationHash = window.location.hash;
  assert.equal(decodeState(citationHash).view, "citation");
  await act(async () => finish(response(normalOutput)));
  assert.equal(window.location.hash, citationHash);
  assert.equal(document.querySelector(".normal-result-page"), null);
  await click(query(".site-header .brand"));
  assert.equal(textarea().value, normalInput.sequence);
  assert.equal(query(".sf-go").disabled, false);
});

test("editing a sequence while a request is pending discards its late result", async () => {
  let finish;
  respond = () => new Promise((resolveResponse) => { finish = resolveResponse; });
  await mount();
  await startNormal();
  await submit();
  await enter(textarea(), "AACCGGUU");
  await act(async () => finish(response(normalOutput)));
  assert.equal(textarea().value, "AACCGGUU");
  assert.equal(targetField().value, "");
  assert.equal(document.querySelector(".normal-result-page"), null);
  assert.equal(window.location.hash, "");
});

test("legacy shared exon input restores normalized coordinates; popstate applies a new workspace", async () => {
  await mount({ view: "design", application: "exon_skipping", input: { mode: "sequence", adar: "ADAR1", upstreamIntron: "AA\n", targetExon: "CCC", downstreamIntron: "GG" } });
  assert.equal(textarea().value, "AACCCGG");
  assert.equal(exonStart().value, "3");
  assert.equal(exonEnd().value, "5");
  await act(async () => {
    window.history.replaceState(null, "", encodeState({ view: "design", application: "normal_editing", input: { mode: "sequence", adar: "ADAR2", sequence: "ACGUA", position: "5", codingContext: false } }));
    window.dispatchEvent(new window.PopStateEvent("popstate"));
  });
  assert.equal(textarea().value, "ACGUA");
  assert.equal(targetField().value, "5");
  assert.equal(query('.sf-mode-switch button[aria-pressed="true"]').textContent, "Normal");
});

test("pasting ordinary RNA after a coding example clears the inherited reading frame", async () => {
  await mount();
  await click(button("Try an example"));
  const sequence = "C".repeat(75) + "A" + "C".repeat(75);
  await enter(textarea(), sequence);
  await click(entryBase(76));
  assert.equal(query(".sf-go").disabled, false);
  respond = async () => response({ detail: "Request inspected in DOM fixture." }, 422);
  await submit();
  assert.equal(requestLog[0].body.sequence, sequence);
  assert.equal(requestLog[0].body.coding_context, false);
});

test("an empty normal result remains actionable and revising preserves the input", async () => {
  respond = async () => response({ ...normalOutput, candidates: [], warnings: ["Insufficient target context in this fixture."] });
  await mount();
  await startNormal();
  await submit();
  assert.match(query(".sf-empty-result").textContent, /Insufficient target context/);
  assert.equal(document.querySelector(".normal-sequence-text"), null);
  await click(button("Revise sequence"));
  assert.equal(textarea().value, normalInput.sequence);
  assert.equal(targetField().value, "76");
});

test("custom drafts join the candidate picker only after Apply and remain available when switching candidates", async () => {
  await mount();
  await startNormal();
  await submit();
  const candidates = Array.from(document.querySelectorAll(".normal-candidate-option"));
  const dualIndex = normalOutput.candidates.findIndex((candidate) => candidate.id === "dual-deletion");
  await click(candidates[dualIndex]);
  assert.equal(query(".normal-sequence-text").textContent.length, 113);
  await click(query(".sf-advanced-trigger"));
  const editor = query(".custom-structure-editor");
  assert.ok(!Array.from(editor.querySelectorAll("summary")).some(summary => summary.textContent.includes("Design notes")));
  const preview = () => query(".normal-pairing-schematic svg", editor);
  assert.equal(editor.querySelectorAll(".normal-pairing-schematic svg").length, 1, "Window and custom structures must share one interactive duplex");
  assert.ok(query(".window-range-selector", editor).contains(preview()));
  const previewRegions = () => Array.from(preview().querySelectorAll("g.normal-schematic-bulge"), bulge => ({
    type: bulge.dataset.type, start: Number(bulge.dataset.start), end: Number(bulge.dataset.end), count: Number(bulge.dataset.count),
  }));
  const initialRegions = [
    { type: "deletion", start: -58, end: -31, count: 28 },
    { type: "deletion", start: 34, end: 43, count: 10 },
  ];
  assert.deepEqual(previewRegions(), initialRegions);
  const targetBaselineY = Number(preview().dataset.targetY);
  const deletedPreviewSites = Array.from(preview().querySelectorAll(".normal-schematic-a")).filter(marker =>
    initialRegions.some(region => Number(marker.dataset.relative) >= region.start && Number(marker.dataset.relative) <= region.end));
  assert.ok(deletedPreviewSites.length > 0);
  assert.ok(deletedPreviewSites.every(marker => Number(marker.getAttribute("transform").match(/^translate\([^ ,]+[ ,]+([^\)]+)\)$/)[1]) < targetBaselineY),
    "Validated custom structure instances must retain their endpoint when placing A markers on loops");
  assert.equal(editor.querySelector(".sf-custom-schematic"), null, "Advanced should use the shared duplex drawing");
  const appliedSchematic = query(".normal-result-page .normal-pairing-schematic svg");
  const appliedTargetPath = query(".normal-schematic-target-line", appliedSchematic).getAttribute("d");
  assert.deepEqual(previewRegions(), Array.from(appliedSchematic.querySelectorAll("g.normal-schematic-bulge"), loop => ({
    type: loop.dataset.type, start: Number(loop.dataset.start), end: Number(loop.dataset.end), count: Number(loop.dataset.count),
  })), "The full-context draft preview must retain the selected candidate's structure coordinates");
  const externalMenu = query(".sf-external-presets", editor);
  const externalTrigger = query("summary", externalMenu);
  const externalPresets = [
    { position: "-31", name: "Upstream −31 · 28/0", region: initialRegions[0] },
    { position: "34", name: "Downstream +34 · 10/0", region: initialRegions[1] },
  ];
  await click(externalTrigger);
  for (const preset of externalPresets) {
    const existing = button(preset.name, externalMenu);
    assert.equal(existing.disabled, true, "An existing external preset must not be added twice");
    await click(existing);
    assert.equal(editor.querySelectorAll(".sf-structure-row").length, 2);
  }
  await act(async () => externalTrigger.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  assert.equal(externalMenu.open, false);
  assert.equal(document.activeElement, externalTrigger);
  for (const preset of externalPresets) {
    const row = Array.from(editor.querySelectorAll(".sf-structure-row")).find(item => query('input[type="number"]', item).value === preset.position);
    assert.ok(row, "The selected candidate must expose each external structure");
    await click(query("button.sf-icon-button", row));
    assert.deepEqual(previewRegions(), initialRegions.filter(region => region !== preset.region));
    assert.equal(query(".normal-sequence-text").textContent.length, 113, "A removed draft preset must not change the displayed candidate");
    await click(externalTrigger);
    const addExternal = button(preset.name, externalMenu);
    assert.equal(addExternal.disabled, false, "Removing a preset must make its add action available again");
    await click(addExternal);
    assert.deepEqual(previewRegions(), initialRegions, "The external preset must restore its original geometry");
    assert.equal(editor.querySelector(".sf-custom-output"), null, "Advanced must not duplicate the result sequence and export controls");
    assert.equal(externalMenu.open, false);
    assert.equal(document.activeElement, externalTrigger);
    assert.equal(button(preset.name, externalMenu).disabled, true);
  }
  await click(button("Internal bulge", editor));
  let addedRow = Array.from(editor.querySelectorAll(".sf-structure-row")).at(-1);
  assert.equal(query("select", addedRow).value, "deletion", "The internal preset must use a target-side deletion rather than a mismatch");
  assert.deepEqual(Array.from(addedRow.querySelectorAll('input[type="number"]'), input => input.value), ["4", "1"]);
  assert.ok(previewRegions().some(region => region.type === "deletion" && region.start === 4 && region.end === 4 && region.count === 1));
  assert.equal(button("Internal bulge", editor).disabled, true);
  await click(button("Internal bulge", editor));
  assert.equal(editor.querySelectorAll(".sf-structure-row").length, 3, "A repeated internal preset must not add another structure");
  await enter(query('input[type="number"]', addedRow), "5");
  assert.ok(previewRegions().some(region => region.type === "deletion" && region.start === 5 && region.end === 5 && region.count === 1), "Position edits must update the draft loop immediately");
  assert.ok(!previewRegions().some(region => region.start === 4));
  assert.equal(query(".normal-schematic-target-line", appliedSchematic).getAttribute("d"), appliedTargetPath, "A preview edit must not redraw the applied result");
  await click(query(".sf-custom-fields-heading button", editor));
  assert.deepEqual(previewRegions(), initialRegions, "Reset must restore the selected candidate's original loops");
  assert.equal(query(".normal-sequence-text").textContent.length, 113);
  assert.equal(designRequests().length, 1, "Draft edits and Reset must not request a new design");
  await click(button("Internal bulge", editor));
  addedRow = Array.from(editor.querySelectorAll(".sf-structure-row")).at(-1);
  const [addedPosition, addedSize] = addedRow.querySelectorAll('input[type="number"]');
  assert.equal(addedPosition.value, "4");
  assert.equal(addedSize.value, "1");
  const customRegions = previewRegions();
  await settleRequests();
  const foldCount = foldRequests().length;
  assert.equal(customCandidateCard(), null, "Editing a draft cannot create an applied candidate");
  await click(button("Close advanced settings"));
  assert.equal(query(".advanced-inline-panel").hidden, true);
  assert.equal(customCandidateCard(), null);
  assert.equal(foldRequests().length, foldCount, "Draft custom sequence must not be folded before Apply");
  await click(query(".sf-advanced-trigger"));
  assert.deepEqual(previewRegions(), customRegions, "Closing Advanced preserves the draft structures");
  await applySettings();
  await settleRequests();
  const customSequence = query(".normal-sequence-text").textContent;
  assert.equal(customSequence.length, 112);
  assert.equal(candidateCards().length, normalOutput.candidates.length + 1);
  assert.equal(customCandidateCard()?.dataset.selected, "true");
  assert.match(customCandidateCard().textContent, /Custom 1/);
  assert.equal(document.querySelector(".sf-custom-banner, .sf-source-label, .sf-custom-output"), null);
  assert.deepEqual(Array.from(query(".normal-pairing-panel").querySelectorAll("g.normal-schematic-bulge"), loop => ({ type: loop.dataset.type, start: Number(loop.dataset.start), end: Number(loop.dataset.end), count: Number(loop.dataset.count) })), customRegions);
  assert.ok(foldRequests().some(({ body }) => body.sequence === customSequence), "Apply must automatically fold the applied custom sequence");
  assert.equal(document.querySelector(".rna-fold-panel"), null);
  await click(query(".rna-fold-thumbnail-trigger", customCandidateCard()));
  assert.match(query(".rna-fold-panel .sa-count", foldDialog()).textContent, /112 nt/);
  await closeFoldDialog();
  const baselineIndex = normalOutput.candidates.findIndex((candidate) => candidate.id === "baseline");
  const requestCountAfterApply = foldRequests().length;
  await click(document.querySelectorAll(".normal-candidate-option")[baselineIndex]);
  await settleRequests();
  assert.ok(customCandidateCard(), "An ordinary candidate must not discard the applied custom candidate");
  assert.equal(customCandidateCard().dataset.selected, "false");
  assert.equal(query(".normal-sequence-text").textContent.length, 151);
  assert.deepEqual(previewRegions(), [], "Selecting the baseline must also reset the Advanced preview to an intact duplex");
  assert.equal(document.querySelector(".rna-fold-panel"), null);
  await click(thumbnailTrigger(baselineIndex));
  assert.match(query(".rna-fold-panel .sa-count", foldDialog()).textContent, /151 nt/);
  await closeFoldDialog();
  assert.equal(foldRequests().length, requestCountAfterApply, "Returning to an existing candidate reuses its fold state");
  await click(query(".normal-candidate-option", customCandidateCard()));
  assert.equal(query(".normal-sequence-text").textContent, customSequence);
  assert.deepEqual(previewRegions(), customRegions, "Selecting custom again must restore its applied structures to the editor");
  assert.equal(foldRequests().length, requestCountAfterApply);
  await click(query(".sf-advanced-trigger"));
  await enter(Array.from(editor.querySelectorAll(".sf-structure-row")).at(-1).querySelectorAll('input[type="number"]')[1], "2");
  assert.equal(query(".normal-sequence-text").textContent, customSequence, "Editing the selected custom candidate remains a draft until Apply");
  await applySettings();
  assert.equal(candidateCards().length, normalOutput.candidates.length + 2, "A second custom Apply appends another custom card");
  assert.equal(customCandidateCards().length, 2);
  assert.equal(customCandidateCard("custom-2").dataset.selected, "true");
  assert.match(customCandidateCard("custom-2").textContent, /Custom 2/);
  assert.equal(query(".normal-sequence-text").textContent.length, 111);
  await click(query(".normal-candidate-option", customCandidateCard()));
  assert.equal(query(".normal-sequence-text").textContent, customSequence, "A later Apply must not rewrite an older custom sequence");
  assert.deepEqual(previewRegions(), customRegions, "An older custom card must restore its original structure snapshot");
  assert.ok(!Array.from(editor.querySelectorAll("summary")).some(summary => summary.textContent.includes("Design notes")), "Warnings must not reintroduce the removed Design notes disclosure");
});

test("an invalid custom draft cannot replace the previous applied results or trigger custom folding", async () => {
  await mount();
  await startNormal();
  await submit();
  await click(query(".sf-advanced-trigger"));
  await click(button("Internal bulge", query(".custom-structure-editor")));
  await applySettings();
  await settleRequests();
  const previousCustom = customCandidateCard();
  assert.ok(previousCustom);
  const priorSequence = query(".normal-sequence-text").textContent;
  const priorFoldCount = foldRequests().length;
  const priorHash = window.location.hash;
  await click(query(".sf-advanced-trigger"));
  const addedRow = Array.from(document.querySelectorAll(".sf-structure-row")).at(-1);
  await enter(query('input[type="number"]', addedRow), "0");
  const editor = query(".custom-structure-editor");
  assert.ok(editor.querySelector('[role="alert"]'), "Invalid A0 deletion must expose its validation error");
  assert.equal(editor.querySelector(".sf-custom-output"), null);
  assert.equal(Array.from(editor.querySelectorAll("button")).some((item) => ["Copy", "JSON"].includes(item.textContent.trim())), false);
  await applySettings();
  await settleRequests();
  assert.equal(query(".advanced-inline-panel").hidden, false, "Failed Apply keeps its draft and error visible");
  assert.ok(query('.advanced-inline-panel [role="alert"]'));
  assert.equal(customCandidateCard(), previousCustom, "A failed draft cannot discard the existing custom card");
  assert.equal(customCandidateCard().dataset.selected, "true");
  assert.equal(query(".normal-sequence-text").textContent, priorSequence);
  assert.equal(foldRequests().length, priorFoldCount);
  assert.equal(window.location.hash, priorHash, "Invalid custom settings must not be recorded as applied");
});

test("an applied insertion and mismatch use the shared candidate diagram, copy control and exports", async () => {
  await mount();
  await startNormal();
  await submit();
  await click(query('.normal-candidate-card[data-candidate-id="baseline"] .normal-candidate-option'));
  await click(query(".sf-advanced-trigger"));
  const editor = query(".custom-structure-editor");
  assert.equal(editor.querySelector(".sf-custom-output"), null);
  assert.ok(!editor.textContent.includes("The preview and exported sequence update together."));
  await click(button("Internal bulge", editor));
  let row = Array.from(editor.querySelectorAll(".sf-structure-row")).at(-1);
  await enter(query("select", row), "insertion");
  await enter(query('input[placeholder="ACGU"]', row), "A");
  await enter(query('input[type="number"]', row), "8");
  await click(button("Internal bulge", editor));
  row = Array.from(editor.querySelectorAll(".sf-structure-row")).at(-1);
  await enter(query('input[type="number"]', row), "12");
  await enter(query("select", row), "mismatch");
  const mismatchBase = normalOutput.target_window[normalOutput.target_index + 12].replace("T", "U");
  await enter(query('input[placeholder="ACGU"]', row), mismatchBase);
  await enter(query('input[type="number"]', editor.querySelector(".sf-structure-row")), "4");
  assert.equal(editor.querySelector('[role="alert"]'), null);
  await applySettings();
  await settleRequests();
  const result = query(".normal-result-page");
  const sequence = query(".normal-sequence-text", result).textContent;
  assert.equal(sequence.length, 152);
  assert.equal(customCandidateCard()?.dataset.selected, "true");
  assert.equal(candidateCards().length, 5);
  assert.deepEqual(Array.from(query(".normal-pairing-panel", result).querySelectorAll("g.normal-schematic-bulge"), loop => loop.dataset.type), ["insertion", "mismatch"]);
  assert.equal(document.querySelector(".sf-custom-banner, .sf-source-label, .sf-custom-output"), null);
  assert.ok(foldRequests().some(({ body }) => body.sequence === sequence));

  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;
  const originalAnchorClick = window.HTMLAnchorElement.prototype.click;
  const originalCopy = window.navigator.clipboard.writeText;
  const copied = [];
  const downloaded = [];
  try {
    window.navigator.clipboard.writeText = async value => { copied.push(value); };
    URL.createObjectURL = blob => { downloaded.push(blob); return `blob:leaper-dom.test/custom-${downloaded.length}`; };
    URL.revokeObjectURL = () => {};
    window.HTMLAnchorElement.prototype.click = function () {};
    await click(button("Copy", result));
    assert.deepEqual(copied, [sequence]);
    for (const format of ["JSON", "FASTA", "CSV"]) {
      await click(button("Download", result));
      await click(button(format, query(".export-menu-options", result)));
    }
    assert.equal(downloaded.length, 3);
    const json = JSON.parse(await downloaded[0].text());
    assert.equal(json.candidates.length, 5);
    assert.deepEqual(json.candidates.filter(candidate => candidate.selected).map(candidate => candidate.id), ["custom-1"]);
    const exported = json.candidates.find(candidate => candidate.id === "custom-1");
    assert.equal(exported.sequence, sequence);
    assert.equal(exported.arrna_sequence, sequence);
    assert.equal(exported.length, sequence.length);
    assert.equal(exported.origin, "manual_customization");
    assert.equal(exported.validation.backend_validated, false);
    assert.equal(json.custom_designs[0].source_candidate.id, "baseline");
    assert.equal(json.custom_designs[0].arrna_sequence, sequence);
    assert.deepEqual(json.custom_designs[0].structures.map(({ type, start, end, size, bases }) => ({ type, start, end, size, bases })), [
      { type: "insertion", start: 4, end: 4, size: 1, bases: "A" },
      { type: "mismatch", start: 12, end: 12, size: 1, bases: mismatchBase },
    ]);
    const fasta = await downloaded[1].text();
    const customRecord = fasta.split(">").find(record => record.startsWith("LEAPER_normal_editing_custom-1_selected_5to3\n"));
    assert.ok(customRecord);
    assert.equal(customRecord.split("\n").slice(1).join("").trim(), sequence);
    const [header, ...rows] = (await downloaded[2].text()).trim().split("\n").map(line => line.split(","));
    const customRow = rows.find(cells => cells[header.indexOf("candidate_id")] === "custom-1");
    assert.ok(customRow);
    assert.equal(customRow[header.indexOf("arrna_sequence_5to3")], sequence);
    assert.equal(customRow[header.indexOf("selected")], "true");
    assert.match(customRow[header.indexOf("engine")], /buildCustomDesign/);
    await click(query('.normal-candidate-card[data-candidate-id="baseline"] .normal-candidate-option'));
    await click(button("Download", result));
    await click(button("JSON", query(".export-menu-options", result)));
    const normalSelection = JSON.parse(await downloaded[3].text());
    assert.deepEqual(normalSelection.candidates.filter(candidate => candidate.selected).map(candidate => candidate.id), ["baseline"]);
    assert.equal(normalSelection.candidates.find(candidate => candidate.id === "custom-1").sequence, sequence, "Export retains the applied custom candidate even while a normal candidate is selected");
    assert.equal(normalSelection.custom_designs[0].arrna_sequence, sequence);
  } finally {
    window.navigator.clipboard.writeText = originalCopy;
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    window.HTMLAnchorElement.prototype.click = originalAnchorClick;
  }
});

test("custom candidates retain independent windows and structures under the unified profile until a successful Go clears them", async () => {
  const defaultRespond = respond;
  respond = async (url, body) => {
    if (url.endsWith("/analysis/rnafold")) return foldResponse(body);
    if (url.endsWith("/designs/normal-editing")) {
      const display = body.window_start_relative === -70 ? shorterNormalOutput : normalOutput;
      return response({ ...display, pairing: combinedPairing,
        normalized_input: { ...display.normalized_input, window_start_relative: body.window_start_relative, coding_context: body.coding_context } });
    }
    return defaultRespond(url, body);
  };
  await mount();
  await startNormal();
  await submit();
  await click(query('.normal-candidate-card[data-candidate-id="baseline"] .normal-candidate-option'));
  await click(query(".sf-advanced-trigger"));
  await click(button("Internal bulge", query(".custom-structure-editor")));
  await applySettings();
  await settleRequests();
  const firstSequence = query(".normal-sequence-text").textContent;
  assert.equal(firstSequence.length, 150);
  const currentSchematic = () => query(".normal-pairing-panel svg");
  const schematicState = () => ({
    target: query(".normal-schematic-target-line", currentSchematic()).getAttribute("d"),
    guide: query(".normal-schematic-guide-line", currentSchematic()).getAttribute("d"),
    markers: Array.from(currentSchematic().querySelectorAll(".normal-schematic-a"), marker => [marker.dataset.position, marker.dataset.relative, marker.getAttribute("transform")]),
    regions: Array.from(currentSchematic().querySelectorAll(".normal-schematic-bulge"), loop => [loop.dataset.type, loop.dataset.start, loop.dataset.end, loop.dataset.count]),
  });
  const firstDrawing = schematicState();
  const sizeField = () => Array.from(document.querySelectorAll(".sf-structure-row")).at(-1).querySelectorAll('input[type="number"]')[1];
  await click(query(".sf-advanced-trigger"));
  await enter(sizeField(), "2");
  await enter(windowStartField(), "-70");
  assert.equal(query(".normal-sequence-text").textContent, firstSequence);
  assert.deepEqual(schematicState(), firstDrawing, "A later draft cannot redraw an applied custom snapshot");
  await applySettings();
  await settleRequests();
  const secondSequence = query(".normal-sequence-text").textContent;
  await flushScroll();
  assert.ok(scrollLog.at(-1)?.element === customCandidateCard("custom-2"), "Apply must reveal the newly appended card rather than the top of the candidate group");
  assert.deepEqual(scrollLog.at(-1)?.options, { behavior: "smooth", block: "center" });
  const scrollsAfterSecondApply = scrollLog.length;
  assert.equal(secondSequence.length, 144);
  assert.equal(candidateCards().length, 6);
  assert.deepEqual(customCandidateCards().map(card => card.dataset.candidateId), ["custom-1", "custom-2"]);
  assert.equal(customCandidateCard("custom-2").dataset.selected, "true");
  const secondDrawing = schematicState();
  assert.notDeepEqual(secondDrawing.markers, firstDrawing.markers, "The cropped display fixture must use a distinct source window");
  assert.equal(query(".rna-fold-thumbnail", customCandidateCard()).dataset.topology, "linear");
  assert.equal(query(".rna-fold-thumbnail", customCandidateCard("custom-2")).dataset.topology, "linear");

  await click(query(".normal-candidate-option", customCandidateCard()));
  assert.equal(query(".normal-sequence-text").textContent, firstSequence);
  assert.deepEqual(schematicState(), firstDrawing, "Selecting an older custom restores its own window and structure drawing");
  assert.equal(windowStartField().value, "-75");
  assertNoAdarChoice();
  assertFixedLinearFolding();
  assert.equal(sizeField().value, "1");
  await flushScroll();
  assert.equal(scrollLog.length, scrollsAfterSecondApply, "Selecting an existing custom card must not scroll again");
  await click(query(".rna-fold-thumbnail-trigger", customCandidateCard()));
  assert.equal(query(".rna-fold-panel", foldDialog()).dataset.topology, "linear");
  assert.equal(query("pre", foldDialog()).textContent.split("\n")[0], firstSequence);
  await closeFoldDialog();
  await click(query(".rna-fold-thumbnail-trigger", customCandidateCard("custom-2")));
  assert.equal(query(".rna-fold-panel", foldDialog()).dataset.topology, "linear");
  assert.equal(query("pre", foldDialog()).textContent.split("\n")[0], secondSequence);
  await closeFoldDialog();
  assert.deepEqual(schematicState(), secondDrawing);
  assert.equal(windowStartField().value, "-70");
  assertNoAdarChoice();
  assertFixedLinearFolding();
  await click(query(".normal-candidate-option", customCandidateCard()));
  await click(query(".sf-advanced-trigger"));
  await enter(sizeField(), "3");
  await applySettings();
  await settleRequests();
  assert.equal(designRequests().at(-1).body.window_start_relative, -75, "Editing an older card must submit that card's restored context");
  assert.equal(designRequests().at(-1).body.adar_environment, "combined");
  const thirdSequence = query(".normal-sequence-text").textContent;
  assert.equal(thirdSequence.length, 148);
  assert.equal(candidateCards().length, 7);
  assert.deepEqual(customCandidateCards().map(card => card.dataset.candidateId), ["custom-1", "custom-2", "custom-3"]);
  assert.equal(customCandidateCard("custom-3").dataset.selected, "true");
  assert.equal(query(".rna-fold-thumbnail", customCandidateCard("custom-2")).dataset.topology, "linear");
  assert.equal(query(".rna-fold-thumbnail", customCandidateCard("custom-3")).dataset.topology, "linear");

  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;
  const originalAnchorClick = window.HTMLAnchorElement.prototype.click;
  const downloads = [];
  try {
    URL.createObjectURL = blob => { downloads.push(blob); return `blob:leaper-dom.test/snapshots-${downloads.length}`; };
    URL.revokeObjectURL = () => {};
    window.HTMLAnchorElement.prototype.click = function () {};
    const result = query(".normal-result-page");
    await click(button("Download", result));
    await click(button("JSON", query(".export-menu-options", result)));
    const exported = JSON.parse(await downloads[0].text());
    assert.equal(exported.candidates.length, 7);
    assert.deepEqual(exported.candidates.filter(candidate => candidate.selected).map(candidate => candidate.id), ["custom-3"]);
    assert.deepEqual(exported.custom_designs.map(snapshot => snapshot.candidate_id), ["custom-1", "custom-2", "custom-3"]);
    for (const [index, expected] of [
      { sequence: firstSequence, start: 1, window: -75, size: 1, adar: "combined", topology: "linear" },
      { sequence: secondSequence, start: 6, window: -70, size: 2, adar: "combined", topology: "linear" },
      { sequence: thirdSequence, start: 1, window: -75, size: 3, adar: "combined", topology: "linear" },
    ].entries()) {
      const id = `custom-${index + 1}`;
      const snapshot = exported.custom_designs.find(item => item.candidate_id === id);
      assert.equal(snapshot.arrna_sequence, expected.sequence);
      assert.equal(snapshot.source_window.start, expected.start);
      assert.equal(snapshot.source_window.end, 151);
      assert.equal(snapshot.source_result.normalized_input.window_start_relative, expected.window);
      assert.equal(snapshot.source_candidate.id, "baseline");
      assert.equal(snapshot.structures.length, 1);
      assert.equal(snapshot.structures[0].size, expected.size);
      assert.equal(snapshot.structures[0].position, 4);
      assert.equal(snapshot.adar, expected.adar);
      assert.equal(snapshot.fold_topology, expected.topology);
      const candidate = exported.candidates.find(item => item.id === id);
      assert.equal(candidate.sequence, expected.sequence);
      assert.equal(candidate.source_window.start, expected.start);
      assert.equal(candidate.fold_topology, expected.topology);
    }
  } finally {
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    window.HTMLAnchorElement.prototype.click = originalAnchorClick;
  }

  await click(query('.normal-candidate-card[data-candidate-id="baseline"] .normal-candidate-option'));
  await click(query(".sf-advanced-trigger"));
  await applySettings();
  assert.deepEqual(customCandidateCards().map(card => card.dataset.candidateId), ["custom-1", "custom-2", "custom-3"], "Apply without a custom draft must keep all prior cards without adding a duplicate");
  await click(query(".normal-candidate-option", customCandidateCard("custom-3")));
  assert.equal(query(".normal-sequence-text").textContent, thirdSequence);
  const successfulRespond = respond;
  respond = (url, body) => url.endsWith("/designs/normal-editing")
    ? response({ detail: "Go failed in the display fixture." }, 503) : successfulRespond(url, body);
  await submit();
  assert.equal(customCandidateCards().length, 3, "A failed Go must retain every applied custom snapshot");
  assert.equal(query(".normal-sequence-text").textContent, thirdSequence);
  let finishGo;
  respond = (url, body) => url.endsWith("/designs/normal-editing")
    ? new Promise(resolveResponse => { finishGo = resolveResponse; }) : successfulRespond(url, body);
  await submit();
  assert.equal(typeof finishGo, "function");
  await click(query(".sf-advanced-trigger"));
  await enter(windowStartField(), "-65");
  await act(async () => finishGo(response(normalOutput)));
  assert.equal(customCandidateCards().length, 3, "A Go made stale by a newer draft must not clear saved candidates");
  assert.equal(query(".normal-sequence-text").textContent, thirdSequence);
  respond = successfulRespond;
  await submit();
  assert.equal(customCandidateCards().length, 0);
  assert.equal(candidateCards().length, 4);
  assert.equal(query(".normal-sequence-text").textContent, normalOutput.candidates.find(candidate => candidate.id === "dual-deletion").arrna_sequence);
});

test("custom duplex display puts insertions on the guide and mismatches on both strands without pairing unpaired positions", async () => {
  // Display-only inputs deliberately bypass design validation and sequence
  // construction. Every position is A so loop marker placement is observable.
  const targetWindow = "A".repeat(81);
  const alignedGuide = "U".repeat(40) + "C" + "U".repeat(40);
  const design = { targetPosition: 41, targetWindow, arrnaSequence: alignedGuide, windowStart: 1, windowEnd: 81,
    targetIndex: 40, upstreamLength: 40, downstreamLength: 40, hasFullFlanks: false };
  const variant = { id: "baseline", label: "Display fixture", shortLabel: "Display fixture", description: "Synthetic geometry fixture",
    arrnaSequence: alignedGuide, alignedGuide, deletionCoordinates: [] };
  const sites = Array.from(targetWindow, (_, index) => ({ position: index + 1, category: "rna", codon: "", editedCodon: "", aminoAcid: "", editedAminoAcid: "" }));
  const structures = [
    { id: "display-deletion", type: "deletion", start: -25, end: -23, size: 3 },
    { id: "display-insertion", type: "insertion", start: -10, end: -10, size: 4 },
    { id: "display-mismatch", type: "mismatch", start: 12, end: 14, size: 3 },
  ];
  container = document.createElement("div");
  document.body.append(container);
  reactRoot = createRoot(container);
  const render = currentStructures => act(async () => reactRoot.render(React.createElement(LanguageProvider, null,
    React.createElement(DuplexPairingSchematic, { design, variant, sites, structures: currentStructures }))));
  await render(structures);
  const svg = query(".normal-pairing-schematic svg");
  const targetY = Number(svg.dataset.targetY);
  const guideY = Number(svg.dataset.guideY);
  assert.ok(Number.isFinite(targetY) && Number.isFinite(guideY) && targetY < guideY);
  const loops = Array.from(svg.querySelectorAll("g.normal-schematic-bulge"));
  assert.deepEqual(loops.map(loop => ({ type: loop.dataset.type, start: Number(loop.dataset.start), end: Number(loop.dataset.end), size: Number(loop.dataset.count) })),
    structures.map(({ type, start, end, size }) => ({ type, start, end, size })), "Insertion count comes from its size, not its one-coordinate boundary");
  for (const loop of loops) {
    const paths = Array.from(loop.querySelectorAll("path[data-strand]"));
    const strands = paths.map(path => path.dataset.strand).sort();
    const expectedStrands = loop.dataset.type === "deletion" ? ["target"] : loop.dataset.type === "insertion" ? ["guide"] : ["guide", "target"];
    assert.deepEqual(strands, expectedStrands, `${loop.dataset.type} must curve the appropriate strand(s)`);
    for (const path of paths) {
      const coordinates = Array.from(path.getAttribute("d").matchAll(/-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi), match => Number(match[0]));
      assert.ok(coordinates.length >= 8 && coordinates.length % 2 === 0 && coordinates.every(Number.isFinite));
      const ys = coordinates.filter((_, index) => index % 2 === 1);
      const baseline = path.dataset.strand === "target" ? targetY : guideY;
      assert.equal(ys[0], baseline);
      assert.equal(ys.at(-1), baseline);
      if (path.dataset.strand === "target") {
        assert.ok(ys.every(y => y <= baseline + 1e-8) && ys.some(y => y < baseline), "A target loop must bend above its strand");
      } else {
        assert.ok(ys.every(y => y >= baseline - 1e-8) && ys.some(y => y > baseline), "An arRNA loop must bend below its strand");
      }
    }
  }
  const markerY = relative => Number(query(`.normal-schematic-a[data-relative="${relative}"]`, svg).getAttribute("transform").match(/^translate\([^ ,]+[ ,]+([^\)]+)\)$/)[1]);
  for (const relative of [-25, -24, -23, 12, 13, 14]) assert.ok(markerY(relative) < targetY);
  assert.equal(markerY(-10), targetY, "An insertion before a target base must not unpair that target base");
  const pairs = Array.from(svg.querySelectorAll(".normal-schematic-pair"), pair => Number(pair.dataset.relative));
  assert.ok(pairs.length > 0);
  assert.ok(pairs.includes(-10), "The target coordinate following an insertion boundary remains paired");
  assert.ok(pairs.every(relative => relative !== 0 && !structures.some(structure => structure.type !== "insertion" && relative >= structure.start && relative <= structure.end)),
    "Generic connectors must skip every deleted or mismatched target position and the dedicated A0 pair");
  assert.equal(query(".normal-schematic-target-guide text", svg).textContent, "C");
  assert.deepEqual(Array.from(svg.querySelectorAll(".normal-schematic-direction"), direction => direction.textContent), ["5′", "3′", "3′", "5′"]);
  for (const selector of [".normal-schematic-target-line", ".normal-schematic-guide-line"]) assert.equal(query(selector, svg).tagName.toLowerCase(), "path");
  const drawingSnapshot = () => Array.from(svg.querySelectorAll("[d], [transform]"), element => [element.getAttribute("d"), element.getAttribute("transform")]);
  const validDrawing = drawingSnapshot();
  await render([...structures,
    { id: "invalid-before-window", type: "deletion", start: -99, end: -97, size: 3 },
    { id: "invalid-after-window", type: "mismatch", start: 90, end: 92, size: 3 },
    { id: "invalid-nonfinite", type: "insertion", start: NaN, end: NaN, size: 1 },
    { id: "invalid-reversed", type: "deletion", start: 20, end: 19, size: 2 },
    { id: "invalid-size", type: "mismatch", start: 25, end: 27, size: 4 },
  ]);
  assert.equal(svg.querySelectorAll("g.normal-schematic-bulge").length, structures.length, "Invalid display regions must not become loops");
  assert.deepEqual(drawingSnapshot(), validDrawing, "Invalid draft regions must not compress or distort the remaining valid drawing");
  assert.ok(drawingSnapshot().flat().filter(Boolean).every(value => !/NaN|Infinity|undefined/.test(value)), "Invalid regions must not produce nonfinite SVG coordinates");
  for (const type of ["deletion", "mismatch"]) {
    await render([
      { id: "adjacent-region", type, start: 4, end: 4, size: 1 },
      { id: "adjacent-insertion", type: "insertion", start: 5, end: 5, size: 1 },
    ]);
    const adjacent = Array.from(svg.querySelectorAll("g.normal-schematic-bulge"));
    assert.deepEqual(adjacent.map(loop => ({ type: loop.dataset.type, start: Number(loop.dataset.start), end: Number(loop.dataset.end), count: Number(loop.dataset.count) })), [
      { type, start: 4, end: 4, count: 1 }, { type: "insertion", start: 5, end: 5, count: 1 },
    ]);
    const [region, insertion] = adjacent.map(loop => ({ start: Number(loop.dataset.startX), end: Number(loop.dataset.endX) }));
    assert.ok([region.start, region.end, insertion.start, insertion.end].every(Number.isFinite));
    assert.ok(region.end > region.start && insertion.end > insertion.start, "Each adjacent structure must retain its own visible width");
    assert.ok(Math.abs(region.end - insertion.start) < 1e-8, "An insertion after a deletion or mismatch must touch its endpoint without overlapping its span");
    assert.deepEqual(Array.from(svg.querySelectorAll(".normal-schematic-direction"), direction => direction.textContent), ["5′", "3′", "3′", "5′"]);
  }
  await render([]);
  assert.equal(svg.querySelectorAll("g.normal-schematic-bulge").length, 0, "Clearing display structures must remove both upper and lower loops");
  assert.ok(Array.from(svg.querySelectorAll(".normal-schematic-a")).every(marker => Number(marker.getAttribute("transform").match(/^translate\([^ ,]+[ ,]+([^\)]+)\)$/)[1]) === Number(svg.dataset.targetY)));
  assert.equal(requestLog.length, 0, "The drawing must not request a design or RNAfold calculation");
});

test("the shared duplex edits window drafts by keyboard and drag before Apply replaces results", async () => {
  const defaultRespond = respond;
  respond = async (url, body) => url.endsWith("/designs/normal-editing") && body.window_start_relative === -70
    ? response(shorterNormalOutput) : defaultRespond(url, body);
  await mount();
  await startNormal();
  await submit();
  await flushScroll();
  const results = query(".sf-inline-results");
  const originalOutput = query(".normal-sequence-text");
  const originalSequence = originalOutput.textContent;
  const originalHash = window.location.hash;
  const resultScrolls = () => scrollLog.filter(({ element }) => element === results).length;
  await click(query(".sf-advanced-trigger"));
  await flushScroll();
  const editor = query(".custom-structure-editor");
  const selector = query(".window-range-selector", editor);
  const preview = query(".wrs-duplex-panel svg", selector);
  assert.equal(editor.querySelectorAll(".normal-pairing-schematic svg").length, 1, "The window and structure editor share a single duplex preview");
  assert.equal(preview.dataset.coordinateScale, "linear");
  assert.equal(preview.dataset.windowStart, "1");
  assert.equal(preview.dataset.windowEnd, "151");
  const fixedPreviewAnchor = pairingAnchor(preview);
  const initialGuidePath = query(".normal-schematic-guide-line", preview).getAttribute("d");
  const startHandle = query('[role="slider"][aria-label="Window start boundary"]', selector);
  assert.equal(startHandle.getAttribute("aria-valuenow"), "-75");
  await act(async () => startHandle.dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));
  assert.equal(windowStartField().value, "-74", "Visual boundary supports keyboard movement");
  assert.equal(preview.dataset.windowStart, "2");
  assertPairingAnchor(preview, fixedPreviewAnchor, "Moving the start boundary by keyboard");
  assert.equal(query(".normal-schematic-guide-line", preview).dataset.start, "2");
  assert.notEqual(query(".normal-schematic-guide-line", preview).getAttribute("d"), initialGuidePath, "Keyboard movement must update the displayed guide coverage immediately");
  const track = query(".wrs-track", selector);
  const endHandle = query('[role="slider"][aria-label="Window end boundary"]', selector);
  const originalBounds = track.getBoundingClientRect;
  const captured = new Set();
  // jsdom has no geometry or PointerCapture; a deterministic track width lets
  // real component pointer handlers exercise the sequence-coordinate mapping.
  track.getBoundingClientRect = () => ({ left: 0, top: 0, right: 1520, bottom: 100, x: 0, y: 0, width: 1520, height: 100 });
  for (const handle of [startHandle, endHandle]) {
    handle.setPointerCapture = id => captured.add(id);
    handle.hasPointerCapture = id => captured.has(id);
    handle.releasePointerCapture = id => captured.delete(id);
  }
  const pointer = (type, clientX, handle = endHandle) => {
    const event = new window.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX });
    Object.defineProperty(event, "pointerId", { value: 7 });
    handle.dispatchEvent(event);
  };
  try {
    await act(async () => pointer("pointerdown", 100));
    await act(async () => pointer("pointermove", 50));
    await act(async () => pointer("pointerup", 50));
    assert.equal(windowEndField().value, "70", "Dragging the right boundary must move the guide endpoint by the mapped number of bases");
    assert.equal(endHandle.getAttribute("aria-valuenow"), "70");
    assert.equal(preview.dataset.windowEnd, "146");
    assertPairingAnchor(preview, fixedPreviewAnchor, "Dragging the end boundary");
    assert.equal(query(".normal-schematic-guide-line", preview).dataset.end, "146");
    assert.equal(captured.size, 0);
    const pairs = Array.from(preview.querySelectorAll(".normal-schematic-pair[data-position]"));
    const unpaired = Array.from(preview.querySelectorAll('.normal-schematic-bulge:not([data-type="insertion"])'), loop => [Number(loop.dataset.start), Number(loop.dataset.end)]);
    assert.ok(pairs.length > 0, "A covered duplex must retain its ordinary pair connectors");
    assert.ok(pairs.every(pair => Number(pair.dataset.position) >= 2 && Number(pair.dataset.position) <= 146), "No pairing connector may extend outside the draft coverage");
    assert.ok(pairs.every(pair => Number(pair.dataset.relative) !== 0 && !unpaired.some(([start, end]) => Number(pair.dataset.relative) >= start && Number(pair.dataset.relative) <= end)), "The shared preview must not draw ordinary connectors through unpaired structures or the dedicated A0 pair");
    const assertSeparateHits = () => {
      const ranges = [startHandle, endHandle].map(handle => {
        const x = Number(handle.getAttribute("transform").match(/^translate\(([^ ,]+)/)[1]);
        const hit = query(".wrs-handle-hit", handle);
        const left = x + Number(hit.getAttribute("x"));
        return { left, right: left + Number(hit.getAttribute("width")) };
      });
      assert.ok(ranges.every(range => Number.isFinite(range.left) && Number.isFinite(range.right) && range.right > range.left));
      assert.ok(ranges[0].right <= ranges[1].left + 1e-8, "Even at A0 or a narrow window, the two handle hit regions must not overlap");
    };
    await enter(windowStartField(), "0");
    await enter(windowEndField(), "0");
    assertSeparateHits();
    assert.equal(preview.dataset.windowStart, "76");
    assert.equal(preview.dataset.windowEnd, "76");
    await act(async () => startHandle.dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true })));
    assert.equal(windowStartField().value, "-1");
    assert.equal(windowEndField().value, "0", "Moving the left boundary must leave the right boundary unchanged");
    assertSeparateHits();
    await act(async () => endHandle.dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));
    assert.equal(windowStartField().value, "-1");
    assert.equal(windowEndField().value, "1");
    assertSeparateHits();
    await act(async () => pointer("pointerdown", 200, startHandle));
    await act(async () => pointer("pointermove", 190, startHandle));
    await act(async () => pointer("pointerup", 190, startHandle));
    assert.equal(windowStartField().value, "-2");
    assert.equal(windowEndField().value, "1");
    assertSeparateHits();
    await act(async () => pointer("pointerdown", 100, endHandle));
    await act(async () => pointer("pointermove", 110, endHandle));
    await act(async () => pointer("pointerup", 110, endHandle));
    assert.equal(windowStartField().value, "-2");
    assert.equal(windowEndField().value, "2");
    assertSeparateHits();
    assert.equal(captured.size, 0);

  } finally {
    track.getBoundingClientRect = originalBounds;
    for (const handle of [startHandle, endHandle]) {
      delete handle.setPointerCapture;
      delete handle.hasPointerCapture;
      delete handle.releasePointerCapture;
    }
  }
  await enter(windowEndField(), "75");
  await enter(windowStartField(), "-70");
  assert.equal(startHandle.getAttribute("aria-valuenow"), "-70");
  assert.equal(windowEndField().value, "75");
  assert.equal(preview.dataset.windowStart, "6");
  assert.equal(preview.dataset.windowEnd, "151");
  assert.equal(editor.querySelector('[role="alert"]'), null, "Restoring a valid window must clear all structure range errors");
  assert.equal(query(".normal-sequence-text"), originalOutput, "Editing a boundary must keep the existing result mounted");
  assert.equal(originalOutput.textContent, originalSequence);
  assert.equal(designRequests().length, 1);
  assert.equal(window.location.hash, originalHash);
  assert.equal(resultScrolls(), 1, "Editing a draft must not scroll to results");
  await applySettings();
  await flushScroll();
  assert.equal(designRequests().length, 2);
  assert.equal(designRequests().at(-1).body.window_start_relative, -70);
  assert.equal(designRequests().at(-1).body.window_end_relative, 75);
  assert.equal(query(".normal-sequence-text").textContent, originalSequence.slice(0, -5));
  assert.equal(query(".advanced-inline-panel").hidden, true);
  assert.equal(decodeState(window.location.hash).input.windowStart, "-70");
  assert.equal(resultScrolls(), 2);
  assert.ok(document.activeElement === results);
});

test("failed Apply and responses made stale by newer drafts preserve the previously applied results", async () => {
  await mount();
  await startNormal();
  await submit();
  await settleRequests();
  await flushScroll();
  const originalOutput = query(".normal-sequence-text");
  const originalSequence = originalOutput.textContent;
  const originalHash = window.location.hash;
  const foldCount = foldRequests().length;
  const results = query(".sf-inline-results");
  await click(query(".sf-advanced-trigger"));
  await enter(windowStartField(), "-70");
  const defaultRespond = respond;
  respond = async (url, body) => url.endsWith("/designs/normal-editing")
    ? response({ detail: "Apply failed in DOM fixture." }, 503) : defaultRespond(url, body);
  await applySettings();
  assert.equal(query(".normal-sequence-text"), originalOutput);
  assert.equal(originalOutput.textContent, originalSequence);
  assert.equal(query(".advanced-inline-panel").hidden, false);
  assert.match(query('.advanced-inline-panel [role="alert"]').textContent, /Apply failed/);
  assert.equal(window.location.hash, originalHash);
  let finish;
  respond = (url, body) => url.endsWith("/designs/normal-editing")
    ? new Promise(resolveResponse => { finish = resolveResponse; }) : defaultRespond(url, body);
  await applySettings();
  assert.equal(typeof finish, "function");
  await enter(windowStartField(), "-65");
  await act(async () => finish(response(shorterNormalOutput)));
  await flushScroll();
  assert.equal(windowStartField().value, "-65");
  assert.equal(query(".normal-sequence-text"), originalOutput);
  assert.equal(originalOutput.textContent, originalSequence);
  assert.equal(window.location.hash, originalHash);
  assert.equal(foldRequests().length, foldCount);
  assert.equal(scrollLog.filter(({ element }) => element === results).length, 1);
  await applySettings();
  assert.equal(designRequests().at(-1).body.adar_environment, "combined");
  await enter(windowEndField(), "70");
  assert.equal(query(".normal-sequence-text").textContent, originalSequence, "Changing the draft end keeps the old applied result visible");
  await act(async () => finish(response(shorterNormalOutput)));
  assert.equal(windowEndField().value, "70");
  assert.ok(query(".normal-sequence-text") === originalOutput, "A late Apply must not overwrite the newer window draft");
  assert.equal(originalOutput.textContent, originalSequence);
  assert.equal(window.location.hash, originalHash);
  assert.equal(foldRequests().length, foldCount);
});

test("only candidate preview enlarge buttons open cached plots, with focus restored to the icon button", async () => {
  const defaultRespond = respond;
  respond = async (url, body) => url.endsWith("/analysis/rnafold") ? foldResponse(body) : defaultRespond(url, body);
  await mount();
  await startNormal();
  await submit();
  await settleRequests();
  await flushScroll();
  const candidates = Array.from(document.querySelectorAll(".normal-candidate-option"));
  const expectedSequences = new Set(normalOutput.candidates.map(candidate => candidate.arrna_sequence));
  assert.deepEqual(new Set(foldRequests().map(({ body }) => body.sequence)), expectedSequences);
  assert.equal(foldRequests().length, expectedSequences.size);
  assert.equal(document.querySelectorAll('.normal-candidate-card .rna-fold-thumbnail[data-status="ready"] .rna-fold-thumbnail-svg').length, candidates.length);
  assert.equal(document.querySelectorAll(".rna-fold-panel, .rna-fold-modal").length, 0, "Only thumbnails are mounted before opening a preview");
  for (const card of candidateCards()) {
    assert.ok(query(".normal-candidate-option", card));
    assert.ok(query(".rna-fold-thumbnail-trigger", card));
    assert.equal(card.querySelector("button button"), null, "Candidate selection and opening the plot must use separate buttons");
  }
  const foldCount = foldRequests().length;
  const previousOverflow = document.body.style.overflow;
  const firstTrigger = thumbnailTrigger(0);
  const firstFrame = query(".rna-fold-thumbnail-frame", candidateCards()[0]);
  const firstImage = query(".rna-fold-thumbnail-svg", firstFrame);
  const metrics = query(".rna-fold-thumbnail-metrics", firstFrame);
  const originallySelectedCard = query('.normal-candidate-card[data-selected="true"]');
  const originallySelectedSequence = query(".normal-sequence-text").textContent;
  assert.ok(firstTrigger.matches("button.rna-fold-thumbnail-enlarge"));
  assert.equal(firstFrame.tagName, "DIV", "The preview surface must not itself be a button");
  assert.equal(firstTrigger.contains(firstImage), false, "The enlarge control must not wrap the image");
  for (const previewPart of [firstImage, metrics, firstFrame]) {
    await act(async () => previewPart.dispatchEvent(new window.MouseEvent("click", { bubbles: true })));
    assert.equal(document.querySelector(".rna-fold-modal"), null, "Clicking the image, metrics or blank preview surface must not enlarge it");
    assert.equal(query('.normal-candidate-card[data-selected="true"]'), originallySelectedCard, "The noninteractive preview must not select its candidate");
    assert.equal(query(".normal-sequence-text").textContent, originallySelectedSequence);
    assert.equal(firstTrigger.getAttribute("aria-expanded"), "false");
  }
  firstTrigger.focus();
  assert.equal(firstTrigger.getAttribute("aria-haspopup"), "dialog");
  await click(firstTrigger);
  let dialog = foldDialog();
  let panel = query('.rna-fold-panel[data-status="ready"]', dialog);
  assert.equal(dialog.getAttribute("aria-modal"), "true");
  assert.equal(firstTrigger.getAttribute("aria-expanded"), "true");
  assert.ok(dialog.contains(document.activeElement), "Opening must move keyboard focus into the dialog");
  assert.equal(document.body.style.overflow, "hidden");
  assert.ok(container.hasAttribute("inert"), "Background controls must be inactive while a modal is open");
  assert.equal(query("pre", panel).textContent.split("\n")[0], normalOutput.candidates[0].arrna_sequence);
  assert.equal(query(".normal-sequence-text").textContent, normalOutput.candidates[0].arrna_sequence);
  assert.equal(candidateCards()[0].dataset.selected, "true");
  await closeFoldDialog();
  assert.equal(document.querySelector(".rna-fold-panel, .rna-fold-modal"), null);
  assert.equal(firstTrigger.getAttribute("aria-expanded"), "false");
  assert.ok(document.activeElement === firstTrigger, "Close must return focus to the small enlarge button");
  assert.equal(document.body.style.overflow, previousOverflow);
  assert.equal(container.hasAttribute("inert"), false);
  const secondTrigger = thumbnailTrigger(1);
  await click(secondTrigger);
  dialog = foldDialog();
  panel = query('.rna-fold-panel[data-status="ready"]', dialog);
  assert.equal(query("pre", panel).textContent.split("\n")[0], normalOutput.candidates[1].arrna_sequence);
  assert.equal(query(".normal-sequence-text").textContent, normalOutput.candidates[1].arrna_sequence);
  await act(async () => dialog.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  assert.equal(document.querySelector(".rna-fold-panel, .rna-fold-modal"), null);
  assert.ok(document.activeElement === secondTrigger, "Escape must restore focus to the triggering candidate");
  await click(secondTrigger);
  await click(query(".rna-fold-modal-backdrop"));
  assert.equal(document.querySelector(".rna-fold-panel, .rna-fold-modal"), null);
  assert.ok(document.activeElement === secondTrigger, "Backdrop dismissal must also restore focus");
  assert.equal(document.body.style.overflow, previousOverflow);
  assert.equal(container.hasAttribute("inert"), false);
  await settleRequests();
  assert.equal(foldRequests().length, foldCount, "Opening and closing large plots must reuse cached thumbnail folds");
});

test("Go uses the unified profile while folding is fixed to linear", async () => {
  const defaultRespond = respond;
  respond = async (url, body) => url.endsWith("/analysis/rnafold") ? foldResponse(body) : defaultRespond(url, body);
  await mount();
  assertNoAdarChoice();
  await startNormal();
  await submit();
  await settleRequests();
  assertRecommendedNormalRequest(designRequests().at(-1).body, false);
  assertFixedLinearFolding();
  assert.equal(document.querySelectorAll('.normal-candidate-card .rna-fold-thumbnail[data-status="ready"][data-topology="linear"]').length, normalOutput.candidates.length);
  const originalSequence = query(".normal-sequence-text").textContent;
  const initialFoldCount = foldRequests().length;
  await click(query(".sf-advanced-trigger"));
  assert.equal(query('#sf-panel-design').querySelector('select[aria-label="ADAR"]'), null);
  await enter(windowStartField(), "-60");
  assert.equal(query(".normal-sequence-text").textContent, originalSequence);
  assert.equal(foldRequests().length, initialFoldCount);
  await click(button("Close advanced settings"));
  await submit();
  await settleRequests();
  assertRecommendedNormalRequest(designRequests().at(-1).body, false);
  assertRecommendedNormalSettings();
  assertFixedLinearFolding();
  await click(thumbnailTrigger(0));
  assert.equal(query('.rna-fold-panel[data-status="ready"]', foldDialog()).dataset.topology, "linear");
  await closeFoldDialog();
  assert.equal(foldRequests().length, initialFoldCount, "Go reuses cached folds for unchanged sequences and the fixed model");
});

test("clearing or temporarily exceeding a numeric window boundary makes pending Apply stale", async () => {
  await mount();
  await startNormal();
  await submit();
  await settleRequests();
  await flushScroll();
  const originalOutput = query(".normal-sequence-text");
  const originalSequence = originalOutput.textContent;
  const originalHash = window.location.hash;
  const originalFoldCount = foldRequests().length;
  const results = query(".sf-inline-results");
  await click(query(".sf-advanced-trigger"));
  const defaultRespond = respond;
  let finish;
  respond = (url, body) => url.endsWith("/designs/normal-editing")
    ? new Promise(resolveResponse => { finish = resolveResponse; }) : defaultRespond(url, body);
  for (const temporarilyInvalidValue of ["", "-999"]) {
    await enter(windowStartField(), "-70");
    await applySettings();
    assert.equal(typeof finish, "function");
    await enter(windowStartField(), temporarilyInvalidValue);
    assert.equal(windowStartField().value, temporarilyInvalidValue);
    await act(async () => finish(response(shorterNormalOutput)));
    await flushScroll();
    assert.equal(query(".normal-sequence-text"), originalOutput, "An in-progress numeric edit must invalidate the pending Apply even before a valid boundary is emitted");
    assert.equal(originalOutput.textContent, originalSequence);
    assert.equal(query(".advanced-inline-panel").hidden, false);
    assert.equal(window.location.hash, originalHash);
    assert.equal(foldRequests().length, originalFoldCount);
    assert.equal(scrollLog.filter(({ element }) => element === results).length, 1);
  }
});

test("Exon Apply replaces candidates only after submission and exports the displayed fallback candidate", async () => {
  const remainingCandidate = {
    ...exonOutput.candidates[0],
    target_sequence: exonOutput.candidates[0].target_sequence.slice(10),
    arrna_sequence: exonOutput.candidates[0].arrna_sequence.slice(0, -10),
    global_start: exonOutput.candidates[0].global_start + 10,
  };
  const replacementOutput = { ...exonOutput, candidates: [remainingCandidate] };
  const defaultRespond = respond;
  respond = async (url, body) => url.endsWith("/exon-skipping/design") && body.candidate_windows?.length
    ? response(replacementOutput) : defaultRespond(url, body);
  await mount();
  await click(button("Exon skipping", query(".sf-mode-switch")));
  await enter(textarea(), exonInput.upstream_intron + exonInput.exon + exonInput.downstream_intron);
  await click(entryBase(153));
  await click(entryBase(208));
  await submit();
  const priorCandidate = exonOutput.candidates.at(-1);
  assert.notEqual(priorCandidate.id, remainingCandidate.id);
  await click(Array.from(document.querySelectorAll(".normal-candidate-option")).at(-1));
  const originalOutput = query(".exon-result .normal-sequence-text");
  assert.equal(originalOutput.textContent, priorCandidate.arrna_sequence);
  await click(query(".sf-advanced-trigger"));
  assertExonWindowOnly();
  assert.equal(exonWindowStartField().value, String(priorCandidate.global_start));
  await enter(exonWindowStartField(), String(priorCandidate.global_start + 10));
  assert.equal(query(".exon-result .normal-sequence-text"), originalOutput);
  assert.equal(originalOutput.textContent, priorCandidate.arrna_sequence);
  assert.equal(document.querySelectorAll(".normal-candidate-option").length, exonOutput.candidates.length);
  assert.equal(designRequests().length, 1);
  await applySettings();
  assert.deepEqual(designRequests().at(-1).body.candidate_windows, [{ candidate_id: priorCandidate.id, start: priorCandidate.global_start + 10, end: priorCandidate.global_end }]);
  assert.equal(designRequests().at(-1).body.arrna_length, 151);
  assert.equal(document.querySelectorAll(".normal-candidate-option").length, 1);
  assert.equal(query('.normal-candidate-option[aria-pressed="true"] .normal-candidate-name').textContent, `${remainingCandidate.label}141 nt`);
  assert.equal(query(".exon-result .normal-sequence-text").textContent, remainingCandidate.arrna_sequence);
  assert.equal(exonWindowStartField().value, String(remainingCandidate.global_start));
  assert.equal(exonWindowEndField().value, String(remainingCandidate.global_end));
  assert.equal(query(".advanced-inline-panel").hidden, true);

  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;
  const originalAnchorClick = window.HTMLAnchorElement.prototype.click;
  const downloadedBlobs = [];
  const filenames = [];
  try {
    URL.createObjectURL = blob => { downloadedBlobs.push(blob); return `blob:leaper-dom.test/${downloadedBlobs.length}`; };
    URL.revokeObjectURL = () => {};
    window.HTMLAnchorElement.prototype.click = function () { filenames.push(this.download); };
    await click(button("Download", query(".exon-result")));
    await click(button("JSON", query(".exon-result .export-menu-options")));
    assert.deepEqual(filenames, ["LEAPER_exon_skipping_candidates.json"]);
    const exported = JSON.parse(await downloadedBlobs[0].text());
    const selected = exported.candidates.filter(candidate => candidate.selected);
    assert.equal(selected.length, 1, "Export must mark the displayed fallback candidate selected when the old ID disappeared");
    assert.equal(selected[0].id, remainingCandidate.id);
    assert.equal(selected[0].sequence, query(".exon-result .normal-sequence-text").textContent);
  } finally {
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    window.HTMLAnchorElement.prototype.click = originalAnchorClick;
  }
});

test("the Advanced duplex has no annotation tracks and preserves boundary focus during its delayed reveal", async () => {
  await mount();
  await startNormal();
  await settlePastAnnotationDelay();
  assert.equal(annotationLog.length, 0);
  const originalRequestFrame = window.requestAnimationFrame;
  const originalCancelFrame = window.cancelAnimationFrame;
  const pendingFrames = new Map();
  let frameId = 0;
  // Keep the reveal frame pending to prove it cannot steal focus from a
  // boundary control that the user has already reached.
  window.requestAnimationFrame = callback => { const id = ++frameId; pendingFrames.set(id, callback); return id; };
  window.cancelAnimationFrame = id => { pendingFrames.delete(id); };
  try {
    await click(query(".sf-advanced-trigger"));
    assert.ok(pendingFrames.size > 0, "Advanced should have queued its reveal");
    const selector = query(".window-range-selector");
    const svg = query(".wrs-duplex-panel svg", selector);
    assert.equal(selector.querySelector('.wrs-feature-tracks, .wrs-feature-lane, .wrs-feature-segment, .wrs-feature-tooltip, .wrs-feature-legend [data-evidence]'), null, "No automatic annotation tracks or evidence labels should remain in the window editor");
    assert.ok(query(".normal-schematic-target-line", svg));
    assert.ok(query(".normal-schematic-guide-line", svg));
    assert.ok(query(".wrs-duplex-coverage", svg));
    assert.equal(svg.querySelectorAll('[role="slider"]').length, 2);
    const startHandle = query('[role="slider"][aria-label="Window start boundary"]', svg);
    const originalEnd = windowEndField().value;
    await act(async () => startHandle.focus());
    await act(async () => {
      for (const [id, callback] of [...pendingFrames]) {
        pendingFrames.delete(id);
        callback(window.performance.now());
      }
    });
    assert.ok(document.activeElement === startHandle, "The delayed Advanced reveal must preserve focus already inside the duplex editor");
    await act(async () => startHandle.dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));
    assert.equal(windowStartField().value, "-74");
    assert.equal(windowEndField().value, originalEnd);
    assert.equal(targetField().value, String(normalInput.target_position));
    assert.equal(designRequests().length, 0, "Editing the window remains a draft");
    assert.equal(annotationLog.length, 0);
    assert.equal(document.querySelector(".sf-annotation-status"), null);
  } finally {
    window.requestAnimationFrame = originalRequestFrame;
    window.cancelAnimationFrame = originalCancelFrame;
    pendingFrames.clear();
  }
});

test("opening a structure before the pending Go scroll frame protects dialog focus and prevents background scrolling", async () => {
  await mount();
  await startNormal();
  const originalRequestFrame = window.requestAnimationFrame;
  const originalCancelFrame = window.cancelAnimationFrame;
  const pendingFrames = new Map();
  let frameId = 0;
  // Hold the exact frame scheduled by Go so this race is deterministic instead
  // of depending on jsdom's or the test machine's animation-frame timing.
  window.requestAnimationFrame = callback => { const id = ++frameId; pendingFrames.set(id, callback); return id; };
  window.cancelAnimationFrame = id => { pendingFrames.delete(id); };
  try {
    await submit();
    assert.ok(pendingFrames.size > 0, "Go should have queued its result reveal");
    const results = query(".sf-inline-results");
    const trigger = thumbnailTrigger(0);
    await click(trigger);
    const dialog = foldDialog();
    assert.ok(dialog.contains(document.activeElement));
    assert.ok(results.closest("[inert]"));
    await act(async () => {
      for (const [id, callback] of [...pendingFrames]) {
        pendingFrames.delete(id);
        callback(window.performance.now());
      }
    });
    assert.ok(dialog.contains(document.activeElement), "The older Go frame must not steal focus from the newly opened modal");
    assert.equal(scrollLog.filter(({ element }) => element === results).length, 0, "Go must not scroll the background while the structure dialog is active");
    await closeFoldDialog();
    assert.ok(document.activeElement === trigger, "Closing after the guarded frame must restore focus to the thumbnail");
    assert.equal(document.querySelector(".rna-fold-modal"), null);
    assert.equal(results.closest("[inert]"), null);
  } finally {
    window.requestAnimationFrame = originalRequestFrame;
    window.cancelAnimationFrame = originalCancelFrame;
    pendingFrames.clear();
  }
});

test("saved Normal windows restore while legacy ADAR choices and retired Exon options use unified defaults", async () => {
  const savedInput = {
    mode: "sequence", adar: "ADAR2", sequence: normalInput.sequence,
    position: String(normalInput.target_position), windowStart: "-60", windowEnd: "65",
    includeInternalBulge: true, codingContext: true,
  };
  await mount({ view: "design", application: "normal_editing", input: savedInput });
  await click(query(".sf-advanced-trigger"));
  assertNoAdarChoice();
  assert.equal(windowStartField().value, "-60");
  assert.equal(windowEndField().value, "65");
  assertNoCodingCheckbox();
  await click(button("Close advanced settings"));
  await click(query(".sf-advanced-trigger"));
  assert.equal(windowStartField().value, "-60", "Opening Advanced must not overwrite explicitly saved settings");
  await applySettings();
  const request = designRequests().at(-1).body;
  assert.equal(request.window_start_relative, -60);
  assert.equal(request.window_end_relative, 65);
  assert.equal(request.adar_environment, "combined");
  assert.equal(request.include_internal_bulge, true);
  assert.equal(request.coding_context, true);
  assert.equal(decodeState(window.location.hash).input.windowStart, "-60");
  assert.equal(decodeState(window.location.hash).input.includeInternalBulge, true, "Saved legacy flags must round-trip through Apply without the removed checkbox");

  const restoredExon = { mode: "sequence", adar: "ADAR1", upstreamIntron: exonInput.upstream_intron,
    targetExon: exonInput.exon, downstreamIntron: exonInput.downstream_intron,
    arrnaLength: "171", evaluateCoveredEse: true, eseMismatchPositions: "2, 9" };
  await act(async () => {
    window.history.replaceState(null, "", encodeState({ view: "design", application: "exon_skipping", input: restoredExon }));
    window.dispatchEvent(new window.PopStateEvent("popstate"));
  });
  await click(query(".sf-advanced-trigger"));
  assertExonWindowOnly();
  assert.ok(query(".wrs-empty", query(".exon-window-selector")), "A saved input has no candidate window until the first design");
  await applySettings();
  assertRecommendedExonRequest(designRequests().at(-1).body);
  assert.equal(exonWindowStartField().value, String(exonOutput.candidates[0].global_start));
});

test("selecting a new target by position or by sequence resets only the window around that A", async () => {
  await mount();
  await startNormal();
  await click(query(".sf-advanced-trigger"));
  await enter(windowStartField(), "-60");
  await enter(windowEndField(), "50");
  const alternatePosition = Array.from(normalInput.sequence).findIndex((base, index) =>
    base === "A" && index >= 75 && index + 75 < normalInput.sequence.length && index + 1 !== normalInput.target_position) + 1;
  assert.ok(alternatePosition > 0, "The fixture needs another A with complete default flanks");
  await enter(targetField(), String(alternatePosition));
  assert.equal(windowStartField().value, "-75");
  assert.equal(windowEndField().value, "75");
  assert.match(query(".wrs-summary").textContent, /151 nt/);
  assertNoAdarChoice();
  assertNoCodingCheckbox();
  assertFixedLinearFolding();
  await enter(windowStartField(), "-55");
  await enter(windowEndField(), "45");
  await click(entryBase(normalInput.target_position));
  assert.equal(targetField().value, String(normalInput.target_position));
  assert.equal(windowStartField().value, "-75");
  assert.equal(windowEndField().value, "75");
  assertNoAdarChoice();
  assertNoCodingCheckbox();
  assertFixedLinearFolding();
  assert.equal(designRequests().length, 0, "Changing a target must not auto-submit the restored window");
});

test("new sequences, examples and application switches start with recommended design settings", async () => {
  await mount();
  await startNormal();
  await click(query(".sf-advanced-trigger"));
  assertRecommendedNormalSettings();
  await enter(windowStartField(), "-60");
  await enter(windowEndField(), "65");
  await enter(textarea(), `>new-input\n${normalInput.sequence}`);
  await click(entryBase(normalInput.target_position));
  assertRecommendedNormalSettings();
  assertNoCodingCheckbox();
  await enter(windowStartField(), "-60");
  await click(button("Try an example"));
  assertRecommendedNormalSettings();
  assertNoCodingCheckbox();
  await click(button("Exon skipping", query(".sf-mode-switch")));
  assertFixedLinearFolding();
  assertExonWindowOnly();
  assert.ok(query(".wrs-empty", query(".exon-window-selector")));
  await click(button("Try an example"));
  await submit();
  assert.equal(decodeState(window.location.hash).input.codingContext, false, "Loading an exon example must not inherit the previous normal CDS context");
  await click(query(".sf-advanced-trigger"));
  await enter(exonWindowStartField(), String(exonOutput.candidates[0].global_start + 10));
  await enter(textarea(), `>new-exon-input\n${exonInput.upstream_intron}${exonInput.exon}${exonInput.downstream_intron}`);
  await click(entryBase(153));
  await click(entryBase(208));
  assertExonWindowOnly();
  assert.ok(query(".wrs-empty", query(".exon-window-selector")), "A new input discards the previous candidate window draft");
  assertFixedLinearFolding();
  await submit();
  assertRecommendedExonRequest(designRequests().at(-1).body);

  await click(button("Normal", query(".sf-mode-switch")));
  assertNoAdarChoice();
  await click(button("Try an example"));
  assertNoAdarChoice();
  assertNoCodingCheckbox();
});

test("restoring recommended settings changes only the draft until Apply and preserves input context", async () => {
  await mount({ view: "design", application: "normal_editing", input: {
    mode: "sequence", adar: "ADAR1", sequence: normalInput.sequence, position: String(normalInput.target_position),
    includeInternalBulge: true, codingContext: true, gene: "SERPINA1", species: "9606", transcriptAccession: "NM_000295.5",
  } });
  await click(query(".sf-advanced-trigger"));
  await applySettings();
  await flushScroll();
  await click(query(".sf-advanced-trigger"));
  const originalStructureCount = document.querySelectorAll(".sf-structure-row").length;
  await click(button("Internal bulge", query(".custom-structure-editor")));
  await applySettings();
  await settleRequests();
  await flushScroll();
  assert.equal(designRequests().at(-1).body.include_internal_bulge, true, "Apply retains the saved legacy flag until defaults are restored");
  const results = query(".sf-inline-results");
  const oldCustom = customCandidateCard();
  assert.ok(oldCustom);
  const oldCustomSequence = query(".normal-sequence-text").textContent;
  const oldOutput = query(".normal-sequence-text");
  const oldHash = window.location.hash;
  const requestCount = designRequests().length;
  const foldCount = foldRequests().length;
  const scrollCount = scrollLog.filter(({ element }) => element === results).length;
  await click(query(".sf-advanced-trigger"));
  await enter(windowStartField(), "-60");
  await enter(windowEndField(), "");
  const unfinishedEndField = windowEndField();
  await click(button("Restore recommended settings"));
  assertRecommendedNormalSettings();
  assert.notEqual(windowEndField(), unfinishedEndField, "Restore must discard unfinished numeric text, even before a valid boundary was emitted");
  assertNoCodingCheckbox();
  assert.equal(document.querySelectorAll(".sf-structure-row").length, originalStructureCount, "Restore clears the editable custom structures");
  assert.equal(textarea().value, normalInput.sequence);
  assert.equal(targetField().value, String(normalInput.target_position));
  assert.equal(query(".normal-sequence-text"), oldOutput);
  assert.equal(customCandidateCard(), oldCustom);
  assert.equal(query(".normal-sequence-text").textContent, oldCustomSequence);
  assert.equal(designRequests().length, requestCount);
  assert.equal(foldRequests().length, foldCount);
  assert.equal(window.location.hash, oldHash);
  await applySettings();
  await settleRequests();
  await flushScroll();
  const request = designRequests().at(-1).body;
  assert.equal(request.adar_environment, "combined");
  assert.equal(request.window_start_relative, -75);
  assert.equal(request.window_end_relative, 75);
  assert.equal(request.include_internal_bulge, false);
  assert.equal(request.coding_context, true);
  assert.equal(customCandidateCards().length, 1, "Applying recommended settings without a custom draft must retain saved custom candidates");
  assert.equal(query(".advanced-inline-panel").hidden, true);
  const saved = decodeState(window.location.hash).input;
  assert.equal(saved.windowStart, "-75");
  assert.equal(saved.windowEnd, "75");
  assert.equal(scrollLog.filter(({ element }) => element === results).length, scrollCount + 1);
  await click(query(".normal-candidate-option", customCandidateCard()));
  assert.equal(query(".normal-sequence-text").textContent, oldCustomSequence);
});

test("homepage Go uses the unified profile while replacing applied custom settings and ignoring unfinished Advanced drafts", async () => {
  const defaultRespond = respond;
  respond = async (url, body) => url.endsWith("/designs/normal-editing") && body.window_start_relative === -70
    ? response({ ...shorterNormalOutput, pairing: combinedPairing }) : defaultRespond(url, body);
  await mount({ view: "design", application: "normal_editing", input: {
    mode: "sequence", adar: "ADAR1", sequence: normalInput.sequence,
    position: String(normalInput.target_position), codingContext: false, includeInternalBulge: true,
  } });
  await click(query(".sf-advanced-trigger"));
  await applySettings();
  await click(query(".normal-candidate-option")); // Baseline, not the recommended dual-deletion selection.
  await click(query(".sf-advanced-trigger"));
  await click(button("Internal bulge", query(".custom-structure-editor")));
  await enter(windowStartField(), "-70");
  await applySettings();
  await settleRequests();
  const appliedRequest = designRequests().at(-1).body;
  assert.equal(appliedRequest.window_start_relative, -70);
  assert.equal(appliedRequest.adar_environment, "combined");
  assert.equal(appliedRequest.include_internal_bulge, true);
  assert.equal(appliedRequest.coding_context, false);
  assert.ok(customCandidateCard());
  assert.ok(Array.from(document.querySelectorAll(".rna-fold-thumbnail")).every(thumbnail => thumbnail.dataset.topology === "linear"));
  const expectedDefault = normalOutput.candidates.find(candidate => candidate.id === "dual-deletion").arrna_sequence;
  await submit();
  await settleRequests();
  assertRecommendedNormalRequest(designRequests().at(-1).body, false);
  assertRecommendedNormalSettings();
  assertNoCodingCheckbox();
  assert.equal(customCandidateCard(), null);
  assert.equal(query(".normal-sequence-text").textContent, expectedDefault, "Go must restore the default candidate instead of retaining the previous baseline selection");
  assert.ok(Array.from(document.querySelectorAll(".rna-fold-thumbnail")).every(thumbnail => thumbnail.dataset.topology === "linear"));

  await click(query(".sf-advanced-trigger"));
  await enter(windowStartField(), "-60");
  await enter(windowEndField(), "");
  await click(button("Internal bulge", query(".custom-structure-editor")));
  await enter(query('input[type="number"]', Array.from(document.querySelectorAll(".sf-structure-row")).at(-1)), "0");
  assert.ok(query('.custom-structure-editor [role="alert"]'), "The draft intentionally includes an invalid structure");
  const beforeGo = designRequests().length;
  await submit();
  await settleRequests();
  assert.equal(designRequests().length, beforeGo + 1, "Invalid Advanced drafts must not prevent default Go from requesting a result");
  assertRecommendedNormalRequest(designRequests().at(-1).body, false);
  assertRecommendedNormalSettings();
  assert.equal(customCandidateCard(), null);
  assert.equal(document.querySelector('.custom-structure-editor [role="alert"]'), null);
  assert.equal(query(".normal-sequence-text").textContent, expectedDefault);
  assert.equal(decodeState(window.location.hash).input.windowStart, "-75");
  assert.equal(decodeState(window.location.hash).input.includeInternalBulge, false);
});

test("Exon windows follow the selected candidate, apply independently and reset on homepage Go", async () => {
  const defaultRespond = respond;
  respond = async (url, body) => url.endsWith("/exon-skipping/design")
    ? response(windowedExonOutput(body.candidate_windows)) : defaultRespond(url, body);
  await mount();
  await click(button("Exon skipping", query(".sf-mode-switch")));
  await enter(textarea(), exonInput.upstream_intron + exonInput.exon + exonInput.downstream_intron);
  await click(entryBase(153));
  await click(entryBase(208));
  await submit();
  await flushScroll();
  await click(query(".sf-advanced-trigger"));
  assertExonWindowOnly();
  const [sa, ese] = exonOutput.candidates;
  const rangeValues = () => [Number(exonWindowStartField().value), Number(exonWindowEndField().value)];
  const select = candidate => click(query(`.exon-result .normal-candidate-card[data-candidate-id="${candidate.id}"] .normal-candidate-option`));
  assert.deepEqual(rangeValues(), [sa.global_start, sa.global_end]);
  await select(ese);
  assert.deepEqual(rangeValues(), [ese.global_start, ese.global_end]);
  await select(sa);
  const originalOutput = query(".exon-result .normal-sequence-text");
  const preview = query(".exon-window-svg");
  const startHandle = query('[role="slider"][aria-label="Window start handle"]');
  await act(async () => startHandle.dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })));
  assert.deepEqual(rangeValues(), [sa.global_start + 1, sa.global_end]);
  assert.equal(preview.dataset.windowStart, String(sa.global_start + 1));
  await enter(exonWindowStartField(), String(sa.global_start + 10));
  const track = query(".wrs-track", preview), endHandle = query('[role="slider"][aria-label="Window end handle"]');
  const originalBounds = track.getBoundingClientRect;
  const captured = new Set();
  track.getBoundingClientRect = () => ({ left: 0, top: 0, right: 3580, bottom: 100, x: 0, y: 0, width: 3580, height: 100 });
  endHandle.setPointerCapture = id => captured.add(id);
  endHandle.hasPointerCapture = id => captured.has(id);
  endHandle.releasePointerCapture = id => captured.delete(id);
  try {
    for (const [type, clientX] of [["pointerdown", 100], ["pointermove", 50], ["pointerup", 50]]) {
      const event = new window.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX });
      Object.defineProperty(event, "pointerId", { value: 5 });
      await act(async () => endHandle.dispatchEvent(event));
    }
    assert.deepEqual(rangeValues(), [sa.global_start + 10, sa.global_end - 5], "Dragging the end handle must preserve the independent start boundary");
    assert.equal(captured.size, 0);
  } finally { track.getBoundingClientRect = originalBounds; }
  assert.equal(preview.dataset.windowEnd, String(sa.global_end - 5));
  assert.ok(query(".exon-result .normal-sequence-text") === originalOutput);
  assert.equal(originalOutput.textContent, sa.arrna_sequence);
  assert.equal(query(".exon-result .exon-pairing-svg").dataset.start, String(sa.global_start));
  assert.equal(designRequests().length, 1, "Window edits remain drafts until Apply");
  const saWindow = { candidate_id: sa.id, start: sa.global_start + 10, end: sa.global_end - 5 };
  await applySettings();
  await flushScroll();
  assert.deepEqual(designRequests().at(-1).body.candidate_windows, [saWindow]);
  assert.equal(query('.exon-result .normal-candidate-card[data-selected="true"]').dataset.candidateId, sa.id);
  assert.equal(query(".exon-result .normal-sequence-text").textContent, windowedExonOutput([saWindow]).candidates[0].arrna_sequence);
  assert.equal(query(".exon-result .exon-pairing-svg").dataset.start, String(saWindow.start));
  assert.equal(query(".exon-result .exon-pairing-svg").dataset.end, String(saWindow.end));
  assert.ok(scrollLog.some(({ element }) => element === query(".sf-inline-results")));
  await select(ese);
  await click(query(".sf-advanced-trigger"));
  assert.deepEqual(rangeValues(), [ese.global_start, ese.global_end]);
  await enter(exonWindowStartField(), String(ese.global_start + 10));
  const eseWindow = { candidate_id: ese.id, start: ese.global_start + 10, end: ese.global_end };
  await applySettings();
  assert.deepEqual(designRequests().at(-1).body.candidate_windows, [saWindow, eseWindow], "Applying a second candidate retains the first candidate's applied override");
  assert.equal(query('.exon-result .normal-candidate-card[data-selected="true"]').dataset.candidateId, ese.id);
  await select(sa);
  assert.deepEqual(rangeValues(), [saWindow.start, saWindow.end]);
  await select(ese);
  assert.deepEqual(rangeValues(), [eseWindow.start, eseWindow.end]);
  await submit();
  assertRecommendedExonRequest(designRequests().at(-1).body);
  assert.equal(query(".normal-sequence-text").textContent, sa.arrna_sequence);
  assert.deepEqual(rangeValues(), [sa.global_start, sa.global_end]);
  assertFixedLinearFolding();
  await click(query(".sf-advanced-trigger"));
  await enter(exonWindowStartField(), "");
  const beforeGo = designRequests().length;
  await submit();
  assert.equal(designRequests().length, beforeGo + 1, "Go must ignore an unfinished Advanced window draft");
  assertRecommendedExonRequest(designRequests().at(-1).body);
  assert.deepEqual(rangeValues(), [sa.global_start, sa.global_end]);
});

test("failed or stale Exon Window Apply preserves the previous result", async () => {
  await mount();
  await click(button("Exon skipping", query(".sf-mode-switch")));
  await enter(textarea(), exonInput.upstream_intron + exonInput.exon + exonInput.downstream_intron);
  await click(entryBase(153));
  await click(entryBase(208));
  await submit();
  await flushScroll();
  const originalOutput = query(".exon-result .normal-sequence-text"), originalHash = window.location.hash;
  await click(query(".sf-advanced-trigger"));
  await enter(exonWindowStartField(), "86");
  const defaultRespond = respond;
  respond = async (url, body) => url.endsWith("/exon-skipping/design") ? response({ detail: "Window fixture rejected" }, 422) : defaultRespond(url, body);
  await applySettings();
  assert.ok(query(".exon-result .normal-sequence-text") === originalOutput);
  assert.equal(originalOutput.textContent, exonOutput.candidates[0].arrna_sequence);
  assert.equal(window.location.hash, originalHash);
  assert.equal(query(".advanced-inline-panel").hidden, false);
  let finish;
  respond = (url, body) => url.endsWith("/exon-skipping/design") ? new Promise(resolveResponse => { finish = resolveResponse; }) : defaultRespond(url, body);
  await applySettings();
  assert.equal(typeof finish, "function");
  await enter(exonWindowEndField(), "");
  await act(async () => finish(response(windowedExonOutput([{ candidate_id: exonOutput.candidates[0].id, start: 86, end: 226 }]))));
  assert.ok(query(".exon-result .normal-sequence-text") === originalOutput, "Even invalid raw boundary text must invalidate an in-flight Apply");
  assert.equal(window.location.hash, originalHash);
});

test("a pending custom Apply cannot replace a later homepage Go result", async () => {
  await mount();
  await startNormal();
  await submit();
  await settleRequests();
  await click(query(".sf-advanced-trigger"));
  await click(button("Internal bulge", query(".custom-structure-editor")));
  await enter(windowStartField(), "-70");
  const defaultRespond = respond;
  let finishApply;
  respond = (url, body) => url.endsWith("/designs/normal-editing") && body.window_start_relative === -70
    ? new Promise(resolveResponse => { finishApply = resolveResponse; }) : defaultRespond(url, body);
  await applySettings();
  assert.equal(typeof finishApply, "function");
  await submit();
  assertRecommendedNormalRequest(designRequests().at(-1).body);
  const goOutput = query(".normal-sequence-text");
  const goSequence = goOutput.textContent;
  const goHash = window.location.hash;
  await act(async () => finishApply(response(shorterNormalOutput)));
  assert.equal(query(".normal-sequence-text"), goOutput);
  assert.equal(goOutput.textContent, goSequence);
  assert.equal(customCandidateCard(), null, "A stale custom Apply must not append a card to the newer default Go result");
  assert.equal(window.location.hash, goHash);
  assertRecommendedNormalSettings();
  assert.equal(query(".advanced-inline-panel").hidden, true);
});

test("Go and Apply derive coding context from the input source without a coding checkbox", async () => {
  await mount();
  await click(button("Try an example"));
  await click(query(".sf-advanced-trigger"));
  assertNoCodingCheckbox();
  await applySettings();
  assert.equal(designRequests().at(-1).body.coding_context, true);
  await submit();
  assertRecommendedNormalRequest(designRequests().at(-1).body, true);
  assertNoCodingCheckbox();

  await enter(textarea(), `>new-pasted-sequence\n${normalInput.sequence}`);
  await click(entryBase(normalInput.target_position));
  await click(query(".sf-advanced-trigger"));
  await applySettings();
  assert.equal(designRequests().at(-1).body.coding_context, false);
  await submit();
  assertRecommendedNormalRequest(designRequests().at(-1).body, false);

  await act(async () => {
    window.history.replaceState(null, "", encodeState({ view: "design", application: "normal_editing", input: {
      mode: "sequence", adar: "ADAR1", sequence: normalInput.sequence,
      position: String(normalInput.target_position), codingContext: true,
    } }));
    window.dispatchEvent(new window.PopStateEvent("popstate"));
  });
  await click(query(".sf-advanced-trigger"));
  await applySettings();
  assert.equal(designRequests().at(-1).body.coding_context, true);
  await submit();
  assertRecommendedNormalRequest(designRequests().at(-1).body, true);
  assert.equal(requestLog.filter(({ url }) => url.includes("/references/")).length, 0);
  assertNoCodingCheckbox();
});

// A static path (/help, /method, /citation) must not drag a design out of the
// `#s=` fragment. These two cases are the DOM gate for restoredStateFor: the
// first proves a design fragment on /help leaves the workspace uninitialized,
// the second proves the exact same fragment on the root restores the sequence,
// so the first assertion is not vacuously true.
test("a design fragment on a static path renders the static page and never initializes the workspace", async () => {
  const fragment = encodeState({ view: "design", application: "normal_editing", input: {
    mode: "sequence", adar: "ADAR2", sequence: normalInput.sequence,
    position: String(normalInput.target_position),
  } });
  window.history.replaceState(null, "", "/help" + fragment);
  await mount();
  assert.equal(window.location.pathname, "/help");
  assert.ok(query(".help-guide"), "a static path must render its own page, not the design workspace");
  assert.ok(query(".sf-entry").closest("[hidden]"), "the design workspace must stay hidden on /help");
  assert.equal(textarea().value, "", "the workspace must not initialize from the fragment's sequence on a static path");
  assert.notEqual(textarea().value, normalInput.sequence);
});

test("the same design fragment on the root path restores the workspace sequence", async () => {
  await mount({ view: "design", application: "normal_editing", input: {
    mode: "sequence", adar: "ADAR2", sequence: normalInput.sequence,
    position: String(normalInput.target_position),
  } });
  assert.equal(window.location.pathname, "/");
  assert.ok(!query(".sf-entry").closest("[hidden]"), "the design workspace must be visible on the root path");
  assert.equal(textarea().value, normalInput.sequence, "the fragment's sequence must restore on the root path");
});
