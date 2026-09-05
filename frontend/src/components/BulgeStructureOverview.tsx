import { LockKeyhole } from "lucide-react";
import {
  Bulge,
  createAbsoluteEffectZoneInterval,
  createBulgeOverviewGeometry,
  createEffectZoneOverviewGeometry,
  createQualitativeOverlapRuns,
} from "../lib/bulgeOptimization";
import { getBulgeFocusClass } from "../lib/guidedOptimization";
import { useLanguage } from "./LanguageProvider";

interface Props {
  bulges: Bulge[];
  windowStart: number;
  windowEnd: number;
  focusedBulgeId?: string | null;
  onClearFocus?: () => void;
}

function formatCoordinate(coordinate: number): string {
  if (coordinate === 0) return "A0";
  return coordinate > 0 ? `A+${coordinate}` : `A${coordinate}`;
}

export function BulgeStructureOverview({ bulges, windowStart, windowEnd, focusedBulgeId = null, onClearFocus }: Props) {
  const { l } = useLanguage();
  const width = 1000;
  const laneTop = 146;
  const laneHeight = 14;
  const laneGap = 7;
  const trackStart = 118;
  const trackEnd = 968;
  const trackWidth = trackEnd - trackStart;
  const targetY = 54;
  const guideY = 118;
  const windowLength = windowEnd - windowStart + 1;
  const zeroX = trackStart + ((0 - windowStart + 0.5) / windowLength) * trackWidth;
  const overlapRuns = createQualitativeOverlapRuns(bulges, windowStart, windowEnd);
  const laneCount = bulges.length + (overlapRuns.length > 0 ? 1 : 0);
  const height = Math.max(176, laneTop + laneCount * (laneHeight + laneGap) + 18);
  const edgeCoordinateY = height - 7;
  const focusedBulgeIndex = bulges.findIndex(({ id }) => id === focusedBulgeId);
  const focusedBulge = focusedBulgeIndex >= 0 ? bulges[focusedBulgeIndex] : null;

  return <figure className="bulge-structure-overview" aria-labelledby="bulge-overview-title">
    <figcaption>
      <div><strong id="bulge-overview-title">{l("Whole-arRNA structure overview")}</strong><span>{l("Structural positions update immediately after placement.")}</span></div>
      <div className="bulge-overview-legend"><span><i className="increase" />Core increase</span><span><i className="decrease" />Core decrease</span><span><i className="concordant" />Concordant overlap</span><span><i className="conflicting" />Conflicting overlap</span><span><i className="initial" />{l("Starting arRNA")}</span></div>
    </figcaption>
    {focusedBulge && <div className="bulge-overview-focus-banner" role="status">
      <span><b>{l("Focused effect range")}</b>{`B${focusedBulgeIndex + 1} · ${focusedBulge.type === "deletion" ? "Deletion" : "Mismatch"} ${focusedBulge.size} nt · ${formatCoordinate(focusedBulge.start)}–${formatCoordinate(focusedBulge.end)}`}</span>
      {onClearFocus && <button type="button" onClick={onClearFocus}>{l("Show all bulges")}</button>}
    </div>}
    <div className="bulge-overview-scroll">
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${bulges.length} bulge${bulges.length === 1 ? "" : "s"} across ${windowLength} aligned nucleotides`}>
      <defs>
        <pattern id="bulge-initial-pattern" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="8" height="8" fill="#f1e7cc" />
          <line x1="0" y1="0" x2="0" y2="8" stroke="#b58a40" strokeWidth="2" opacity=".34" />
        </pattern>
        <pattern id="bulge-concordant-pattern" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="6" height="6" fill="#f6e9bd" />
          <line x1="0" y1="0" x2="0" y2="6" stroke="#9d7626" strokeWidth="2" opacity=".55" />
        </pattern>
        <pattern id="bulge-conflicting-pattern" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="6" height="6" fill="#ebe2f0" />
          <line x1="0" y1="0" x2="0" y2="6" stroke="#765282" strokeWidth="2" opacity=".62" />
        </pattern>
      </defs>

      <text className="bulge-overview-strand-label target" x="12" y={targetY - 5}>Target RNA</text>
      <text className="bulge-overview-direction" x="12" y={targetY + 10}>5′ → 3′</text>
      <text className="bulge-overview-strand-label guide" x="12" y={guideY - 5}>arRNA</text>
      <text className="bulge-overview-direction" x="12" y={guideY + 10}>3′ → 5′</text>

      <line className="bulge-overview-target-line" x1={trackStart} y1={targetY} x2={trackEnd} y2={targetY} />
      <line className="bulge-overview-guide-line" x1={trackStart} y1={guideY} x2={trackEnd} y2={guideY} />
      {Array.from({ length: 16 }, (_, index) => {
        const x = trackStart + (index / 15) * trackWidth;
        return <line className="bulge-overview-pairing" x1={x} y1={targetY + 6} x2={x} y2={guideY - 6} key={index} />;
      })}

      {bulges.map((bulge) => {
        const geometry = createBulgeOverviewGeometry(bulge, windowStart, windowEnd);
        if (geometry.visibleSize === 0) return null;
        const x1 = trackStart + geometry.startFraction * trackWidth;
        const x2 = trackStart + geometry.endFraction * trackWidth;
        const centerX = trackStart + geometry.centerFraction * trackWidth;
        const visualWidth = Math.max(7, x2 - x1);
        const maskX = centerX - visualWidth / 2 - 2;
        const isPreview = bulge.id === "placement-preview";
        const sourceClass = bulge.source === "initial" ? "initial" : "user";
        const focusClass = getBulgeFocusClass(bulge.id, focusedBulgeId);
        const className = `bulge-overview-mark ${bulge.type} ${sourceClass} ${isPreview ? "preview" : ""} ${focusClass}`;
        const topArch = `M ${x1} ${targetY} Q ${centerX} 14 ${x2} ${targetY}`;
        const bottomArch = `M ${x1} ${guideY} Q ${centerX} 158 ${x2} ${guideY}`;
        return <g className={className} aria-label={`${bulge.type}, ${bulge.size} nt, ${formatCoordinate(bulge.start)} to ${formatCoordinate(bulge.end)}`} key={bulge.id}>
          <rect className="bulge-overview-mask" x={maskX} y={targetY - 5} width={visualWidth + 4} height="10" />
          <rect className="bulge-overview-mask" x={maskX} y={guideY - 5} width={visualWidth + 4} height="10" />
          <path className="bulge-overview-arch top" d={topArch} />
          {bulge.type === "mismatch"
            ? <path className="bulge-overview-arch bottom" d={bottomArch} />
            : null}
          {(visualWidth >= 48 || focusClass === "focused") && <text className="bulge-overview-mark-label" x={centerX} y={bulge.type === "mismatch" ? 89 : guideY + 4}>{bulge.type === "deletion" ? `Deletion ${bulge.size}` : `Mismatch ${bulge.size}`}</text>}
        </g>;
      })}

      <g className="bulge-overview-edit-site" aria-label="A-C editing mismatch at A0">
        <line className="bulge-overview-edit-connector" x1={zeroX} y1={targetY + 10} x2={zeroX} y2={guideY - 10} />
        <rect className="bulge-overview-base-background" x={zeroX - 10} y={targetY - 11} width="20" height="22" />
        <rect className="bulge-overview-base-background" x={zeroX - 10} y={guideY - 11} width="20" height="22" />
        <text className="bulge-overview-edit-base target" x={zeroX} y={targetY + 4}>A</text>
        <text className="bulge-overview-edit-base guide" x={zeroX} y={guideY + 4}>C</text>
      </g>

      {bulges.map((bulge, bulgeIndex) => {
        const y = laneTop + bulgeIndex * (laneHeight + laneGap);
        const isPreview = bulge.id === "placement-preview";
        const focusClass = getBulgeFocusClass(bulge.id, focusedBulgeId);
        return <g className={`bulge-overview-effect-lane ${isPreview ? "preview" : ""} ${focusClass}`} key={`${bulge.id}-lane`}>
          <text className="bulge-overview-lane-id" x="12" y={y + 10}>{`B${bulgeIndex + 1}`}</text>
          <text className="bulge-overview-lane-type" x="38" y={y + 10}>{`${bulge.type === "deletion" ? "Del" : "Mismatch"} ${bulge.size}`}</text>
          <rect className="bulge-overview-lane-background" x={trackStart} y={y} width={trackWidth} height={laneHeight} />
          {bulge.effectZones.map((zone, zoneIndex) => {
            const geometry = createEffectZoneOverviewGeometry(bulge, zone, windowStart, windowEnd);
            if (!geometry) return null;
            const x = trackStart + geometry.startFraction * trackWidth;
            const bandWidth = Math.max(4, geometry.widthFraction * trackWidth);
            return <g className={`bulge-overview-effect-zone ${zone.effect}`} key={`${bulge.id}-effect-${zoneIndex}`}>
              <rect x={x} y={y + 1} width={bandWidth} height={laneHeight - 2} />
              {bandWidth >= 38 && <text x={x + bandWidth / 2} y={y + 10}>{`B${bulgeIndex + 1}${zone.effect === "increase" ? "↑" : "↓"}`}</text>}
            </g>;
          })}
          {bulge.effectZones.length === 0 && <text className="bulge-overview-no-zone" x={trackStart + 8} y={y + 10}>No mapped core zone</text>}
        </g>;
      })}

      {overlapRuns.length > 0 && (() => {
        const y = laneTop + bulges.length * (laneHeight + laneGap);
        return <g className={`bulge-overview-overlap-lane ${focusedBulgeId ? "dimmed" : ""}`}>
          <text className="bulge-overview-lane-id overlap" x="12" y={y + 10}>Overlap</text>
          <rect className="bulge-overview-lane-background" x={trackStart} y={y} width={trackWidth} height={laneHeight} />
          {overlapRuns.map((run, index) => {
            const geometry = createBulgeOverviewGeometry(run, windowStart, windowEnd);
            const x = trackStart + geometry.startFraction * trackWidth;
            const runWidth = Math.max(4, geometry.widthFraction * trackWidth);
            const sourceLabel = run.effects.map(({ bulgeId, effect }) => {
              const sourceIndex = bulges.findIndex((bulge) => bulge.id === bulgeId);
              return `B${sourceIndex + 1}${effect === "increase" ? "↑" : "↓"}`;
            }).join("+");
            return <g className={`bulge-overview-overlap-zone ${run.kind}`} key={`${run.start}-${run.end}-${index}`}>
              <rect x={x} y={y + 1} width={runWidth} height={laneHeight - 2} />
              {runWidth >= 48 && <text x={x + runWidth / 2} y={y + 10}>{sourceLabel}</text>}
            </g>;
          })}
        </g>;
      })()}

      <text className="bulge-overview-edge-coordinate" x={trackStart} y={edgeCoordinateY}>{formatCoordinate(windowStart)}</text>
      <text className="bulge-overview-edge-coordinate end" x={trackEnd} y={edgeCoordinateY}>{formatCoordinate(windowEnd)}</text>
      {bulges.length === 0 && <text className="bulge-overview-empty" x={(trackStart + trackEnd) / 2} y="89">{l("No structural bulges in the selected starting arRNA")}</text>}
    </svg>
    </div>

    {bulges.length > 0 && <div className="bulge-overview-items">
      {bulges.map((bulge, bulgeIndex) => <div className={`${bulge.type} ${bulge.source} ${getBulgeFocusClass(bulge.id, focusedBulgeId)}`} key={bulge.id}>
        <i>{`B${bulgeIndex + 1}`}</i>
        <strong>{bulge.type === "deletion" ? "Deletion" : "Mismatch"} · {bulge.size} nt</strong>
        <span>{formatCoordinate(bulge.start)}–{formatCoordinate(bulge.end)}</span>
        <small>{bulge.id === "placement-preview" ? l("Placement preview") : bulge.source === "initial" ? <><LockKeyhole size={10} />{l("Starting arRNA")}</> : l("Added optimization")}</small>
        {bulge.effectZones.length > 0 && <div className="bulge-overview-effect-ranges">
          {bulge.effectZones.map((zone, index) => {
            const interval = createAbsoluteEffectZoneInterval(bulge, zone);
            return <span className={zone.effect} key={`${zone.effect}-${index}`}><b>{zone.effect === "increase" ? "↑" : "↓"}</b>{formatCoordinate(interval.start)}–{formatCoordinate(interval.end)}</span>;
          })}
        </div>}
      </div>)}
    </div>}
  </figure>;
}
