/**
 * Protocol Table 1 component/workspace interactions in jsdom (not visual QA).
 * LEAPER_DOM_TEST_DEPS=<external-jsdom-install> node --test --test-reporter=spec scripts/protocol_table1_dom_smoke.mjs
 * Uses existing React/esbuild packages and checked-in teaching fixtures.
 */
import assert from "node:assert/strict";
import { after, afterEach, beforeEach, test } from "node:test";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const website = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const frontend = join(website, "frontend");
const requireFrontend = createRequire(join(frontend, "package.json"));
const requireDom = process.env.LEAPER_DOM_TEST_DEPS
  ? createRequire(join(resolve(process.env.LEAPER_DOM_TEST_DEPS), "package.json")) : requireFrontend;
const { JSDOM } = requireDom("jsdom");
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://leaper-dom.test/", pretendToBeVisual: true,
});
for (const name of ["window", "document", "navigator", "HTMLElement", "HTMLInputElement", "HTMLTextAreaElement", "HTMLSelectElement", "Element", "Node", "Event", "MouseEvent", "KeyboardEvent", "MutationObserver", "getComputedStyle"]) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: dom.window[name] });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
dom.window.scrollTo = () => {};
dom.window.HTMLElement.prototype.scrollIntoView = () => {};
dom.window.matchMedia = query => ({ matches: false, media: query });
Object.defineProperty(dom.window.navigator, "clipboard", { value: { writeText: async () => {} } });
const React = requireFrontend("react");
const { act } = React;
const { createRoot } = requireFrontend("react-dom/client");
const { build } = requireFrontend("esbuild");
const bundled = await build({
  stdin: {
    contents: "export { App } from './src/App'; export { LanguageProvider } from './src/components/LanguageProvider'; export { CustomStructureEditor } from './src/components/CustomStructureEditor'; export { buildCustomDesign } from './src/lib/customDesign'; export { clearRnaFoldCache } from './src/lib/rnaFoldCache';",
    resolveDir: frontend, loader: "tsx",
  },
  bundle: true, write: false, platform: "node", format: "cjs", jsx: "automatic", packages: "external",
  define: { "import.meta.env": "{}" }, loader: { ".css": "empty" },
});
const module = { exports: {} };
new Function("require", "module", "exports", bundled.outputFiles[0].text)(requireFrontend, module, module.exports);
const { App, LanguageProvider, CustomStructureEditor, buildCustomDesign, clearRnaFoldCache } = module.exports;
const normalInput = JSON.parse(await readFile(join(frontend, "public/examples/normal-input.json"), "utf8"));
const normalOutput = JSON.parse(await readFile(join(frontend, "public/examples/normal-output.json"), "utf8"));
normalOutput.pairing = { ...normalOutput.pairing, adar_environment: "combined", required_upstream: 6, required_downstream: 25 };
const source = normalOutput.candidates.find(candidate => candidate.id === "baseline");
assert.ok(source, "The existing fixture must include the baseline candidate");
const baselineVariant = {
  id: source.id, label: source.label, shortLabel: source.short_label, description: source.description,
  arrnaSequence: source.arrna_sequence, alignedGuide: source.aligned_guide, deletionCoordinates: [],
};
const shortOutput = { ...normalOutput, window_start: 8, window_end: 129,
  target_window: normalOutput.target_window.slice(7, 129), target_index: 68, upstream_length: 68, downstream_length: 53 };
