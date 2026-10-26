import { AlertCircle, Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { ExonSkippingCandidate, ExonSkippingDesign } from "../lib/exonSkipping";
import { createExonExportBundle, downloadText, serializeCsv, serializeFasta, serializeJson } from "../lib/exports";
import { ExportMenu } from "./ExportMenu";
import { useLanguage } from "./LanguageProvider";
import { RnaFoldThumbnail } from "./RnaFoldThumbnail";
import { ExonPairingOverview } from "./ExonPairingOverview";
import type { RnaTopology } from "../lib/sequenceAnalysis";
import "../pairing-overview.css";
import "../exon-results.css";

interface Props {
  foldTopology?: RnaTopology;
  design: ExonSkippingDesign;
  onRevise: () => void;
  onSelectionChange?: (candidate: ExonSkippingCandidate) => void;
  selectedCandidateId?: string;
}

interface PairingViewProps {
  candidate: ExonSkippingCandidate;
  design: ExonSkippingDesign;
}

function ExonContextOverview({ candidate, design }: PairingViewProps) {
  const { l, language } = useLanguage();
  const total = design.normalized_upstream_intron.length + design.exon_length + design.normalized_downstream_intron.length;
  const exonStart = design.normalized_upstream_intron.length;
  const exonEnd = exonStart + design.exon_length;
  // Whole-input intervals use base edges; candidate coordinates stay 1-based.
  const x = (edge: number) => 96 + Math.max(0, Math.min(total, edge)) / Math.max(total, 1) * 860;
  const coverageLabel = language === "zh-CN" ? "arRNA 覆盖区" : "arRNA coverage";
  return <div className="exon-context-overview">
    <svg className="exon-context-track" viewBox="0 0 1000 78" role="img" aria-label={language === "zh-CN" ? "靶外显子与 arRNA 在输入序列中的覆盖范围" : "Target exon and arRNA coverage in the input sequence"} data-sequence-length={total}>
      <path className="exon-context-backbone" d="M96 36 H956" />
      <rect className="exon-context-exon" x={x(exonStart)} y="28" width={x(exonEnd) - x(exonStart)} height="16" rx="4" data-start={exonStart + 1} data-end={exonEnd}><title>{l("Target exon")} · {exonStart + 1}–{exonEnd}</title></rect>
      <text className="exon-context-label" x={(x(exonStart) + x(exonEnd)) / 2} y="18" textAnchor="middle">{l("Target exon")}</text>
      {design.ese_regions.map((region, index) => <rect key={`${region.start}-${region.end}`} className="exon-context-ese" x={x(exonStart + region.start - 1)} y="32" width={x(exonStart + region.end) - x(exonStart + region.start - 1)} height="8" rx="2" data-start={exonStart + region.start} data-end={exonStart + region.end}><title>{l("Predicted ESE region")} {index + 1} · {exonStart + region.start}–{exonStart + region.end}</title></rect>)}
      <rect className="exon-context-coverage" x={x(candidate.global_start - 1)} y="52" width={x(candidate.global_end) - x(candidate.global_start - 1)} height="4" rx="2" data-start={candidate.global_start} data-end={candidate.global_end}><title>{coverageLabel} · {candidate.global_start}–{candidate.global_end}</title></rect>
      <text className="exon-context-label" x="12" y="40">{language === "zh-CN" ? "全序列" : "Context"}</text>
      <text className="exon-context-endpoint" x="96" y="72">1</text><text className="exon-context-endpoint" x="956" y="72" textAnchor="end">{total}</text>
    </svg>
    <div className="exon-context-key"><span><i className="exon-coverage-swatch" />{coverageLabel}</span></div>
  </div>;
}

// General guidance lives in Help and the unchanged export; show input-specific
// diagnostics beside the results instead of repeating the same notices each run.
const GENERAL_GUIDANCE = new Set([
  "Predicted ESE motifs are candidates for experimental testing, not confirmed functional enhancers.",
  "Test individual guides before combinations; compare with SA alone while keeping the total nucleic acid dose constant.",
]);

export function ExonSkippingResult({ design, onRevise, onSelectionChange, selectedCandidateId, foldTopology = "linear" }: Props) {
  const { l } = useLanguage();
  const [selectedId, setSelectedId] = useState(design.candidates[0]?.id ?? "");
  const [copied, setCopied] = useState(false);
  const selected = design.candidates.find((candidate) => candidate.id === (selectedCandidateId ?? selectedId)) ?? design.candidates[0];
  useEffect(() => { if (selected) onSelectionChange?.(selected); }, [selected, onSelectionChange]);
  useEffect(() => { setCopied(false); }, [selected]);
  const notices = design.warnings.filter((warning) => !GENERAL_GUIDANCE.has(warning));
  const select = (candidate: ExonSkippingCandidate) => {
    setSelectedId(candidate.id); setCopied(false);
    onSelectionChange?.(candidate);
  };

  async function copy(candidate: ExonSkippingCandidate) {
    await navigator.clipboard.writeText(candidate.arrna_sequence);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  function exportBundle() {
    return createExonExportBundle(design, selected?.id ?? "");
  }

  function download(format: "fasta" | "csv" | "json") {
    const serializers = { fasta: serializeFasta, csv: serializeCsv, json: serializeJson };
    const mime = format === "csv" ? "text/csv;charset=utf-8" : format === "json" ? "application/json;charset=utf-8" : "text/plain;charset=utf-8";
    downloadText(`LEAPER_exon_skipping_candidates.${format}`, serializers[format](exportBundle()), mime);
  }

  return (
    <section className="arrna-result exon-result exon-result-page task-result-page normal-tool-result exon-tool-result" aria-live="polite" aria-label={l("Exon skipping")}>
      {notices.length > 0 && <div className="exon-result-notices" role="note">{notices.map((warning) => <div className="exon-result-notice" key={warning}><AlertCircle size={16} aria-hidden="true" /><p>{l(warning)}</p></div>)}</div>}

      <section className="exon-primary-panel" aria-label={l("SA and ESE candidates")}>
      <div className="exon-result-layout">
        <aside className="exon-candidate-sidebar" aria-label={l("SA and ESE candidates")}>
          <div className="normal-candidate-picker" role="group" aria-label={l("Choose a candidate")}>
            {design.candidates.map((candidate) => <div className="normal-candidate-card" data-candidate-id={candidate.id} data-selected={candidate.id === selected?.id} key={candidate.id}>
              <button className="normal-candidate-option" type="button" aria-label={`${candidate.label}, ${candidate.arrna_sequence.length} nt`} aria-pressed={candidate.id === selected?.id} onClick={() => select(candidate)}>
              <span className="normal-candidate-name"><span title={candidate.label}>{candidate.label}</span><strong>{candidate.arrna_sequence.length} nt</strong></span><small className="normal-candidate-change">{l(candidate.kind === "sa" ? "SA A–C mismatch" : "ESE coverage")}</small>
              </button>
              <RnaFoldThumbnail sequence={candidate.arrna_sequence} topology={foldTopology} label={candidate.label} onOpen={() => select(candidate)} />
            </div>)}
          </div>
        </aside>
        <div className="exon-result-main">
        {selected ? (
          <div className="exon-selected-panel">
            <section className="normal-pairing-panel exon-pairing-panel" aria-label={l("SA and ESE coverage map")}>
              <div className="exon-pairing-scroll">
                <ExonContextOverview candidate={selected} design={design} />
                <ExonPairingOverview candidate={selected} design={design} />
              </div>
            </section>
            <div className="arrna-export normal-sequence-export exon-primary-export">
              <div className="normal-sequence-heading">
                <span>{l("arRNA sequence")} · 5′→3′ <small>{selected.arrna_sequence.length} nt</small></span>
                <div className="arrna-export-actions">
                  <button className="button button-primary" type="button" onClick={() => copy(selected)}>{copied ? <Check size={15} /> : <Copy size={15} />}{l(copied ? "Copied" : "Copy")}</button>
                  <ExportMenu onDownload={download} />
                </div>
              </div>
              <code className="normal-sequence-text">{selected.arrna_sequence}</code>
            </div>
          </div>
        ) : <div className="exon-empty-result"><p>{l("No arRNA candidate was generated. Revise the input sequence or design length.")}</p><button className="button button-secondary" type="button" onClick={onRevise}>{l("Revise input")}</button></div>}
        </div>
      </div>
      </section>

    </section>
  );
}
