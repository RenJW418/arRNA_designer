import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { createTestedDuplex } from './testedDuplex.ts';

function fixture(name: string) {
  const url = new URL(`../../public/examples/${name}.json`, import.meta.url);
  assert.ok(existsSync(url), `Downloadable ${name} example must exist`);
  return JSON.parse(readFileSync(url, 'utf8'));
}

test('downloadable PiZZ output preserves request and selected default architecture', () => {
  const input = fixture('normal-input');
  const output = fixture('normal-output');
  assert.equal(input.sequence[input.target_position - 1], 'A');
  assert.equal(output.normalized_input.sequence, input.sequence);
  assert.equal(output.candidates.length, 4);
  assert.equal(output.candidates.find((c: {id:string}) => c.id === 'dual-deletion').arrna_sequence.length, 113);
});

test('downloadable synthetic exon output includes additional mismatches and full ESE evidence', () => {
  const input = fixture('exon-input');
  const output = fixture('exon-output');
  assert.equal(output.normalized_input.exon, input.exon);
  assert.deepEqual(output.design_settings.ese_mismatch_positions, [2]);
  assert.equal(output.candidates.length, 2);
  assert.ok(output.ese_hits.length > 0);
  assert.deepEqual(output.candidates.find((c: {kind:string}) => c.kind === 'ese').mismatch_exon_positions, [2]);
});

test('standalone refinement tutorial is a valid complete two-A baseline and marks percentages illustrative', () => {
  const input = fixture('refinement-input');
  const duplex = createTestedDuplex(input);
  assert.equal(duplex.initialBulges.length, 0);
  assert.equal(duplex.arrnaSequence.length, 151);
  assert.equal(input.targetSequence.match(/A/g).length, 2);
  assert.equal(input.measurement_kind, 'illustrative_not_experimental');
  assert.deepEqual(input.illustrative_measurements, {76: 42});
  assert.equal(input.source, 'external');
});
