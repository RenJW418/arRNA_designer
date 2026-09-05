import assert from "node:assert/strict";
import test from "node:test";
import { resolveApiDocsUrl } from "./apiNavigation.ts";

test("uses an explicit API documentation URL when configured", () => {
  assert.equal(
    resolveApiDocsUrl("https://api.example.org/reference", "/api/v1"),
    "https://api.example.org/reference",
  );
});

test("derives API documentation from an absolute API base URL", () => {
  assert.equal(
    resolveApiDocsUrl(undefined, "https://api.example.org/api/v1"),
    "https://api.example.org/docs",
  );
});

test("uses the same-origin documentation route for a relative API base", () => {
  assert.equal(resolveApiDocsUrl(undefined, "/api/v1"), "/docs");
});
