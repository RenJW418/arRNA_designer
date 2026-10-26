import assert from "node:assert/strict";
import test from "node:test";
import { resolveBuildInfo } from "./buildInfo.ts";

const FULL_HASH = "0123456789abcdef0123456789abcdef01234567";

test("resolveBuildInfo falls back to dev and renders no commit link without build arguments", () => {
  const info = resolveBuildInfo(undefined, undefined);
  assert.equal(info.version, "dev");
  assert.equal(info.versionLabel, "dev");
  assert.equal(info.commit, "dev");
  assert.equal(info.commitShort, "dev");
  assert.equal(info.commitUrl, null);
});

test("resolveBuildInfo resolves a provided version and full commit hash", () => {
  const info = resolveBuildInfo("0.3.0", FULL_HASH);
  assert.equal(info.version, "0.3.0");
  assert.equal(info.versionLabel, "v0.3.0");
  assert.equal(info.commit, FULL_HASH);
  assert.equal(info.commitShort, "0123456");
  assert.equal(
    info.commitUrl,
    `https://github.com/RenJW418/arRNA_designer/commit/${FULL_HASH}`,
  );
});

test("resolveBuildInfo keeps an existing v prefix instead of doubling it", () => {
  assert.equal(resolveBuildInfo("v0.3.0", FULL_HASH).versionLabel, "v0.3.0");
});

test("resolveBuildInfo does not render a commit link for unknown", () => {
  assert.equal(resolveBuildInfo("0.3.0", "unknown").commitUrl, null);
});

test("resolveBuildInfo does not render a commit link for HEAD", () => {
  assert.equal(resolveBuildInfo("0.3.0", "HEAD").commitUrl, null);
});

test("resolveBuildInfo does not render a commit link for a dirty short hash", () => {
  assert.equal(resolveBuildInfo("0.3.0", "abc123-dirty").commitUrl, null);
});

test("empty and whitespace commit values still render no link", () => {
  assert.deepEqual(resolveBuildInfo(" 0.3.0 ", "   "), {
    version: "0.3.0",
    versionLabel: "v0.3.0",
    commit: "dev",
    commitShort: "dev",
    commitUrl: null,
  });
});

test("an explicit fallback commit value still renders no link", () => {
  assert.equal(resolveBuildInfo("0.3.0", "dev").commitUrl, null);
});