const response = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
function normalDisplay(body) {
  const controls = normalOutput.candidates.filter(candidate => !candidate.id.endsWith("-internal-del1"));
  const internal = controls.map(candidate => {
    const aligned = Array.from(candidate.aligned_guide);
    aligned[normalOutput.target_index + 4] = "-";
    return { ...candidate, id: `${candidate.id}-internal-del1`, aligned_guide: aligned.join(""),
      arrna_sequence: aligned.filter(base => base !== "-").reverse().join(""),
      deletion_coordinates: [...candidate.deletion_coordinates, 4] };
  });
  return { ...normalOutput, normalized_input: { ...normalOutput.normalized_input,
    coding_context: body.coding_context, include_internal_bulge: body.include_internal_bulge },
  candidates: body.include_internal_bulge ? [...controls, ...internal] : controls };
}
let root;
let container;
let latestSpecs;
let emittedErrors;
const consoleError = console.error;
beforeEach(() => {
  clearRnaFoldCache();
  document.body.replaceChildren();
  window.localStorage.clear();
  window.history.replaceState(null, "", "/");
  latestSpecs = null;
  emittedErrors = [];
  console.error = (...args) => emittedErrors.push(args.map(String).join(" "));
  globalThis.fetch = async (url, options) => {
    const body = JSON.parse(options?.body ?? "{}");
    if (String(url).endsWith("/designs/normal-editing")) return response(normalDisplay(body));
    if (String(url).endsWith("/analysis/rnafold")) return response({ detail: "No folding service in this DOM fixture." }, 503);
    if (String(url).endsWith("/analysis/annotations")) return response({ sequence: body.sequence, prediction_method: "DOM fixture", features: [], warnings: [], reference_accession: null });
    throw new Error(`Unexpected network request: ${url}`);
  };
});
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  root = null;
  console.error = consoleError;
  assert.deepEqual(emittedErrors, [], "React/component errors were emitted");
});
after(() => dom.window.close());

function query(selector, scope = document) {
  const node = scope.querySelector(selector);
  assert.ok(node, `Missing DOM element: ${selector}`);
  return node;
}
function button(name, scope = document) {
  const node = Array.from(scope.querySelectorAll("button")).find(element =>
    element.getAttribute("aria-label") === name || element.textContent.trim() === name);
  assert.ok(node, `Missing button: ${name}`);
  return node;
}
async function click(node) { await act(async () => node.click()); }
async function enter(node, value) {
  const prototype = node instanceof window.HTMLSelectElement ? window.HTMLSelectElement.prototype
    : node instanceof window.HTMLTextAreaElement ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(prototype, "value").set.call(node, value);
    node.dispatchEvent(new window.Event(node instanceof window.HTMLSelectElement ? "change" : "input", { bubbles: true }));
  });
}
function Harness({ result, initial = [] }) {
  const [specs, setSpecs] = React.useState(initial);
  const draft = buildCustomDesign(result.target_window, result.target_index, "combined", specs);
  latestSpecs = specs;
  return React.createElement(React.Fragment, null,
    React.createElement(CustomStructureEditor, { result, variant: baselineVariant, structures: specs,
      onChange: setSpecs, environment: "combined" }),
    React.createElement("output", { "data-testid": "draft-valid" }, String(draft.valid)));
}
async function mountEditor({ short = false, initial = [], language = "en" } = {}) {
  window.localStorage.setItem("leaper-language", language);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(React.createElement(LanguageProvider, null,
    React.createElement(Harness, { result: short ? shortOutput : normalOutput, initial }))));
}
const menu = () => query("details.sf-external-presets");
const presets = () => Array.from(menu().querySelectorAll("button[data-protocol-preset]"));
const preset = id => query(`button[data-protocol-preset="${id}"]`, menu());
const row = () => query(".sf-structure-row");
async function openPreset(id) {
  const item = preset(id);
  await act(async () => {
    menu().open = true;
    const group = item.closest("details");
    if (group !== menu()) group.open = true;
  });
  return item;
}

test("Table 1 adds thirty choices in six native groups after unchanged universal presets", async () => {
  await mountEditor();
  assert.equal(presets().length, 30, "The external preset menu must expose all thirty protocol alternatives");
  assert.equal(menu().querySelectorAll("details").length, 6, "Side × type must yield six native collapsible groups");
  const buttons = Array.from(menu().querySelectorAll("button"));
  assert.deepEqual(buttons.slice(0, 2).map(node => node.textContent.trim()), ["Upstream −31 · 28/0", "Downstream +34 · 10/0"]);
  assert.ok(buttons.slice(0, 2).every(node => !node.hasAttribute("data-protocol-preset")));
  assert.ok(Array.from(menu().querySelectorAll("details")).every(group => group.querySelectorAll("button[data-protocol-preset]").length === 5));
  assert.ok(presets().every(node => !node.disabled), "All Table 1 geometries fit a full Baseline target window");
});

