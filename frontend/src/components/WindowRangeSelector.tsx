import { useEffect, useId, useMemo, useState } from "react";
import { RotateCcw } from "lucide-react";
import type { SequenceFeature } from "../lib/sequenceAnalysis";
import type { EditingSite, InitialArrnaDesign, NormalArrnaVariant } from "../lib/normalEditing";
import { RECOMMENDED_DESIGN_SETTINGS as recommended } from "../lib/designDefaults";
import { useLanguage } from "./LanguageProvider";
import { DuplexPairingSchematic, windowFeatureLanes, type PairingStructure } from "./DuplexPairingSchematic";
import "../window-range-selector.css";

export interface WindowRangeSelectorProps {
  sequence: string;
  targetPosition: number | null;
  startRelative: number;
  endRelative: number;
  onChange: (startRelative: number, endRelative: number) => void;
  onEdit?: () => void;
  features?: SequenceFeature[];
  embedded?: boolean;
  preview?: {
    design: InitialArrnaDesign;
    sites: EditingSite[];
    variant: Pick<NormalArrnaVariant, "shortLabel" | "alignedGuide" | "deletionCoordinates">;
    structures: PairingStructure[];
  };
}

type Boundary = "start" | "end";
const EMPTY_FEATURES: SequenceFeature[] = [];
const boundedInteger = (value: number, minimum: number, maximum: number) =>
  Math.max(minimum, Math.min(maximum, Number.isFinite(value) ? Math.round(value) : 0));

