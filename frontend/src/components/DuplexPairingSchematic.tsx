import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { EditingSite, InitialArrnaDesign, NormalArrnaVariant } from "../lib/normalEditing";
import type { SequenceFeature } from "../lib/sequenceAnalysis";
import { useLanguage } from "./LanguageProvider";
import "../pairing-overview.css";

/** Display data only. Validation and sequence construction remain with callers. */
export interface PairingStructure {
  id: string;
  type: "deletion" | "insertion" | "mismatch";
  start: number;
  end: number;
  size: number;
}

interface DeletionSegment {
  start: number;
  end: number;
}

export interface DuplexPairingSchematicProps {
  design: InitialArrnaDesign;
  sites: EditingSite[];
  variant: Pick<NormalArrnaVariant, "shortLabel" | "alignedGuide" | "deletionCoordinates">;
  structures?: PairingStructure[];
  windowSelection?: {
    /** Absolute, 1-based inclusive coordinates in the complete input sequence. */
    start: number;
    end: number;
    onChange: (start: number, end: number) => void;
    onEdit?: () => void;
    features?: SequenceFeature[];
  };
}

function groupDeletionCoordinates(coordinates: number[]): DeletionSegment[] {
  const sorted = [...coordinates].sort((left, right) => left - right);
  return sorted.reduce<DeletionSegment[]>((segments, coordinate) => {
    const last = segments.at(-1);
    if (!last || coordinate > last.end + 1) {
      segments.push({ start: coordinate, end: coordinate });
    } else {
      last.end = coordinate;
    }
    return segments;
  }, []);
}

function loopGeometry(startX: number, endX: number, baselineY: number, size: number, internal: boolean, direction: -1 | 1) {
  const centerX = (startX + endX) / 2;
  const radiusX = internal ? (endX - startX) / 2 : size === 1 ? 8 : Math.min(34, 14 + Math.sqrt(size) * 3.7);
  const height = internal ? Math.min(25, 8 + Math.sqrt(size) * 4) : size === 1 ? 16 : Math.min(60, 22 + Math.sqrt(size) * 7);
  const neck = Math.min(6, (endX - startX) / 4);
  const y = (offset: number) => baselineY + direction * offset;
  type Point = { x: number; y: number };
  const points: Point[] = internal ? [
    { x: startX, y: baselineY },
    { x: startX + radiusX * .45, y: baselineY }, { x: startX, y: y(height) }, { x: centerX, y: y(height) },
    { x: endX, y: y(height) }, { x: endX - radiusX * .45, y: baselineY }, { x: endX, y: baselineY },
  ] : [
    { x: startX, y: baselineY },
    { x: startX + neck, y: baselineY }, { x: centerX - radiusX, y: y(6) }, { x: centerX - radiusX, y: y(height / 2) },
    { x: centerX - radiusX, y: y(height * 1.15) }, { x: centerX + radiusX, y: y(height * 1.15) }, { x: centerX + radiusX, y: y(height / 2) },
    { x: centerX + radiusX, y: y(6) }, { x: endX - neck, y: baselineY }, { x: endX, y: baselineY },
  ];
  const offsets = Array.from({ length: (points.length - 1) / 3 }, (_, i) => i * 3);
  const commands = offsets.map(offset => `C ${points.slice(offset + 1, offset + 4).map(point => `${point.x} ${point.y}`).join(" ")}`).join(" ");
  // Place markers in sequence order along the drawn curve, not along its x axis.
  const samples = [{ ...points[0], distance: 0 }];
  for (const offset of offsets) {
    for (let sample = 1; sample <= 24; sample++) {
      const t = sample / 24;
      const u = 1 - t;
      const coordinate = (axis: "x" | "y") => u ** 3 * points[offset][axis] + 3 * u * u * t * points[offset + 1][axis] + 3 * u * t * t * points[offset + 2][axis] + t ** 3 * points[offset + 3][axis];
      const x = coordinate("x");
      const pointY = coordinate("y");
      const previous = samples[samples.length - 1];
      samples.push({ x, y: pointY, distance: previous.distance + Math.hypot(x - previous.x, pointY - previous.y) });
    }
  }
  const pointAt = (fraction: number) => {
    const distance = Math.max(0, Math.min(1, fraction)) * samples[samples.length - 1].distance;
    const nextIndex = Math.max(1, samples.findIndex(sample => sample.distance >= distance));
    const previous = samples[nextIndex - 1];
    const next = samples[nextIndex];
    const t = (distance - previous.distance) / Math.max(next.distance - previous.distance, .001);
    return { x: previous.x + (next.x - previous.x) * t, y: previous.y + (next.y - previous.y) * t };
  };
  return { centerX, radiusX, height, commands, curve: `M ${startX} ${baselineY} ${commands}`, pointAt };
}

