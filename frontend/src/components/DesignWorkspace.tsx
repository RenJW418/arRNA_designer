import { ArrowLeft, Dna, Search } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { InitialArrnaResult } from "./InitialArrnaResult";
import { ExonSkippingResult } from "./ExonSkippingResult";
import { DesignPreview } from "./DesignPreview";
import { TranscriptPreview } from "./TranscriptPreview";
import { AdarEnvironment, classifyEditingSites } from "../lib/normalEditing";
import { createExonSkippingDesign, ExonSkippingDesign, NcbiCodingReference, NcbiExonReference, resolveNcbiCodingSequence, resolveNcbiExon } from "../lib/exonSkipping";
import { createNormalEditingDesign, normalResultToDesign, normalResultToVariants, NormalEditingResult } from "../lib/api";
import type { DesignExample } from "../lib/examples";
import type { TestedDuplexSeed } from "../lib/testedDuplex";
import { InfoTip } from "./InfoTip";
import { useLanguage } from "./LanguageProvider";
import { TaskInputShell, type TaskStep } from "./TaskLayout";

type Mode = "sequence" | "gene";
export type Application = "normal_editing" | "exon_skipping";

interface Props {
  onExit: () => void;
  onRefine: (seed: TestedDuplexSeed) => void;
  initialExample?: DesignExample | null;
  initialApplication?: Application;
}

