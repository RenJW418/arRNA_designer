import { Check, Copy } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  EditingSite,
  InitialArrnaDesign,
  NormalArrnaVariant,
  classifyEditingSites,
  selectDefaultNormalVariant,
  primaryNormalVariants,
} from "../lib/normalEditing";
import { normalResultToDesign, type NormalEditingResult } from "../lib/api";
import { downloadText, serializeFasta, serializeJson } from "../lib/exports";
import { createNormalExportBundleWithCustom, serializeNormalCandidateCsv, type AppliedCustomCandidate } from "../lib/customDesign";
import { ExportMenu } from "./ExportMenu";
import { useLanguage } from "./LanguageProvider";
import { RnaFoldThumbnail } from "./RnaFoldThumbnail";
import type { RnaTopology } from "../lib/sequenceAnalysis";
import { DuplexPairingSchematic } from "./DuplexPairingSchematic";
import { RECOMMENDED_DESIGN_SETTINGS } from "../lib/designDefaults";

interface Props {
  showHeader?: boolean;
  foldTopology?: RnaTopology;
  selectedCandidateId?: string;
  customCandidates?: AppliedCustomCandidate[];
  design: InitialArrnaDesign;
  variants: NormalArrnaVariant[];
  result: NormalEditingResult;
  sites: EditingSite[];
  onRevise: () => void;
  onSelectionChange?: (variant: NormalArrnaVariant | AppliedCustomCandidate["variant"]) => void;
}

const CANDIDATE_NAMES: Record<string, string> = {
  baseline: "Baseline",
  "dual-deletion-internal-del1": "Three bulges",
};
const NO_CUSTOM_CANDIDATES: AppliedCustomCandidate[] = [];