export function DuplexPairingSchematic(props: DuplexPairingSchematicProps) {
  return props.windowSelection ? <InteractiveDuplexWindow {...props} selection={props.windowSelection} /> : <ResultDuplexPairingSchematic {...props} />;
}

function ResultDuplexPairingSchematic({ design, sites, variant, structures }: DuplexPairingSchematicProps) {
  const { l, language } = useLanguage();
  const diagramId = useId();
  const left = 96;
  const right = 956;
  const suppliedFeatures: PairingStructure[] = structures ?? groupDeletionCoordinates(variant.deletionCoordinates).map((segment) => ({
    ...segment, id: `${segment.start}:${segment.end}`, type: "deletion", size: segment.end - segment.start + 1,
  }));
  // Invalid drafts retain their editor error, but must not distort the preview.
  const features = suppliedFeatures.filter(feature => Number.isInteger(feature.start) && Number.isInteger(feature.end)
    && Number.isInteger(feature.size) && feature.size > 0 && feature.start + design.targetIndex >= 0
    && feature.end + design.targetIndex < design.targetWindow.length && feature.end >= feature.start
    && (feature.type === "insertion" ? feature.end === feature.start : feature.end - feature.start + 1 === feature.size));
  // Reserve the same space above A0 for every candidate, including the baseline.
  const targetY = 108;
  const guideY = targetY + 24;
  const windowLength = design.targetWindow.length;
  const relativeLabel = (coordinate: number) => coordinate < 0 ? `A−${Math.abs(coordinate)}` : coordinate > 0 ? `A+${coordinate}` : "A0";
  const unpairedCoordinates = new Set(features.filter(feature => feature.type !== "insertion").flatMap(feature =>
    Array.from({ length: feature.end - feature.start + 1 }, (_, i) => feature.start + i)));
  const visibleSites = sites.filter(site => site.position >= design.windowStart && site.position <= design.windowEnd);
  const generalRna = sites.some(site => site.category === "rna");
  const targetGuideBase = variant.alignedGuide[design.targetIndex];
  const badgeWidth = 94;
  const badgeGap = 10;
  // Compress only the displayed unpaired regions; retain their source coordinates.
  const spans = [...features].sort((a, b) => a.start - b.start).map(feature => {
    const boundary = Math.max(0, Math.min(windowLength - 1, design.targetIndex + feature.start - .5));
    return { id: feature.id, type: feature.type, start: feature.start, end: feature.end, size: feature.size, count: feature.size,
      startIndex: boundary,
      endIndex: feature.type === "insertion" ? boundary : Math.min(windowLength - 1, design.targetIndex + feature.end + .5),
      displayWidth: feature.type === "mismatch" ? Math.min(54, 16 + feature.size * 4) : feature.size === 1 ? 10 : feature.size <= 10 ? 24 : 32,
    };
  });
  const pairedSpan = windowLength - 1 - spans.reduce((total, span) => total + span.endIndex - span.startIndex, 0);
  const step = (right - left - spans.reduce((total, span) => total + span.displayWidth, 0)) / Math.max(pairedSpan, 1);
  const compressedXForIndex = (index: number, afterInsertion = true) => {
    let x = left + index * step;
    for (const span of spans) {
      const length = span.endIndex - span.startIndex;
      if (span.type === "insertion") { if (index > span.startIndex || (afterInsertion && index === span.startIndex)) x += span.displayWidth; }
      else {
        const covered = Math.max(0, Math.min(length, index - span.startIndex));
        x += covered * (span.displayWidth / Math.max(length, .001) - step);
      }
    }
    return x;
  };
  // A0 belongs to the target window, not the shortened guide. Anchor it at its
  // uncompressed window position and fit the two compressed arms independently.
  const targetX = windowLength > 1
    ? left + design.targetIndex / (windowLength - 1) * (right - left)
    : (left + right) / 2;
  const compressedTargetX = compressedXForIndex(design.targetIndex);
  const xForIndex = (index: number, afterInsertion = true) => {
    if (index === design.targetIndex) return targetX;
    const x = compressedXForIndex(index, afterInsertion);
    return index < design.targetIndex
      ? left + (x - left) / Math.max(compressedTargetX - left, .001) * (targetX - left)
      : targetX + (x - compressedTargetX) / Math.max(right - compressedTargetX, .001) * (right - targetX);
  };
  const xForRelative = (coordinate: number) => xForIndex(design.targetIndex + coordinate);
  const pairStride = Math.max(1, Math.ceil(10 / step));
  const bulges = spans.map(span => {
    const startX = xForIndex(span.startIndex, span.type !== "insertion");
    const endX = xForIndex(span.endIndex, span.type === "insertion");
    const centerX = (startX + endX) / 2;
    const upper = span.type === "insertion" ? null : loopGeometry(startX, endX, targetY, span.size, span.type === "mismatch", -1);
    const lower = span.type === "deletion" ? null : loopGeometry(startX, endX, guideY, span.size, span.type === "mismatch", 1);
    return { ...span, startX, endX, centerX, upper, lower,
      radiusX: (upper ?? lower)!.radiusX,
      labelX: Math.max(left + badgeWidth / 2, Math.min(right - badgeWidth / 2, centerX)),
    };
  });
  for (let i = 1; i < bulges.length; i++) bulges[i].labelX = Math.max(bulges[i].labelX, bulges[i - 1].labelX + badgeWidth + badgeGap);
  if (bulges.length) {
    bulges[bulges.length - 1].labelX = Math.min(bulges[bulges.length - 1].labelX, right - badgeWidth / 2);
    for (let i = bulges.length - 2; i >= 0; i--) bulges[i].labelX = Math.min(bulges[i].labelX, bulges[i + 1].labelX - badgeWidth - badgeGap);
  }
  const strandPath = (strand: "upper" | "lower", y: number) => {
    let path = `M ${left} ${y}`;
    for (const bulge of bulges) if (bulge[strand]) path += ` L ${bulge.startX} ${y} ${bulge[strand]!.commands}`;
    return `${path} L ${right} ${y}`;
  };
  const targetPath = strandPath("upper", targetY);
  const guidePath = strandPath("lower", guideY);
  const lowerHeight = Math.max(0, ...bulges.map(bulge => bulge.lower?.height ?? 0));
  const coordinateY = guideY + (lowerHeight ? lowerHeight + 14 : 26);
  const lowerLabelY = guideY + lowerHeight + 18;
  const viewHeight = Math.max(coordinateY + 12, guideY + lowerHeight + 10, features.some(feature => feature.type === "insertion") ? lowerLabelY + 30 : 0);
  const pointForSite = (relative: number) => {
    const bulge = bulges.find(({ start, end, upper }) => upper && relative >= start && relative <= end);
    return bulge?.upper?.pointAt((relative - bulge.start + .5) / bulge.count) ?? { x: xForRelative(relative), y: targetY };
  };
  const detail = (bulge: typeof bulges[number]) => bulge.type === "insertion"
    ? `${bulge.count} ${language === "en" ? "nt inserted" : "nt 插入"} · ${language === "en" ? "before" : "位于之前"} ${relativeLabel(bulge.start)}`
    : `${bulge.count} ${bulge.type === "deletion" ? l("nt deleted") : language === "en" ? "nt internal loop" : "nt 内部环"} · ${relativeLabel(bulge.start)}…${relativeLabel(bulge.end)}`;

  return <section className="normal-pairing-schematic" aria-label={`${variant.shortLabel} target and arRNA overview`}>
    <div className="normal-schematic-scroll">
      <svg viewBox={`0 0 1000 ${viewHeight}`} data-left={left} data-right={right} data-target-y={targetY} data-guide-y={guideY} role="img" aria-labelledby={`${diagramId}-title`} aria-describedby={`${diagramId}-description`}>
        <title id={`${diagramId}-title`}>{l("Target and arRNA pairing schematic")}</title>
        <desc id={`${diagramId}-description`}>{language === "zh-CN"
          ? "双链配对示意图，不按比例绘制。上方为靶 RNA，下方为反向平行的 arRNA。金色环表示未配对的靶区段，绿色环表示 arRNA 插入，紫色表示两条链的内部环。圆点按序列顺序分布。"
          : "Pairing schematic, not to scale. Target RNA is above the antiparallel arRNA. Gold loops show unpaired target regions; green loops show arRNA insertions; purple shows an internal loop on both strands. A-site dots follow sequence order around each loop."}</desc>

        <path className="normal-schematic-target-line" d={targetPath} />
        <path className="normal-schematic-guide-line" d={guidePath} />
        {bulges.map(bulge => <g className="normal-schematic-bulge" data-type={bulge.type} data-start={bulge.start} data-end={bulge.end} data-count={bulge.count} data-start-x={bulge.startX} data-end-x={bulge.endX} data-center-x={bulge.centerX} data-radius-x={bulge.radiusX} key={bulge.id}>
          <title>{detail(bulge)}</title>
          {bulge.upper && <path data-strand="target" className={`normal-schematic-bulge-arc ${bulge.type}`} d={bulge.upper.curve} />}
          {bulge.lower && <path data-strand="guide" className={`normal-schematic-bulge-arc ${bulge.type}`} d={bulge.lower.curve} />}
        </g>)}

        <text className="normal-schematic-strand-label target" x="12" y={targetY + 4}>{l("Target")}</text>
        <text className="normal-schematic-strand-label guide" x="12" y={guideY + 4}>arRNA</text>
        <text className="normal-schematic-direction" x={left - 14} y={targetY + 4} textAnchor="end">5′</text>
        <text className="normal-schematic-direction" x={right + 14} y={targetY + 4}>3′</text>
        <text className="normal-schematic-direction guide" x={left - 14} y={guideY + 4} textAnchor="end">3′</text>
        <text className="normal-schematic-direction guide" x={right + 14} y={guideY + 4}>5′</text>

        {Array.from({ length: Math.floor((windowLength - 1) / pairStride) + 1 }, (_, index) => index * pairStride).map((index) => {
          const relative = index - design.targetIndex;
          if (unpairedCoordinates.has(relative) || relative === 0) return null;
          const x = xForIndex(index);
          return <line className="normal-schematic-pair" data-relative={relative} x1={x} x2={x} y1={targetY + 2} y2={guideY - 2} key={index} />;
        })}
        <line className="normal-schematic-target-pair" x1={targetX} x2={targetX} y1={targetY + 9} y2={guideY - 9} />
        {visibleSites.map((site) => {
          const selected = site.position === design.targetPosition;
          const relative = site.position - design.windowStart - design.targetIndex;
          const point = pointForSite(relative);
          const category = site.category === "synonymous" ? l("Synonymous A") : site.category === "blocked_ga" ? l("GA difficult") : l(generalRna ? "Other A sites" : "Editable A");
          return <g className={`normal-schematic-a ${site.category}${selected ? " selected" : ""}`} data-position={site.position} data-relative={relative}
            transform={`translate(${point.x} ${point.y})`} key={site.position}>
            <title>{`A${site.position} · ${relativeLabel(relative)} · ${selected ? l("Target A") : category}`}</title>
            {selected ? <><circle className="normal-schematic-target-node" r="9" /><text textAnchor="middle" dy=".35em">A</text></>
              : <><circle className="normal-schematic-site-hit" r="7" /><circle className="normal-schematic-site-dot" r={Math.min(2.3, Math.max(.7, step * .3))} />
                {site.category === "blocked_ga" && <line className="normal-schematic-site-strike" x1="-3" y1="3" x2="3" y2="-3" />}</>}
          </g>;
        })}
        <g className="normal-schematic-target-guide" transform={`translate(${targetX} ${guideY})`}>
          <title>{`A–${targetGuideBase} · A${design.targetPosition}`}</title>
          <circle r="9" /><text textAnchor="middle" dy=".35em">{targetGuideBase}</text>
        </g>
        <text className="normal-schematic-target-coordinate" x={targetX} y={coordinateY} textAnchor="middle">A{design.targetPosition} · A0</text>
        {bulges.map(bulge => {
          const lower = bulge.type === "insertion";
          const labelY = lower ? lowerLabelY : 8;
          const label = bulge.type === "deletion" ? `${bulge.count} ${l("nt deleted")}` : bulge.type === "insertion"
            ? `${bulge.count} ${language === "en" ? "nt inserted" : "nt 插入"}` : `${bulge.count}/${bulge.count} ${language === "en" ? "loop" : "内部环"}`;
          return <g className={`normal-schematic-bulge-label ${bulge.type}`} key={bulge.id}>
            <title>{detail(bulge)}</title>
            <line className={`normal-schematic-bulge-leader ${bulge.type}`} x1={bulge.labelX} x2={bulge.centerX} y1={lower ? labelY : labelY + 22} y2={lower ? guideY + bulge.lower!.height + 6 : targetY - bulge.upper!.height - 6} />
            <rect x={bulge.labelX - badgeWidth / 2} y={labelY} width={badgeWidth} height="22" rx="11" />
            <text x={bulge.labelX} y={labelY + 15} textAnchor="middle">{label}</text>
          </g>;
        })}
      </svg>
    </div>
    <div className="normal-schematic-legend">
      <span><i className={generalRna ? "site-dot" : "editable-dot"} />{l(generalRna ? "Other A sites" : "Editable A")}</span>
      {!generalRna && <><span><i className="synonymous-dot" />{l("Synonymous A")}</span><span><i className="ga-dot" />{l("GA difficult")}</span></>}
      {bulges.some(b => b.type === "deletion") && <span><i className="bulge-line" />{l("Unpaired target bulge")}</span>}
      {bulges.some(b => b.type === "insertion") && <span><i className="bulge-line insertion" />{language === "en" ? "arRNA bulge" : "arRNA 凸起"}</span>}
      {bulges.some(b => b.type === "mismatch") && <span><i className="bulge-line mismatch" />{language === "en" ? "Internal loop" : "内部环"}</span>}
    </div>
  </section>;
}

