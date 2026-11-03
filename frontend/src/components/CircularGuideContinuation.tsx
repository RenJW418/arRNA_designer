/** Close the schematic guide below its paired segment. The caller draws the
 * upper backbone, including any guide-side loops; this return path joins both
 * ends smoothly without adding a straight segment across those loops. */
export function CircularGuideContinuation({ left, right, y, depth = 32 }: { left: number; right: number; y: number; depth?: number }) {
  const bottom = y + depth;
  const turn = 24;
  return <g className="normal-schematic-circular-guide" aria-hidden="true" data-topology="circular"
    data-left={left} data-right={right} data-guide-y={y} data-bottom-y={bottom}>
    <path className="normal-schematic-guide-line"
      d={`M ${right} ${y} C ${right + turn} ${y} ${right + turn} ${bottom} ${right} ${bottom} H ${left} C ${left - turn} ${bottom} ${left - turn} ${y} ${left} ${y}`} />
  </g>;
}
