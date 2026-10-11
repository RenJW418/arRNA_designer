import { Check, Copy } from "lucide-react";
import { CSSProperties, useState } from "react";
import { ExonSkippingCandidate, ExonSkippingDesign } from "../lib/exonSkipping";
import { createExonExportBundle, downloadText, serializeCsv, serializeFasta, serializeJson } from "../lib/exports";
import { InfoTip } from "./InfoTip";
import { ExportMenu } from "./ExportMenu";
import { useLanguage } from "./LanguageProvider";

interface Props {
  design: ExonSkippingDesign;
  onRevise: () => void;
}

const CLASS_LABELS = { short: "<70 nt", medium: "70–150 nt", long: ">150 nt" };
const PAIRING_ROW_SIZE = 30;

interface PairingViewProps {
  candidate: ExonSkippingCandidate;
  design: ExonSkippingDesign;
}

function CandidatePairingOverview({ candidate, design }: PairingViewProps) {
  const { l } = useLanguage();
  const exonStart = design.normalized_upstream_intron.length + 1;
  const exonEnd = exonStart + design.exon_length - 1;
  const length = candidate.target_sequence.length;
  const x = (position: number) => 92 + (position - candidate.global_start) / Math.max(length - 1, 1) * 1068;
  const mismatches = new Set([
    ...(candidate.mismatch_target_position != null ? [candidate.mismatch_target_position] : []),
    ...(candidate.mismatch_exon_positions ?? []).map((position) => exonStart + position - 1),
  ]);
  const eseAs = new Set(design.ese_regions.flatMap((region) => region.a_positions.map((position) => exonStart + position - 1)));
  const guide = candidate.arrna_sequence.split("").reverse().join("");
  return <section className="exon-pairing-overview" aria-label={l("Base-pairing view")}>
    <div className="normal-schematic-scroll">
      <svg viewBox="0 0 1200 196" role="img" aria-label={`${candidate.label}: ${candidate.global_start}–${candidate.global_end}`}>
        <title>{candidate.label} · {l("Base-pairing view")}</title>
        {design.ese_regions.map((region, index) => {
          const start = Math.max(candidate.global_start, exonStart + region.start - 1);
          const end = Math.min(candidate.global_end, exonStart + region.end - 1);
          return start <= end ? <rect key={index} x={x(start) - 3} y="63" width={Math.max(6, x(end) - x(start) + 6)} height="32" fill="#edf5ef"><title>{l("Predicted ESE region")} {index + 1}</title></rect> : null;
        })}
        <path d="M92 86 H1160" className="normal-schematic-target-line" />
        <path d="M92 142 H1160" className="normal-schematic-guide-line" />
        {Array.from({ length }, (_, index) => {
          const position = candidate.global_start + index;
          return index % 6 === 0 && !mismatches.has(position) ? <line key={position} x1={x(position)} x2={x(position)} y1="92" y2="136" className="normal-schematic-pair" /> : null;
        })}
        {candidate.target_sequence.split("").map((base, index) => {
          if (base !== "A") return null;
          const position = candidate.global_start + index;
          const mismatch = mismatches.has(position);
          return <g key={position} transform={`translate(${x(position)}, 0)`}>
            <title>{l("Target")} {position}{mismatch ? " · A–C mismatch" : ""}</title>
            {mismatch && <rect x="-10" y="65" width="20" height="26" fill="var(--accent)" />}
            <text y="81" textAnchor="middle" fill={mismatch ? "white" : eseAs.has(position) ? "var(--green)" : "var(--accent)"} fontSize="11" fontWeight="600">A</text>
            {mismatch && <><text y="132" textAnchor="middle" fill="var(--green)" fontSize="11">{guide[index]}</text><text y="108" textAnchor="middle" fill="var(--muted)" fontSize="8">{position}</text></>}
          </g>;
        })}
        {[{ position: exonStart - 0.5, label: "SA" }, { position: exonEnd + 0.5, label: "SD" }].map(({ position, label }) => position >= candidate.global_start && position <= candidate.global_end ? <g key={label}><line x1={x(position)} x2={x(position)} y1="40" y2="91" stroke="#abb8bf" strokeDasharray="3 3" /><text x={x(position)} y="32" textAnchor="middle" fontSize="10" fill="var(--muted)">{label}</text></g> : null)}
        <text x="16" y="89" className="normal-schematic-strand-label">TARGET</text>
        <text x="16" y="145" className="normal-schematic-strand-label guide">arRNA</text>
        <text x="92" y="59" className="normal-schematic-direction">5′</text><text x="1150" y="59" className="normal-schematic-direction">3′</text>
        <text x="92" y="170" className="normal-schematic-direction guide">3′</text><text x="1150" y="170" className="normal-schematic-direction guide">5′</text>
      </svg>
    </div>
    <div className="normal-schematic-legend"><span>{l("Target")} {candidate.global_start}–{candidate.global_end} · {length} nt</span><span><i className="synonymous-a" />{l("ESE-region A")}</span>{mismatches.size > 0 && <span>A–C mismatch · {mismatches.size}</span>}</div>
  </section>;
}

