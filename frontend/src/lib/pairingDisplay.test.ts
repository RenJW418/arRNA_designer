import assert from "node:assert/strict";
import test from "node:test";
import { PAIRING_PITCH_RATIO, samplePairingPositions } from "./pairingDisplay.ts";

test("a 151-nt window shows every actual paired base at the protocol density", () => {
  const positions = samplePairingPositions(1, 151, position => (position - 1) * 860 / 150, 24,
    position => position !== 76);
  assert.equal(positions.length, 150);
  assert.deepEqual(positions, Array.from({ length: 151 }, (_, index) => index + 1).filter(position => position !== 76));
});

test("long sequences retain integer positions without an overcrowded drawing", () => {
  const step = 860 / 9999;
  const positions = samplePairingPositions(1, 10000, position => (position - 1) * step, 24);
  assert.ok(positions.length > 120 && positions.length < 160);
  assert.equal(positions[0], 1);
  assert.equal(positions.at(-1), 10000);
  assert.ok(positions.every(Number.isInteger));
  for (let index = 1; index < positions.length - 1; index++) {
    const displayedPitch = (positions[index] - positions[index - 1]) * step;
    assert.ok(Math.abs(displayedPitch - 24 * PAIRING_PITCH_RATIO) <= step / 2 + 1e-8);
  }
});

test("sampling uses the final coordinates on both differently scaled arms", () => {
  const x = (position: number) => position <= 80 ? position * 4 : 320 + (position - 80) * 1.8;
  const positions = samplePairingPositions(1, 160, x, 24);
  for (let index = 1; index < positions.length - 1; index++) {
    const previous = positions[index - 1], current = positions[index];
    if (current <= 80) assert.ok(Math.abs(x(current) - x(previous) - 8) < 1e-8);
    else if (previous > 80) assert.ok(Math.abs(x(current) - x(previous) - 7.2) < 1e-8);
  }
});

test("A0, unpaired regions and outside-window bases never become pairing marks", () => {
  const isPaired = (position: number) => position !== 76 && !(position >= 90 && position <= 110);
  const positions = samplePairingPositions(60, 130, position => position * 2, 28, isPaired);
  assert.ok(positions.length > 0);
  assert.ok(positions.every(position => Number.isInteger(position) && position >= 60 && position <= 130 && isPaired(position)));
  assert.ok(positions.some(position => position < 90) && positions.some(position => position > 110));
});

test("short, single-base and completely unpaired windows do not invent marks", () => {
  assert.deepEqual(samplePairingPositions(1, 3, position => position * 200, 24), [1, 2, 3]);
  assert.deepEqual(samplePairingPositions(7, 7, () => 400, 28), [7]);
  assert.deepEqual(samplePairingPositions(7, 7, () => 400, 28, () => false), []);
  assert.deepEqual(samplePairingPositions(1, 0, () => 400, 28), []);
});