type WindowEvidence = SequenceFeature["evidence"];
interface WindowFeatureSegment { start: number; end: number; features: SequenceFeature[] }
const WINDOW_EVIDENCE_ORDER: WindowEvidence[] = ["reference", "predicted", "user"];
const NO_WINDOW_FEATURES: SequenceFeature[] = [];

/** Presentation-only overlap segmentation; it does not infer annotations. */
export function windowFeatureLanes(features: SequenceFeature[], length: number) {
  const valid = features.filter(feature => Number.isInteger(feature.start) && Number.isInteger(feature.end)
    && feature.start >= 1 && feature.end <= length && feature.start <= feature.end
    && WINDOW_EVIDENCE_ORDER.includes(feature.evidence))
    .sort((a, b) => a.start - b.start || a.end - b.end || a.label.localeCompare(b.label)
      || a.source.localeCompare(b.source) || a.id.localeCompare(b.id));
  return WINDOW_EVIDENCE_ORDER.map(evidence => {
    const records = valid.filter(feature => feature.evidence === evidence);
    const order = new Map(records.map((feature, index) => [feature, index]));
    const events = new Map<number, { add: SequenceFeature[]; remove: SequenceFeature[] }>();
    for (const feature of records) {
      if (!events.has(feature.start)) events.set(feature.start, { add: [], remove: [] });
      if (!events.has(feature.end + 1)) events.set(feature.end + 1, { add: [], remove: [] });
      events.get(feature.start)!.add.push(feature);
      events.get(feature.end + 1)!.remove.push(feature);
    }
    const boundaries = [...events.keys()].sort((a, b) => a - b);
    const active = new Set<SequenceFeature>();
    const segments: WindowFeatureSegment[] = [];
    for (let index = 0; index < boundaries.length - 1; index++) {
      const start = boundaries[index], end = boundaries[index + 1] - 1;
      for (const feature of events.get(start)!.remove) active.delete(feature);
      for (const feature of events.get(start)!.add) active.add(feature);
      if (active.size) segments.push({ start, end, features: [...active].sort((a, b) => order.get(a)! - order.get(b)!) });
    }
    return { evidence, segments };
  }).filter(lane => lane.segments.length > 0);
}