function CandidatePairingView({ candidate, design }: PairingViewProps) {
  const { l } = useLanguage();
  const alignedGuide = candidate.arrna_sequence.split("").reverse().join("");
  const exonGlobalStart = design.normalized_upstream_intron.length + 1;
  const exonGlobalEnd = exonGlobalStart + design.exon_length - 1;
  const eseAPositions = new Set(design.ese_regions.flatMap((region) => region.a_positions));
  const mismatchedPositions = new Set([
    ...(candidate.mismatch_target_position ? [candidate.mismatch_target_position] : []),
    ...(candidate.mismatch_exon_positions ?? []).map((p) => exonGlobalStart + p - 1),
  ]);
  const chunks = Array.from(
    { length: Math.ceil(candidate.target_sequence.length / PAIRING_ROW_SIZE) },
    (_, index) => ({
      offset: index * PAIRING_ROW_SIZE,
      target: candidate.target_sequence.slice(index * PAIRING_ROW_SIZE, (index + 1) * PAIRING_ROW_SIZE),
      guide: alignedGuide.slice(index * PAIRING_ROW_SIZE, (index + 1) * PAIRING_ROW_SIZE),
    }),
  );

  return (
    <div className="candidate-pairing-view">
      <div className="pairing-view-heading"><strong>{l("Base-pairing view")}</strong><span>{l("arRNA is aligned 3′→5′; export remains 5′→3′")}</span></div>
      {chunks.map((chunk) => {
        const chunkStart = candidate.global_start + chunk.offset;
        const chunkEnd = chunkStart + chunk.target.length - 1;
        const columns = { "--pairing-columns": PAIRING_ROW_SIZE } as CSSProperties;
        return (
          <div className="pairing-chunk" style={columns} key={chunk.offset}>
            <div className="pairing-coordinate-line"><span>{chunkStart}</span><i /><span>{chunkEnd}</span></div>
            <div className="pairing-strand target-pairing-strand">
              <span className="pairing-label"><b>Target</b><i>5′→3′</i></span>
              <div className="pairing-bases">
                {chunk.target.split("").map((base, index) => {
                  const globalPosition = chunkStart + index;
                  const exonPosition = globalPosition - exonGlobalStart + 1;
                  const inExon = globalPosition >= exonGlobalStart && globalPosition <= exonGlobalEnd;
                  const isMismatch = mismatchedPositions.has(globalPosition);
                  const isEseA = inExon && base === "A" && eseAPositions.has(exonPosition);
                  return <span className={`${inExon ? "base-exon" : "base-intron"} ${isEseA ? "base-ese-a" : ""} ${isMismatch ? "base-sa-mismatch" : ""}`} title={`${inExon ? `Exon ${exonPosition}` : "Intron"} · local ${globalPosition}`} key={globalPosition}>{base}</span>;
                })}
              </div>
            </div>
            <div className="pairing-connectors"><span /><div>{chunk.target.split("").map((_, index) => {
              const globalPosition = chunkStart + index;
              const mismatch = mismatchedPositions.has(globalPosition);
              return <i className={mismatch ? "mismatch" : ""} key={globalPosition}>{mismatch ? "•" : "|"}</i>;
            })}</div></div>
            <div className="pairing-strand guide-pairing-strand">
              <span className="pairing-label"><b>arRNA</b><i>3′→5′</i></span>
              <div className="pairing-bases">
                {chunk.guide.split("").map((base, index) => {
                  const globalPosition = chunkStart + index;
                  const inExon = globalPosition >= exonGlobalStart && globalPosition <= exonGlobalEnd;
                  const mismatch = mismatchedPositions.has(globalPosition);
                  return <span className={`${inExon ? "base-exon-guide" : ""} ${mismatch ? "base-guide-mismatch" : ""}`} key={globalPosition}>{base}</span>;
                })}
              </div>
            </div>
          </div>
        );
      })}
      <div className="pairing-legend">
        <span><i className="pairing-legend-intron" />{l("Intron")}</span>
        <span><i className="pairing-legend-exon" />Exon X</span>
        <span><i className="pairing-legend-ese" />{l("ESE-region A")}</span>
        {mismatchedPositions.size > 0 && <span><i className="pairing-legend-mismatch" />A–C mismatch</span>}
      </div>
    </div>
  );
}

