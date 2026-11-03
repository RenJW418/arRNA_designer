import { useEffect, useId, useState } from "react";
import type { SequenceFeature } from "../lib/sequenceAnalysis";
import type { AutoAnnotations } from "../lib/useAutoAnnotations";
import { useLanguage } from "./LanguageProvider";
import "../sequence-analysis.css";

export interface FunctionalAnnotationsPanelProps {
  sequence: string;
  accession: string;
  onAccessionChange: (value: string) => void;
  scan: AutoAnnotations;
}

export function FunctionalAnnotationsPanel({ sequence, accession, onAccessionChange, scan }: FunctionalAnnotationsPanelProps) {
  const { language } = useLanguage();
  const tr = (en: string, zh: string) => language === "zh-CN" ? zh : en;
  const accessionId = useId();
  const detailsId = useId();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(30);
  const { result } = scan;
  const localPending = scan.local.status === "waiting" || scan.local.status === "loading";
  const referencePending = scan.reference.status === "waiting" || scan.reference.status === "loading";
  const canRetry = scan.local.status === "error" || scan.reference.status === "error";

  useEffect(() => {
    setSelectedId(result?.features[0]?.id ?? null);
    setVisibleCount(30);
  }, [result]);

  const evidenceLabel = (evidence: SequenceFeature["evidence"]) => ({
    reference: tr("Reference", "参考注释"), predicted: tr("Predicted", "预测基序"), user: tr("User-defined", "用户定义"),
  })[evidence];
  const selected = result?.features.find(feature => feature.id === selectedId);
  const sourceUrl = selected?.source_url && /^https?:\/\//i.test(selected.source_url) ? selected.source_url : null;

  return <section className="sa-panel" aria-label={tr("Functional annotations", "功能注释")}>
    <div className="sa-panel-heading">
      <div><h3>{tr("Features & evidence", "功能元件与证据")}</h3><p>{tr("Features are scanned automatically as you enter or update a sequence.", "输入或更新序列后，自动扫描功能元件。")}</p></div>
      <span className="sa-count">{sequence.replace(/\s/g, "").length.toLocaleString()} nt</span>
    </div>
    <div className="sa-annotation-controls">
      <label htmlFor={accessionId}><span>{tr("Reference accession", "参考序列登录号")} <span className="sa-muted">{tr("optional", "可选")}</span></span>
        <input id={accessionId} value={accession} onChange={event => onAccessionChange(event.target.value)} placeholder="NM_000000.0" autoCapitalize="off" spellCheck={false} autoComplete="off" maxLength={40} />
      </label>
      {canRetry && <button type="button" className="sa-primary" onClick={scan.retry} disabled={localPending || referencePending || !sequence.trim()}>{tr("Retry", "重试")}</button>}
    </div>
    <p className="sa-scope">{tr("This first version scans five published ESEfinder SR-protein matrices. Matches are predicted motifs, including motifs without A; they are not a comprehensive RBP screen.", "首版扫描已发表的 5 个 ESEfinder SR 蛋白矩阵，包含不带 A 的基序。匹配项为预测基序，扫描范围并非全部 RNA 结合蛋白。")}</p>
    <p className="sa-scope">{tr("Reference features require an exact accession and a unique sequence match. Reference annotation does not establish activity in your cell type. Sequence limit: 20,000 nt.", "参考注释要求准确的登录号与唯一序列匹配；已有注释不代表其在当前细胞类型中具有活性。序列上限为 20,000 nt。")}</p>
    {localPending && <p className="sa-state" role="status">{tr("Scanning sequence motifs…", "正在扫描序列基序…")}</p>}
    {referencePending && <p className="sa-state" role="status">{tr("Looking up reference annotations… Sequence motifs remain available while this completes.", "正在查询参考注释… 查询期间可继续查看已完成的基序扫描。")}</p>}
    {scan.inputError && <div className="sa-error" role="alert"><strong>{tr("Check the sequence", "请检查序列")}</strong><span>{scan.inputError}</span></div>}
    {scan.referenceInputError && <div className="sa-error" role="alert"><strong>{tr("Check the reference accession", "请检查参考序列登录号")}</strong><span>{scan.referenceInputError}</span></div>}
    {scan.local.status === "error" && <div className="sa-error" role="alert"><strong>{tr("Sequence scan unavailable", "序列扫描暂不可用")}</strong><span>{scan.local.error}</span></div>}
    {scan.reference.status === "error" && <div className="sa-error" role="alert"><strong>{tr("Reference lookup unavailable", "参考注释查询暂不可用")}</strong><span>{scan.reference.error}</span></div>}
    {!result && !localPending && !referencePending && !canRetry && !scan.inputError && !scan.referenceInputError && <p className="sa-empty">{tr("Paste a sequence to scan and highlight features automatically. Add an accession to include reference annotations.", "粘贴序列后自动扫描并高亮功能元件；填写登录号后将自动查询参考注释。")}</p>}
    {result && <div className="sa-annotation-result">
      <div className="sa-evidence-summary" aria-label={tr("Feature evidence counts", "功能元件证据分类数量")}>
        {(["reference", "predicted", "user"] as const).map(evidence => <span key={evidence} className={`sa-evidence sa-evidence-${evidence}`}>{evidenceLabel(evidence)} <strong>{result.features.filter(feature => feature.evidence === evidence).length}</strong></span>)}
      </div>
      <p className="sa-provenance">{result.prediction_method}{result.reference_accession ? ` · ${result.reference_accession}` : ""}</p>
      {!!result.warnings.length && <ul className="sa-warnings">{result.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>}
      {!result.features.length && <p className="sa-empty">{tr("No features were returned in this scan. This does not establish the absence of functional elements.", "本次扫描未返回功能元件；这不代表该序列不存在功能元件。")}</p>}
      {!!result.features.length && <>
        <div className="sa-feature-list" aria-label={tr("Detected features", "检测到的功能元件")}>
          {result.features.slice(0, visibleCount).map(feature => <button key={feature.id} type="button" className={`sa-feature-chip sa-feature-${feature.evidence}${selectedId === feature.id ? " is-selected" : ""}`} onClick={() => setSelectedId(feature.id)} aria-pressed={selectedId === feature.id} aria-controls={detailsId}>
            <span>{feature.label}</span><small>{feature.start}–{feature.end} · {evidenceLabel(feature.evidence)}</small>
          </button>)}
        </div>
        {visibleCount < result.features.length && <button type="button" className="sa-text-button" onClick={() => setVisibleCount(count => count + 50)}>{tr("Show more", "显示更多")} ({visibleCount}/{result.features.length})</button>}
        {selected && <div className="sa-feature-details" id={detailsId} tabIndex={0}>
          <div className="sa-feature-detail-heading"><strong>{selected.label}</strong><span className={`sa-evidence sa-evidence-${selected.evidence}`}>{evidenceLabel(selected.evidence)}</span></div>
          <p>{selected.description}</p>
          <dl><div><dt>{tr("Position", "位置")}</dt><dd>{selected.start}–{selected.end} <span className="sa-muted">{tr("(1-based, inclusive)", "（从 1 开始，含两端）")}</span></dd></div>
            <div><dt>{tr("Source", "来源")}</dt><dd>{sourceUrl ? <a href={sourceUrl} target="_blank" rel="noreferrer">{selected.source} ↗</a> : selected.source}</dd></div>
            {selected.protein && <div><dt>{tr("Protein", "蛋白")}</dt><dd>{selected.protein}</dd></div>}
            {selected.score != null && <div><dt>{tr("Matrix score", "矩阵得分")}</dt><dd>{selected.score.toFixed(3)}</dd></div>}
          </dl>
        </div>}
      </>}
    </div>}
  </section>;
}