export function WindowRangeSelector({
  sequence, targetPosition, startRelative, endRelative, onChange, onEdit, features = EMPTY_FEATURES, embedded = false, preview,
}: WindowRangeSelectorProps) {
  const { language } = useLanguage();
  const zh = language === "zh-CN";
  const id = useId();
  const validTarget = targetPosition !== null && Number.isInteger(targetPosition)
    && targetPosition >= 1 && targetPosition <= sequence.length
    && sequence[targetPosition - 1]?.toUpperCase() === "A";
  const target = validTarget ? targetPosition : 1;
  const minimumStart = 1 - target;
  const maximumEnd = Math.max(0, sequence.length - target);
  const actualStart = boundedInteger(startRelative, minimumStart, 0);
  const actualEnd = boundedInteger(endRelative, 0, maximumEnd);
  const first = target + actualStart;
  const last = target + actualEnd;
  const clipped = actualStart !== startRelative || actualEnd !== endRelative;
  const [startDraft, setStartDraft] = useState(String(actualStart));
  const [endDraft, setEndDraft] = useState(String(actualEnd));
  const featureLanes = useMemo(() => windowFeatureLanes(features, sequence.length), [features, sequence.length]);
  const evidenceLabel = (evidence: SequenceFeature["evidence"]) => evidence === "reference" ? (zh ? "参考注释" : "Reference")
    : evidence === "predicted" ? (zh ? "预测" : "Predicted") : (zh ? "用户定义" : "User-defined");
  // This fallback only supplies display context, never a designed/exportable guide.
  const contextPreview = useMemo<NonNullable<WindowRangeSelectorProps["preview"]>>(() => ({
    design: { targetPosition: target, targetWindow: sequence, targetIndex: target - 1, windowStart: 1, windowEnd: sequence.length,
      upstreamLength: target - 1, downstreamLength: sequence.length - target, arrnaSequence: "", hasFullFlanks: false },
    sites: Array.from(sequence).flatMap((base, index) => base.toUpperCase() === "A" ? [{ position: index + 1, codon: "", editedCodon: "", aminoAcid: "", editedAminoAcid: "", category: "rna" as const }] : []),
    variant: { shortLabel: "Window", alignedGuide: `${" ".repeat(Math.max(0, target - 1))}C`, deletionCoordinates: [] },
    structures: [],
  }), [sequence, target]);
  const diagram = preview ?? contextPreview;

  // Reflect clipping without changing the parent's saved draft on mount.
  useEffect(() => {
    setStartDraft(String(actualStart));
    setEndDraft(String(actualEnd));
  }, [actualStart, actualEnd, sequence, targetPosition]);

  function updateBoundary(boundary: Boundary, value: number) {
    const nextStart = boundary === "start" ? boundedInteger(value, minimumStart, 0) : actualStart;
    const nextEnd = boundary === "end" ? boundedInteger(value, 0, maximumEnd) : actualEnd;
    setStartDraft(String(nextStart)); setEndDraft(String(nextEnd));
    if (nextStart !== startRelative || nextEnd !== endRelative) onChange(nextStart, nextEnd);
  }
  function editNumber(boundary: Boundary, raw: string) {
    onEdit?.();
    if (boundary === "start") setStartDraft(raw); else setEndDraft(raw);
    const value = Number(raw);
    const minimum = boundary === "start" ? minimumStart : 0;
    const maximum = boundary === "start" ? 0 : maximumEnd;
    if (raw.trim() !== "" && Number.isInteger(value) && value >= minimum && value <= maximum) {
      const nextStart = boundary === "start" ? value : actualStart;
      const nextEnd = boundary === "end" ? value : actualEnd;
      if (nextStart !== startRelative || nextEnd !== endRelative) onChange(nextStart, nextEnd);
    }
  }
  function commitNumber(boundary: Boundary) {
    const raw = boundary === "start" ? startDraft : endDraft;
    if (raw.trim() === "" || !Number.isFinite(Number(raw))) {
      if (boundary === "start") setStartDraft(String(actualStart)); else setEndDraft(String(actualEnd));
      return;
    }
    updateBoundary(boundary, Number(raw));
  }
  const className = `window-range-selector${embedded ? " wrs-embedded" : " sf-design-card"}`;
  const heading = embedded ? (zh ? "窗口与结构" : "Window & structures") : (zh ? "窗口" : "Window");
  if (!validTarget) return <div className={className} role="group" aria-label={zh ? "窗口范围" : "Window selection"}>
    <div className="sf-design-card-heading"><h3>{heading}</h3></div>
    <p className="wrs-empty">{zh ? "先选择一个目标 A。" : "Select a target A first."}</p>
  </div>;

  return <div className={className} role="group" aria-label={zh ? "窗口范围" : "Window selection"}>
    <div className="wrs-summary sf-design-card-heading">
      <h3>{heading}</h3>
      <div className="wrs-summary-actions">
        <div className="wrs-summary-values" id={`${id}-extent`}>
          <span>{first}–{last}{clipped ? (zh ? " · 按输入序列裁剪" : " · clipped to sequence") : ""}</span>{" "}
          <strong className="wrs-length">{last - first + 1} nt</strong>
        </div>
        <button type="button" className="wrs-reset sf-card-reset" aria-label={zh ? "重置窗口" : "Reset window"} onClick={() => {
          setStartDraft(String(boundedInteger(recommended.windowStart, minimumStart, 0)));
          setEndDraft(String(boundedInteger(recommended.windowEnd, 0, maximumEnd)));
          onChange(recommended.windowStart, recommended.windowEnd);
        }}><RotateCcw size={14} aria-hidden="true" />{zh ? "重置" : "Reset"}</button>
      </div>
    </div>
    <div className="wrs-duplex-panel">
      <DuplexPairingSchematic {...diagram} windowSelection={{ start: first, end: last, features, onEdit,
        onChange: (start, end) => {
          const nextStart = start - target, nextEnd = end - target;
          setStartDraft(String(nextStart)); setEndDraft(String(nextEnd));
          if (nextStart !== startRelative || nextEnd !== endRelative) onChange(nextStart, nextEnd);
        } }} />
    </div>
    <div className="wrs-footer">
      <div className="wrs-feature-legend" aria-label={zh ? "窗口图例" : "Window legend"}>
        <span className="wrs-coverage-legend"><i aria-hidden="true" />{zh ? "arRNA 覆盖区" : "arRNA coverage"}</span>
        {featureLanes.map(({ evidence }) => <span key={evidence} data-evidence={evidence}><i aria-hidden="true" />{evidenceLabel(evidence)}</span>)}
      </div>
      <div className="wrs-controls">
        <span className="wrs-origin">{zh ? "相对 A0" : "From A0"}</span>
        <label htmlFor={`${id}-start`}><span className="wrs-control-label">{zh ? "起点" : "Start"}</span>
          <input id={`${id}-start`} type="number" step={1} min={minimumStart} max={0} value={startDraft}
            aria-label="Window start relative to target" onChange={event => editNumber("start", event.target.value)}
            onBlur={() => commitNumber("start")} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); commitNumber("start"); } }} />
        </label>
        <span className="wrs-controls-separator" aria-hidden="true">–</span>
        <label htmlFor={`${id}-end`}><span className="wrs-control-label">{zh ? "终点" : "End"}</span>
          <input id={`${id}-end`} type="number" step={1} min={0} max={maximumEnd} value={endDraft}
            aria-label="Window end relative to target" onChange={event => editNumber("end", event.target.value)}
            onBlur={() => commitNumber("end")} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); commitNumber("end"); } }} />
        </label>
      </div>
    </div>
  </div>;
}
