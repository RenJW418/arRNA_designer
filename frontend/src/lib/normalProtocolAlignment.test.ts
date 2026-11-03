import assert from 'node:assert/strict';
import test from 'node:test';
import { designInitialArrna, designNormalArrnaVariants, selectDefaultNormalVariant, validateAdarPairing } from './normalEditing.ts';

test('normal helper accepts protocol target-axis coverage rather than the reverse strand', () => {
  const design = designInitialArrna('CCCCA'+'C'.repeat(25),5)!;
  assert.equal(validateAdarPairing(design,'ADAR1').valid,true);
  const insufficient = designInitialArrna('C'.repeat(20)+'A'+'C'.repeat(6),21)!;
  assert.equal(validateAdarPairing(insufficient,'ADAR1').valid,false);
  assert.deepEqual(designNormalArrnaVariants(insufficient),[]);
});
test('normal helper generates shorter legal external designs and preserves ten nt flank', () => {
  const design = designInitialArrna('C'.repeat(68)+'A'+'C'.repeat(54),69)!;
  assert.equal(designNormalArrnaVariants(design, false).length,4);
  const shorter = designInitialArrna('C'.repeat(67)+'A'+'C'.repeat(52),68)!;
  assert.equal(designNormalArrnaVariants(shorter, false).length,1);
});
test('default selection shows the three-bulge design only when all three bulges fit', () => {
  for (const [upstream, downstream, expectedId, expectedLength] of [
    [75, 75, 'dual-deletion-internal-del1', 112],
    [30, 75, 'baseline', 106],
    [75, 30, 'baseline', 106],
    [30, 30, 'baseline', 61],
  ] as const) {
    const design = designInitialArrna('C'.repeat(upstream) + 'A' + 'C'.repeat(downstream), upstream + 1)!;
    const variants = designNormalArrnaVariants(design);
    const selected = selectDefaultNormalVariant(variants)!;
    assert.equal(selected.id, expectedId);
    assert.equal(selected.arrnaSequence.length, expectedLength);
    assert.equal(selected.alignedGuide[upstream], 'C');
    assert.equal(selected.alignedGuide[upstream + 4], expectedId === 'baseline' ? 'G' : '-');
    const control = selectDefaultNormalVariant(variants, false)!;
    assert.ok(!control.deletionCoordinates.includes(4));
  }
});
test('normal helper supports shifted windows and the optional +4 internal deletion', () => {
  const design = designInitialArrna('C'.repeat(120)+'A'+'C'.repeat(122),121,75,{windowStartRelative:-30,windowEndRelative:100})!;
  assert.equal(design.targetWindow.length,131);
  assert.equal(design.windowStart,91);
  const full=designInitialArrna('C'.repeat(75)+'A'+'C'.repeat(77),76)!;
  const precise=designNormalArrnaVariants(full,true).find(v=>v.id==='dual-deletion-internal-del1')!;
  assert.equal(precise.arrnaSequence.length,112);
  assert.equal(precise.alignedGuide[79],'-');
  assert.equal(precise.alignedGuide[75],'C');
});

test('general RNA adenosines are classified without invented codon consequences', async () => {
  const {classifyEditingSites}=await import('./normalEditing.ts');
  const sites=classifyEditingSites('CCAGA',false);
  assert.equal(sites.length,2);
  assert.deepEqual(sites.map(s=>s.position),[3,5]);
  assert.ok(sites.every(s=>s.category==='rna' && s.codon==='' && s.aminoAcid===''));
});