export function InitialArrnaResult({ design, variants, result, sites, onRevise, onSelectionChange, foldTopology = RECOMMENDED_DESIGN_SETTINGS.foldTopology, selectedCandidateId, customCandidates = NO_CUSTOM_CANDIDATES, showHeader = true }: Props) {
  const { l } = useLanguage();
  const [copied, setCopied] = useState(false);
  const [selectedVariantId, setSelectedVariantId] = useState<string>(() =>
    selectDefaultNormalVariant(variants, result.normalized_input.include_internal_bulge)?.id ?? "baseline",
  );
  const customById = useMemo(() => new Map<string, AppliedCustomCandidate>(customCandidates.map((candidate) => [candidate.variant.id, candidate])), [customCandidates]);
  const displayedVariants = useMemo(() => [...primaryNormalVariants(variants), ...customCandidates.map((candidate) => candidate.variant)], [variants, customCandidates]);
  const selectedVariant = displayedVariants.find((variant) => variant.id === (selectedCandidateId ?? selectedVariantId)) ?? displayedVariants[0];
  const selectedCustom = customById.get(selectedVariant.id);
  const selectedResult = selectedCustom?.snapshot.source_result ?? result;
  const selectedDesign = useMemo(() => selectedCustom ? normalResultToDesign(selectedResult) : design, [selectedCustom, selectedResult, design]);
  const selectedSites = useMemo(() => selectedCustom
    ? classifyEditingSites(selectedResult.normalized_input.sequence, selectedResult.normalized_input.coding_context)
    : sites, [selectedCustom, selectedResult, sites]);
  useEffect(() => { if (selectedVariant) onSelectionChange?.(selectedVariant); }, [selectedVariant, onSelectionChange]);
  useEffect(() => { setCopied(false); }, [selectedVariant]);
  async function copySequence() {
    await navigator.clipboard.writeText(selectedVariant.arrnaSequence);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  function exportBundle() {
    const bundle = createNormalExportBundleWithCustom(result, selectedVariant.id, customCandidates);
    const visibleIds = new Set<string>(displayedVariants.map(variant => variant.id));
    bundle.candidates = bundle.candidates.filter(candidate => visibleIds.has(candidate.id));
    return bundle;
  }

  function downloadFasta() {
    downloadText(`LEAPER_arRNA_A${selectedDesign.targetPosition}.fasta`, serializeFasta(exportBundle()), "text/plain;charset=utf-8");
  }

  function downloadCsv() {
    downloadText(`LEAPER_arRNA_A${selectedDesign.targetPosition}.csv`, serializeNormalCandidateCsv(exportBundle()), "text/csv;charset=utf-8");
  }

  function downloadJson() {
    downloadText(`LEAPER_arRNA_A${selectedDesign.targetPosition}.json`, serializeJson(exportBundle()), "application/json;charset=utf-8");
  }

  const visibleWarnings = selectedResult.warnings;

  return (
    <section className="arrna-result normal-result-page task-result-page normal-tool-result" aria-live="polite" aria-label={l("arRNA designs")}>
      {showHeader && <div className="arrna-result-header normal-tool-header">
        <div>
          <h1>{l("arRNA designs")}</h1>
          <p className="normal-tool-meta">A{selectedDesign.targetPosition} · {displayedVariants.length} {l(displayedVariants.length === 1 ? "candidate" : "candidates")}</p>
        </div>
        <div className="normal-tool-header-actions">
          <button className="button button-secondary" type="button" onClick={onRevise}>{l("Revise target")}</button>
        </div>
      </div>}

      {visibleWarnings.length > 0 && <div className="result-warning-list" role="note">{visibleWarnings.map((warning) => <p key={warning}>{l(warning)}</p>)}</div>}

      <section className="normal-variant-section result-primary-panel normal-tool-workspace" aria-label={l("Available arRNA designs")}>
        <div className={`normal-candidate-picker${customCandidates.length > 0 ? " has-custom-candidate" : ""}`} role="group" aria-label={l("Choose a candidate")}>
          {displayedVariants.map((variant) => (
            <div className="normal-candidate-card" data-candidate-id={variant.id} data-selected={selectedVariant.id === variant.id} key={variant.id}>
            <button
              type="button"
              className="normal-candidate-option"
              aria-pressed={selectedVariant.id === variant.id}
              aria-label={`${l(CANDIDATE_NAMES[variant.id] ?? variant.label)}, ${variant.arrnaSequence.length} nt`}
              onClick={() => { setSelectedVariantId(variant.id); setCopied(false); onSelectionChange?.(variant); }}
            >
              <span className="normal-candidate-name"><span title={l(CANDIDATE_NAMES[variant.id] ?? variant.label)}>{l(CANDIDATE_NAMES[variant.id] ?? variant.label)}</span><strong>{variant.arrnaSequence.length} nt</strong></span>
            </button>
            <RnaFoldThumbnail sequence={variant.arrnaSequence} topology={customById.get(variant.id)?.foldTopology ?? foldTopology} label={l(CANDIDATE_NAMES[variant.id] ?? variant.label)} onOpen={() => { setSelectedVariantId(variant.id); setCopied(false); onSelectionChange?.(variant); }} />
            </div>
          ))}
        </div>

        {selectedDesign.downstreamLength < 53 && <div className="variant-unavailable-note">{l("The +34 external bulge needs coverage through +53 to retain 10 paired nt beyond the bulge.")}</div>}
        {selectedDesign.upstreamLength < 68 && <div className="variant-unavailable-note">{l("The −31 external bulge needs coverage through −68 to retain 10 paired nt beyond the bulge.")}</div>}
        <section className="normal-pairing-panel" aria-label={l("Pairing")}>
          <DuplexPairingSchematic design={selectedDesign} sites={selectedSites} variant={selectedVariant} structures={selectedCustom?.bulges} />
        </section>

        <div className="arrna-export result-primary-export normal-sequence-export">
          <div className="normal-sequence-heading">
            <span>{l("arRNA sequence")} · 5′→3′ <small>{selectedVariant.arrnaSequence.length} nt</small></span>
            <div className="arrna-export-actions">
              <button className="button button-primary" type="button" onClick={copySequence}>{copied ? <Check size={16} /> : <Copy size={16} />}{l(copied ? "Copied" : "Copy")}</button>
              <ExportMenu onDownload={(format) => ({ fasta: downloadFasta, csv: downloadCsv, json: downloadJson })[format]()} />
            </div>
          </div>
          <code className="normal-sequence-text">{selectedVariant.arrnaSequence}</code>
        </div>
      </section>

    </section>
  );
}
