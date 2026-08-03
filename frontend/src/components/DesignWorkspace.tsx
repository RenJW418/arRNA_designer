import { ArrowLeft, Check, Dna, Search, ShieldCheck } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { InitialArrnaResult } from "./InitialArrnaResult";
import { ExonSkippingResult } from "./ExonSkippingResult";
import { TranscriptPreview } from "./TranscriptPreview";
import { AdarEnvironment, classifyEditingSites, designInitialArrna, validateAdarPairing } from "../lib/normalEditing";
import { createExonSkippingDesign, ExonSkippingDesign, NcbiCodingReference, NcbiExonReference, resolveNcbiCodingSequence, resolveNcbiExon } from "../lib/exonSkipping";

type Mode = "sequence" | "gene";
type Application = "normal_editing" | "exon_skipping";

interface Props {
  onExit: () => void;
}

export function DesignWorkspace({ onExit }: Props) {
  const [mode, setMode] = useState<Mode>("sequence");
  const [application, setApplication] = useState<Application>("normal_editing");
  const [sequence, setSequence] = useState("");
  const [position, setPosition] = useState("1");
  const [gene, setGene] = useState("DMD");
  const [species, setSpecies] = useState("9606");
  const [submitted, setSubmitted] = useState(false);
  const [upstreamIntron, setUpstreamIntron] = useState("");
  const [targetExon, setTargetExon] = useState("");
  const [downstreamIntron, setDownstreamIntron] = useState("");
  const [exonNumber, setExonNumber] = useState("51");
  const [arrnaLength, setArrnaLength] = useState("151");
  const [exonDesign, setExonDesign] = useState<ExonSkippingDesign | null>(null);
  const [reference, setReference] = useState<NcbiExonReference | null>(null);
  const [normalReference, setNormalReference] = useState<NcbiCodingReference | null>(null);
  const [adarEnvironment, setAdarEnvironment] = useState<AdarEnvironment>("ADAR1");
  const [requestError, setRequestError] = useState("");
  const [loading, setLoading] = useState(false);

  const cleanSequence = useMemo(
    () => sequence.toUpperCase().replace(/U/g, "T").replace(/[^A-Z]/g, ""),
    [sequence],
  );
  const invalidSequence = cleanSequence.length > 0 && /[^ACGT]/.test(cleanSequence);
  const inFrame = cleanSequence.length > 0 && cleanSequence.length % 3 === 0;
  const editingSites = useMemo(
    () => classifyEditingSites(cleanSequence),
    [cleanSequence],
  );
  const selectedSite = editingSites.find((site) => site.position === Number(position));
  const invalidTarget = application === "normal_editing" && cleanSequence.length > 0 && !selectedSite;
  const initialArrna = useMemo(
    () => application === "normal_editing" ? designInitialArrna(cleanSequence, Number(position)) : null,
    [application, cleanSequence, position],
  );

  const normalize = (value: string) => value.toUpperCase().replace(/U/g, "T").replace(/\s/g, "");
  const exonSequences = [upstreamIntron, targetExon, downstreamIntron].map(normalize);
  const invalidExonSequence = exonSequences.some((value) => value.length > 0 && /[^ACGT]/.test(value));

  async function submit(event: FormEvent) {
    event.preventDefault();
    setRequestError("");
    if (application === "normal_editing") {
      if (mode === "gene" && !normalReference) {
        setLoading(true);
        try {
          const codingReference = await resolveNcbiCodingSequence(species, gene);
          const sites = classifyEditingSites(codingReference.cds_sequence);
          const hasFullFlanks = (site: { position: number }) =>
            site.position >= 76 && site.position <= codingReference.cds_sequence.length - 75;
          const defaultSite = sites.find((site) => site.category === "editable" && hasFullFlanks(site))
            ?? sites.find((site) => site.category === "synonymous" && hasFullFlanks(site))
            ?? sites.find((site) => site.category !== "blocked_ga")
            ?? sites[0];
          if (!defaultSite) throw new Error("The selected CDS contains no A target site.");
          setNormalReference(codingReference);
          setSequence(codingReference.cds_sequence);
          setPosition(String(defaultSite.position));
        } catch (error) {
          setRequestError(error instanceof Error ? error.message : "The NCBI reference request failed.");
        } finally {
          setLoading(false);
        }
        return;
      }
      if (!cleanSequence || invalidSequence || !inFrame || invalidTarget || !initialArrna) return;
      const pairingValidation = validateAdarPairing(initialArrna, adarEnvironment);
      if (!pairingValidation.valid) {
        setRequestError(`${adarEnvironment} pairing requirement not met: ${pairingValidation.message}.`);
        return;
      }
      setSubmitted(true);
      return;
    }
    const length = Number(arrnaLength);
    if (!Number.isInteger(length) || length < 21 || length > 1001) {
      setRequestError("arRNA length must be an integer from 21 to 1001 nt.");
      return;
    }
    setLoading(true);
    try {
      let activeReference = reference;
      let [upstream, exon, downstream] = exonSequences;
      if (mode === "gene") {
        activeReference = await resolveNcbiExon(species, gene, Number(exonNumber), length);
        setReference(activeReference);
        upstream = activeReference.upstream_intron;
        exon = activeReference.exon;
        downstream = activeReference.downstream_intron;
        setUpstreamIntron(upstream);
        setTargetExon(exon);
        setDownstreamIntron(downstream);
      } else if (!upstream || !exon || !downstream || invalidExonSequence) {
        setRequestError("Provide valid A/C/G/T/U sequence for all three regions.");
        return;
      }
      const design = await createExonSkippingDesign(upstream, exon, downstream, length, activeReference ?? undefined);
      setExonDesign(design);
      setSubmitted(true);
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : "The design request failed.");
    } finally {
      setLoading(false);
    }
  }

  function changeNormalTarget(nextPosition: number) {
    const nextDesign = designInitialArrna(cleanSequence, nextPosition);
    if (!nextDesign) return;
    const pairingValidation = validateAdarPairing(nextDesign, adarEnvironment);
    setPosition(String(nextPosition));
    if (!pairingValidation.valid) {
      setRequestError(`${adarEnvironment} pairing requirement not met: ${pairingValidation.message}.`);
      setSubmitted(false);
    }
  }

  if (submitted && application === "normal_editing" && selectedSite && initialArrna) {
    return <InitialArrnaResult design={initialArrna} sequence={cleanSequence} site={selectedSite} sites={editingSites} environment={adarEnvironment} reference={mode === "gene" ? normalReference : null} onTargetChange={changeNormalTarget} onRevise={() => setSubmitted(false)} />;
  }

  if (submitted && application === "exon_skipping" && exonDesign) {
    return <ExonSkippingResult design={exonDesign} onRevise={() => setSubmitted(false)} />;
  }

  if (submitted) {
    return (
      <section className="result-placeholder" aria-live="polite">
        <p className="eyebrow">Design request validated</p>
        <div className="result-status"><Check aria-hidden="true" /></div>
        <h1>Input is ready for analysis.</h1>
        <p>
          The arRNA design algorithm has not been connected yet. This prototype has
          validated the product flow and will preserve the exact API boundary for the
          scientific pipeline.
        </p>
        <dl>
          <div><dt>Input mode</dt><dd>{mode === "sequence" ? "Direct sequence" : "Gene / species"}</dd></div>
          <div><dt>Application</dt><dd>{application === "normal_editing" ? "Normal editing" : "Exon skipping"}</dd></div>
          <div><dt>Target</dt><dd>{mode === "sequence" ? `Position ${position}` : `${gene} · Homo sapiens`}</dd></div>
        </dl>
        <button className="button button-primary" onClick={() => setSubmitted(false)}>
          Revise input
        </button>
      </section>
    );
  }

  return (
    <section className="workspace">
      <button className="back-button" onClick={onExit}>
        <ArrowLeft aria-hidden="true" size={16} /> Back to overview
      </button>
      <div className="workspace-heading">
        <div>
          <p className="eyebrow">New design · Step 1 of 3</p>
          <h1>Define the editing target</h1>
        </div>
        <p><ShieldCheck aria-hidden="true" size={17} /> Sequence data expires within 24 hours</p>
      </div>

      <form onSubmit={submit}>
        <fieldset className="mode-picker">
          <legend>Choose an input mode</legend>
          <label className={mode === "sequence" ? "mode-option selected" : "mode-option"}>
            <input type="radio" name="mode" checked={mode === "sequence"} onChange={() => setMode("sequence")} />
            <Dna aria-hidden="true" />
            <span><strong>Sequence mode</strong><small>Paste DNA or RNA directly</small></span>
          </label>
          <label className={mode === "gene" ? "mode-option selected" : "mode-option"}>
            <input type="radio" name="mode" checked={mode === "gene"} onChange={() => setMode("gene")} />
            <Search aria-hidden="true" />
            <span><strong>Gene / species</strong><small>Resolve a reference transcript</small></span>
          </label>
        </fieldset>

        <div className="workspace-grid">
          <div className="form-panel">
            {mode === "sequence" && application === "normal_editing" ? (
              <>
                <label htmlFor="sequence">Target sequence <span>5′ → 3′</span></label>
                <textarea
                  id="sequence"
                  value={sequence}
                  onChange={(event) => setSequence(event.target.value)}
                  placeholder="Paste a DNA or RNA sequence…"
                  rows={7}
                />
                <div className={invalidSequence || (cleanSequence.length > 0 && !inFrame) ? "field-meta error" : "field-meta"}>
                  <span>{invalidSequence ? "Only A, C, G, T or U are supported" : inFrame ? "In-frame coding sequence" : "Length must be divisible by 3"}</span>
                  <span>{cleanSequence.length.toLocaleString()} nt</span>
                </div>
                <label htmlFor="position">Target A position <span>1-based sequence coordinate</span></label>
                <input id="position" type="number" min="1" max={cleanSequence.length || undefined} value={position} onChange={(event) => setPosition(event.target.value)} />
                {invalidTarget && <p className="target-field-error">Choose a colored A in the sequence preview.</p>}
              </>
            ) : mode === "gene" ? (
              <>
                <div className="form-row">
                  <div>
                    <label htmlFor="species">Species</label>
                  <select id="species" value={species} onChange={(event) => { setSpecies(event.target.value); setReference(null); setNormalReference(null); }}>
                      <option value="9606">Homo sapiens</option>
                      <option value="10090">Mus musculus</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="gene">Gene symbol</label>
                    <input id="gene" value={gene} onChange={(event) => { setGene(event.target.value.toUpperCase()); setReference(null); setNormalReference(null); }} />
                  </div>
                </div>
                {application === "exon_skipping" ? <>
                  <label htmlFor="exon-number">Target exon number</label>
                  <input id="exon-number" type="number" min="2" value={exonNumber} onChange={(event) => setExonNumber(event.target.value)} />
                  <div className="reference-notice">
                    Sequence and exon coordinates are retrieved live from <a href="https://www.ncbi.nlm.nih.gov/datasets/" target="_blank" rel="noreferrer">NCBI Datasets</a>. <a href="https://www.ncbi.nlm.nih.gov/refseq/MANE/" target="_blank" rel="noreferrer">MANE Select</a> is preferred; if unavailable, the longest protein-coding RefSeq transcript is used.
                  </div>
                  {reference && <div className="resolved-reference"><strong>{reference.transcript} · {reference.selection}</strong><span>{reference.species} · {reference.genomic_accession} · exon {reference.exon_number}/{reference.exon_count}</span></div>}
                </> : <>
                  <div className="reference-notice">The in-frame CDS is retrieved live from <a href="https://www.ncbi.nlm.nih.gov/datasets/" target="_blank" rel="noreferrer">NCBI Datasets</a>. <a href="https://www.ncbi.nlm.nih.gov/refseq/MANE/" target="_blank" rel="noreferrer">MANE Select</a> is preferred; if unavailable, the longest protein-coding RefSeq transcript is used.</div>
                  {normalReference && <>
                    <div className="resolved-reference"><strong>{normalReference.transcript} · {normalReference.selection}</strong><span>{normalReference.species} · CDS {normalReference.cds_start}–{normalReference.cds_end} · {normalReference.cds_sequence.length.toLocaleString()} nt</span></div>
                    <label htmlFor="gene-position">Target A position <span>CDS coordinate; choose in preview</span></label>
                    <input id="gene-position" type="number" min="1" max={cleanSequence.length || undefined} value={position} onChange={(event) => setPosition(event.target.value)} />
                    {invalidTarget && <p className="target-field-error">Choose a colored A in the CDS preview.</p>}
                  </>}
                </>}
              </>
            ) : (
              <div className="exon-sequence-fields">
                <label htmlFor="upstream-intron">Intron X−1 <span>ends at the SA</span></label>
                <textarea id="upstream-intron" rows={4} value={upstreamIntron} onChange={(event) => setUpstreamIntron(event.target.value)} placeholder="Upstream intron; canonical input ends in AG…" />
                <span className="segment-count">{normalize(upstreamIntron).length} nt</span>
                <label htmlFor="target-exon">Exon X <span>exon to skip</span></label>
                <textarea id="target-exon" rows={4} value={targetExon} onChange={(event) => setTargetExon(event.target.value)} placeholder="Target exon sequence…" />
                <span className="segment-count">{normalize(targetExon).length} nt</span>
                <label htmlFor="downstream-intron">Intron X <span>starts after the SD</span></label>
                <textarea id="downstream-intron" rows={4} value={downstreamIntron} onChange={(event) => setDownstreamIntron(event.target.value)} placeholder="Downstream intron sequence…" />
                <div className={invalidExonSequence ? "field-meta error" : "field-meta"}><span>{invalidExonSequence ? "Only A, C, G, T or U are supported" : "T and U are both accepted"}</span><span>{normalize(downstreamIntron).length} nt</span></div>
              </div>
            )}

            <fieldset className="application-picker">
              <legend>Application type</legend>
              <label><input type="radio" checked={application === "normal_editing"} onChange={() => setApplication("normal_editing")} /> Normal editing</label>
              <label><input type="radio" checked={application === "exon_skipping"} onChange={() => setApplication("exon_skipping")} /> Exon skipping</label>
            </fieldset>

            {application === "normal_editing" && <fieldset className="adar-picker">
              <legend>ADAR environment</legend>
              <label className={adarEnvironment === "ADAR1" ? "selected" : ""}><input type="radio" name="adar-environment" checked={adarEnvironment === "ADAR1"} onChange={() => setAdarEnvironment("ADAR1")} /><span><strong>ADAR1</strong><small>5′ ≥4 paired nt · 3′ ≥20 paired nt</small></span></label>
              <label className={adarEnvironment === "ADAR2" ? "selected" : ""}><input type="radio" name="adar-environment" checked={adarEnvironment === "ADAR2"} onChange={() => setAdarEnvironment("ADAR2")} /><span><strong>ADAR2</strong><small>5′ ≥6 paired nt · 3′ ≥11 paired nt</small></span></label>
            </fieldset>}

            {application === "exon_skipping" && (
              <div className="length-control">
                <label htmlFor="arrna-length">arRNA length x <span>default 151 nt</span></label>
                <input id="arrna-length" type="number" min="21" max="1001" value={arrnaLength} onChange={(event) => setArrnaLength(event.target.value)} />
                <small>Exons are classified as &lt; x/2, x/2–x, or &gt; x.</small>
              </div>
            )}

            {requestError && <p className="request-error" role="alert">{requestError}</p>}

            <button className="button button-primary submit-button" type="submit" disabled={loading}>
              {loading ? "Loading NCBI reference…" : application === "exon_skipping" ? mode === "gene" ? "Fetch reference & design" : "Generate exon-skipping arRNAs" : mode === "gene" ? normalReference ? "Generate initial arRNA" : "Fetch coding sequence" : "Review design input"}
            </button>
          </div>
          {application === "normal_editing" ? <TranscriptPreview mode={mode === "gene" && normalReference ? "sequence" : mode} sourceLabel={normalReference ? `${normalReference.gene} · ${normalReference.transcript} CDS` : undefined} sequence={cleanSequence} position={Number(position)} onPositionChange={(nextPosition) => setPosition(String(nextPosition))} /> : <div className="preview-panel exon-principle-preview">
            <div className="preview-header"><span>Exon skipping logic</span><span>x = {arrnaLength || "—"} nt</span></div>
            <div className="exon-input-map"><span>INTRON X−1</span><i>SA</i><strong>EXON X</strong><i>SD</i><span>INTRON X</span></div>
            <div className="design-rule-list">
              <div><b>&lt; x/2</b><span>SA-centered A–C guide can cover the whole exon and enter intron X.</span></div>
              <div><b>x/2 – x</b><span>Keep the SA guide and add the minimum ESE coverage needed.</span></div>
              <div><b>&gt; x</b><span>Keep the SA guide and tile the fewest guides across merged ESE regions.</span></div>
            </div>
            <p className="preview-help">ESE candidates use perfect complementarity. Only above-threshold motifs containing A are merged into candidate regions. Scores use the published <a href="https://esefinder.ahc.umn.edu/cgi-bin/tools/ESE3/esefinder.cgi?process=matrices" target="_blank" rel="noreferrer">ESEfinder 3.0 matrices and thresholds</a>.</p>
          </div>}
        </div>
      </form>
    </section>
  );
}