test("short target windows retain real flank-validation reasons on exactly three disabled alternatives", async () => {
  await mountEditor({ short: true });
  assert.equal(presets().length, 30);
  const disabled = presets().filter(node => node.disabled);
  assert.deepEqual(disabled.map(node => node.dataset.protocolPreset).sort(), [
    "table1-downstream-deletion-13-34", "table1-upstream-deletion-30-31", "table1-upstream-mismatch-30-32",
  ].sort());
  assert.ok(disabled.every(node => /10 complementary nucleotides/.test(node.title)), "Disabled geometry must expose the existing paired-flank reason");
});

test("existing Three bulges disable conflicting alternatives without silently replacing structures", async () => {
  const initial = [
    { id: "up", type: "deletion", position: -31, size: 28 },
    { id: "internal", type: "deletion", position: 4, size: 1 },
    { id: "down", type: "deletion", position: 34, size: 10 },
  ];
  await mountEditor({ initial });
  assert.equal(presets().length, 30);
  assert.ok(presets().every(node => node.disabled && node.title.trim()));
  assert.deepEqual(latestSpecs, initial);
  assert.match(menu().textContent, /Baseline/);
});

for (const sample of [
  { id: "table1-upstream-insertion-5-30", type: "insertion", size: 5, position: -30, bases: "AAAAA" },
  { id: "table1-downstream-mismatch-6-33", type: "mismatch", size: 6, position: 33,
    bases: normalOutput.target_window.slice(normalOutput.target_index + 33, normalOutput.target_index + 39).replace(/T/g, "U") },
]) test(`${sample.type} presets keep bases empty until the user supplies them`, async () => {
  await mountEditor();
  const item = await openPreset(sample.id);
  assert.equal(item.disabled, false);
  await click(item);
  assert.equal(latestSpecs.length, 1);
  assert.equal(latestSpecs[0].type, sample.type);
  assert.equal(latestSpecs[0].position, sample.position);
  assert.equal(latestSpecs[0].size, sample.size);
  assert.equal(latestSpecs[0].bases, "", "Preflight bases must never enter the actual draft");
  assert.equal(query('input[placeholder="ACGU"]', row()).value, "");
  assert.equal(query('[data-testid="draft-valid"]').textContent, "false");
  assert.ok(query('[role="alert"]').textContent.includes(`exactly ${sample.size}`));
  const origin = structuredClone(latestSpecs[0].preset_provenance);
  assert.equal(origin.source, "protocol-table-1");
  assert.equal(origin.preset_id, sample.id);
  assert.equal(origin.table, 1);
  assert.equal(origin.doi, null);
  assert.equal(origin.status, "unpublished-protocol");
  await enter(query('input[placeholder="ACGU"]', row()), sample.bases);
  assert.equal(query('[data-testid="draft-valid"]').textContent, "true");
  assert.deepEqual(latestSpecs[0].preset_provenance, origin, "Filling bases retains the geometry origin");
  assert.equal(document.querySelector('[role="alert"]'), null);
});

test("nested selection and Escape both close the outer menu and restore its summary focus", async () => {
  await mountEditor();
  const item = await openPreset("table1-upstream-deletion-14-31");
  await act(async () => {
    item.focus();
    item.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
  });
  assert.equal(menu().open, false);
  assert.equal(document.activeElement, menu().querySelector(":scope > summary"));
  await openPreset("table1-upstream-deletion-14-31");
  await click(item);
  assert.equal(menu().open, false, "Selecting a nested choice must close the entire menu");
  assert.equal(document.activeElement, menu().querySelector(":scope > summary"));
  assert.equal(latestSpecs[0].type, "deletion");
  assert.equal(latestSpecs[0].size, 14);
});

test("changing preset geometry clears its exact preset provenance without altering validation", async () => {
  await mountEditor();
  await click(await openPreset("table1-upstream-deletion-14-31"));
  assert.ok(latestSpecs[0].preset_provenance);
  await enter(row().querySelectorAll('input[type="number"]')[1], "15");
  assert.equal(latestSpecs[0].size, 15);
  assert.equal(latestSpecs[0].preset_provenance, undefined, "An edited geometry must not claim an exact Table 1 preset");
  assert.equal(query('[data-testid="draft-valid"]').textContent, "true");
});

