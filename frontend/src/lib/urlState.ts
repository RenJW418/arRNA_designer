// Shareable links without server-side state.
//
// Everything needed to restore a view is encoded into the URL fragment. A
// fragment is never transmitted in an HTTP request, so a shared link carries a
// user's sequence to whoever opens it without putting the fragment in HTTP
// request URLs. Generating a design still submits the sequence to the API in
// its request body; fragment encoding does not establish a retention policy.

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
  windowStart?: string;
  windowEnd?: string;
  includeInternalBulge?: boolean;
  codingContext?: boolean;
  evaluateCoveredEse?: boolean;
  eseMismatchPositions?: string;
  transcriptAccession?: string;
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

// The three static pages are routed by path so they can be bookmarked, cited
// and opened directly. Home and design keep living in the `#s=` fragment, which
// the browser never sends to the server, so a shared sequence still never
// reaches a request URL or an access log. A static page carries no sequence, so
// its path is safe to put in a citation.
export type StaticView = "help" | "method" | "citation";

// The refinement module was removed; old refinement links still land on a
// usable page, so the app-level view never includes "refine".
export type View = Exclude<SharedView, "refine">;

const STATIC_PATHS: Record<string, StaticView> = {
  "/help": "help",
  "/citation": "citation",
  "/method": "method",
};

export function staticViewFromPath(pathname: string): StaticView | null {
  // A citation or bookmark may carry a trailing slash or any casing; both are
  // normalized so the link still opens the intended page. An empty path falls
  // back to "/" (home), which is not a static page.
  const normalized = pathname.replace(/\/+$/, "").toLowerCase() || "/";
  return STATIC_PATHS[normalized] ?? null;
}

// A static path must not drag a design out of the fragment: on /help,
// /method or /citation the fragment belongs to a different page, so it is
// ignored when initializing the design state. Everywhere else the `#s=`
// fragment is the single source of restorable state.
export function restoredStateFor(pathname: string, hash: string): SharedState | null {
  if (staticViewFromPath(pathname)) return null;
  return decodeState(hash);
}

export function pathForView(view: SharedView): string {
  return view === "help" || view === "method" || view === "citation" ? `/${view}` : "/";
}

// Paths win over the fragment: a static path opens its page even when a stale
// `#s=` fragment names a different view. Otherwise an old shared link's
// fragment restores the view, and anything unrecognized lands on home.
export function resolveView(pathname: string, hash: string): View {
  const staticView = staticViewFromPath(pathname);
  if (staticView) return staticView;
  const view = decodeState(hash)?.view;
  return !view || view === "refine" ? "home" : view;
}