function InteractiveDuplexWindow({ design, sites, variant, structures = [], selection }: DuplexPairingSchematicProps & {
  selection: NonNullable<DuplexPairingSchematicProps["windowSelection"]>;
}) {
  const { l, language } = useLanguage();
  const zh = language === "zh-CN";
  const id = useId();
  const trackRef = useRef<SVGRectElement>(null);
  const dragRef = useRef<{ boundary: "start" | "end"; pointerId: number; x: number; position: number; width: number } | null>(null);
  const [activeFeature, setActiveFeature] = useState<WindowFeatureSegment | null>(null);
  const annotations = selection.features ?? NO_WINDOW_FEATURES;
  const lanes = useMemo(() => windowFeatureLanes(annotations, design.targetWindow.length), [annotations, design.targetWindow.length]);
  useEffect(() => { setActiveFeature(null); }, [lanes]);
  const left = 96, right = 956, length = design.targetWindow.length;
  const firstPosition = design.windowStart, lastPosition = design.windowEnd, target = design.targetPosition;
  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, Number.isFinite(value) ? Math.round(value) : min));
  const first = clamp(selection.start, firstPosition, target), last = clamp(selection.end, target, lastPosition);
  const xForPosition = (position: number) => length > 1 ? left + (position - firstPosition) / (length - 1) * (right - left) : (left + right) / 2;
  const relativeLabel = (coordinate: number) => coordinate < 0 ? `A−${Math.abs(coordinate)}` : coordinate > 0 ? `A+${coordinate}` : "A0";
  const evidenceLabel = (evidence: WindowEvidence) => evidence === "reference" ? (zh ? "参考注释" : "Reference") : evidence === "predicted" ? (zh ? "预测" : "Predicted") : (zh ? "用户定义" : "User-defined");
  const displayStructures = structures.filter(feature => Number.isInteger(feature.start) && Number.isInteger(feature.end)
    && Number.isInteger(feature.size) && feature.size > 0 && feature.end >= feature.start
    && target + feature.start >= first && target + feature.end <= last
    && (feature.type === "insertion" ? feature.end === feature.start : feature.end - feature.start + 1 === feature.size))
    .sort((a, b) => a.start - b.start || a.end - b.end || a.id.localeCompare(b.id));
  const targetY = 100;
  const guideY = targetY + 28;
  const upperFeatures = displayStructures.filter(feature => feature.type !== "insertion");
  const features = displayStructures.map(feature => {
    const start = xForPosition(Math.max(firstPosition, target + feature.start - .5));
    const end = xForPosition(Math.min(lastPosition, target + feature.end + .5));
    // Editing keeps the genomic x axis fixed. The curves are schematic and do
    // not compress coordinates or alter the pointer-to-position mapping.
    const center = feature.type === "insertion" ? xForPosition(Math.max(firstPosition, target + feature.start - .5)) : (start + end) / 2;
    const arcStart = feature.type === "insertion" ? center : start;
    const arcEnd = feature.type === "insertion" ? center : end;
    const upper = feature.type === "insertion" ? null : loopGeometry(arcStart, arcEnd, targetY, feature.size, feature.type === "mismatch", -1);
    const lower = feature.type === "deletion" ? null : loopGeometry(arcStart, arcEnd, guideY, feature.size, feature.type === "mismatch", 1);
    return { feature, start: arcStart, end: arcEnd, center, height: Math.max(upper?.height ?? 0, lower?.height ?? 0), upper, lower };
  });
  const strandPath = (strand: "upper" | "lower", y: number, from: number, to: number) => {
    let path = `M ${from} ${y}`;
    for (const item of features) {
      const curve = item[strand];
      if (curve) path += ` L ${item.start} ${y} ${curve.commands}`;
    }
    return `${path} L ${to} ${y}`;
  };
  const firstX = xForPosition(first), lastX = xForPosition(last), targetX = xForPosition(target);
  const lowerHeight = Math.max(0, ...features.filter(item => item.lower).map(item => item.height));
  const handlesY = guideY + lowerHeight + 19;
  const featuresY = handlesY + 29;
  const viewHeight = lanes.length ? featuresY + lanes.length * 14 + 23 : handlesY + 38;
  const step = length > 1 ? (right - left) / (length - 1) : right - left;
  const pairStride = Math.max(1, Math.ceil(9 / step));
  const pairPositions = Array.from({ length: Math.floor((last - first) / pairStride) + 1 }, (_, index) => first + index * pairStride);
  const isUnpaired = (position: number) => upperFeatures.some(feature => position >= target + feature.start && position <= target + feature.end);
  const featureDescription = (segment: WindowFeatureSegment) => segment.features.map(feature => `${feature.label} · ${feature.start}–${feature.end} · ${feature.source} · ${evidenceLabel(feature.evidence)}`).join("; ");
  function updateBoundary(boundary: "start" | "end", position: number) {
    const start = boundary === "start" ? clamp(position, firstPosition, target) : first;
    const end = boundary === "end" ? clamp(position, target, lastPosition) : last;
    if (start !== first || end !== last) selection.onChange(start, end);
  }
  function startDrag(event: PointerEvent<SVGGElement>, boundary: "start" | "end") {
    const width = trackRef.current?.getBoundingClientRect().width ?? 0;
    if (event.button !== 0 || width <= 0 || (boundary === "start" ? firstPosition === target : lastPosition === target)) return;
    event.preventDefault(); selection.onEdit?.(); setActiveFeature(null);
    event.currentTarget.focus({ preventScroll: true });
    dragRef.current = { boundary, pointerId: event.pointerId, x: event.clientX, position: boundary === "start" ? first : last, width };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function moveDrag(event: PointerEvent<SVGGElement>) {
    const drag = dragRef.current;
    if (drag?.pointerId !== event.pointerId) return;
    updateBoundary(drag.boundary, drag.position + (event.clientX - drag.x) / drag.width * Math.max(0, length - 1));
  }
  function finishDrag(event: PointerEvent<SVGGElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function moveByKey(event: KeyboardEvent<SVGGElement>, boundary: "start" | "end") {
    const value = boundary === "start" ? first : last;
    const next = event.key === "ArrowLeft" || event.key === "ArrowDown" ? value - 1
      : event.key === "ArrowRight" || event.key === "ArrowUp" ? value + 1
      : event.key === "Home" ? (boundary === "start" ? firstPosition : target)
      : event.key === "End" ? (boundary === "start" ? target : lastPosition) : null;
    if (next !== null) { event.preventDefault(); selection.onEdit?.(); updateBoundary(boundary, next); }
  }
  return <section className="normal-pairing-schematic wrs-duplex-preview" aria-label={zh ? "可调整窗口的双链配对图" : "Target and arRNA window overview"}>
    <div className="normal-schematic-scroll">
      <svg className="wrs-duplex-svg" viewBox={`0 0 1000 ${viewHeight}`} data-coordinate-scale="linear" data-window-start={first} data-window-end={last}
        data-left={left} data-right={right} data-target-y={targetY} data-guide-y={guideY} role="group" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`}>
        <title id={`${id}-title`}>{l("Target and arRNA pairing schematic")}</title>
        <desc id={`${id}-description`}>{zh ? "完整靶序列按线性坐标展示。arRNA 仅显示所选覆盖区；拖动边界或使用方向键调整窗口。凸起为示意图。" : "Full target sequence on a fixed linear axis. arRNA is shown only within the selected coverage. Drag a boundary or use arrow keys to adjust the window. Loops are schematic."}</desc>
        <rect className="wrs-track" ref={trackRef} x={left} y={targetY - 12} width={right - left} height={guideY - targetY + 24} fill="transparent" pointerEvents="none" />
        <rect className="wrs-duplex-coverage" x={firstX - 3} y={targetY - 13} width={Math.max(6, lastX - firstX + 6)} height={guideY - targetY + 26} rx="7" />
        <path className="normal-schematic-target-line" d={strandPath("upper", targetY, left, right)} />
        <path className="normal-schematic-guide-line" data-start={first} data-end={last} d={strandPath("lower", guideY, firstX, lastX)} />
        {features.map(({ feature, start, end, center, height, upper, lower }) => <g className="normal-schematic-bulge" key={feature.id} data-type={feature.type} data-start={feature.start} data-end={feature.end} data-count={feature.size} data-start-x={start} data-end-x={end}>
          <title>{`${feature.type} · ${feature.size} nt · ${relativeLabel(feature.start)}–${relativeLabel(feature.end)}`}</title>
          {upper && <path data-strand="target" className={`normal-schematic-bulge-arc ${feature.type}`} d={upper.curve} />}
          {lower && <path data-strand="guide" className={`normal-schematic-bulge-arc ${feature.type}`} d={lower.curve} />}
          <text className={`wrs-bulge-label ${feature.type}`} x={center} y={feature.type === "insertion" ? guideY + height + 13 : targetY - height - 9} textAnchor="middle">{feature.type === "deletion" ? `${feature.size}/0` : feature.type === "insertion" ? `0/${feature.size}` : `${feature.size}/${feature.size}`}</text>
        </g>)}
        {pairPositions.filter(position => position !== target && !isUnpaired(position)).map(position => <line className="normal-schematic-pair" data-position={position} data-relative={position - target} key={position} x1={xForPosition(position)} x2={xForPosition(position)} y1={targetY + 2} y2={guideY - 2} />)}
        <line className="normal-schematic-target-pair" x1={targetX} x2={targetX} y1={targetY + 9} y2={guideY - 9} />
        {sites.filter(site => site.position >= firstPosition && site.position <= lastPosition && site.position !== target).map(site => {
          // Sequence order follows the loop; the selection and feature axes stay fixed.
          const unpaired = features.find(item => item.upper && site.position >= target + item.feature.start && site.position <= target + item.feature.end);
          const fraction = unpaired ? (site.position - target - unpaired.feature.start + .5) / unpaired.feature.size : 0;
          const point = unpaired?.upper?.pointAt(fraction) ?? { x: xForPosition(site.position), y: targetY };
          return <g className={`normal-schematic-a ${site.category}`} key={site.position} data-position={site.position} data-relative={site.position - target} transform={`translate(${point.x} ${point.y})`}>
            <title>{`A${site.position} · ${relativeLabel(site.position - target)}`}</title><circle className="normal-schematic-site-hit" r="6" /><circle className="normal-schematic-site-dot" r={Math.max(.8, Math.min(2.3, step * .3))} />
            {site.category === "blocked_ga" && <line className="normal-schematic-site-strike" x1="-3" y1="3" x2="3" y2="-3" />}
          </g>;
        })}
        <g className="normal-schematic-a selected" data-position={target} data-relative="0" transform={`translate(${targetX} ${targetY})`}><title>{`A${target} · A0`}</title><circle className="normal-schematic-target-node" r="9" /><text textAnchor="middle" dy=".35em">A</text></g>
        <g className="normal-schematic-target-guide" transform={`translate(${targetX} ${guideY})`}><circle r="9" /><text textAnchor="middle" dy=".35em">{variant.alignedGuide[design.targetIndex] || "C"}</text></g>
        <text className="normal-schematic-strand-label target" x="12" y={targetY + 4}>{l("Target")}</text><text className="normal-schematic-strand-label guide" x="12" y={guideY + 4}>arRNA</text>
        <text className="normal-schematic-direction" x={left - 12} y={targetY + 4} textAnchor="end">5′</text><text className="normal-schematic-direction" x={right + 12} y={targetY + 4}>3′</text>
        <text className="normal-schematic-direction guide" x={firstX - 12} y={guideY + 4} textAnchor="end">3′</text><text className="normal-schematic-direction guide" x={lastX + 12} y={guideY + 4}>5′</text>
        <text className="normal-schematic-target-coordinate" x={targetX} y={targetY - 19} textAnchor="middle">A{target} · A0</text>
        {(["start", "end"] as const).map(boundary => {
          const value = boundary === "start" ? first : last, min = boundary === "start" ? firstPosition : target, max = boundary === "start" ? target : lastPosition;
          // Keep the 44-unit hit regions disjoint even for a one-base window.
          // Leaders retain the true boundary and dragging still uses that value.
          const separation = Math.max(0, 44 - (lastX - firstX)) / 2;
          const offset = boundary === "start" ? -separation : separation;
          return <g key={boundary} className={`wrs-handle wrs-handle-${boundary}`} role="slider" tabIndex={min === max ? -1 : 0} aria-disabled={min === max}
            aria-label={boundary === "start" ? "Window start boundary" : "Window end boundary"} aria-orientation="horizontal" aria-valuemin={min - target} aria-valuemax={max - target} aria-valuenow={value - target}
            aria-valuetext={`${relativeLabel(value - target)} · ${zh ? "位置" : "position"} ${value}`} transform={`translate(${xForPosition(value)} ${handlesY})`}
            onPointerDown={event => startDrag(event, boundary)} onPointerMove={moveDrag} onPointerUp={finishDrag} onPointerCancel={finishDrag} onLostPointerCapture={() => { dragRef.current = null; }} onKeyDown={event => moveByKey(event, boundary)}>
            <line className="wrs-boundary-line" x1="0" x2={offset} y1={targetY - handlesY - 10} y2="-12" />
            <rect className="wrs-handle-hit" x={offset - 22} y="-22" width="44" height="44" rx="8" />
            <rect className="wrs-handle-thumb" x={offset - 8} y="-12" width="16" height="24" rx="5" /><path className="wrs-handle-grip" d={`M ${offset - 2} -4 v 8 M ${offset + 2} -4 v 8`} />
          </g>;
        })}
        {lanes.length > 0 && <g className="wrs-feature-tracks" aria-label={zh ? "功能元件注释" : "Sequence feature annotations"}>
          {lanes.map(({ evidence, segments }, laneIndex) => <g className="wrs-feature-lane" data-evidence={evidence} key={evidence} role="group" aria-label={evidenceLabel(evidence)}>
            <line className="wrs-feature-lane-line" x1={left} x2={right} y1={featuresY + laneIndex * 14 + 4} y2={featuresY + laneIndex * 14 + 4} />
            {segments.map(segment => <g className="wrs-feature-segment" role="button" tabIndex={0} key={`${segment.start}-${segment.end}`} data-start={segment.start} data-end={segment.end} data-feature-ids={segment.features.map(feature => feature.id).join(" ")}
              aria-label={featureDescription(segment)} aria-describedby={activeFeature === segment ? `${id}-feature-tooltip` : undefined}
              onMouseEnter={() => setActiveFeature(segment)} onMouseLeave={event => { if (document.activeElement !== event.currentTarget) setActiveFeature(null); }}
              onFocus={() => setActiveFeature(segment)} onBlur={() => setActiveFeature(null)} onClick={() => setActiveFeature(segment)}
              onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setActiveFeature(null); } if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setActiveFeature(segment); } }}>
              <title>{featureDescription(segment)}</title><rect x={xForPosition(Math.max(firstPosition, segment.start - .5))} y={featuresY + laneIndex * 14} width={Math.max(2, xForPosition(Math.min(lastPosition, segment.end + .5)) - xForPosition(Math.max(firstPosition, segment.start - .5)))} height="8" rx="4" />
            </g>)}
          </g>)}
        </g>}
        <text className="wrs-sequence-coordinate" x={left} y={viewHeight - 3}>{firstPosition}</text><text className="wrs-sequence-coordinate" x={right} y={viewHeight - 3} textAnchor="end">{lastPosition}</text>
      </svg>
    </div>
    {activeFeature && <div id={`${id}-feature-tooltip`} className="wrs-feature-tooltip" role="tooltip">{activeFeature.features.map((feature, index) => <span className="wrs-feature-tooltip-item" key={`${feature.id}-${index}`}><strong>{feature.label}</strong><span>{feature.start}–{feature.end}</span><span className="wrs-feature-source">{evidenceLabel(feature.evidence)} · {feature.source}</span></span>)}</div>}
  </section>;
}