export function DesignWorkspace({ onExit, onRefine, initialExample, initialApplication = "normal_editing" }: Props) {
  const { l } = useLanguage();
  const [mode, setMode] = useState<Mode>(initialExample?.mode ?? "sequence");
  const application = initialExample?.application ?? initialApplication;
  const [sequence, setSequence] = useState(initialExample?.sequence ?? "");
  const [position, setPosition] = useState(String(initialExample?.position ?? 1));
  const [gene, setGene] = useState(initialExample?.gene ?? "DMD");
  const [species, setSpecies] = useState(initialExample?.species ?? "9606");
  const [submitted, setSubmitted] = useState(false);
  const [upstreamIntron, setUpstreamIntron] = useState("");
  const [targetExon, setTargetExon] = useState("");
  const [downstreamIntron, setDownstreamIntron] = useState("");
  const [exonNumber, setExonNumber] = useState(String(initialExample?.exonNumber ?? 51));
  const [arrnaLength, setArrnaLength] = useState(String(initialExample?.arrnaLength ?? 151));
  const [exonDesign, setExonDesign] = useState<ExonSkippingDesign | null>(null);
  const [reference, setReference] = useState<NcbiExonReference | null>(null);
  const [normalReference, setNormalReference] = useState<NcbiCodingReference | null>(null);
  const [normalResult, setNormalResult] = useState<NormalEditingResult | null>(null);
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
          if (!defaultSite) throw new Error(l("No adenosine target was found in the selected CDS. Choose another gene or enter a sequence."));
          setNormalReference(codingReference);
          setSequence(codingReference.cds_sequence);
          setPosition(String(defaultSite.position));
        } catch (error) {
          setRequestError(error instanceof Error ? l(error.message) : l("The NCBI reference could not be loaded. Check the reference identifiers and try again."));
        } finally {
          setLoading(false);
        }
        return;
      }
      if (!cleanSequence || invalidSequence || !inFrame || invalidTarget) return;
      setLoading(true);
      try {
        const result = await createNormalEditingDesign(
          cleanSequence,
          Number(position),
          adarEnvironment,
          mode === "gene" ? normalReference : null,
        );
        setNormalResult(result);
        setSubmitted(true);
      } catch (error) {
        setRequestError(error instanceof Error ? l(error.message) : l("The design could not be generated. Check the input and try again."));
      } finally {
        setLoading(false);
      }
      return;
    }
    const length = Number(arrnaLength);
    if (!Number.isInteger(length) || length < 21 || length > 1001) {
      setRequestError(l("Enter an arRNA length from 21 to 1001 nt."));
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
        setRequestError(l("Enter A/C/G/T/U sequences for the upstream intron, target exon and downstream intron."));
        return;
      }
      const design = await createExonSkippingDesign(upstream, exon, downstream, length, activeReference ?? undefined);
      setExonDesign(design);
      setSubmitted(true);
    } catch (error) {
      setRequestError(error instanceof Error ? l(error.message) : l("The exon skipping design could not be generated. Check the input and try again."));
    } finally {
      setLoading(false);
    }
  }

  async function changeNormalTarget(nextPosition: number) {
    setPosition(String(nextPosition));
    setRequestError("");
    setLoading(true);
    try {
      const result = await createNormalEditingDesign(
        cleanSequence,
        nextPosition,
        adarEnvironment,
        mode === "gene" ? normalReference : null,
      );
      setNormalResult(result);
    } catch (error) {
      setRequestError(error instanceof Error ? l(error.message) : l("The design could not be generated. Check the input and try again."));
      setSubmitted(false);
    } finally {
      setLoading(false);
    }
  }

  if (submitted && application === "normal_editing" && normalResult) {
    const resultSite = {
      position: normalResult.editing_site.position,
      codon: normalResult.editing_site.codon,
      editedCodon: normalResult.editing_site.edited_codon,
      aminoAcid: normalResult.editing_site.amino_acid,
      editedAminoAcid: normalResult.editing_site.edited_amino_acid,
      category: normalResult.editing_site.category,
    };
    return <InitialArrnaResult
      design={normalResultToDesign(normalResult)}
      variants={normalResultToVariants(normalResult)}
      result={normalResult}
      sequence={normalResult.normalized_input.sequence}
      site={resultSite}
      sites={editingSites}
      environment={normalResult.pairing.adar_environment}
      reference={mode === "gene" ? normalReference : null}
      onTargetChange={changeNormalTarget}
      onRevise={() => setSubmitted(false)}
      onRefine={onRefine}
    />;
  }

  if (submitted && application === "exon_skipping" && exonDesign) {
    return <ExonSkippingResult design={exonDesign} onRevise={() => setSubmitted(false)} />;
  }

  if (submitted) {
    return (
      <section className="result-placeholder" aria-live="polite">
        <p className="eyebrow">{l("No candidates")}</p>
        <div className="result-status"><Search aria-hidden="true" /></div>
        <h1>{l("No arRNA candidate was generated.")}</h1>
        <p>{l("Return to the input and check the sequence context and target coordinate.")}</p>
        <dl>
          <div><dt>{l("Input mode")}</dt><dd>{l(mode === "sequence" ? "Direct sequence" : "Gene / species")}</dd></div>
          <div><dt>{l("Application")}</dt><dd>{l(application === "normal_editing" ? "Normal editing" : "Exon skipping")}</dd></div>
          <div><dt>{l("Target")}</dt><dd>{mode === "sequence" ? l(`Position ${position}`) : `${gene} · Homo sapiens`}</dd></div>
        </dl>
        <button className="button button-primary" onClick={() => setSubmitted(false)}>
          {l("Revise input")}
        </button>
      </section>
    );
  }

  const hasInput = application === "normal_editing"
    ? mode === "gene" ? Boolean(normalReference) : Boolean(cleanSequence) && !invalidSequence && inFrame
    : mode === "gene" ? Boolean(reference) : exonSequences.every(Boolean) && !invalidExonSequence;
  const hasTarget = application === "normal_editing" ? Boolean(selectedSite) : mode === "gene" ? Number(exonNumber) > 1 : Boolean(targetExon);
  const currentStep = !hasInput ? 0 : !hasTarget ? 1 : 3;
  const stepLabels = application === "normal_editing"
    ? ["Input sequence", "Select target A", "Design settings", "Run"]
    : ["Input reference", "Select exon", "Design settings", "Run"];
  const taskSteps: TaskStep[] = stepLabels.map((label, index) => ({
    label: l(label),
    state: index < currentStep ? "complete" : index === currentStep ? "current" : "pending",
  }));

  return (
    <TaskInputShell
      back={<button className="back-button" type="button" onClick={onExit}>
        <ArrowLeft aria-hidden="true" size={16} /> {l("Back to overview")}
      </button>}
      title={l(application === "normal_editing" ? "Normal editing design" : "Exon skipping design")}
      description={l(application === "normal_editing" ? "Choose a target A and generate the available initial arRNA designs." : "Define an exon context and generate SA or ESE coverage candidates.")}
      steps={taskSteps}
      stepsLabel={l("Design progress")}
      notice={initialExample ? <div className="example-loaded" role="status"><strong>{l(`${initialExample.title} loaded`)}</strong><span>{l(initialExample.description)} {l("Example data.")}</span></div> : undefined}
    >
      <form className="task-design-form" onSubmit={submit} aria-busy={loading}>
        <fieldset className="mode-picker">
          <legend>{l("Choose an input mode")}</legend>
          <label className={mode === "sequence" ? "mode-option selected" : "mode-option"}>
            <input type="radio" name="mode" checked={mode === "sequence"} onChange={() => setMode("sequence")} />
            <Dna aria-hidden="true" />
            <span><strong>{l("Sequence mode")}</strong><small>{l("Paste DNA or RNA directly")}</small></span>
          </label>
          <label className={mode === "gene" ? "mode-option selected" : "mode-option"}>
            <input type="radio" name="mode" checked={mode === "gene"} onChange={() => setMode("gene")} />
            <Search aria-hidden="true" />
            <span><strong>{l("Gene / species")}</strong><small>{l("Resolve a reference transcript")}</small></span>
          </label>
        </fieldset>

        <div className="workspace-grid task-workspace-grid">
          <div className="form-panel">
            {mode === "sequence" && application === "normal_editing" ? (
              <>
                <label htmlFor="sequence">{l("Target sequence")} <span>5′ → 3′</span></label>
                <textarea
                  id="sequence"
                  value={sequence}
                  onChange={(event) => setSequence(event.target.value)}
                  placeholder={l("Paste a DNA or RNA sequence…")}
                  rows={7}
                />
                <div className={invalidSequence || (cleanSequence.length > 0 && !inFrame) ? "field-meta error" : "field-meta"}>
                  <span>{l(invalidSequence ? "Use only A, C, G, T or U" : inFrame ? "In-frame coding sequence" : "CDS length must be divisible by 3")}</span>
                  <span>{cleanSequence.length.toLocaleString()} nt</span>
                </div>
                <label htmlFor="position">{l("Target A position")} <span>{l("1-based sequence coordinate")}</span></label>
                <input id="position" type="number" min="1" max={cleanSequence.length || undefined} value={position} onChange={(event) => setPosition(event.target.value)} />
                {invalidTarget && <p className="target-field-error">{l("Choose a colored A in the sequence preview.")}</p>}
              </>
            ) : mode === "gene" ? (
              <>
                <div className="form-row">
                  <div>
                    <label htmlFor="species">{l("Species")}</label>
                  <select id="species" value={species} onChange={(event) => { setSpecies(event.target.value); setReference(null); setNormalReference(null); }}>
                      <option value="9606">Homo sapiens</option>
                      <option value="10090">Mus musculus</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="gene">{l("Gene symbol")}</label>
                    <input id="gene" value={gene} onChange={(event) => { setGene(event.target.value.toUpperCase()); setReference(null); setNormalReference(null); }} />
                  </div>
                </div>
                {application === "exon_skipping" ? <>
                  <label htmlFor="exon-number">{l("Target exon number")}</label>
                  <input id="exon-number" type="number" min="2" value={exonNumber} onChange={(event) => setExonNumber(event.target.value)} />
                  <div className="reference-notice">
                    {l("Sequence and exon coordinates are retrieved live from")} <a href="https://www.ncbi.nlm.nih.gov/datasets/" target="_blank" rel="noreferrer">NCBI Datasets</a>. {l("MANE Select is preferred; if unavailable, the longest protein-coding RefSeq transcript is used.")}
                  </div>
                  {reference && <div className="resolved-reference"><strong>{reference.transcript} · {reference.selection}</strong><span>{reference.species} · {reference.genomic_accession} · exon {reference.exon_number}/{reference.exon_count}</span></div>}
                </> : <>
                  <div className="reference-notice">{l("The in-frame CDS is retrieved live from")} <a href="https://www.ncbi.nlm.nih.gov/datasets/" target="_blank" rel="noreferrer">NCBI Datasets</a>. {l("MANE Select is preferred; if unavailable, the longest protein-coding RefSeq transcript is used.")}</div>
                  {normalReference && <>
                    <div className="resolved-reference"><strong>{normalReference.transcript} · {normalReference.selection}</strong><span>{normalReference.species} · CDS {normalReference.cds_start}–{normalReference.cds_end} · {normalReference.cds_sequence.length.toLocaleString()} nt</span></div>
                    <label htmlFor="gene-position">{l("Target A position")} <span>{l("CDS coordinate; choose in preview")}</span></label>
                    <input id="gene-position" type="number" min="1" max={cleanSequence.length || undefined} value={position} onChange={(event) => setPosition(event.target.value)} />
                    {invalidTarget && <p className="target-field-error">{l("Choose a colored A in the CDS preview.")}</p>}
                  </>}
                </>}
              </>
            ) : (
              <div className="exon-sequence-fields">
                <label htmlFor="upstream-intron">Intron X−1 <span>{l("ends at the SA")}</span></label>
                <textarea id="upstream-intron" rows={4} value={upstreamIntron} onChange={(event) => setUpstreamIntron(event.target.value)} placeholder={l("Upstream intron; canonical input ends in AG…")} />
                <span className="segment-count">{normalize(upstreamIntron).length} nt</span>
                <label htmlFor="target-exon">Exon X <span>{l("exon to skip")}</span></label>
                <textarea id="target-exon" rows={4} value={targetExon} onChange={(event) => setTargetExon(event.target.value)} placeholder={l("Target exon sequence…")} />
                <span className="segment-count">{normalize(targetExon).length} nt</span>
                <label htmlFor="downstream-intron">Intron X <span>{l("starts after the SD")}</span></label>
                <textarea id="downstream-intron" rows={4} value={downstreamIntron} onChange={(event) => setDownstreamIntron(event.target.value)} placeholder={l("Downstream intron sequence…")} />
                <div className={invalidExonSequence ? "field-meta error" : "field-meta"}><span>{l(invalidExonSequence ? "Use only A, C, G, T or U" : "T and U are both accepted")}</span><span>{normalize(downstreamIntron).length} nt</span></div>
              </div>
            )}

            {application === "normal_editing" && <fieldset className="adar-picker">
              <legend>{l("ADAR environment")} <InfoTip>ADAR1: arRNA 5′ ≥4 nt · 3′ ≥20 nt; ADAR2: arRNA 5′ ≥6 nt · 3′ ≥11 nt {l("paired nt")}</InfoTip></legend>
              <label className={adarEnvironment === "ADAR1" ? "selected" : ""}><input type="radio" name="adar-environment" checked={adarEnvironment === "ADAR1"} onChange={() => setAdarEnvironment("ADAR1")} /><span><strong>ADAR1</strong></span></label>
              <label className={adarEnvironment === "ADAR2" ? "selected" : ""}><input type="radio" name="adar-environment" checked={adarEnvironment === "ADAR2"} onChange={() => setAdarEnvironment("ADAR2")} /><span><strong>ADAR2</strong></span></label>
            </fieldset>}

            {application === "exon_skipping" && (
              <details className="simple-disclosure"><summary>{l("Advanced settings")} · {arrnaLength} nt</summary><div className="length-control">
                <label htmlFor="arrna-length">arRNA length x <span>{l("default 151 nt")}</span></label>
                <input id="arrna-length" type="number" min="21" max="1001" value={arrnaLength} onChange={(event) => setArrnaLength(event.target.value)} />
                <small>{l("Exons are classified as < x/2, x/2–x, or > x.")}</small>
              </div></details>
            )}

            {requestError && <p className="request-error" role="alert">{requestError}</p>}

            <button className="button button-primary submit-button" type="submit" disabled={loading}>
              {l(loading ? "Loading NCBI reference…" : application === "exon_skipping" ? mode === "gene" ? "Fetch reference & design" : "Generate exon-skipping arRNAs" : mode === "gene" ? normalReference ? "Generate arRNA candidates" : "Fetch coding sequence" : "Generate arRNA candidates")}
            </button>
          </div>
          <div className="workspace-preview-stack">
            <details className="simple-disclosure design-figure-disclosure"><summary>{l("View design principles")}</summary><DesignPreview
              mode={mode}
              application={application}
              sequence={cleanSequence}
              position={Number(position)}
            /></details>
            {application === "normal_editing" ? (
              <TranscriptPreview
                mode={mode === "gene" && normalReference ? "sequence" : mode}
                sourceLabel={normalReference ? `${normalReference.gene} · ${normalReference.transcript} CDS` : undefined}
                sequence={cleanSequence}
                position={Number(position)}
                onPositionChange={(nextPosition) => setPosition(String(nextPosition))}
              />
            ) : (
              <details className="simple-disclosure"><summary>{l("Exon skipping logic")}</summary><div className="preview-panel exon-principle-preview">
                <div className="preview-header">
                  <span>{l("Exon skipping logic")} <InfoTip align="left">{l("ESE candidates are perfectly complementary. ESEfinder 3.0 scores the five published matrices at their official thresholds; motifs containing A are retained and overlapping hits are merged into candidate regions.")} <a href="https://esefinder.ahc.umn.edu/cgi-bin/tools/ESE3/esefinder.cgi?process=matrices" target="_blank" rel="noreferrer">ESEfinder 3.0 ↗</a></InfoTip></span>
                  <span>x = {arrnaLength || "—"} nt</span>
                </div>
                <div className="exon-input-map"><span>INTRON X−1</span><i>SA</i><strong>EXON X</strong><i>SD</i><span>INTRON X</span></div>
                <div className="design-rule-list">
                  <div><b>&lt; x/2</b><span>{l("One SA-centered guide")}</span></div>
                  <div><b>x/2 – x</b><span>{l("SA guide + minimum ESE coverage")}</span></div>
                  <div><b>&gt; x</b><span>{l("SA guide + fewest ESE guides")}</span></div>
                </div>
              </div></details>
            )}
          </div>
        </div>
      </form>
    </TaskInputShell>
  );
}
