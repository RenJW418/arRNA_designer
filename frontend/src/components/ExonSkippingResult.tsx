import { Check, Copy, Download } from "lucide-react";
import { CSSProperties, useState } from "react";
import { ExonSkippingCandidate, ExonSkippingDesign } from "../lib/exonSkipping";
import { createExonExportBundle, downloadText, serializeCsv, serializeFasta, serializeJson } from "../lib/exports";
import { InfoTip } from "./InfoTip";
import { useLanguage } from "./LanguageProvider";

interface Props {
  design: ExonSkippingDesign;
  onRevise: () => void;
}

const CLASS_LABELS = { short: "< x/2", medium: "x/2 – x", long: "> x" };
const PAIRING_ROW_SIZE = 30;

interface PairingViewProps {
  candidate: ExonSkippingCandidate;
  design: ExonSkippingDesign;
}

function CandidatePairingView({ candidate, design }: PairingViewProps) {
  const { l } = useLanguage();
  const alignedGuide = candidate.arrna_sequence.split("").reverse().join("");
  const exonGlobalStart = design.normalized_upstream_intron.length + 1;
  const exonGlobalEnd = exonGlobalStart + design.exon_length - 1;
  const eseAPositions = new Set(design.ese_regions.flatMap((region) => region.a_positions));
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
                  const isMismatch = globalPosition === candidate.mismatch_target_position;
                  const isEseA = inExon && base === "A" && eseAPositions.has(exonPosition);
                  return <span className={`${inExon ? "base-exon" : "base-intron"} ${isEseA ? "base-ese-a" : ""} ${isMismatch ? "base-sa-mismatch" : ""}`} title={`${inExon ? `Exon ${exonPosition}` : "Intron"} · local ${globalPosition}`} key={globalPosition}>{base}</span>;
                })}
              </div>
            </div>
            <div className="pairing-connectors"><span /><div>{chunk.target.split("").map((_, index) => {
              const globalPosition = chunkStart + index;
              const mismatch = globalPosition === candidate.mismatch_target_position;
              return <i className={mismatch ? "mismatch" : ""} key={globalPosition}>{mismatch ? "•" : "|"}</i>;
            })}</div></div>
            <div className="pairing-strand guide-pairing-strand">
              <span className="pairing-label"><b>arRNA</b><i>3′→5′</i></span>
              <div className="pairing-bases">
                {chunk.guide.split("").map((base, index) => {
                  const globalPosition = chunkStart + index;
                  const inExon = globalPosition >= exonGlobalStart && globalPosition <= exonGlobalEnd;
                  const mismatch = globalPosition === candidate.mismatch_target_position;
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
        {candidate.kind === "sa" && <span><i className="pairing-legend-mismatch" />SA A–C mismatch</span>}
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
    <section className="arrna-result exon-result exon-result-page" aria-live="polite">
      <div className="arrna-result-header">
        <div>
          <p className="eyebrow">{l("Exon skipping result")}</p>
          <h1>{design.candidates.length} arRNA {l(design.candidates.length === 1 ? "candidate" : "candidates")}</h1>
          <p>{l("Choose a candidate on the pre-mRNA map, then copy or export its sequence.")}</p>
        </div>
        <button className="button button-secondary" type="button" onClick={onRevise}>{l("Revise input")}</button>
      </div>

      <dl className="result-key-facts exon-key-facts">
        <div><dt>{l("Candidates")}</dt><dd>{design.candidates.length}</dd></div>
        <div><dt>{l("Requested length")}</dt><dd>{design.arrna_length} nt</dd></div>
        <div><dt>{l("Target exon")}</dt><dd>{design.exon_length} nt · {CLASS_LABELS[design.length_class]}</dd></div>
        <div><dt>{l("Design context")} <InfoTip>{l("SA describes the splice acceptor. ESE regions are merged above-threshold enhancer motifs used to place coverage candidates.")}</InfoTip></dt><dd>{l(design.sa_is_canonical ? "Canonical AG" : "Non-canonical SA")} · {design.ese_regions.length} ESE {l(design.ese_regions.length === 1 ? "region" : "regions")}</dd></div>
      </dl>

      {design.warnings.map((warning) => <div className="arrna-length-warning" key={warning}>{l(warning)}</div>)}

      <section className="exon-primary-panel" aria-labelledby="exon-candidate-title">
        <div className="normal-variant-heading simplified exon-result-heading">
          <div className="result-step-heading">
            <span>1</span>
            <div><p className="eyebrow">{l("Choose a candidate")}</p><h2 id="exon-candidate-title">{l("SA and ESE coverage map")}</h2></div>
          </div>
          <span>{total} nt {l("local context")}</span>
        </div>

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
        </div>
        <div className="candidate-track-list">
          {design.candidates.map((candidate) => (
            <button className={`candidate-track ${candidate.id === selected?.id ? "selected" : ""} candidate-${candidate.kind}`} type="button" aria-pressed={candidate.id === selected?.id} onClick={() => setSelectedId(candidate.id)} key={candidate.id}>
              <span>{candidate.label}</span>
              <i style={{ left: `${(candidate.global_start - 1) / total * 100}%`, width: `${(candidate.global_end - candidate.global_start + 1) / total * 100}%` }} />
              <small>{candidate.arrna_sequence.length} nt</small>
            </button>
          ))}
        </div>
        <div className="exon-track-legend"><span><i className="legend-sa" />{l("SA A–C candidate")}</span><span><i className="legend-ese-region" />{l("Merged ESE high-score region")}</span><span><i className="legend-ese-guide" />{l("Perfect-match ESE candidate")}</span></div>
      </div>

        {selected ? (
          <div className="exon-selected-panel">
            <div className="result-structure-heading exon-selected-heading">
              <div className="result-step-heading">
                <span>2</span>
                <div>
                  <p className="eyebrow">{l(selected.kind === "sa" ? "A–C mismatch candidate" : "Perfect-match candidate")}</p>
                  <h2>{selected.label}</h2>
                </div>
              </div>
              <strong>{selected.arrna_sequence.length} nt</strong>
            </div>

            <dl className="candidate-meta simplified">
              <div><dt>{l("Local coordinates")}</dt><dd>{selected.global_start}–{selected.global_end}</dd></div>
              <div><dt>{l("Exon coverage")}</dt><dd>{selected.exon_start}–{selected.exon_end}</dd></div>
              <div><dt>{l("ESE A covered")}</dt><dd>{selected.covered_a_positions.length || "—"}</dd></div>
              <div><dt>{l("Mismatch coordinate")}</dt><dd>{selected.mismatch_arrna_position ?? "—"}</dd></div>
            </dl>

            <div className="arrna-export result-primary-export exon-primary-export">
              <div><span>{l("Selected arRNA")} · 5′→3′ · A/C/G/U</span><code>{selected.arrna_sequence}</code><small>{selected.arrna_sequence.length} nt · {selected.kind === "sa" ? "SA A–C mismatch" : "ESE perfect complement"}</small></div>
              <div className="arrna-export-actions">
                <button className="button button-secondary" type="button" onClick={() => copy(selected)}>{copied ? <Check size={15} /> : <Copy size={15} />}{l(copied ? "Copied" : "Copy sequence")}</button>
                <button className="button button-secondary" type="button" onClick={() => download("csv")}><Download size={15} />CSV</button>
                <button className="button button-secondary" type="button" onClick={() => download("json")}><Download size={15} />JSON</button>
                <InfoTip align="left">{l("JSON includes normalized input, all candidates, the selected design, warnings, provenance and any recorded experimental evidence.")}</InfoTip>
                <button className="button button-primary" type="button" onClick={() => download("fasta")}><Download size={15} />FASTA</button>
              </div>
            </div>
          </div>
        ) : <div className="arrna-length-warning exon-no-candidate">{l("No arRNA candidate was generated. Revise the input sequence or design length.")}</div>}
      </section>

      <div className="result-detail-intro">
        <p className="eyebrow">{l("Supporting details")}</p>
        <h2>{l("Sequence evidence")} <InfoTip>{l("Open these panels only for nucleotide-level inspection or method documentation.")}</InfoTip></h2>
      </div>

      {selected && (
        <details className="result-disclosure">
          <summary>
            <span className="disclosure-index">A</span>
            <span><strong>{l("Full base-by-base pairing")}</strong></span>
          </summary>
          <div className="result-disclosure-body pairing-detail-body">
            <CandidatePairingView candidate={selected} design={design} />
          </div>
        </details>
      )}

      <details className="result-disclosure">
        <summary>
          <span className="disclosure-index">B</span>
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
