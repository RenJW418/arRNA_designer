import assert from "node:assert/strict";
import { test } from "node:test";
import { createRnaFoldCache, EMPTY_FOLD_STATE, rnaFoldKey } from "./rnaFoldCache.ts";
import type { RnaFoldResult, RnaTopology } from "./sequenceAnalysis.ts";

// Transport fixtures only: these tests exercise request ownership, not folding.
function fixture(sequence: string, topology: RnaTopology): RnaFoldResult {
  return { sequence, topology, structure: ".".repeat(sequence.length), mfe: 0,
    ensemble_free_energy: 0, ensemble_diversity: 0, unpaired_probabilities: Array(sequence.length).fill(1),
    mean_unpaired_probability: 1, mfe_unpaired_fraction: 1, pairs: [],
    coordinates: [...sequence].map((_, index) => ({ x: index * 10, y: 0 })), engine: "DOM fixture", version: "test", temperature: 37 };
}
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
function deferredLoader() {
  const calls: Array<{ sequence: string; topology: RnaTopology; signal: AbortSignal; resolve: (result: RnaFoldResult) => void; reject: (reason: Error) => void }> = [];
  const loader = (sequence: string, topology: RnaTopology, signal: AbortSignal) => new Promise<RnaFoldResult>((resolve, reject) => calls.push({ sequence, topology, signal, resolve, reject }));
  return { calls, loader };
}

test("cards and detail share normalized requests while folding models remain separate", async () => {
  const { calls, loader } = deferredLoader();
  const cache = createRnaFoldCache(loader);
  const stopCard = cache.subscribe("ac gta", "linear", () => {});
  const stopDetail = cache.subscribe("ACGUA", "linear", () => {});
  await tick();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].sequence, "ACGUA");
  calls[0].resolve(fixture("ACGUA", "linear"));
  await tick();
  stopCard(); stopDetail();
  await tick();
  const stopCached = cache.subscribe("ACGTA", "linear", () => {});
  const stopCircular = cache.subscribe("ACGUA", "circular", () => {});
  await tick();
  assert.equal(calls.length, 2);
  assert.equal(calls[1].topology, "circular");
  assert.equal(cache.read(rnaFoldKey("ACGTA", "linear")).status, "ready");
  calls[1].resolve(fixture("ACGUA", "circular"));
  await tick();
  stopCached(); stopCircular();
});

test("the queue starts at most two requests and drops unobserved queued candidates", async () => {
  const { calls, loader } = deferredLoader();
  const cache = createRnaFoldCache(loader);
  const stops = ["AAAAA", "CCCCC", "GGGGG", "UUUUU"].map(sequence => cache.subscribe(sequence, "linear", () => {}));
  await tick();
  assert.equal(calls.length, 2);
  stops[3]();
  await tick();
  calls[0].resolve(fixture("AAAAA", "linear"));
  await tick();
  assert.equal(calls.length, 3);
  assert.equal(calls[2].sequence, "GGGGG");
  calls[1].resolve(fixture("CCCCC", "linear"));
  calls[2].resolve(fixture("GGGGG", "linear"));
  await tick();
  assert.equal(calls.length, 3);
  stops.forEach(stop => stop());
});

test("a released request cannot overwrite a new subscription with a late response", async () => {
  const { calls, loader } = deferredLoader();
  const cache = createRnaFoldCache(loader);
  const key = rnaFoldKey("AAAAA", "linear");
  const stopOld = cache.subscribe("AAAAA", "linear", () => {});
  await tick();
  stopOld();
  await tick();
  assert.equal(calls[0].signal.aborted, true);
  assert.equal(cache.read(key), EMPTY_FOLD_STATE);
  const stopNew = cache.subscribe("AAAAA", "linear", () => {});
  await tick();
  calls[0].resolve({ ...fixture("AAAAA", "linear"), version: "stale" });
  await tick();
  assert.equal(cache.read(key).status, "loading");
  assert.equal(cache.read(key).result, null);
  calls[1].resolve({ ...fixture("AAAAA", "linear"), version: "current" });
  await tick();
  assert.equal(cache.read(key).result?.version, "current");
  stopNew();
});

test("failures remain explicit until one shared retry succeeds", async () => {
  const { calls, loader } = deferredLoader();
  const cache = createRnaFoldCache(loader);
  const key = rnaFoldKey("AAAAA", "linear");
  const states: string[] = [];
  const stop = cache.subscribe("AAAAA", "linear", () => states.push(cache.read(key).status));
  await tick();
  calls[0].reject(new Error("RNAfold service unavailable"));
  await tick();
  assert.equal(cache.read(key).status, "error");
  assert.match(cache.read(key).error, /unavailable/);
  assert.equal(cache.read(key).result, null);
  cache.retry(key); cache.retry(key);
  await tick();
  assert.equal(calls.length, 2);
  calls[1].resolve(fixture("AAAAA", "linear"));
  await tick();
  assert.equal(cache.read(key).status, "ready");
  assert.equal(cache.read(key).error, "");
  assert.deepEqual(states, ["loading", "error", "queued", "loading", "ready"]);
  stop();
});

test("completed unobserved entries obey the cache bound", async () => {
  let count = 0;
  const cache = createRnaFoldCache(async (sequence, topology) => { count += 1; return fixture(sequence, topology); }, 1);
  const stopFirst = cache.subscribe("AAAAA", "linear", () => {});
  await tick(); stopFirst(); await tick();
  const stopSecond = cache.subscribe("CCCCC", "linear", () => {});
  await tick(); stopSecond(); await tick();
  assert.equal(cache.read(rnaFoldKey("AAAAA", "linear")), EMPTY_FOLD_STATE);
  assert.equal(cache.read(rnaFoldKey("CCCCC", "linear")).status, "ready");
  const stopAgain = cache.subscribe("AAAAA", "linear", () => {});
  await tick();
  assert.equal(count, 3);
  stopAgain();
});
