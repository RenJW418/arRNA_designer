interface Props {
  x: number;
  targetY: number;
  guideY: number;
  position?: number;
  relative?: number;
}

/** The protocol's paired-base convention: one short stroke from each strand,
 * with a clear central gap. These marks do not encode individual H bonds. */
export function DuplexPairingStalks({ x, targetY, guideY, position, relative }: Props) {
  const spacing = guideY - targetY;
  const middle = (targetY + guideY) / 2;
  const halfGap = spacing * .075;
  return <>
    <line className="normal-schematic-pair normal-schematic-pair-target" data-strand="target" data-position={position} data-relative={relative}
      x1={x} x2={x} y1={targetY} y2={middle - halfGap} />
    <line className="normal-schematic-pair normal-schematic-pair-guide" data-strand="guide" data-position={position} data-relative={relative}
      x1={x} x2={x} y1={middle + halfGap} y2={guideY} />
  </>;
}
