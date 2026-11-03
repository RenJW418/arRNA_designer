// Build-time metadata injected through Vite. A plain `npm run build`, a dev
// server, or a Node unit-test run has no VITE_APP_VERSION / VITE_APP_COMMIT in
// import.meta.env, so the footer falls back to "dev" and renders no commit
// link. The production Docker image passes the real version and the full
// commit hash through build args (see Dockerfile.production); only the first
// 7 characters are shown.

const FALLBACK = "dev";
const COMMIT_BASE_URL = "https://github.com/RenJW418/arRNA_designer/commit";
// A commit hash looks like a Git object id: 7 to 40 hex digits. Anything else
// ("unknown", "HEAD", "abc123-dirty", a value with spaces) must NOT become a
// link, otherwise the footer would point at a 404. The original value is still
// shown, just not rendered as a link.
const COMMIT_HASH_RE = /^[0-9a-f]{7,40}$/i;

export interface BuildInfo {
  version: string;
  commit: string;
  commitShort: string;
  commitUrl: string | null;
  versionLabel: string;
}

function cleanValue(value: unknown): string {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : "";
}

function formatVersionLabel(version: string): string {
  // The fallback "dev" stays bare. A numeric version such as "0.3.0" gets a
  // "v" prefix, and a value that already carries one (e.g. a tag name
  // "v0.3.0") is kept as is so it never turns into "vv0.3.0".
  if (version === FALLBACK) return version;
  return version.startsWith("v") ? version : `v${version}`;
}

export function resolveBuildInfo(rawVersion: unknown, rawCommit: unknown): BuildInfo {
  const version = cleanValue(rawVersion) || FALLBACK;
  const commit = cleanValue(rawCommit) || FALLBACK;
  const commitShort = commit.slice(0, 7);
  const commitUrl = COMMIT_HASH_RE.test(commit) ? `${COMMIT_BASE_URL}/${commit}` : null;
  return {
    version,
    commit,
    commitShort,
    commitUrl,
    versionLabel: formatVersionLabel(version),
  };
}

const info = resolveBuildInfo(
  import.meta.env?.VITE_APP_VERSION,
  import.meta.env?.VITE_APP_COMMIT,
);

export const BUILD_VERSION: string = info.versionLabel;
export const BUILD_VERSION_PLAIN: string = info.version;
export const BUILD_COMMIT: string = info.commit;
export const BUILD_COMMIT_SHORT: string = info.commitShort;
export const COMMIT_URL: string | null = info.commitUrl;
