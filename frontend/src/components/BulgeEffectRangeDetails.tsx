import type { AdarEnvironment } from "../lib/normalEditing";
import type { BulgeCandidate } from "../lib/bulgeOptimization";
import { useLanguage } from "./LanguageProvider";

interface Props {
  candidate: BulgeCandidate;
  environment: AdarEnvironment;
  onClose: () => void;
  showClose?: boolean;
}

function formatRelativeCoordinate(coordinate: number): string {
  if (coordinate === 0) return "A0";
  return coordinate > 0 ? `A+${coordinate}` : `A${coordinate}`;
}

export function BulgeEffectRangeDetails({ candidate, environment, onClose, showClose = true }: Props) {
  const { l } = useLanguage();
  const axisStart = Math.min(-50, ...candidate.effectZones.map(({ minDistance }) => minDistance));
  const axisEnd = Math.max(50, ...candidate.effectZones.map(({ maxDistance }) => maxDistance));
  const axisLength = axisEnd - axisStart + 1;
  const trackStart = 72;
  const trackEnd = 580;
  const trackWidth = trackEnd - trackStart;
  const zeroX = trackStart + ((0 - axisStart + 0.5) / axisLength) * trackWidth;

  return <section className="bulge-effect-range-details" aria-label={`${environment} ${candidate.label} core effect range`}>
    <header>
      <div><strong>{environment} · {candidate.size} nt {candidate.type}</strong><span>{l("Relative to source anchor")}</span></div>
      {showClose && <button type="button" onClick={onClose} aria-label={l("Hide effect range")}>×</button>}
    </header>
    {candidate.effectZones.length === 0
      ? <p>{l("No core strong-effect zone is mapped for this candidate.")}</p>
      : <>
        <svg viewBox="0 0 600 104" role="img" aria-label={`Core increase and decrease ranges from ${formatRelativeCoordinate(axisStart)} to ${formatRelativeCoordinate(axisEnd)}`}>
          <text className="range-axis-label increase" x="4" y="31">Increase ↑</text>
          <text className="range-axis-label decrease" x="4" y="67">Decrease ↓</text>
          <line className="range-axis" x1={trackStart} y1="27" x2={trackEnd} y2="27" />
          <line className="range-axis" x1={trackStart} y1="63" x2={trackEnd} y2="63" />
          <line className="range-zero" x1={zeroX} y1="9" x2={zeroX} y2="82" />
          <text className="range-zero-label" x={zeroX} y="94">source anchor</text>
          {candidate.effectZones.map((zone, index) => {
            const x = trackStart + ((zone.minDistance - axisStart) / axisLength) * trackWidth;
            const width = Math.max(4, ((zone.maxDistance - zone.minDistance + 1) / axisLength) * trackWidth);
            const y = zone.effect === "increase" ? 18 : 54;
            return <g className={`range-zone ${zone.effect}`} key={`${zone.effect}-${zone.minDistance}-${index}`}>
              <rect x={x} y={y} width={width} height="18" />
              {width >= 50 && <text x={x + width / 2} y={y + 12}>{formatRelativeCoordinate(zone.minDistance)}–{formatRelativeCoordinate(zone.maxDistance)}</text>}
            </g>;
          })}
          <text className="range-edge-label" x={trackStart} y="94">{formatRelativeCoordinate(axisStart)}</text>
          <text className="range-edge-label end" x={trackEnd} y="94">{formatRelativeCoordinate(axisEnd)}</text>
        </svg>
        <div className="bulge-effect-range-list">
          {candidate.effectZones.map((zone, index) => <span className={zone.effect} key={`${zone.effect}-list-${index}`}><b>{zone.effect === "increase" ? "↑" : "↓"}</b>{formatRelativeCoordinate(zone.minDistance)}–{formatRelativeCoordinate(zone.maxDistance)}</span>)}
        </div>
        {candidate.size > 1 && <p>{l("Source coordinate anchor is pending confirmation for multi-nucleotide bulges.")}</p>}
      </>}
  </section>;
}
