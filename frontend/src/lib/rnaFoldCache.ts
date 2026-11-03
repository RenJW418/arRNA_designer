import { analyzeRnaStructure, normalizeAnalysisSequence, type RnaFoldResult, type RnaTopology } from "./sequenceAnalysis.ts";

export interface RnaFoldState {
  status: "idle" | "queued" | "loading" | "ready" | "error";
  result: RnaFoldResult | null;
  error: string;
}
export const EMPTY_FOLD_STATE: RnaFoldState = { status: "idle", result: null, error: "" };
type Loader = (sequence: string, topology: RnaTopology, signal: AbortSignal) => Promise<RnaFoldResult>;
interface Entry {
  key: string;
  sequence: string;
  topology: RnaTopology;
  state: RnaFoldState;
  listeners: Set<() => void>;
  controller?: AbortController;
}
export function rnaFoldKey(sequence: string, topology: RnaTopology): string {
  return JSON.stringify([normalizeAnalysisSequence(sequence, "structure"), topology]);
}

/** Shares card/detail requests; retains at most maxCached unobserved results.
 * Active views retain their own entries until they unsubscribe. */
export function createRnaFoldCache(loader: Loader, maxCached = 48, concurrency = 2) {
  const entries = new Map<string, Entry>();
  let queue: Entry[] = [];
  let running = 0;
  let scheduled = false;
  function notify(entry: Entry) { entry.listeners.forEach(listener => listener()); }
  function prune() {
    const retained = [...entries.values()].filter(entry => entry.listeners.size === 0 && ["ready", "error"].includes(entry.state.status));
    for (const entry of retained.slice(0, Math.max(0, retained.length - maxCached))) entries.delete(entry.key);
  }
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => { scheduled = false; pump(); });
  }
  function pump() {
    while (running < concurrency && queue.length) {
      const entry = queue.shift()!;
      if (entries.get(entry.key) !== entry || entry.state.status !== "queued" || !entry.listeners.size) continue;
      const controller = new AbortController();
      entry.controller = controller;
      entry.state = { status: "loading", result: null, error: "" };
      running += 1;
      notify(entry);
      Promise.resolve().then(() => loader(entry.sequence, entry.topology, controller.signal)).then(result => {
        if (entries.get(entry.key) === entry && !controller.signal.aborted) entry.state = { status: "ready", result, error: "" };
      }, reason => {
        if (entries.get(entry.key) === entry && !controller.signal.aborted) entry.state = { status: "error", result: null, error: reason instanceof Error ? reason.message : "RNAfold could not complete this calculation." };
      }).finally(() => {
        running -= 1;
        if (entries.get(entry.key) === entry && !controller.signal.aborted) notify(entry);
        prune();
        pump();
      });
    }
  }
  return {
    read(key: string): RnaFoldState { return entries.get(key)?.state ?? EMPTY_FOLD_STATE; },
    subscribe(sequence: string, topology: RnaTopology, listener: () => void) {
      const normalized = normalizeAnalysisSequence(sequence, "structure");
      const key = rnaFoldKey(normalized, topology);
      let entry = entries.get(key);
      if (!entry) {
        entry = { key, sequence: normalized, topology, state: { status: "queued", result: null, error: "" }, listeners: new Set() };
        entries.set(key, entry);
        queue.push(entry);
      } else { entries.delete(key); entries.set(key, entry); }
      entry.listeners.add(listener);
      schedule();
      const subscribedEntry = entry;
      return () => {
        subscribedEntry.listeners.delete(listener);
        // Allow React StrictMode's immediate resubscription to share the request.
        queueMicrotask(() => {
          if (subscribedEntry.listeners.size || entries.get(key) !== subscribedEntry) return;
          if (["queued", "loading"].includes(subscribedEntry.state.status)) {
            entries.delete(key);
            queue = queue.filter(candidate => candidate !== subscribedEntry);
            subscribedEntry.controller?.abort();
          }
          prune();
        });
      };
    },
    retry(key: string) {
      const entry = entries.get(key);
      if (!entry || ["queued", "loading"].includes(entry.state.status)) return;
      entry.state = { status: "queued", result: null, error: "" };
      queue.push(entry);
      notify(entry);
      schedule();
    },
    clear() {
      for (const entry of entries.values()) entry.controller?.abort();
      entries.clear();
      queue = [];
    },
  };
}
export const rnaFoldCache = createRnaFoldCache(analyzeRnaStructure);
export function clearRnaFoldCache() { rnaFoldCache.clear(); }
