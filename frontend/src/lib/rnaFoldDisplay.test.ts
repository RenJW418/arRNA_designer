import assert from "node:assert/strict";
import test from "node:test";
import { orientThumbnailCoordinates } from "./rnaFoldDisplay.ts";

test("a tall fold uses the thumbnail width without changing nucleotide order or distances", () => {
  const coordinates = [{ x: 0, y: 0 }, { x: 0, y: 10 }, { x: 0, y: 20 }];
  const oriented = orientThumbnailCoordinates(coordinates);
  oriented.forEach((point, i) => {
    assert.ok(Math.abs(point.x - [-10, 0, 10][i]) < 1e-8);
    assert.ok(Math.abs(point.y) < 1e-8);
  });
  assert.deepEqual(coordinates, [{ x: 0, y: 0 }, { x: 0, y: 10 }, { x: 0, y: 20 }]);
  const bent = orientThumbnailCoordinates([{ x: 0, y: 0 }, { x: 0, y: 10 }, { x: 4, y: 10 }]);
  const distance = (i: number, j: number) => Math.hypot(bent[i].x - bent[j].x, bent[i].y - bent[j].y);
  assert.ok(Math.abs(distance(0, 1) - 10) < 1e-8);
  assert.ok(Math.abs(distance(1, 2) - 4) < 1e-8);
  assert.ok(Math.abs(distance(0, 2) - Math.sqrt(116)) < 1e-8);
});
