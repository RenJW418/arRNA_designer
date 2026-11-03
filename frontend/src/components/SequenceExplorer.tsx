import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import type { SequenceFeature } from "../lib/sequenceAnalysis";
import type { SequenceRange } from "../lib/sequenceExplorer";
import { useLanguage } from "./LanguageProvider";
import "../sequence-explorer.css";

export interface SequenceExplorerProps {
  sequence: string;
  mode: "normal_editing" | "exon_skipping";
  targetPosition?: number | null;
  onTargetChange?: (position: number) => void;
  exonRange?: SequenceRange | null;
  onExonRangeChange?: (range: SequenceRange) => void;
  features?: SequenceFeature[];
  windowRange?: SequenceRange | null;
  compact?: boolean;
  minimal?: boolean;
  showFeatureList?: boolean;
}

const PAGE_SIZE = 300;
const CHIP_PAGE_SIZE = 12;
const EMPTY_FEATURES: SequenceFeature[] = [];

export function SequenceExplorer({
  sequence, mode, targetPosition, onTargetChange, exonRange, onExonRangeChange,
  features = EMPTY_FEATURES, windowRange, compact = false, minimal = false, showFeatureList = true,
}: SequenceExplorerProps) {
  const { language } = useLanguage();
  const zh = language === "zh-CN";
  const id = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const detailRef = useRef<HTMLDivElement>(null);
  const featureTrigger = useRef<HTMLElement | null>(null);
  const focusAfterRender = useRef<number | null>(null);
  const drag = useRef<{ pointerId: number; start: number; end: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const [page, setPage] = useState(0);
  const [columns, setColumns] = useState(20);
  const [focusPosition, setFocusPosition] = useState(1);
  const [hoverPosition, setHoverPosition] = useState<number | null>(null);
  const [anchor, setAnchor] = useState<number | null>(null);
  const [draftRange, setDraftRange] = useState<SequenceRange | null>(null);
  const [selectedFeature, setSelectedFeature] = useState<SequenceFeature | null>(null);
  const [featurePage, setFeaturePage] = useState(0);
  const [jump, setJump] = useState("");
  const [notice, setNotice] = useState("");
  const pageCount = Math.max(1, Math.ceil(sequence.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const first = currentPage * PAGE_SIZE + 1;
  const last = Math.min(sequence.length, first + PAGE_SIZE - 1);
  const validExon = exonRange && Number.isInteger(exonRange.start) && Number.isInteger(exonRange.end)
    && exonRange.start >= 2 && exonRange.end < sequence.length && exonRange.start <= exonRange.end ? exonRange : null;
  const displayExon = draftRange ?? validExon;
  const isExon = mode === "exon_skipping";
  const pageFeatures = useMemo(() => features.filter((feature) => Number.isInteger(feature.start)
    && Number.isInteger(feature.end) && feature.start >= 1 && feature.end <= sequence.length
    && feature.start <= feature.end && feature.end >= first && feature.start <= last), [features, first, last, sequence.length]);
  const featuresByPosition = useMemo(() => {
    const result: SequenceFeature[][] = Array.from({ length: Math.max(0, last - first + 1) }, () => []);
    for (const feature of pageFeatures) {
      for (let position = Math.max(first, feature.start); position <= Math.min(last, feature.end); position++) {
        result[position - first].push(feature);
      }
    }
    return result;
  }, [pageFeatures, first, last]);
  const featurePages = Math.max(1, Math.ceil(pageFeatures.length / CHIP_PAGE_SIZE));
  const currentFeaturePage = Math.min(featurePage, featurePages - 1);
  const hoveredFeatures = hoverPosition === null ? [] : featuresByPosition[hoverPosition - first] ?? [];
  const visibleRows = Array.from({ length: Math.ceil(Math.max(0, last - first + 1) / columns) }, (_, row) => first + row * columns);
  const evidenceLabel = (evidence: string) => evidence === "reference" ? (zh ? "参考注释" : "Reference")
    : evidence === "predicted" ? (zh ? "预测" : "Predicted") : (zh ? "用户定义" : "User-defined");

  useEffect(() => {
    setPage(0); setAnchor(null); setDraftRange(null);
    setSelectedFeature(null); setHoverPosition(null); setFocusPosition(1); setNotice(""); setJump("");
    drag.current = null;
  }, [sequence, mode]);
  useEffect(() => {
    if (targetPosition && targetPosition >= 1 && targetPosition <= sequence.length) {
      setPage(Math.floor((targetPosition - 1) / PAGE_SIZE)); setFocusPosition(targetPosition);
    }
  }, [targetPosition, sequence.length]);
  useEffect(() => { setFeaturePage(0); setHoverPosition(null); }, [currentPage, features]);
  useEffect(() => { setSelectedFeature(null); }, [features]);
  useEffect(() => {
    const element = gridRef.current;
    if (!element) return;
    const resize = () => setColumns(Math.max(5, Math.min(50, Math.floor((element.clientWidth - 48) / 27))));
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    return () => observer.disconnect();
  }, [sequence.length > 0]);
  useEffect(() => {
    if (focusAfterRender.current === null) return;
    const element = gridRef.current?.querySelector<HTMLElement>(`[data-seq-position="${focusAfterRender.current}"]`);
    if (element) { element.focus(); focusAfterRender.current = null; }
  }, [currentPage, focusPosition, columns]);
  useEffect(() => { if (selectedFeature) detailRef.current?.focus(); }, [selectedFeature]);

  function navigate(position: number, focus = true) {
    const next = Math.min(sequence.length, Math.max(1, position));
    if (focus) focusAfterRender.current = next;
    setPage(Math.floor((next - 1) / PAGE_SIZE));
    setFocusPosition(next);
    if (focus) gridRef.current?.querySelector<HTMLElement>(`[data-seq-position="${next}"]`)?.focus();
  }

  function showFeature(feature: SequenceFeature, trigger: HTMLElement) {
    featureTrigger.current = trigger;
    setSelectedFeature(feature);
  }

  function closeFeature() {
    setSelectedFeature(null);
    if (featureTrigger.current?.isConnected) featureTrigger.current.focus();
  }

  function visibleAnnotation(baseFeatures: SequenceFeature[]) {
    // Region boundaries have a separate selection layer; retain their details
    // without painting every flanking base or hiding overlapping annotations.
    return baseFeatures.find((feature) => feature.evidence === "reference")
      ?? baseFeatures.find((feature) => feature.evidence === "predicted")
      ?? baseFeatures.find((feature) => !(isExon && feature.evidence === "user" && (feature.kind === "intron" || feature.kind === "exon")));
  }

  function selectPosition(position: number, trigger: HTMLElement) {
    if (suppressClick.current) { suppressClick.current = false; return; }
    setNotice("");
    if (isExon && onExonRangeChange) {
      if (position < 2 || position >= sequence.length) {
        setNotice(zh ? "外显子两侧各需保留至少一个碱基。" : "Leave at least one base on each side of the exon.");
        return;
      }
      if (anchor === null) {
        setAnchor(position);
      } else {
        onExonRangeChange({ start: Math.min(anchor, position), end: Math.max(anchor, position) });
        setAnchor(null);
      }
    } else if (!isExon && sequence[position - 1] === "A" && onTargetChange) {
      onTargetChange(position);
    } else {
      const baseFeatures = featuresByPosition[position - first] ?? [];
      const feature = visibleAnnotation(baseFeatures) ?? baseFeatures[0];
      if (feature) showFeature(feature, trigger);
    }
  }

  function onBaseKeyDown(event: KeyboardEvent<HTMLButtonElement>, position: number) {
    let next: number | null = null;
    if (event.key === "ArrowRight") next = position + 1;
    if (event.key === "ArrowLeft") next = position - 1;
    if (event.key === "ArrowDown") next = position + columns;
    if (event.key === "ArrowUp") next = position - columns;
    if (event.key === "Home") next = event.ctrlKey || event.metaKey ? 1 : first;
    if (event.key === "End") next = event.ctrlKey || event.metaKey ? sequence.length : last;
    if (event.key === "PageDown") next = position + PAGE_SIZE;
    if (event.key === "PageUp") next = position - PAGE_SIZE;
    if (next !== null) { event.preventDefault(); navigate(next); }
  }

  function onPointerDown(event: PointerEvent<HTMLButtonElement>, position: number) {
    if (!isExon || !onExonRangeChange || event.button !== 0 || position < 2 || position >= sequence.length) return;
    suppressClick.current = false;
    drag.current = { pointerId: event.pointerId, start: position, end: position, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const element = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-seq-position]");
    if (!element || !gridRef.current?.contains(element)) return;
    const position = Math.max(2, Math.min(sequence.length - 1, Number(element.dataset.seqPosition)));
    if (position === current.end) return;
    current.end = position; current.moved = true;
    setDraftRange({ start: Math.min(current.start, position), end: Math.max(current.start, position) });
  }

  function finishDrag(event: PointerEvent<HTMLDivElement>, cancelled = false) {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    if (current.moved && !cancelled) {
      onExonRangeChange?.({ start: Math.min(current.start, current.end), end: Math.max(current.start, current.end) });
      setAnchor(null); suppressClick.current = true;
    }
    drag.current = null;
    setDraftRange(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  const instruction = !onTargetChange && !onExonRangeChange
    ? (zh ? "点击高亮碱基，查看功能元件及证据来源。" : "Select a highlighted base to inspect its feature and evidence.")
    : isExon
    ? anchor !== null ? (zh ? `已选边界 ${anchor}，再选择另一个边界。` : `Boundary ${anchor} selected. Choose the other boundary.`)
        : (zh ? "点选两个边界，或拖动以定义内部外显子。" : "Choose two boundaries, or drag to define an internal exon.")
    : (zh ? "点选一个 A 作为编辑靶点。" : "Choose an A as the editing target.");
  const hasDynamicInstruction = isExon && anchor !== null;
  const coordinateNote = zh ? "坐标从 1 开始，区间含起点和终点。" : "Positions are 1-based; ranges include both boundaries.";
  const safeSourceUrl = selectedFeature?.source_url && /^https?:\/\//i.test(selectedFeature.source_url) ? selectedFeature.source_url : null;

  return <div ref={rootRef} className={`sequence-explorer${compact ? " is-compact" : ""}${minimal ? " is-minimal" : ""}${isExon ? " is-exon" : ""}`} onKeyDown={(event) => {
    if (event.key === "Escape") {
      if (selectedFeature) { event.preventDefault(); event.stopPropagation(); closeFeature(); }
      else if (anchor !== null) { event.preventDefault(); setAnchor(null); }
    }
  }}>
    {!minimal && <div className="sequence-explorer-heading">
      <span>{zh ? "序列视图" : "Sequence view"} <span className="sequence-explorer-length">{sequence.length.toLocaleString()} nt</span></span>
      {sequence.length > 0 && <span className="sequence-explorer-page-position">{first.toLocaleString()}–{last.toLocaleString()}</span>}
    </div>}
    {sequence.length === 0 ? <p className="sequence-explorer-empty">{zh ? "粘贴序列后，即可在这里选择位置和查看注释。" : "Paste a sequence to select positions and explore annotations here."}</p> : <>
      <p className={`sequence-explorer-instruction${minimal && !hasDynamicInstruction ? " sequence-explorer-visually-hidden" : ""}`} id={`${id}-instructions`} aria-live="polite">{instruction}</p>
      <p className={`sequence-explorer-keyboard${minimal ? " sequence-explorer-visually-hidden" : ""}`} id={`${id}-keyboard`}>{zh ? "键盘：方向键移动，Enter 或空格选择；Esc 取消。" : "Keyboard: arrow keys to move, Enter or Space to select; Esc to cancel."}</p>
      {minimal && <p className="sequence-explorer-visually-hidden" id={`${id}-coordinates`}>{coordinateNote}</p>}
      {isExon && validExon && <div className="sequence-explorer-regions">
        <span>{zh ? "用户定义上游内含子" : "User-defined upstream intron"} · {validExon.start - 1} nt</span>
        <strong>{zh ? "目标外显子" : "Target exon"} {validExon.start}–{validExon.end}</strong>
        <span>{zh ? "用户定义下游内含子" : "User-defined downstream intron"} · {sequence.length - validExon.end} nt</span>
      </div>}
      <div ref={gridRef} className="sequence-explorer-grid" role="group" aria-label={zh ? "序列碱基" : "Sequence bases"}
        aria-describedby={`${id}-instructions ${id}-keyboard${minimal ? ` ${id}-coordinates` : ""}`} onPointerMove={onPointerMove} onPointerUp={finishDrag}
        onPointerCancel={(event) => finishDrag(event, true)} onLostPointerCapture={() => { drag.current = null; setDraftRange(null); }}
        onMouseLeave={() => setHoverPosition(null)}
        onBlur={(event) => { if (minimal && !event.currentTarget.contains(event.relatedTarget)) setHoverPosition(null); }}>
        {visibleRows.map((rowStart) => <div className="sequence-explorer-row" key={rowStart}>
          <span className="sequence-explorer-row-position" aria-hidden="true">{rowStart}</span>
          <div className="sequence-explorer-row-bases" style={{ "--sequence-columns": columns } as CSSProperties}>
            {Array.from({ length: Math.min(columns, last - rowStart + 1) }, (_, index) => {
              const position = rowStart + index;
              const base = sequence[position - 1];
              const baseFeatures = featuresByPosition[position - first] ?? [];
              const annotationFeature = visibleAnnotation(baseFeatures);
              const evidence = annotationFeature?.evidence ?? baseFeatures[0]?.evidence;
              const target = !isExon && base === "A" && position === targetPosition;
              const inExon = isExon && displayExon && position >= displayExon.start && position <= displayExon.end;
              const inWindow = windowRange && position >= windowRange.start && position <= windowRange.end;
              const selectable = isExon ? !!onExonRangeChange && position > 1 && position < sequence.length : !!onTargetChange && base === "A";
              const featureLabel = baseFeatures.map((feature) => `${feature.label} (${evidenceLabel(feature.evidence)})`).slice(0, 3).join("; ");
              const label = `${base}, ${zh ? "位置" : "position"} ${position}${target ? (zh ? "，已选靶点" : ", selected target") : ""}${featureLabel ? `; ${featureLabel}` : ""}`;
              return <button key={position} type="button" data-seq-position={position}
                className={`sequence-explorer-base${selectable ? " is-selectable" : ""}${target ? " is-target" : ""}${inExon ? " in-exon" : ""}${isExon && displayExon && !inExon ? " in-flank" : ""}${inWindow ? " in-window" : ""}${anchor === position ? " is-anchor" : ""}${baseFeatures.length ? ` has-feature evidence-${evidence}` : ""}${annotationFeature ? " has-annotation" : ""}${isExon && displayExon && (position === displayExon.start || position === displayExon.end) ? " is-boundary" : ""}`}
                tabIndex={position === (focusPosition >= first && focusPosition <= last ? focusPosition : first) ? 0 : -1}
                aria-label={label} aria-pressed={selectable ? !!(isExon ? inExon : target) : undefined}
                aria-describedby={hoverPosition === position && baseFeatures.length ? `${id}-tooltip` : undefined}
                onFocus={() => { setFocusPosition(position); setHoverPosition(position); }}
                onMouseEnter={() => setHoverPosition(position)} onKeyDown={(event) => onBaseKeyDown(event, position)}
                onPointerDown={(event) => onPointerDown(event, position)} onClick={(event) => selectPosition(position, event.currentTarget)}>
                <span className="sequence-explorer-letter">{base}</span><span className="sequence-explorer-tick" aria-hidden="true">{position % 10 === 0 ? position : ""}</span>
              </button>;
            })}
          </div>
        </div>)}
      </div>
      <div className="sequence-explorer-context" aria-live="polite">
        {hoverPosition !== null ? <span id={`${id}-tooltip`} role="tooltip">
          <b>{sequence[hoverPosition - 1]} · {hoverPosition}</b>
          {hoveredFeatures.length ? ` · ${hoveredFeatures.slice(0, 3).map((feature) => `${feature.label} (${evidenceLabel(feature.evidence)})`).join(" · ")}` : (zh ? " · 当前无注释" : " · No annotation loaded")}
        </span> : !minimal && <span>{coordinateNote}</span>}
      </div>
      {isExon && displayExon && <div className="sequence-explorer-exon-legend" aria-label={zh ? "序列图例" : "Sequence legend"}>
        <span aria-hidden="true" />{zh ? "外显子" : "Exon"}
      </div>}
      {notice && <p className="sequence-explorer-notice" role="status">{notice}</p>}
      {showFeatureList && pageFeatures.length > 0 && <div className="sequence-explorer-features" aria-label={zh ? "当前页面的功能注释" : "Features on this page"}>
        <div className="sequence-explorer-feature-chips">
          {pageFeatures.slice(currentFeaturePage * CHIP_PAGE_SIZE, (currentFeaturePage + 1) * CHIP_PAGE_SIZE).map((feature) =>
            <button key={feature.id} type="button" className={`sequence-explorer-feature-chip evidence-${feature.evidence}`}
              aria-expanded={selectedFeature?.id === feature.id} aria-controls={selectedFeature?.id === feature.id ? `${id}-feature` : undefined}
              onClick={(event) => showFeature(feature, event.currentTarget)}>
              <span>{feature.label}</span><small>{feature.start}–{feature.end} · {evidenceLabel(feature.evidence)}</small>
            </button>)}
        </div>
        {featurePages > 1 && <div className="sequence-explorer-feature-pages">
          <button type="button" disabled={currentFeaturePage === 0} onClick={() => setFeaturePage(currentFeaturePage - 1)}>{zh ? "上一组注释" : "Previous features"}</button>
          <span>{currentFeaturePage + 1}/{featurePages}</span>
          <button type="button" disabled={currentFeaturePage >= featurePages - 1} onClick={() => setFeaturePage(currentFeaturePage + 1)}>{zh ? "下一组注释" : "Next features"}</button>
        </div>}
      </div>}
      {selectedFeature && <div ref={detailRef} id={`${id}-feature`} className="sequence-explorer-feature-detail" role="region" aria-label={zh ? "注释详情" : "Feature details"} tabIndex={-1}>
        <button type="button" className="sequence-explorer-detail-close" onClick={closeFeature} aria-label={zh ? "关闭注释详情" : "Close feature details"}><X size={17} aria-hidden="true" /></button>
        <span className={`sequence-explorer-evidence evidence-${selectedFeature.evidence}`}>{evidenceLabel(selectedFeature.evidence)}</span>
        <h4>{selectedFeature.label} <small>{selectedFeature.start}–{selectedFeature.end}</small></h4>
        <p>{selectedFeature.description}</p>
        <dl><div><dt>{zh ? "来源" : "Source"}</dt><dd>{selectedFeature.source}</dd></div>
          {selectedFeature.protein && <div><dt>{zh ? "蛋白" : "Protein"}</dt><dd>{selectedFeature.protein}</dd></div>}
          {selectedFeature.score != null && <div><dt>{zh ? "矩阵评分" : "Matrix score"}</dt><dd>{selectedFeature.score.toFixed(3)}</dd></div>}
        </dl>
        {selectedFeature.evidence === "reference" && <p className="sequence-explorer-evidence-note">{zh ? "参考注释不代表该功能已在当前细胞类型中得到实验验证。" : "Reference annotation does not establish experimental activity in the current cell type."}</p>}
        {selectedFeature.evidence === "predicted" && <p className="sequence-explorer-evidence-note">{zh ? "计算预测，尚未在当前序列环境中进行实验验证。" : "Computational prediction; not experimentally validated in this sequence context."}</p>}
        {safeSourceUrl && <a href={safeSourceUrl} target="_blank" rel="noreferrer">{zh ? "查看来源" : "View source"} ↗</a>}
      </div>}
      {pageCount > 1 && <div className="sequence-explorer-pagination" aria-label={zh ? "序列分页" : "Sequence pagination"}>
        <button type="button" onClick={() => navigate(first - PAGE_SIZE, false)} disabled={currentPage === 0} aria-label={zh ? "上一页序列" : "Previous sequence page"}><ChevronLeft size={17} aria-hidden="true" /><span>{zh ? "上一页" : "Previous"}</span></button>
        <div className="sequence-explorer-jump">
          <label htmlFor={`${id}-jump`}>{zh ? "定位" : "Go to"}</label>
          <input id={`${id}-jump`} type="number" min={1} max={sequence.length} step={1} value={jump} onChange={(event) => setJump(event.target.value)} placeholder={`${first}`} aria-label={zh ? "定位到序列位置" : "Jump to sequence position"}
            onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); const position = Number(jump); if (Number.isInteger(position) && position >= 1 && position <= sequence.length) navigate(position); else event.currentTarget.reportValidity(); } }} />
          <button type="button" aria-label={zh ? "定位到输入位置" : "Go to entered position"} onClick={() => {
            const position = Number(jump);
            if (Number.isInteger(position) && position >= 1 && position <= sequence.length) { navigate(position); setNotice(""); }
            else setNotice(zh ? `请输入 1–${sequence.length} 之间的整数位置。` : `Enter an integer position between 1 and ${sequence.length}.`);
          }}>↵</button>
        </div>
        <button type="button" onClick={() => navigate(first + PAGE_SIZE, false)} disabled={currentPage >= pageCount - 1} aria-label={zh ? "下一页序列" : "Next sequence page"}><span>{zh ? "下一页" : "Next"}</span><ChevronRight size={17} aria-hidden="true" /></button>
      </div>}
    </>}
  </div>;
}