test("Chinese users see source status, pending DOI and the experimental-testing qualification", async () => {
  await mountEditor({ language: "zh-CN" });
  assert.equal(presets().length, 30);
  const text = menu().textContent;
  assert.match(text, /审|未发表/);
  assert.match(text, /DOI/);
  assert.match(text, /实验/);
  assert.match(text, /保证/);
  assert.ok(Array.from(menu().querySelectorAll("details > summary")).some(node => /上游/.test(node.textContent)));
  assert.ok(Array.from(menu().querySelectorAll("details > summary")).some(node => /下游/.test(node.textContent)));
});

test("real workspace rejects empty preset bases, then saves and exports the source after card switching", async () => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(React.createElement(LanguageProvider, null, React.createElement(App))));
  await enter(query('textarea[aria-label="Target sequence"]'), normalInput.sequence);
  await click(query(`.sf-entry [data-seq-position="${normalInput.target_position}"]`));
  await act(async () => query(".sf-entry-form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true })));
  await click(query('.normal-candidate-card[data-candidate-id="baseline"] .normal-candidate-option'));
  await click(query(".sf-advanced-trigger"));
  await click(await openPreset("table1-upstream-insertion-5-30"));
  const originalSequence = query(".normal-sequence-text").textContent;
  await click(button("Apply settings"));
  assert.equal(document.querySelector('.normal-candidate-card[data-candidate-id="custom-1"]'), null);
  assert.equal(query(".normal-sequence-text").textContent, originalSequence);
  assert.equal(query(".advanced-inline-panel").hidden, false);
  assert.ok(query('.advanced-inline-panel [role="alert"]'));
  await enter(query('input[placeholder="ACGU"]', row()), "AAAAA");
  await click(button("Apply settings"));
  assert.ok(query('.normal-candidate-card[data-candidate-id="custom-1"]'));
  assert.equal(query(".normal-sequence-text").textContent.length, 156);
  const createURL = URL.createObjectURL;
  const revokeURL = URL.revokeObjectURL;
  const anchorClick = window.HTMLAnchorElement.prototype.click;
  const downloads = [];
  try {
    URL.createObjectURL = blob => { downloads.push(blob); return `blob:leaper-dom.test/protocol-${downloads.length}`; };
    URL.revokeObjectURL = () => {};
    window.HTMLAnchorElement.prototype.click = () => {};
    // Allow the completed Apply's scheduled focus to settle before menu access.
    await act(async () => new Promise(done => window.requestAnimationFrame(() => window.requestAnimationFrame(done))));
    await click(query('.normal-candidate-card[data-candidate-id="baseline"] .normal-candidate-option'));
    await click(query('.normal-candidate-card[data-candidate-id="custom-1"] .normal-candidate-option'));
    for (const format of ["JSON", "CSV"]) {
      await click(button("Download", query(".normal-result-page")));
      await click(button(format, query(".export-menu-options")));
    }
    assert.equal(downloads.length, 2);
    const json = JSON.parse(await downloads[0].text());
    const exported = json.candidates.find(candidate => candidate.id === "custom-1");
    assert.equal(exported.sequence.length, 156);
    assert.equal(exported.structures[0].bases, "AAAAA");
    assert.equal(exported.structures[0].preset_provenance.source, "protocol-table-1");
    assert.equal(exported.structures[0].preset_provenance.preset_id, "table1-upstream-insertion-5-30");
    assert.deepEqual(json.custom_designs[0].structures[0].preset_provenance, exported.structures[0].preset_provenance);
    const csv = await downloads[1].text();
    assert.match(csv, /""preset_provenance""/);
    assert.match(csv, /protocol-table-1/);
    assert.match(csv, /table1-upstream-insertion-5-30/);
  } finally {
    URL.createObjectURL = createURL;
    URL.revokeObjectURL = revokeURL;
    window.HTMLAnchorElement.prototype.click = anchorClick;
  }
});
