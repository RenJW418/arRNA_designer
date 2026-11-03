/** Protocol Figure 1A: median pair pitch / strand separation = 0.5298 / 1.992.
 * This controls schematic density, not individual hydrogen-bond counts. */
export const PAIRING_PITCH_RATIO = 0.266;

/** Select actual paired nucleotide positions at approximately the protocol
 * pitch. Choosing the nearest position avoids the sparse result of rounding
 * every interval upwards, and uses final display coordinates after any bulge
 * compression. No intermediate nucleotide positions are introduced. */
export function samplePairingPositions(
  first: number,
  last: number,
  xForPosition: (position: number) => number,
  strandGap: number,
  isPaired: (position: number) => boolean = () => true,
): number[] {
  if (!Number.isInteger(first) || !Number.isInteger(last) || first > last
    || !Number.isFinite(strandGap) || strandGap <= 0) return [];
  const candidates: { position: number; x: number }[] = [];
  for (let position = first; position <= last; position++) {
    if (!isPaired(position)) continue;
    const x = xForPosition(position);
    if (Number.isFinite(x)) candidates.push({ position, x });
  }
  const pitch = strandGap * PAIRING_PITCH_RATIO;
  const positions: number[] = [];
  let current = 0;
  while (current < candidates.length) {
    positions.push(candidates[current].position);
    const targetX = candidates[current].x + pitch;
    let next = current + 1;
    while (next + 1 < candidates.length
      && Math.abs(candidates[next + 1].x - targetX) < Math.abs(candidates[next].x - targetX)) next++;
    current = next;
  }
  return positions;
}
