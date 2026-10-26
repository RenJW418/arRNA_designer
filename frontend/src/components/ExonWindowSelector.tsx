import { RotateCcw } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { ExonSkippingCandidate, ExonSkippingDesign } from "../lib/exonSkipping";
import { useLanguage } from "./LanguageProvider";
import "../pairing-overview.css";
import "../window-range-selector.css";

export interface ExonWindowRange { start: number; end: number; }
export interface ExonWindowSelectorProps {
  sequence: string;
  exonRange: ExonWindowRange | null;
  candidate: ExonSkippingCandidate | null;
  design: ExonSkippingDesign | null;
  value: ExonWindowRange | null;
  onChange: (range: ExonWindowRange) => void;
  onEdit?: () => void;
  onReset: () => void;
}

type Boundary = "start" | "end";
const normalize = (sequence: string) => sequence.toUpperCase().replace(/U/g, "T");
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, Number.isFinite(value) ? Math.round(value) : min));

export function ExonWindowSelector({ sequence, exonRange, candidate, design, value, onChange, onEdit, onReset }: ExonWindowSelectorProps) {
  const { language } = useLanguage();
  const zh = language === "zh-CN";
  const id = useId();
  const trackRef = useRef<SVGRectElement>(null);
  const dragRef = useRef<{ boundary: Boundary; pointerId: number; x: number; position: number; width: number } | null>(null);
  const inputSequence = normalize(sequence);
  const length = sequence.length;
  const originalStart = candidate?.global_start ?? 1;
  const originalEnd = candidate?.global_end ?? Math.max(1, length);
  const hasCandidate = !!candidate && !!design && length > 0
    && Number.isInteger(originalStart) && Number.isInteger(originalEnd)
    && originalStart >= 1 && originalEnd >= originalStart && originalEnd <= length
    && inputSequence.slice(originalStart - 1, originalEnd) === normalize(candidate.target_sequence)
    && candidate.arrna_sequence.length === candidate.target_sequence.length
    && inputSequence === normalize(design.normalized_upstream_intron + design.normalized_exon + design.normalized_downstream_intron);
  const reportedTarget = candidate?.kind === "sa" ? candidate.mismatch_target_position : null;
  const anchor = hasCandidate && reportedTarget !== null && reportedTarget !== undefined
    && Number.isInteger(reportedTarget) && reportedTarget >= originalStart && reportedTarget <= originalEnd ? reportedTarget : null;
  const alignedGuide = candidate ? Array.from(candidate.arrna_sequence.toUpperCase().replace(/T/g, "U")).reverse() : [];
  const actualMismatch = anchor !== null && inputSequence[anchor - 1] === "A" && alignedGuide[anchor - originalStart] === "C" ? anchor : null;
  const initialStart = clamp(value?.start ?? originalStart, 1, Math.max(1, length));
  const initialEnd = clamp(value?.end ?? originalEnd, initialStart, Math.max(1, length));
  const first = anchor === null ? initialStart : Math.min(initialStart, anchor);
  const last = anchor === null ? initialEnd : Math.max(initialEnd, anchor);
  const [startDraft, setStartDraft] = useState(String(first));
  const [endDraft, setEndDraft] = useState(String(last));
  const minStart = 1, maxStart = anchor ?? last, minEnd = anchor ?? first, maxEnd = Math.max(1, length);
  const left = 96, right = 956, targetY = 48, guideY = 76, handlesY = 106, exonY = 142;
  const x = (position: number) => length > 1 ? left + (position - 1) / (length - 1) * (right - left) : (left + right) / 2;
  const firstX = x(first), lastX = x(last);
  const step = length > 1 ? (right - left) / (length - 1) : right - left;
  const pairStride = Math.max(1, Math.ceil(9 / step));
  const pairPositions = Array.from({ length: Math.floor((last - first) / pairStride) + 1 }, (_, index) => first + index * pairStride);
  const validExon = exonRange && Number.isInteger(exonRange.start) && Number.isInteger(exonRange.end)
    && exonRange.start >= 1 && exonRange.end <= length && exonRange.start <= exonRange.end ? exonRange : null;
  const boundaries = validExon ? [{ label: "SA", position: validExon.start - .5 }, { label: "SD", position: validExon.end + .5 }]
    .filter(boundary => boundary.position >= 1 && boundary.position <= length) : [];

  useEffect(() => { setStartDraft(String(first)); setEndDraft(String(last)); }, [first, last, candidate?.id, sequence]);
  useEffect(() => { dragRef.current = null; }, [candidate?.id, sequence]);

  function updateBoundary(boundary: Boundary, position: number) {
    const start = boundary === "start" ? clamp(position, minStart, maxStart) : first;
    const end = boundary === "end" ? clamp(position, minEnd, maxEnd) : last;
    setStartDraft(String(start)); setEndDraft(String(end));
    if (start !== first || end !== last) onChange({ start, end });
  }
  function editNumber(boundary: Boundary, raw: string) {
    onEdit?.();
    if (boundary === "start") setStartDraft(raw); else setEndDraft(raw);
    const number = Number(raw);
    const min = boundary === "start" ? minStart : minEnd, max = boundary === "start" ? maxStart : maxEnd;
    if (raw.trim() !== "" && Number.isInteger(number) && number >= min && number <= max) {
      const range = boundary === "start" ? { start: number, end: last } : { start: first, end: number };
      if (range.start !== first || range.end !== last) onChange(range);
    }
  }
  function commitNumber(boundary: Boundary) {
    const raw = boundary === "start" ? startDraft : endDraft;
    if (raw.trim() === "" || !Number.isFinite(Number(raw))) {
      if (boundary === "start") setStartDraft(String(first)); else setEndDraft(String(last));
      return;
    }
    updateBoundary(boundary, Number(raw));
  }
  function startDrag(event: PointerEvent<SVGGElement>, boundary: Boundary) {
    const width = trackRef.current?.getBoundingClientRect().width ?? 0;
    const disabled = boundary === "start" ? minStart === maxStart : minEnd === maxEnd;
    if (event.button !== 0 || width <= 0 || disabled) return;
    event.preventDefault(); onEdit?.(); event.currentTarget.focus({ preventScroll: true });
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
  function moveByKey(event: KeyboardEvent<SVGGElement>, boundary: Boundary) {
    const current = boundary === "start" ? first : last;
    const next = event.key === "ArrowLeft" || event.key === "ArrowDown" ? current - 1
      : event.key === "ArrowRight" || event.key === "ArrowUp" ? current + 1
      : event.key === "Home" ? (boundary === "start" ? minStart : minEnd)
      : event.key === "End" ? (boundary === "start" ? maxStart : maxEnd) : null;
    if (next !== null) { event.preventDefault(); event.stopPropagation(); onEdit?.(); updateBoundary(boundary, next); }
  }

  if (!hasCandidate) return <div className="window-range-selector exon-window-selector sf-design-card" role="group" aria-label="Window selection">
    <div className="sf-design-card-heading"><h3>{zh ? "窗口" : "Window"}</h3></div>
    <p className="wrs-empty">{zh ? "请先生成候选。" : "Generate candidates first."}</p>
  </div>;

  return <div className="window-range-selector exon-window-selector sf-design-card" role="group" aria-label="Window selection">
    <div className="wrs-summary sf-design-card-heading">
      <div className="exw-heading"><h3>{zh ? "窗口" : "Window"}</h3><span className="exw-candidate">{candidate!.label}</span></div>
      <div className="wrs-summary-actions">
        <button type="button" className="wrs-reset sf-card-reset" aria-label="Reset window" onClick={() => { dragRef.current = null; setStartDraft(String(first)); setEndDraft(String(last)); onEdit?.(); onReset(); }}><RotateCcw size={14} aria-hidden="true" />{zh ? "重置" : "Reset"}</button>
      </div>
    </div>
    <div className="wrs-duplex-panel">
      <section className="normal-pairing-schematic wrs-duplex-preview" aria-label={zh ? "外显子窗口预览" : "Exon window preview"}>
        <div className="normal-schematic-scroll">
          <svg className="exon-window-svg wrs-duplex-svg" viewBox="0 0 1000 176" role="group" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`}
            data-coordinate-scale="linear" data-window-start={first} data-window-end={last} data-left={left} data-right={right} data-target-y={targetY} data-guide-y={guideY}>
            <title id={`${id}-title`}>{zh ? "靶序列与 arRNA 窗口" : "Target sequence and arRNA window"}</title>
            <desc id={`${id}-description`}>{zh ? "完整输入序列使用从 1 开始的绝对坐标。拖动边界或使用方向键调整窗口。A–C 节点仅表示 SA 候选返回序列中的实际错配。" : "Full input sequence using absolute, 1-based coordinates. Drag a boundary or use arrow keys to adjust the window. An A–C node marks only an actual mismatch in the returned SA candidate."}</desc>
            <rect ref={trackRef} className="wrs-track" x={left} y={targetY - 12} width={right - left} height={guideY - targetY + 24} fill="transparent" pointerEvents="none" />
            <rect className="wrs-duplex-coverage" data-start={first} data-end={last} x={firstX - 3} y={targetY - 13} width={Math.max(6, lastX - firstX + 6)} height={guideY - targetY + 26} rx="7" />
            <path className="normal-schematic-target-line" d={`M ${left} ${targetY} H ${right}`} />
            <path className="normal-schematic-guide-line" data-start={first} data-end={last} d={`M ${firstX} ${guideY} H ${lastX}`} />
            {pairPositions.filter(position => position !== actualMismatch).map(position => <line className="normal-schematic-pair" data-position={position} key={position} x1={x(position)} x2={x(position)} y1={targetY + 2} y2={guideY - 2} />)}
            {Array.from(inputSequence).flatMap((base, index) => base === "A" && index + 1 !== actualMismatch ? [<g className="normal-schematic-a rna" key={index} data-position={index + 1} transform={`translate(${x(index + 1)} ${targetY})`}>
              <title>{`A${index + 1}`}</title><circle className="normal-schematic-site-hit" r={Math.min(6, Math.max(2, step * .4))} /><circle className="normal-schematic-site-dot" r={Math.max(.5, Math.min(2.3, step * .3))} />
            </g>] : [])}
            {actualMismatch !== null && <>
              <line className="normal-schematic-target-pair" data-position={actualMismatch} x1={x(actualMismatch)} x2={x(actualMismatch)} y1={targetY + 10} y2={guideY - 10} />
              <g className="normal-schematic-a selected" data-position={actualMismatch} data-base="A" transform={`translate(${x(actualMismatch)} ${targetY})`}><title>{`SA · A${actualMismatch} · A–C mismatch`}</title><circle className="normal-schematic-target-node" r="9" /><text textAnchor="middle" dy=".35em">A</text></g>
              <g className="normal-schematic-target-guide" data-position={actualMismatch} data-base="C" transform={`translate(${x(actualMismatch)} ${guideY})`}><circle r="9" /><text textAnchor="middle" dy=".35em">C</text></g>
            </>}
            {boundaries.map(boundary => <g className="exw-splice" data-boundary={boundary.label} data-position={boundary.position} key={boundary.label}><title>{`${boundary.label} · ${boundary.position}`}</title><line x1={x(boundary.position)} x2={x(boundary.position)} y1="24" y2={guideY + 12} /><text x={x(boundary.position)} y="17" textAnchor="middle">{boundary.label}</text></g>)}
            <text className="normal-schematic-strand-label target" x="12" y={targetY + 4}>{zh ? "靶 RNA" : "Target"}</text><text className="normal-schematic-strand-label guide" x="12" y={guideY + 4}>arRNA</text>
            <text className="normal-schematic-direction" x={left - 12} y={targetY + 4} textAnchor="end">5′</text><text className="normal-schematic-direction" x={right + 12} y={targetY + 4}>3′</text>
            <text className="normal-schematic-direction guide" x={firstX - 12} y={guideY + 4} textAnchor="end">3′</text><text className="normal-schematic-direction guide" x={lastX + 12} y={guideY + 4}>5′</text>
            {(["start", "end"] as const).map(boundary => {
              const position = boundary === "start" ? first : last, min = boundary === "start" ? minStart : minEnd, max = boundary === "start" ? maxStart : maxEnd;
              const separation = Math.max(0, 44 - (lastX - firstX)) / 2;
              const offset = boundary === "start" ? -separation : separation;
              return <g className={`wrs-handle wrs-handle-${boundary}`} key={boundary} role="slider" tabIndex={min === max ? -1 : 0} aria-disabled={min === max}
                aria-label={boundary === "start" ? "Window start handle" : "Window end handle"} aria-orientation="horizontal" aria-valuemin={min} aria-valuemax={max} aria-valuenow={position}
                aria-valuetext={`${zh ? "位置" : "Position"} ${position}`} transform={`translate(${x(position)} ${handlesY})`}
                onPointerDown={event => startDrag(event, boundary)} onPointerMove={moveDrag} onPointerUp={finishDrag} onPointerCancel={finishDrag} onLostPointerCapture={() => { dragRef.current = null; }} onKeyDown={event => moveByKey(event, boundary)}>
                <line className="wrs-boundary-line" x1="0" x2={offset} y1={targetY - handlesY - 10} y2="-12" />
                <rect className="wrs-handle-hit" x={offset - 22} y="-22" width="44" height="44" rx="8" />
                <rect className="wrs-handle-thumb" x={offset - 8} y="-12" width="16" height="24" rx="5" /><path className="wrs-handle-grip" d={`M ${offset - 2} -4 v 8 M ${offset + 2} -4 v 8`} />
              </g>;
            })}
            {validExon && <g><line className="exw-exon-track" x1={left} x2={right} y1={exonY + 4} y2={exonY + 4} /><rect className="exw-exon-region" data-start={validExon.start} data-end={validExon.end} x={x(Math.max(1, validExon.start - .5))} y={exonY} width={Math.max(1, x(Math.min(length, validExon.end + .5)) - x(Math.max(1, validExon.start - .5)))} height="8" rx="4"><title>{`${zh ? "靶外显子" : "Target exon"} · ${validExon.start}–${validExon.end}`}</title></rect></g>}
            <text className="wrs-sequence-coordinate" x={left} y="170">1</text><text className="wrs-sequence-coordinate" x={right} y="170" textAnchor="end">{length}</text>
          </svg>
        </div>
      </section>
    </div>
    <div className="wrs-footer">
      <div className="wrs-feature-legend" aria-label={zh ? "窗口图例" : "Window legend"}><span className="wrs-coverage-legend"><i aria-hidden="true" />{zh ? "arRNA 覆盖区" : "arRNA coverage"}</span>{validExon && <span data-evidence="user"><i aria-hidden="true" />{zh ? "靶外显子" : "Target exon"}</span>}</div>
      <div className="wrs-controls exw-controls">
        <label htmlFor={`${id}-start`}><span>{zh ? "起点" : "Start"}</span><input id={`${id}-start`} type="number" min={minStart} max={maxStart} step={1} value={startDraft} aria-label="Window start" onChange={event => editNumber("start", event.target.value)} onBlur={() => commitNumber("start")} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); event.stopPropagation(); commitNumber("start"); } }} /></label>
        <label htmlFor={`${id}-end`}><span>{zh ? "终点" : "End"}</span><input id={`${id}-end`} type="number" min={minEnd} max={maxEnd} step={1} value={endDraft} aria-label="Window end" onChange={event => editNumber("end", event.target.value)} onBlur={() => commitNumber("end")} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); event.stopPropagation(); commitNumber("end"); } }} /></label>
      </div>
    </div>
  </div>;
}