export function ExonSkippingResult({ design, onRevise }: Props) {
  const { l } = useLanguage();
  const [selectedId, setSelectedId] = useState(design.candidates[0]?.id ?? "");
  const [copied, setCopied] = useState(false);
  const selected = design.candidates.find((candidate) => candidate.id === selectedId) ?? design.candidates[0];
  const total = design.normalized_upstream_intron.length + design.exon_length + design.normalized_downstream_intron.length;
  const exonStart = design.normalized_upstream_intron.length;
  const exonLeft = exonStart / total * 100;
  const exonWidth = design.exon_length / total * 100;

  async function copy(candidate: ExonSkippingCandidate) {
    await navigator.clipboard.writeText(candidate.arrna_sequence);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  function exportBundle() {
    return createExonExportBundle(design, selectedId);
  }

  function download(format: "fasta" | "csv" | "json") {
    const serializers = { fasta: serializeFasta, csv: serializeCsv, json: serializeJson };
    const mime = format === "csv" ? "text/csv;charset=utf-8" : format === "json" ? "application/json;charset=utf-8" : "text/plain;charset=utf-8";
    downloadText(`LEAPER_exon_skipping_candidates.${format}`, serializers[format](exportBundle()), mime);
  }

  return (
    <section className="arrna-result exon-result exon-result-page task-result-page normal-tool-result exon-tool-result" aria-live="polite">
      <div className="arrna-result-header normal-tool-header">
        <div>
          <h1>{l("Exon skipping")}</h1>
          <p className="normal-tool-meta">{design.arrna_length} nt · {design.candidates.length} {l(design.candidates.length === 1 ? "candidate" : "candidates")}</p>
        </div>
        <button className="button button-secondary" type="button" onClick={onRevise}>{l("Revise input")}</button>
      </div>



      {design.warnings.map((warning) => <div className="arrna-length-warning" key={warning}>{l(warning)}</div>)}

      <section className="exon-primary-panel" aria-label={l("SA and ESE candidates")}>
      <div className="exon-result-layout">
        <aside className="exon-candidate-sidebar" aria-label={l("SA and ESE candidates")}>
          <div className="normal-candidate-picker">
            {design.candidates.map((candidate) => <button className="normal-candidate-option" type="button" aria-pressed={candidate.id === selected?.id} onClick={() => { setSelectedId(candidate.id); setCopied(false); }} key={candidate.id}>
              <span className="normal-candidate-name"><span>{candidate.label}</span><strong>{candidate.arrna_sequence.length} nt</strong></span><small className="normal-candidate-change">{candidate.kind === "sa" ? "SA A–C mismatch" : l("ESE coverage")}</small>
            </button>)}
          </div>
        </aside>
        <div className="exon-result-main">
      <div className="exon-design-board">
        <div className="exon-board-heading"><strong>INTRON X−1 · EXON X · INTRON X</strong><span>{total} nt {l("local context")}</span></div>
        <div className="exon-coordinate-track">
          <i className="pre-mrna-line" />
          <span className="exon-block" style={{ left: `${exonLeft}%`, width: `${exonWidth}%` }}>EXON X</span>
          <span className="sa-marker" style={{ left: `${exonLeft}%` }} title="Splice acceptor">SA</span>
          <span className="sd-marker" style={{ left: `${exonLeft + exonWidth}%` }} title="Splice donor">SD</span>
          {design.ese_regions.map((region, index) => (
            <span className="ese-region" style={{ left: `${(exonStart + region.start - 1) / total * 100}%`, width: `${(region.end - region.start + 1) / total * 100}%` }} title={`ESE ${index + 1}: exon ${region.start}-${region.end}; peak ${region.peak_score}`} key={`${region.start}-${region.end}`} />
          ))}
          {selected && <span className={`selected-candidate-coverage candidate-${selected.kind}`} style={{ left: `${(selected.global_start - 1) / total * 100}%`, width: `${(selected.global_end - selected.global_start + 1) / total * 100}%` }} title={`${selected.label}: ${selected.global_start}–${selected.global_end}`} />}
        </div>
        <div className="exon-track-legend"><span><i className="legend-sa" />{l("SA A–C candidate")}</span><span><i className="legend-ese-region" />{l("Predicted ESE region")}</span><span><i className="legend-ese-guide" />{l("ESE coverage candidate")}</span></div>
      </div>

        {selected ? (
          <div className="exon-selected-panel">
            <div className="normal-selected-note"><strong>{selected.label}</strong><span>{l(selected.kind === "sa" ? "A–C mismatch candidate" : (selected.mismatch_exon_positions?.length ?? 0) > 0 ? "ESE with optional A/C mismatches" : "Perfect-match candidate")}</span></div>

            <details className="result-disclosure normal-tool-detail"><summary>{l("Candidate details")}</summary><dl className="candidate-meta simplified">
              <div><dt>{l("Local coordinates")}</dt><dd>{selected.global_start}–{selected.global_end}</dd></div>
              <div><dt>{l("Exon coverage")}</dt><dd>{selected.exon_start}–{selected.exon_end}</dd></div>
              <div><dt>{l("ESE regions fully covered")}</dt><dd>{selected.covered_region_indices.length}</dd></div>
              <div><dt>{l("ESE regions partially covered")}</dt><dd>{selected.partially_covered_region_indices?.length ?? 0}</dd></div>
              <div><dt>{l("Mismatch coordinate")}</dt><dd>{selected.mismatch_arrna_position ?? "—"}</dd></div>
            </dl></details>

            <CandidatePairingOverview candidate={selected} design={design} />
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
            <details className="result-disclosure normal-tool-detail">
              <summary><span><strong>{l("Full base-by-base pairing")}</strong></span></summary>
              <div className="result-disclosure-body"><CandidatePairingView candidate={selected} design={design} /></div>
            </details>
          </div>
        ) : <div className="arrna-length-warning exon-no-candidate">{l("No arRNA candidate was generated. Revise the input sequence or design length.")}</div>}
        </div>
      </div>
      </section>

      <details className="result-disclosure normal-tool-detail"><summary>{l("Design details")} · {design.arrna_length} nt</summary><dl className="result-key-facts exon-key-facts">
        <div><dt>{l("Candidates")}</dt><dd>{design.candidates.length}</dd></div>
        <div><dt>{l("Requested length")}</dt><dd>{design.arrna_length} nt</dd></div>
        <div><dt>{l("Target exon")}</dt><dd>{design.exon_length} nt · {CLASS_LABELS[design.length_class]}</dd></div>
        <div><dt>{l("Design context")} <InfoTip>{l("SA describes the splice acceptor. Predicted ESE regions are candidates for experimental validation, not confirmed functional enhancers.")}</InfoTip></dt><dd>{l(design.sa_is_canonical ? "Canonical AG" : "Non-canonical SA")} · {design.ese_regions.length} ESE {l(design.ese_regions.length === 1 ? "region" : "regions")}</dd></div>
      </dl></details>

      <details className="result-disclosure normal-tool-detail">
        <summary>
          <span><strong>{l("Data and method provenance")}</strong></span>
        </summary>
        <div className="result-disclosure-body provenance-disclosure-body">
      <section className="method-provenance" aria-labelledby="method-provenance-title">
        <div className="provenance-heading">
          <p className="eyebrow">{l("Data & method provenance")}</p>
          <h2 id="method-provenance-title">{l("References for this design")}</h2>
        </div>
        <div className="provenance-grid">
          <article>
            <span>{l("Sequence source")}</span>
            <h3>{l(design.transcript ? "NCBI reference sequence" : "User-supplied sequence")}</h3>
            {design.transcript ? <p>Transcript <strong>{design.transcript}</strong>{design.exon_number ? `, exon ${design.exon_number}` : ""}. {l("Transcript metadata and genomic exon coordinates were resolved with NCBI Datasets; the sequence was retrieved from NCBI Nucleotide using EFetch.")}</p> : <p>{l("The intron–exon–intron sequence was supplied directly and was not resolved through NCBI.")}</p>}
            <div className="provenance-links">
              <a href="https://www.ncbi.nlm.nih.gov/datasets/" target="_blank" rel="noreferrer">NCBI Datasets ↗</a>
              <a href="https://www.ncbi.nlm.nih.gov/books/NBK25501/" target="_blank" rel="noreferrer">NCBI E-utilities ↗</a>
              {design.transcript && <a href="https://www.ncbi.nlm.nih.gov/refseq/MANE/" target="_blank" rel="noreferrer">MANE Select ↗</a>}
            </div>
          </article>
          <article>
            <span>{l("ESE scoring method")}</span>
            <h3>ESEfinder 3.0</h3>
            <p>{l("Local scoring uses the five published ESEfinder matrices and their official thresholds. The workflow retains motifs containing A and merges overlapping hits into design regions.")}</p>
            <cite>Cartegni L, Wang J, Zhu Z, Zhang MQ, Krainer AR. ESEfinder: a web resource to identify exonic splicing enhancers. Nucleic Acids Res. 2003;31(13):3568–3571.</cite>
            <div className="provenance-links">
              <a href="https://esefinder.ahc.umn.edu/cgi-bin/tools/ESE3/esefinder.cgi?process=home" target="_blank" rel="noreferrer">ESEfinder 3.0 ↗</a>
              <a href="https://doi.org/10.1093/nar/gkg616" target="_blank" rel="noreferrer">DOI: 10.1093/nar/gkg616 ↗</a>
            </div>
          </article>
        </div>
      </section>
        </div>
      </details>
    </section>
  );
}
