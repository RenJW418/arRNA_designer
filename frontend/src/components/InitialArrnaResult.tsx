import { ArrowRight, Check, Copy, Search } from "lucide-react";
import { CSSProperties, useState } from "react";
import {
  AdarEnvironment,
  EditingSite,
  InitialArrnaDesign,
  NormalArrnaVariant,
  translateCodon,
} from "../lib/normalEditing";
import { NcbiCodingReference } from "../lib/exonSkipping";
import { NormalEditingResult } from "../lib/api";
import { createNormalExportBundle, downloadText, serializeCsv, serializeFasta, serializeJson } from "../lib/exports";
import type { TestedDuplexSeed } from "../lib/testedDuplex";
import { createGeneratedTestedDuplex } from "../lib/testedDuplex";
import { InfoTip } from "./InfoTip";
import { ExportMenu } from "./ExportMenu";
import { useLanguage } from "./LanguageProvider";

interface Props {
  design: InitialArrnaDesign;
  variants: NormalArrnaVariant[];
  result: NormalEditingResult;
  sequence: string;
  site: EditingSite;
  sites: EditingSite[];
  environment: AdarEnvironment;
  reference?: NcbiCodingReference | null;
  onTargetChange: (position: number) => void | Promise<void>;
  onRevise: () => void;
  onRefine: (seed: TestedDuplexSeed) => void;
}

const CATEGORY_LABELS: Record<EditingSite["category"], string> = {
  blocked_ga: "GA difficult",
  synonymous: "Synonymous",
  editable: "Editable",
  rna: "Target RNA adenosine",
};

const AMINO_ACIDS: Record<string, string> = {
  A: "Ala", R: "Arg", N: "Asn", D: "Asp", C: "Cys", Q: "Gln", E: "Glu",
  G: "Gly", H: "His", I: "Ile", L: "Leu", K: "Lys", M: "Met", F: "Phe",
  P: "Pro", S: "Ser", T: "Thr", W: "Trp", Y: "Tyr", V: "Val", "*": "Stop",
};

interface TranslationBlock {
  label: string;
  position: number;
  column: number;
  span: number;
}

const VARIANT_ROW_SIZE = 30;

const CANDIDATE_NAMES: Record<string, string> = {
  baseline: "Baseline",
  "downstream-del10": "Downstream +34",
  "upstream-del28": "Upstream −31",
  "dual-deletion": "Dual deletion",
};

interface VariantPairingProps {
  design: InitialArrnaDesign;
  sites: EditingSite[];
  variant: NormalArrnaVariant;
}

interface DeletionSegment {
  start: number;
  end: number;
}

