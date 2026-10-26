import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Maximize2 } from "lucide-react";
import { RnaFoldModal } from "./RnaFoldModal";
import { useRnaFold } from "../lib/useRnaFold";
import { parseDotBracketPairs, structureBounds, type RnaTopology } from "../lib/sequenceAnalysis";
import { probabilityColor } from "../lib/rnaFoldDisplay";
import { useLanguage } from "./LanguageProvider";
import "../rna-fold.css";

export interface RnaFoldThumbnailProps { sequence: string; topology?: RnaTopology; label?: string; onOpen?: () => void }

/** Noninteractive preview with an explicit enlarge button. */
export function RnaFoldThumbnail({ sequence, topology = "linear", label, onOpen }: RnaFoldThumbnailProps) {
  const { language } = useLanguage();
  const tr = (en: string, zh: string) => language === "zh-CN" ? zh : en;
  const titleId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => { setOpen(false); }, [sequence, topology]);
  const fold = useRnaFold(sequence, topology);
  const result = fold.result;
  const geometry = useMemo(() => result ? { bounds: structureBounds(result.coordinates), pairs: parseDotBracketPairs(result.structure) } : null, [result]);
  return <>
    <div className="rna-fold-thumbnail-frame">
    <span className="rna-fold-thumbnail" data-status={fold.status} data-topology={topology}>
      <button ref={triggerRef} type="button" className="rna-fold-thumbnail-trigger rna-fold-thumbnail-enlarge" aria-haspopup="dialog" aria-expanded={open} aria-label={`${tr("Enlarge RNAfold structure", "放大 RNAfold 结构")}${label ? ` · ${label}` : ""}`} onClick={() => { onOpen?.(); setOpen(true); }}><Maximize2 size={14} aria-hidden="true" /></button>
    {result && geometry ? <>
      <svg className="rna-fold-thumbnail-svg" viewBox={`${geometry.bounds.x} ${geometry.bounds.y} ${geometry.bounds.width} ${geometry.bounds.height}`} role="img" aria-labelledby={titleId}>
        <title id={titleId}>{tr("RNAfold structure preview", "RNAfold 结构预览")} · {topology}</title>
        <polyline points={result.coordinates.map(point => `${point.x},${point.y}`).join(" ")} stroke="#b9b5ad" strokeWidth="2" fill="none" />
        {topology === "circular" && <line x1={result.coordinates.at(-1)!.x} y1={result.coordinates.at(-1)!.y} x2={result.coordinates[0].x} y2={result.coordinates[0].y} stroke="#b9b5ad" strokeDasharray="3 2" />}
        <g stroke="#929187" strokeWidth="1.5">{geometry.pairs.map(pair => <line key={`${pair.i}-${pair.j}`} x1={result.coordinates[pair.i - 1].x} y1={result.coordinates[pair.i - 1].y} x2={result.coordinates[pair.j - 1].x} y2={result.coordinates[pair.j - 1].y} />)}</g>
        {result.coordinates.map((point, index) => <circle key={index} cx={point.x} cy={point.y} r="4" fill={probabilityColor(result.unpaired_probabilities[index])} />)}
      </svg>
      <span className="rna-fold-thumbnail-metrics"><span>{result.mfe.toFixed(1)} kcal/mol</span><span title={tr("Mean unpaired probability", "平均未配对概率")}>{Math.round(result.mean_unpaired_probability * 100)}% {tr("unpaired", "未配对")}</span></span>
    </> : <span className="rna-fold-thumbnail-state">{fold.inputError || (fold.status === "error" ? tr("RNAfold unavailable", "RNAfold 暂不可用") : tr("Folding…", "结构计算中…"))}</span>}
    </span>
    </div>
    {open && <RnaFoldModal sequence={sequence} topology={topology} label={label} trigger={triggerRef.current} onClose={() => setOpen(false)} />}
  </>;
}
