import { useEffect, useId, useMemo, useRef, useState } from "react";
import { parseDotBracketPairs, structureBounds, type RnaTopology } from "../lib/sequenceAnalysis";
import { useLanguage } from "./LanguageProvider";
import { useRnaFold } from "../lib/useRnaFold";
import { probabilityColor } from "../lib/rnaFoldDisplay";
import "../sequence-analysis.css";
import "../rna-fold.css";

export interface RnaStructurePanelProps {
  sequence: string;
  label?: string;
  topology?: RnaTopology;
  autoCalculate?: boolean;
  hideControls?: boolean;
}

function downloadFile(content: string, type: string, name: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function RnaStructurePanel({ sequence, label, topology: appliedTopology, autoCalculate = false, hideControls = false }: RnaStructurePanelProps) {
  const { language } = useLanguage();
  const tr = (en: string, zh: string) => language === "zh-CN" ? zh : en;
  const topologyId = useId();
  const baseDetailId = useId();
  const diagramTitleId = useId();
  const [selectedTopology, setTopology] = useState<RnaTopology>("linear");
  const topology = appliedTopology ?? selectedTopology;
  const fold = useRnaFold(sequence, topology, autoCalculate);
  const { result, error, inputKey } = fold;
  const loading = fold.status === "queued" || fold.status === "loading" || (autoCalculate && fold.status === "idle" && !!fold.normalizedSequence);
  const normalizedInput = { sequence: fold.normalizedSequence, error: fold.inputError };
  const calculate = fold.request;
  const [zoom, setZoom] = useState(1);
  const [activeBase, setActiveBase] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  useEffect(() => { setZoom(1); setActiveBase(null); }, [inputKey]);

  const geometry = useMemo(() => result ? {
    bounds: structureBounds(result.coordinates),
    pairs: parseDotBracketPairs(result.structure),
  } : null, [result]);
  const activePair = geometry?.pairs.find(pair => pair.i === activeBase || pair.j === activeBase);
  const partner = activePair ? (activePair.i === activeBase ? activePair.j : activePair.i) : null;
  const percentage = (value: number) => `${(value * 100).toFixed(1)}%`;
  const modelLabel = topology === "linear" ? tr("Linear", "线性") : tr("Circular", "环状");

  function exportSvg() {
    if (!svgRef.current || !result) return;
    const clone = svgRef.current.cloneNode(true) as SVGSVGElement;
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("width", String(Math.max(640, geometry?.bounds.width ?? 640)));
    clone.setAttribute("height", String(Math.max(320, geometry?.bounds.height ?? 320)));
    clone.removeAttribute("style");
    clone.removeAttribute("tabindex");
    clone.removeAttribute("aria-describedby");
    const metadata = document.createElementNS("http://www.w3.org/2000/svg", "metadata");
    metadata.textContent = JSON.stringify({ ...result, label: label ?? "arRNA", color_scale: { minimum: probabilityColor(0), maximum: probabilityColor(1), value: "unpaired_probability" } });
    clone.prepend(metadata);
    downloadFile(new XMLSerializer().serializeToString(clone), "image/svg+xml;charset=utf-8", `arrna-rnafold-${result.topology}.svg`);
  }

  return <section className="sa-panel rna-fold-panel" data-status={fold.status} data-topology={topology} aria-label={tr("arRNA secondary structure", "arRNA 二级结构")}>
    <div className="sa-panel-heading"><div><h3>{tr("arRNA structure", "arRNA 结构")}</h3><p>{label || tr("Current selected arRNA", "当前所选 arRNA")}</p></div><span className="sa-count">{normalizedInput.sequence.length || sequence.replace(/\s/g, "").length} nt</span></div>
    {!hideControls && <div className="sa-structure-controls">
      <label htmlFor={topologyId}>{tr("Folding model", "折叠模型")}<select id={topologyId} value={topology} disabled={appliedTopology !== undefined} onChange={event => setTopology(event.target.value as RnaTopology)}><option value="linear">{tr("Linear arRNA", "线性 arRNA")}</option><option value="circular">{tr("Circular arRNA", "环状 arRNA")}</option></select></label>
      {!autoCalculate && <button type="button" className="sa-primary" disabled={loading || !normalizedInput.sequence} onClick={calculate}>{loading ? tr("Calculating…", "计算中…") : tr("Calculate structure", "计算结构")}</button>}
    </div>}
    {!sequence.trim() && <p className="sa-empty">{tr("Generate or select an arRNA to calculate its structure.", "生成或选择 arRNA 后即可计算结构。")}</p>}
    {!!sequence.trim() && normalizedInput.error && <p className="sa-error" role="status">{normalizedInput.error}</p>}
    {loading && <p className="sa-state" role="status">{tr("Calculating the current arRNA with RNAfold…", "正在使用 RNAfold 计算当前 arRNA…")}</p>}
    {error && <div className="sa-error" role="alert"><strong>{tr("Structure calculation unavailable", "结构计算暂不可用")}</strong><span>{error}</span><button type="button" className="rna-fold-retry" aria-label={tr("Retry RNAfold", "重试 RNAfold")} onClick={calculate}>{tr("Retry", "重试")}</button></div>}
    {!autoCalculate && !result && !loading && !error && normalizedInput.sequence && <p className="sa-empty">{tr("Choose Calculate structure when ready. Changing the arRNA or model clears the previous calculation.", "准备好后点击“计算结构”。更换 arRNA 或模型会清除上次计算结果。")}</p>}
    {result && geometry && <div className="sa-structure-result">
      <dl className="sa-metrics"><div className="sa-primary-metric"><dt>{tr("Mean unpaired probability", "平均未配对概率")}</dt><dd>{percentage(result.mean_unpaired_probability)}</dd></div><div><dt>{tr("MFE", "最小自由能")}</dt><dd>{result.mfe.toFixed(2)} <small>kcal/mol</small></dd></div><div><dt>{tr("Length", "长度")}</dt><dd>{result.sequence.length} <small>nt</small></dd></div><div><dt>{tr("Model", "模型")}</dt><dd>{modelLabel}</dd></div></dl>
      <div className="sa-diagram-toolbar"><span>{tr("Hover or select a base; use ← → to navigate.", "悬停或点击碱基；用 ← → 切换。")}</span><div><button type="button" onClick={() => setZoom(value => Math.max(1, value / 1.5))} disabled={zoom <= 1} aria-label={tr("Zoom out", "缩小")}>−</button><button type="button" onClick={() => setZoom(1)} aria-label={tr("Fit structure", "适应画布")}>{Math.round(zoom * 100)}%</button><button type="button" onClick={() => setZoom(value => Math.min(16, value * 1.5))} disabled={zoom >= 16} aria-label={tr("Zoom in", "放大")}>+</button></div></div>
      <div className="sa-structure-viewport">
        <svg ref={svgRef} viewBox={`${geometry.bounds.x} ${geometry.bounds.y} ${geometry.bounds.width} ${geometry.bounds.height}`} style={{ width: `${100 * zoom}%`, height: `${100 * zoom}%` }} role="img" aria-labelledby={diagramTitleId} aria-describedby={baseDetailId} tabIndex={0} onKeyDown={event => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
          event.preventDefault();
          setActiveBase(current => event.key === "Home" ? 1 : event.key === "End" ? result.sequence.length : Math.max(1, Math.min(result.sequence.length, (current ?? 0) + (event.key === "ArrowLeft" ? -1 : 1))));
        }}>
          <title id={diagramTitleId}>{tr("RNAfold MFE structure; bases are colored by unpaired probability", "RNAfold 最小自由能结构；碱基颜色表示未配对概率")}</title>
          <rect x={geometry.bounds.x} y={geometry.bounds.y} width={geometry.bounds.width} height={geometry.bounds.height} fill="#fcfbf8" />
          <g stroke="#c8c4bc" strokeWidth="1.5" fill="none">
            <polyline points={result.coordinates.map(point => `${point.x},${point.y}`).join(" ")} />
            {result.topology === "circular" && <line x1={result.coordinates.at(-1)!.x} y1={result.coordinates.at(-1)!.y} x2={result.coordinates[0].x} y2={result.coordinates[0].y} strokeDasharray="3 2" />}
          </g>
          <g stroke="#8c929e" strokeWidth="1" fill="none">{geometry.pairs.map(pair => <line key={`${pair.i}-${pair.j}`} x1={result.coordinates[pair.i - 1].x} y1={result.coordinates[pair.i - 1].y} x2={result.coordinates[pair.j - 1].x} y2={result.coordinates[pair.j - 1].y} />)}</g>
          <g>{result.coordinates.map((point, index) => <g key={index} transform={`translate(${point.x} ${point.y})`} onMouseEnter={() => setActiveBase(index + 1)} onClick={() => setActiveBase(index + 1)} style={{ cursor: "pointer" }}>
            <title>{index + 1} {result.sequence[index]} · {tr("Unpaired probability", "未配对概率")} {percentage(result.unpaired_probabilities[index])}</title>
            <circle r="6.2" fill={probabilityColor(result.unpaired_probabilities[index])} stroke={activeBase === index + 1 ? "#282d31" : "#fcfbf8"} strokeWidth={activeBase === index + 1 ? 2 : 0.65} />
            <text textAnchor="middle" dominantBaseline="central" fontSize="6.6" fontFamily="Arial, sans-serif" fill="#25313b" pointerEvents="none">{result.sequence[index]}</text>
            {(index === 0 || index === result.sequence.length - 1) && <text y="-11" textAnchor="middle" fontSize="7" fontFamily="Arial, sans-serif" fill="#5e6366" pointerEvents="none">{result.topology === "linear" ? (index === 0 ? "5′ · 1" : `3′ · ${index + 1}`) : index + 1}</text>}
          </g>)}</g>
        </svg>
      </div>
      <div className="sa-structure-legend"><span>{tr("Unpaired probability", "未配对概率")}</span><span>0</span><span className="sa-probability-gradient" aria-hidden="true" /><span>1</span><span className="sa-legend-pair">— {tr("MFE pair", "MFE 配对")}</span></div>
      <div id={baseDetailId} className="sa-base-detail" aria-live="polite">{activeBase ? <><strong>{activeBase} · {result.sequence[activeBase - 1]}</strong><span>{tr("Unpaired probability", "未配对概率")} {percentage(result.unpaired_probabilities[activeBase - 1])}</span><span>{partner ? `${tr("MFE partner", "MFE 配对位置")} ${partner}` : tr("Unpaired in MFE structure", "MFE 结构中未配对")}</span></> : tr("Select a base to inspect its probability and MFE pairing.", "选择碱基以查看其未配对概率与 MFE 配对信息。")}</div>
      <div className="sa-export-actions"><button type="button" onClick={() => downloadFile(JSON.stringify(result, null, 2), "application/json", `arrna-rnafold-${result.topology}.json`)}>{tr("Download JSON", "下载 JSON")}</button><button type="button" onClick={exportSvg}>{tr("Download SVG", "下载 SVG")}</button></div>
      <details className="sa-method-details"><summary>{tr("Calculation details", "计算详情")}</summary>    <p className="sa-scope">{tr("ViennaRNA minimum-free-energy structure and partition-function probabilities for this arRNA alone (5–1,001 nt). No construct or linker sequence is added.", "仅对当前 arRNA（5–1,001 nt）进行 ViennaRNA 最小自由能结构和配分函数概率计算，不添加载体或连接序列。")}</p>
    {topology === "circular" && <p className="sa-model-note">{tr("The circular model joins the ends of this exact sequence. It does not model a complete circularization construct.", "环状模型将此序列的首尾直接连接，不代表完整环化构建体。")}</p>}
      <p className="sa-scope">{tr("Unpaired probabilities describe the thermodynamic ensemble. They do not predict editing efficiency. Lines show the minimum-free-energy (MFE) structure.", "未配对概率描述热力学系综，不用于预测编辑效率。图中连线表示最小自由能（MFE）结构中的配对。")}</p>
<dl><div><dt>{tr("Engine", "引擎")}</dt><dd>{result.engine} {result.version}</dd></div><div><dt>{tr("Temperature", "温度")}</dt><dd>{result.temperature} °C</dd></div><div><dt>{tr("Ensemble free energy", "系综自由能")}</dt><dd>{result.ensemble_free_energy.toFixed(2)} kcal/mol</dd></div><div><dt>{tr("Ensemble diversity", "系综多样性")}</dt><dd>{result.ensemble_diversity.toFixed(2)}</dd></div><div><dt>{tr("Unpaired fraction in MFE structure", "MFE 结构中的未配对比例")}</dt><dd>{percentage(result.mfe_unpaired_fraction)}</dd></div></dl><p>{tr("arRNA and dot-bracket structure, 5′→3′", "arRNA 与点括号结构，5′→3′")}</p><pre>{result.sequence}{"\n"}{result.structure}</pre></details>
    </div>}
  </section>;
}
