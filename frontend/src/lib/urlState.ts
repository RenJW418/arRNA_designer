// Shareable links without server-side state.
//
// Everything needed to restore a view is encoded into the URL fragment. A
// fragment is never transmitted in an HTTP request, so a shared link carries a
// user's sequence to whoever opens it while the server never sees it and
// nothing lands in an access log. That keeps the promise that nothing a user
// submits is retained, and makes it true by construction rather than by policy.

export type SharedView = "home" | "design" | "refine" | "help" | "method" | "citation";
export type SharedMode = "sequence" | "gene";
export type SharedApplication = "normal_editing" | "exon_skipping";

export interface SharedDesignInput {
  mode: SharedMode;
  adar: string;
  sequence?: string;
  position?: string;
  gene?: string;
  species?: string;
  upstreamIntron?: string;
  targetExon?: string;
  downstreamIntron?: string;
  exonNumber?: string;
  arrnaLength?: string;
}

export interface SharedState {
  view: SharedView;
  application?: SharedApplication;
  example?: string;
  input?: SharedDesignInput;
}

const VIEWS: SharedView[] = ["home", "design", "refine", "help", "method", "citation"];
const PREFIX = "#s=";

// Short keys keep a pasted coding sequence inside a link people can still paste
// into a message. Order is irrelevant; only the names are part of the format.
const KEYS: Record<string, string> = {
  view: "v", application: "a", example: "e", input: "i",
  mode: "m", adar: "d", sequence: "q", position: "p", gene: "g", species: "s",
  upstreamIntron: "u", targetExon: "x", downstreamIntron: "w",
  exonNumber: "n", arrnaLength: "L",
};
const LONG = Object.fromEntries(Object.entries(KEYS).map(([long, short]) => [short, long]));

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): string {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/")
    + "=".repeat((4 - (text.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function shorten(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(shorten);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined && item !== "")
        .map(([key, item]) => [KEYS[key] ?? key, shorten(item)]),
    );
  }
  return value;
}

function lengthen(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(lengthen);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .map(([key, item]) => [LONG[key] ?? key, lengthen(item)]),
    );
  }
  return value;
}

export function encodeState(state: SharedState): string {
  if (state.view === "home" && !state.example && !state.input) return "";
  return PREFIX + toBase64Url(JSON.stringify(shorten(state)));
}

export function decodeState(hash: string): SharedState | null {
  if (!hash.startsWith(PREFIX)) return null;
  try {
    const parsed = lengthen(JSON.parse(fromBase64Url(hash.slice(PREFIX.length))));
    if (!parsed || typeof parsed !== "object") return null;
    const state = parsed as SharedState;
    // A hand-edited or truncated link must land on a usable page rather than
    // render an undefined view.
    if (!VIEWS.includes(state.view)) return null;
    return state;
  } catch {
    return null;
  }
}