interface NormalPairingSchematicProps {
  design: InitialArrnaDesign;
  sites: EditingSite[];
  variant: NormalArrnaVariant;
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

function NormalPairingSchematic({ design, sites, variant }: NormalPairingSchematicProps) {
  const { l } = useLanguage();
  const width = 1200;
  const left = 92;
  const right = 1160;
  const plotWidth = right - left;
  const targetY = 86;
  const guideY = 142;
  const windowLength = design.targetWindow.length;
  const denominator = Math.max(windowLength - 1, 1);
  const xForIndex = (index: number) => left + (index / denominator) * plotWidth;
  const xForRelative = (coordinate: number) => xForIndex(design.targetIndex + coordinate);
  const deletionSegments = groupDeletionCoordinates(variant.deletionCoordinates);
  const deletedCoordinates = new Set(variant.deletionCoordinates);
  const visibleSites = sites.filter((editingSite) => editingSite.position >= design.windowStart && editingSite.position <= design.windowEnd);

  let targetPath = `M ${left} ${targetY}`;
  deletionSegments.forEach((segment) => {
    const segmentStart = Math.max(0, design.targetIndex + segment.start);
    const segmentEnd = Math.min(windowLength - 1, design.targetIndex + segment.end);
    const startX = xForIndex(segmentStart);
    const endX = xForIndex(segmentEnd);
    const span = Math.max(endX - startX, 10);
    targetPath += ` L ${startX} ${targetY} C ${startX + span * 0.16} ${targetY - 52}, ${endX - span * 0.16} ${targetY - 52}, ${endX} ${targetY}`;
  });
  targetPath += ` L ${right} ${targetY}`;

  const yForRelative = (coordinate: number) => {
    const segment = deletionSegments.find(({ start, end }) => coordinate >= start && coordinate <= end);
    if (!segment || segment.start === segment.end) return targetY;
    const progress = (coordinate - segment.start) / (segment.end - segment.start);
    return targetY - Math.sin(progress * Math.PI) * 39;
  };

  return <section className="normal-pairing-schematic" aria-label={`${variant.shortLabel} target and arRNA overview`}>
    <div className="normal-schematic-scroll">
      <svg viewBox={`0 0 ${width} 196`} role="img" aria-labelledby="normal-schematic-title normal-schematic-description">
        <title id="normal-schematic-title">{l("Target and arRNA pairing schematic")}</title>
        <desc id="normal-schematic-description">The target strand is shown above the shorter arRNA. Target regions left unpaired by arRNA deletions curve outward as bulges.</desc>

        <text className="normal-schematic-strand-label target" x="14" y={targetY + 4}>TARGET</text>
        <text className="normal-schematic-direction" x={left} y={targetY - 13}>5′</text>
        <text className="normal-schematic-direction" x={right} y={targetY - 13} textAnchor="end">3′</text>
        <path className={`normal-schematic-target-line ${deletionSegments.length ? "with-bulge" : ""}`} d={targetPath} />
        <line className="normal-schematic-end" x1={left} x2={left} y1={targetY - 9} y2={targetY + 9} />
        <line className="normal-schematic-end" x1={right} x2={right} y1={targetY - 9} y2={targetY + 9} />

        {Array.from({ length: Math.floor((windowLength - 1) / 6) + 1 }, (_, markerIndex) => markerIndex * 6).map((index) => {
          const relative = index - design.targetIndex;
          if (deletedCoordinates.has(relative)) return null;
          const x = xForIndex(index);
          return <line className="normal-schematic-pair" x1={x} x2={x} y1={targetY + 9} y2={guideY - 9} key={index} />;
        })}

        {visibleSites.map((editingSite) => {
          const index = editingSite.position - design.windowStart;
          const x = xForIndex(index);
          const selected = editingSite.position === design.targetPosition;
          const relative = index - design.targetIndex;
          return <g className={`normal-schematic-a ${editingSite.category} ${selected ? "selected" : ""}`} transform={`translate(${x} ${yForRelative(relative)})`} key={editingSite.position}>
            {selected && <rect x="-13" y="-18" width="26" height="26" />}
            <text y={selected ? 1 : -7} textAnchor="middle">A</text>
          </g>;
        })}

        <text className="normal-schematic-target-coordinate" x={xForIndex(design.targetIndex)} y={targetY + 22} textAnchor="middle">A{design.targetPosition} · 0</text>

        <text className="normal-schematic-strand-label guide" x="14" y={guideY + 4}>arRNA</text>
        <text className="normal-schematic-direction guide" x={left} y={guideY + 29}>3′</text>
        <text className="normal-schematic-direction guide" x={right} y={guideY + 29} textAnchor="end">5′</text>
        <line className="normal-schematic-guide-line" x1={left} x2={right} y1={guideY} y2={guideY} />
        <line className="normal-schematic-guide-end" x1={left} x2={left} y1={guideY - 8} y2={guideY + 8} />
        <line className="normal-schematic-guide-end" x1={right} x2={right} y1={guideY - 8} y2={guideY + 8} />

        {deletionSegments.map((segment) => {
          const startX = xForRelative(segment.start);
          const endX = xForRelative(segment.end);
          const centerX = (startX + endX) / 2;
          const count = segment.end - segment.start + 1;
          return <g className="normal-schematic-bulge" key={`${segment.start}-${segment.end}`}>
            <line x1={startX} x2={startX} y1={targetY - 9} y2={targetY + 6} />
            <line x1={endX} x2={endX} y1={targetY - 9} y2={targetY + 6} />
            <text x={centerX} y={targetY - 66} textAnchor="middle">Deletion {count}</text>
            <text className="coordinate" x={centerX} y={targetY - 54} textAnchor="middle">A{segment.start > 0 ? "+" : ""}{segment.start}…A{segment.end > 0 ? "+" : ""}{segment.end}</text>
          </g>;
        })}
      </svg>
    </div>
    <div className="normal-schematic-legend">
      <span><i className="editable-a" />{l(sites.some((site) => site.category === "rna") ? "Target RNA adenosine" : "Editable A")}</span>
      {!sites.some((site) => site.category === "rna") && <><span><i className="synonymous-a" />{l("Synonymous A")}</span>
      <span><i className="ga-a" />{l("GA difficult")}</span></>}
      {deletionSegments.length > 0 && <span><i className="bulge-line" />{l("Unpaired target bulge")}</span>}
    </div>
  </section>;
}

function VariantPairing({ design, sites, variant }: VariantPairingProps) {
  const { l } = useLanguage();
  const sitesByPosition = new Map(sites.map((editingSite) => [editingSite.position, editingSite]));
  const deletedCoordinates = new Set(variant.deletionCoordinates);
  const chunks = Array.from({ length: Math.ceil(design.targetWindow.length / VARIANT_ROW_SIZE) }, (_, index) => {
    const offset = index * VARIANT_ROW_SIZE;
    return {
      offset,
      target: design.targetWindow.slice(offset, offset + VARIANT_ROW_SIZE),
      guide: variant.alignedGuide.slice(offset, offset + VARIANT_ROW_SIZE),
    };
  });

  return <div className="normal-variant-pairing">
    <div className="variant-pairing-heading"><strong>{l("Full pairing view")}</strong><span>{l("Deleted arRNA positions are retained as “−” alignment gaps")}</span></div>
    {chunks.map((chunk) => {
      const firstRelative = chunk.offset - design.targetIndex;
      const lastRelative = firstRelative + chunk.target.length - 1;
      const columns = { "--variant-columns": VARIANT_ROW_SIZE } as CSSProperties;
      return <div className="normal-pairing-chunk" style={columns} key={chunk.offset}>
        <div className="normal-relative-ruler"><span>{firstRelative > 0 ? `+${firstRelative}` : firstRelative}</span><span>{lastRelative > 0 ? `+${lastRelative}` : lastRelative}</span></div>
        <div className="normal-pairing-strand normal-target-strand">
          <span className="normal-pairing-label"><b>Target</b><i>5′→3′</i></span>
          <div className="normal-pairing-bases">{chunk.target.split("").map((base, index) => {
            const windowIndex = chunk.offset + index;
            const relative = windowIndex - design.targetIndex;
            const globalPosition = design.windowStart + windowIndex;
            const editingSite = sitesByPosition.get(globalPosition);
            return <span className={`${editingSite ? `normal-site-${editingSite.category}` : ""} ${relative === 0 ? "normal-target-a" : ""} ${deletedCoordinates.has(relative) ? "normal-gap-target" : ""}`} title={`A-relative coordinate ${relative > 0 ? `+${relative}` : relative}; target ${globalPosition}`} key={globalPosition}>{base}</span>;
          })}</div>
        </div>
        <div className="normal-pairing-connectors"><span /><div>{chunk.target.split("").map((_, index) => {
          const relative = chunk.offset + index - design.targetIndex;
          return <i className={deletedCoordinates.has(relative) ? "gap" : relative === 0 ? "mismatch" : ""} key={relative}>{deletedCoordinates.has(relative) ? "" : relative === 0 ? "•" : "|"}</i>;
        })}</div></div>
        <div className="normal-pairing-strand normal-guide-strand">
          <span className="normal-pairing-label"><b>arRNA</b><i>3′→5′</i></span>
          <div className="normal-pairing-bases">{chunk.guide.split("").map((base, index) => {
            const relative = chunk.offset + index - design.targetIndex;
            return <span className={`${base === "-" ? "normal-deletion-gap" : ""} ${relative === 0 ? "normal-guide-target" : ""}`} key={relative}>{base}</span>;
          })}</div>
        </div>
      </div>;
    })}
    <div className="normal-pairing-legend"><span><i className="normal-legend-target" />{l("Target A")}</span><span><i className="normal-legend-editable" />{l(sites.some((site) => site.category === "rna") ? "Target RNA adenosine" : "Editable A")}</span>{!sites.some((site) => site.category === "rna") && <><span><i className="normal-legend-synonymous" />{l("Synonymous A")}</span><span><i className="normal-legend-ga" />{l("GA difficult")}</span></>}{variant.deletionCoordinates.length > 0 && <span><i className="normal-legend-gap" />{l("Deletion gap")}</span>}</div>
    <div className="normal-variant-output"><span>{l("arRNA output")} · 5′→3′</span><code>{variant.arrnaSequence}</code><small>{variant.arrnaSequence.length} nt</small></div>
  </div>;
}

export function InitialArrnaResult({ design, variants, result, sequence, site, sites, environment, reference, onTargetChange, onRevise, onRefine }: Props) {
  const { l } = useLanguage();
  const [copied, setCopied] = useState(false);
  const [selectedVariantId, setSelectedVariantId] = useState(() =>
    (result.normalized_input.include_internal_bulge ? variants.find((v) => v.id === "dual-deletion-internal-del1") : undefined)?.id
    ?? variants.find((v) => v.id === "dual-deletion")?.id
    ?? variants.find((v) => v.id === (environment === "ADAR1" ? "downstream-del10" : "upstream-del28"))?.id
    ?? variants[0]?.id ?? "baseline",
  );
  const selectedVariant = variants.find((variant) => variant.id === selectedVariantId) ?? variants[0];
  const sitesByPosition = new Map(sites.map((editingSite) => [editingSite.position, editingSite]));
  const targetIndex = design.targetPosition - 1;
  const codingContext = result.normalized_input.coding_context !== false;

  const overviewStart = Math.max(0, targetIndex - 76);
  const overviewEnd = Math.min(sequence.length, targetIndex + 77);
  const overviewLength = overviewEnd - overviewStart;
  const overviewSites = sites.filter((editingSite) => editingSite.position > overviewStart && editingSite.position <= overviewEnd);

  const focusStart = Math.max(0, targetIndex - 25);
  const focusEnd = Math.min(sequence.length, targetIndex + 26);
  const focusSequence = sequence.slice(focusStart, focusEnd);
  const focusTargetIndex = targetIndex - focusStart;
  const alignedGuide = Array.from(focusSequence, (_, index) =>
    selectedVariant.alignedGuide[focusStart + index + 1 - design.windowStart] ?? "-",
  ).join("");
  const guideCoordinate = selectedVariant.alignedGuide.slice(design.targetIndex).replace(/-/g, "").length;

  const translationBlocks: TranslationBlock[] = [];
  const firstCodonStart = Math.floor(focusStart / 3) * 3;
  for (let codonStart = firstCodonStart; codingContext && codonStart < focusEnd; codonStart += 3) {
    const visibleStart = Math.max(codonStart, focusStart);
    const visibleEnd = Math.min(codonStart + 3, focusEnd);
    const codon = sequence.slice(codonStart, codonStart + 3);
    if (codon.length !== 3 || visibleEnd <= visibleStart) continue;
    translationBlocks.push({
      label: AMINO_ACIDS[translateCodon(codon)] ?? "?",
      position: codonStart + 1,
      column: visibleStart - focusStart + 1,
      span: visibleEnd - visibleStart,
    });
  }

  const focusGridStyle = { "--focus-columns": focusSequence.length } as CSSProperties;

  async function copySequence() {
    await navigator.clipboard.writeText(selectedVariant.arrnaSequence);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  function exportBundle() {
    return createNormalExportBundle(result, selectedVariant.id);
  }

  function downloadFasta() {
    downloadText(`LEAPER_arRNA_A${design.targetPosition}_${environment}.fasta`, serializeFasta(exportBundle()), "text/plain;charset=utf-8");
  }

  function downloadCsv() {
    downloadText(`LEAPER_arRNA_A${design.targetPosition}_${environment}.csv`, serializeCsv(exportBundle()), "text/csv;charset=utf-8");
  }

  function downloadJson() {
    downloadText(`LEAPER_arRNA_A${design.targetPosition}_${environment}.json`, serializeJson(exportBundle()), "application/json;charset=utf-8");
  }

  const visibleWarnings = result.warnings;
  const pairedUpstream = design.upstreamLength - selectedVariant.deletionCoordinates.filter((p) => p < 0).length;
  const pairedDownstream = design.downstreamLength - selectedVariant.deletionCoordinates.filter((p) => p > 0).length;

  return (
    <section className="arrna-result normal-result-page task-result-page normal-tool-result" aria-live="polite">
      <div className="arrna-result-header normal-tool-header">
        <div>
          <h1>{l("arRNA designs")}</h1>
          <p className="normal-tool-meta">A{design.targetPosition} · {environment} · {variants.length} {l(variants.length === 1 ? "candidate" : "candidates")}</p>
        </div>
        <div className="normal-tool-header-actions">
          <button className="button button-secondary" type="button" onClick={onRevise}>{l("Revise target")}</button>
        </div>
      </div>

      {visibleWarnings.length > 0 && <div className="result-warning-list" role="note">{visibleWarnings.map((warning) => <p key={warning}>{l(warning)}</p>)}</div>}

      <section className="normal-variant-section result-primary-panel normal-tool-workspace" aria-label={l("Available arRNA designs")}>
        <div className="normal-candidate-picker" role="group" aria-label={l("Choose a candidate")}>
          {variants.map((variant) => (
            <button
              type="button"
              className="normal-candidate-option"
              aria-pressed={selectedVariant.id === variant.id}
              aria-label={`${l(variant.label)}, ${variant.arrnaSequence.length} nt`}
              onClick={() => { setSelectedVariantId(variant.id); setCopied(false); }}
              key={variant.id}
            >
              <span className="normal-candidate-name"><span>{l(CANDIDATE_NAMES[variant.id.replace(/-internal-del1$/, "")] ?? variant.label)}{variant.id.endsWith("-internal-del1") && <small> · +4</small>}</span><strong>{variant.arrnaSequence.length} nt</strong></span>
              <small className="normal-candidate-change">{variant.deletionCoordinates.length === 0 ? l("A–C mismatch only") : `${variant.deletionCoordinates.length} ${l("nt deleted")}`}</small>
            </button>
          ))}
        </div>

        {design.downstreamLength < 53 && <div className="variant-unavailable-note">{l("The +34 external bulge needs coverage through +53 to retain 10 paired nt beyond the bulge.")}</div>}
        {design.upstreamLength < 68 && <div className="variant-unavailable-note">{l("The −31 external bulge needs coverage through −68 to retain 10 paired nt beyond the bulge.")}</div>}
        <div className="normal-selected-note">
          <strong>{l("Pairing")}</strong>
          <span>{l("Target")} {design.windowStart}–{design.windowEnd} · {design.targetWindow.length} nt</span>
          <InfoTip><p>{l(selectedVariant.description)}</p><p>{l("The schematic updates to show the structural consequence of the selected arRNA version.")}</p></InfoTip>
        </div>
        <NormalPairingSchematic design={design} sites={sites} variant={selectedVariant} />

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

      <aside className="normal-refine-row">
        <button className="button button-secondary" type="button" title={l("Open the independent refinement module with the selected target and arRNA prefilled. You will confirm the alignment before entering measurements.")} onClick={() => onRefine({
          source: "generated",
          label: selectedVariant.label,
          targetSequence: sequence,
          arrnaSequence: selectedVariant.arrnaSequence,
          targetAPosition: design.targetPosition,
          environment,
          preparedDuplex: createGeneratedTestedDuplex({
            targetSequence: sequence,
            arrnaSequence: selectedVariant.arrnaSequence,
            targetAPosition: design.targetPosition,
            environment,
            targetWindow: design.targetWindow,
            alignedGuide: selectedVariant.alignedGuide,
            windowStart: design.windowStart,
            targetIndex: design.targetIndex,
            deletionCoordinates: selectedVariant.deletionCoordinates,
          }),
        })}>{l("Refine after experiment")}<ArrowRight size={14} /></button>
      </aside>

      <details className="result-disclosure normal-tool-detail normal-parameters">
        <summary><span><strong>{l("Parameters")}</strong></span></summary>
        <dl className="result-key-facts">
          <div><dt>{l("Target")}</dt><dd>A{design.targetPosition}</dd></div>
          <div><dt>{l("Environment")}</dt><dd>{environment}</dd></div>
          <div><dt>{l("Site class")}</dt><dd>{l(CATEGORY_LABELS[site.category])}</dd></div>
          <div><dt>{l("Pairing context")} <InfoTip>{l("Coverage includes unpaired bulge bases; paired counts exclude deleted guide positions.")}</InfoTip></dt><dd>{design.targetWindow.length} nt {l("target coverage")} · {pairedUpstream}/{pairedDownstream} nt {l("paired arms")}</dd></div>
        </dl>
        {reference && <div className="normal-reference-source"><span>{l("NCBI reference CDS")}</span><strong>{reference.gene} · {reference.transcript} · {reference.selection}</strong><small>{reference.species} · CDS {reference.cds_start}–{reference.cds_end} · {reference.cds_sequence.length.toLocaleString()} nt</small><a href="https://www.ncbi.nlm.nih.gov/datasets/" target="_blank" rel="noreferrer">NCBI Datasets ↗</a></div>}
      </details>

      <details className="result-disclosure normal-tool-detail">
        <summary>
          <span><strong>{l(codingContext ? "Target site and codon context" : "Target RNA context")}</strong></span>
        </summary>
        <div className="result-disclosure-body">
      <div className="sequence-design-figure">
        <section className="sequence-overview" aria-label={`${overviewLength} nucleotide overview`}>
          <div className="overview-heading"><strong>{overviewLength} nt overview</strong><span>{overviewStart + 1}-{overviewEnd}</span></div>
          <div className="overview-axis">
            <span className="overview-start">{overviewStart + 1}</span>
            <span className="overview-end">{overviewEnd}</span>
            <i className="overview-line" />
            <span
              className="overview-focus-window"
              style={{
                left: `${((focusStart - overviewStart) / Math.max(overviewLength - 1, 1)) * 100}%`,
                width: `${((focusEnd - focusStart - 1) / Math.max(overviewLength - 1, 1)) * 100}%`,
              }}
            />
            {overviewSites.map((editingSite) => {
              const selected = editingSite.position === design.targetPosition;
              return (
                <button
                  type="button"
                  className={`overview-a overview-a-${editingSite.category} ${selected ? "selected" : ""}`}
                  style={{ left: `${((editingSite.position - 1 - overviewStart) / Math.max(overviewLength - 1, 1)) * 100}%` }}
                  title={`A${editingSite.position}: ${CATEGORY_LABELS[editingSite.category]}`}
                  aria-label={`Select A${editingSite.position}, ${CATEGORY_LABELS[editingSite.category]}`}
                  aria-pressed={selected}
                  onClick={() => onTargetChange(editingSite.position)}
                  key={editingSite.position}
                >A</button>
              );
            })}
            <span
              className="overview-target-coordinate"
              style={{ left: `${((targetIndex - overviewStart) / Math.max(overviewLength - 1, 1)) * 100}%` }}
            >{design.targetPosition}</span>
          </div>
        </section>

        <div className="sequence-focus-layout">
          <section className="sequence-focus-panel">
            <div className="focus-heading"><span><Search size={14} />{focusSequence.length} nt view</span><span>{focusStart + 1}-{focusEnd}</span></div>
            <div className="focus-scroll">
              <div className="focus-canvas" style={focusGridStyle}>
                <div className="translation-grid">
                  {translationBlocks.map((block) => <span style={{ gridColumn: `${block.column} / span ${block.span}` }} key={block.position}>{block.label}</span>)}
                </div>
                <div className="codon-coordinate-grid">
                  {translationBlocks.map((block) => <span style={{ gridColumn: `${block.column} / span ${block.span}` }} key={block.position}>{block.position}</span>)}
                </div>

                <div className="focus-strand target-focus-strand">
                  <span className="focus-strand-label"><b>Target strand</b><i>5′→3′</i></span>
                  <div className="focus-bases">
                    {focusSequence.split("").map((base, index) => {
                      const position = focusStart + index + 1;
                      const editingSite = sitesByPosition.get(position);
                      const siteClass = editingSite ? `focus-site-${editingSite.category}` : "";
                      const selected = index === focusTargetIndex;
                      const title = editingSite ? codingContext ? `A${position}: ${CATEGORY_LABELS[editingSite.category]}; ${editingSite.codon} → ${editingSite.editedCodon}; ${editingSite.aminoAcid} → ${editingSite.editedAminoAcid}` : `A${position}: ${CATEGORY_LABELS[editingSite.category]}` : `Target position ${position}`;
                      return editingSite
                        ? <button type="button" className={`${siteClass} focus-clickable-a ${selected ? "focus-selected-target" : ""}`} title={title} aria-label={`Select A${position}, ${CATEGORY_LABELS[editingSite.category]}`} aria-pressed={selected} onClick={() => onTargetChange(position)} key={position}>{base}</button>
                        : <span title={title} key={position}>{base}</span>;
                    })}
                  </div>
                </div>
                <div className="focus-pair-lines"><span /> <div>{focusSequence.split("").map((_, index) => <i key={index}>{alignedGuide[index] === "-" ? "" : index === focusTargetIndex ? "•" : "|"}</i>)}</div></div>
                <div className="focus-strand guide-focus-strand">
                  <span className="focus-strand-label"><b>arRNA guide</b><i>3′→5′</i></span>
                  <div className="focus-bases">
                    {alignedGuide.split("").map((base, index) => {
                      const position = focusStart + index + 1;
                      const editingSite = sitesByPosition.get(position);
                      const pairedClass = base === "-" ? "normal-deletion-gap" : editingSite ? `focus-paired-${editingSite.category}` : "";
                      return <span className={`${pairedClass} ${index === focusTargetIndex ? "focus-paired-target" : ""}`} title={base === "-" ? l("Unpaired target bulge") : editingSite ? `Aligned opposite target A${position}: ${CATEGORY_LABELS[editingSite.category]}` : undefined} key={position}>{base}</span>;
                    })}
                  </div>
                </div>
              </div>
            </div>
            <p className="focus-caption">{focusSequence.length} nt shown, positions {focusStart + 1}-{focusEnd} of the input sequence</p>
          </section>

          <aside className="sequence-inspector">
            <div className="selected-site-inspector">
              <h2>A{site.position}</h2>
              <dl>
                {codingContext && <><div><dt>{l("Codon")}</dt><dd>{site.codon} → {site.editedCodon}</dd></div>
                <div><dt>{l("Translation")}</dt><dd>{AMINO_ACIDS[site.aminoAcid]} → {AMINO_ACIDS[site.editedAminoAcid]}</dd></div></>}
                <div><dt>{l("Property")}</dt><dd className={`inspector-${site.category}`}>{l(CATEGORY_LABELS[site.category])}</dd></div>
                <div><dt>{l("Guide coordinate")}</dt><dd>{guideCoordinate}</dd></div>
              </dl>
            </div>
            <div className="sequence-property-legend">
              <span><i className="property-selected" />{l("Selected A")}</span>
              {codingContext && <><span><i className="property-editable" />{l("Editable A")}</span>
              <span><i className="property-synonymous" />{l("Synonymous A")}</span>
              <span><i className="property-ga" />{l("GA difficult")}</span></>}
            </div>
          </aside>
        </div>
      </div>
        </div>
      </details>

      <details className="result-disclosure normal-tool-detail">
        <summary>
          <span><strong>{l("Full base-by-base pairing")}</strong></span>
        </summary>
        <div className="result-disclosure-body pairing-detail-body">
          <VariantPairing design={design} sites={sites} variant={selectedVariant} />
        </div>
      </details>
    </section>
  );
}
