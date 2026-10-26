import { ChevronDown, LoaderCircle, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import type { Application } from "./DesignWorkspace";
import { useLanguage } from "./LanguageProvider";
import "../ncbi-sequence-input.css";

export interface NcbiLookupInput {
  gene: string;
  species: string;
  exonNumber: string;
  transcriptAccession: string;
}

interface Props {
  mode: Application;
  open: boolean;
  loading: boolean;
  error: string;
  initialGene?: string;
  initialSpecies?: string;
  initialExonNumber?: string;
  initialAccession?: string;
  onLookup: (input: NcbiLookupInput) => void;
  onEdit: () => void;
  onClose: () => void;
}

export function NcbiSequenceInput({
  mode, open, loading, error, initialGene = "", initialSpecies = "9606",
  initialExonNumber = "2", initialAccession = "", onLookup, onEdit, onClose,
}: Props) {
  const { language } = useLanguage();
  const tx = (en: string, zh: string) => language === "en" ? en : zh;
  const id = useId();
  const geneInput = useRef<HTMLInputElement>(null);
  const [gene, setGene] = useState(initialGene);
  const [speciesChoice, setSpeciesChoice] = useState(() => ["9606", "10090"].includes(initialSpecies.trim()) ? initialSpecies.trim() : "other");
  const [customSpecies, setCustomSpecies] = useState(() => ["9606", "10090"].includes(initialSpecies.trim()) ? "" : initialSpecies);
  const [exonNumber, setExonNumber] = useState(() => Number.isInteger(Number(initialExonNumber)) && Number(initialExonNumber) >= 2 ? initialExonNumber : "2");
  const [transcriptAccession, setTranscriptAccession] = useState(initialAccession);
  const [showTranscript, setShowTranscript] = useState(Boolean(initialAccession.trim()));
  const isExon = mode === "exon_skipping";
  const species = speciesChoice === "other" ? customSpecies.trim() : speciesChoice;
  const validExon = !isExon || (exonNumber.trim() !== "" && Number.isInteger(Number(exonNumber)) && Number(exonNumber) >= 2);
  const canLookup = Boolean(gene.trim() && species && validExon && !loading);

  useEffect(() => { if (open) geneInput.current?.focus(); }, [open, mode]);

  function close() {
    onClose();
    document.getElementById("sf-ncbi-trigger")?.focus();
  }

  function lookup() {
    if (!open || !canLookup) return;
    onLookup({ gene: gene.trim(), species, exonNumber: String(Number(exonNumber)), transcriptAccession: isExon ? transcriptAccession.trim() : "" });
  }

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Escape") {
      event.preventDefault(); event.stopPropagation(); close();
    } else if (event.key === "Enter") {
      // Buttons retain their own activation; field Enter must not submit Go.
      event.stopPropagation();
      if ((event.target as HTMLElement).closest("button")) return;
      event.preventDefault(); lookup();
    }
  }

  return <section id="sf-ncbi-input" className="sf-ncbi-input" hidden={!open} aria-label={tx("NCBI sequence lookup", "NCBI 序列检索")} aria-busy={loading} onKeyDown={onKeyDown}>
    <div className="sf-ncbi-heading">
      <div><strong>NCBI</strong><p>{isExon ? tx("Fetch the exon and flanking introns.", "获取外显子及两侧内含子。") : tx("Fetch the coding sequence (CDS).", "获取编码序列（CDS）。")}</p></div>
      <button type="button" className="sf-ncbi-close" aria-label={tx("Close NCBI input", "关闭 NCBI 输入")} onClick={close}><X size={16} aria-hidden="true" /></button>
    </div>
    <div className="sf-ncbi-fields">
      <div className="sf-ncbi-field sf-ncbi-gene">
        <label htmlFor={`${id}-gene`}>{tx("Gene symbol", "基因符号")}</label>
        <input ref={geneInput} id={`${id}-gene`} value={gene} placeholder={isExon ? "DMD" : "TP53"} autoComplete="off" autoCapitalize="off" spellCheck={false}
          onChange={event => { onEdit(); setGene(event.target.value); }} />
      </div>
      <div className="sf-ncbi-field sf-ncbi-species">
        <label htmlFor={`${id}-species`}>{tx("Species", "物种")}</label>
        <select id={`${id}-species`} value={speciesChoice} onChange={event => { onEdit(); setSpeciesChoice(event.target.value); }}>
          <option value="9606">{tx("Human", "人")}</option><option value="10090">{tx("Mouse", "小鼠")}</option><option value="other">{tx("Other", "其他")}</option>
        </select>
      </div>
      {speciesChoice === "other" && <div className="sf-ncbi-field sf-ncbi-custom-species">
        <label htmlFor={`${id}-custom-species`}>{tx("Taxonomy ID or species name", "分类 ID 或物种名称")}</label>
        <input id={`${id}-custom-species`} value={customSpecies} placeholder="10116" autoComplete="off" autoCapitalize="off" spellCheck={false}
          onChange={event => { onEdit(); setCustomSpecies(event.target.value); }} />
      </div>}
      {isExon && <div className="sf-ncbi-field sf-ncbi-exon">
        <label htmlFor={`${id}-exon`}>{tx("Exon number", "外显子编号")}</label>
        <input id={`${id}-exon`} type="number" min={2} step={1} inputMode="numeric" value={exonNumber}
          onChange={event => { onEdit(); setExonNumber(event.target.value); }} />
      </div>}
      <button type="button" className="sf-ncbi-fetch" aria-label={tx("Fetch sequence", "获取序列")} disabled={!canLookup} onClick={lookup}>
        {loading && <LoaderCircle size={15} className="sf-ncbi-spinner" aria-hidden="true" />}{loading ? tx("Fetching…", "正在获取…") : tx("Fetch", "获取")}
      </button>
    </div>
    {isExon && <div className="sf-ncbi-transcript">
      <button type="button" className="sf-ncbi-transcript-toggle" aria-expanded={showTranscript} aria-controls={`${id}-transcript-field`} onClick={() => setShowTranscript(value => !value)}>
        <ChevronDown size={14} aria-hidden="true" />{tx("Specify transcript", "指定转录本")}
      </button>
      <div id={`${id}-transcript-field`} className="sf-ncbi-field" hidden={!showTranscript}>
        <label htmlFor={`${id}-accession`}>{tx("Transcript accession (optional)", "转录本 accession（可选）")}</label>
        <input id={`${id}-accession`} value={transcriptAccession} placeholder="NM_004006.3" autoComplete="off" autoCapitalize="off" spellCheck={false}
          onChange={event => { onEdit(); setTranscriptAccession(event.target.value); }} />
      </div>
    </div>}
    {error && <p className="sf-ncbi-error" role="alert">{error}</p>}
  </section>;
}
