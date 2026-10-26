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
import type { SharedDesignInput } from "../lib/urlState";
import { InfoTip } from "./InfoTip";
import { useLanguage } from "./LanguageProvider";
import { TaskInputShell, type TaskStep } from "./TaskLayout";

type Mode = "sequence" | "gene";
export type Application = "normal_editing" | "exon_skipping";

interface Props {
  onExit: () => void;
  initialExample?: DesignExample | null;
  initialApplication?: Application;
  /** Restored from a shared link; takes precedence over the example defaults. */
  initialInput?: SharedDesignInput | null;
  /** Reports the inputs behind a generated design so they can go in the URL. */
  onInputChange?: (input: SharedDesignInput) => void;
}

export function DesignWorkspace({ onExit, initialExample, initialApplication = "normal_editing", initialInput, onInputChange }: Props) {
  const { l } = useLanguage();
  const [mode, setMode] = useState<Mode>(initialInput?.mode ?? initialExample?.mode ?? "sequence");
  const application = initialExample?.application ?? initialApplication;
  const [sequence, setSequence] = useState(initialInput?.sequence ?? initialExample?.sequence ?? "");
  const [position, setPosition] = useState(initialInput?.position ?? String(initialExample?.position ?? 1));
  const [gene, setGene] = useState(initialInput?.gene ?? initialExample?.gene ?? "DMD");
  const [species, setSpecies] = useState(initialInput?.species ?? initialExample?.species ?? "9606");
  const [submitted, setSubmitted] = useState(false);
  const [upstreamIntron, setUpstreamIntron] = useState(initialInput?.upstreamIntron ?? "");
  const [targetExon, setTargetExon] = useState(initialInput?.targetExon ?? "");
  const [downstreamIntron, setDownstreamIntron] = useState(initialInput?.downstreamIntron ?? "");
  const [exonNumber, setExonNumber] = useState(initialInput?.exonNumber ?? String(initialExample?.exonNumber ?? 51));
  const [arrnaLength, setArrnaLength] = useState(initialInput?.arrnaLength ?? String(initialExample?.arrnaLength ?? 151));
  const [windowStart, setWindowStart] = useState(initialInput?.windowStart ?? "-75");
  const [windowEnd, setWindowEnd] = useState(initialInput?.windowEnd ?? "75");
  const [includeInternalBulge, setIncludeInternalBulge] = useState(initialInput?.includeInternalBulge ?? false);
  const [codingContext, setCodingContext] = useState(initialInput?.codingContext ?? true);
  const [evaluateCoveredEse, setEvaluateCoveredEse] = useState(initialInput?.evaluateCoveredEse ?? false);
  const [eseMismatchPositions, setEseMismatchPositions] = useState(initialInput?.eseMismatchPositions ?? "");
  const [transcriptAccession, setTranscriptAccession] = useState(initialInput?.transcriptAccession ?? "");
  const [exonDesign, setExonDesign] = useState<ExonSkippingDesign | null>(null);
  const [reference, setReference] = useState<NcbiExonReference | null>(null);
  const [normalReference, setNormalReference] = useState<NcbiCodingReference | null>(null);
  const [normalResult, setNormalResult] = useState<NormalEditingResult | null>(null);
  const [adarEnvironment, setAdarEnvironment] = useState<AdarEnvironment>(initialInput?.adar === "ADAR2" ? "ADAR2" : "ADAR1");
  const [requestError, setRequestError] = useState("");
  const [loading, setLoading] = useState(false);

  const cleanSequence = useMemo(
    () => sequence.toUpperCase().replace(/U/g, "T").replace(/[^A-Z]/g, ""),
    [sequence],
  );
  const invalidSequence = cleanSequence.length > 0 && /[^ACGT]/.test(cleanSequence);
  const inFrame = cleanSequence.length > 0 && cleanSequence.length % 3 === 0;
  const useCodingContext = mode === "gene" || codingContext;
  const editingSites = useMemo(
    () => classifyEditingSites(cleanSequence, useCodingContext),
    [cleanSequence, useCodingContext],
  );
  const selectedSite = editingSites.find((site) => site.position === Number(position));
  const invalidTarget = application === "normal_editing" && cleanSequence.length > 0 && !selectedSite;

  const normalize = (value: string) => value.toUpperCase().replace(/U/g, "T").replace(/\s/g, "");
  const exonSequences = [upstreamIntron, targetExon, downstreamIntron].map(normalize);
  const invalidExonSequence = exonSequences.some((value) => value.length > 0 && /[^ACGT]/.test(value));

  function currentInput(): SharedDesignInput {
    return {
      mode, adar: adarEnvironment, sequence, position, gene, species,
      upstreamIntron, targetExon, downstreamIntron, exonNumber, arrnaLength,
      windowStart, windowEnd, includeInternalBulge, codingContext,
      evaluateCoveredEse, eseMismatchPositions, transcriptAccession,
    };
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setRequestError("");
    // A design is only worth linking to once the user has asked to generate it.
    onInputChange?.(currentInput());
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
          const savedSite = initialInput?.mode === "gene" && normalize(initialInput.sequence ?? "") === codingReference.cds_sequence
            ? sites.find((site) => site.position === Number(initialInput.position)) : undefined;
          const chosenSite = savedSite ?? defaultSite;
          setNormalReference(codingReference);
          setSequence(codingReference.cds_sequence);
          setPosition(String(chosenSite.position));
          onInputChange?.({ ...currentInput(), sequence: codingReference.cds_sequence, position: String(chosenSite.position) });
        } catch (error) {
          setRequestError(error instanceof Error ? l(error.message) : l("The NCBI reference could not be loaded. Check the reference identifiers and try again."));
        } finally {
          setLoading(false);
        }
        return;
      }
      if (!cleanSequence || invalidSequence || (useCodingContext && !inFrame) || invalidTarget) return;
      if (!Number.isInteger(Number(windowStart)) || !Number.isInteger(Number(windowEnd)) || Number(windowStart) > 0 || Number(windowEnd) < 0) {
        setRequestError(l("Window coordinates must be integers with start ≤ 0 and end ≥ 0."));
        return;
      }
      setLoading(true);
      try {
        const result = await createNormalEditingDesign(
          cleanSequence,
          Number(position),
          adarEnvironment,
          mode === "gene" ? normalReference : null,
          { windowStartRelative: Number(windowStart), windowEndRelative: Number(windowEnd), includeInternalBulge, codingContext: useCodingContext },
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
        activeReference = await resolveNcbiExon(species, gene, Number(exonNumber), length, transcriptAccession.trim() || undefined);
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
      const mismatchPositions = eseMismatchPositions.trim() ? eseMismatchPositions.trim().split(/[\s,;]+/).map(Number) : [];
      if (mismatchPositions.some((p) => !Number.isInteger(p) || p < 1)) {
        setRequestError(l("Enter positive exon coordinates separated by commas for optional A/C mismatches."));
        return;
      }
      const design = await createExonSkippingDesign(upstream, exon, downstream, length, mode === "gene" ? activeReference ?? undefined : undefined, {
        evaluateCoveredEse, eseMismatchPositions: mismatchPositions,
      });
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
        { windowStartRelative: Number(windowStart), windowEndRelative: Number(windowEnd), includeInternalBulge, codingContext: useCodingContext },
      );
      setNormalResult(result);
      onInputChange?.({ ...currentInput(), position: String(nextPosition) });
    } catch (error) {
      setRequestError(error instanceof Error ? l(error.message) : l("The design could not be generated. Check the input and try again."));
      setSubmitted(false);
    } finally {
      setLoading(false);
    }
  }

  if (submitted && application === "normal_editing" && normalResult) {
    if (normalResult.candidates.length === 0) return <section className="result-placeholder" aria-live="polite">
      <h1>{l("No arRNA candidate was generated.")}</h1>
      <p>{normalResult.pairing.message}</p>
      {normalResult.warnings.map((warning) => <p key={warning}>{l(warning)}</p>)}
      <button className="button button-primary" onClick={() => setSubmitted(false)}>{l("Revise input")}</button>
    </section>;
    return <InitialArrnaResult
      key={`${normalResult.normalized_input.target_position}:${normalResult.window_start}:${normalResult.window_end}:${normalResult.normalized_input.include_internal_bulge}`}
      design={normalResultToDesign(normalResult)}
      variants={normalResultToVariants(normalResult)}
      result={normalResult}
      sites={editingSites}
      onRevise={() => setSubmitted(false)}
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
    ? mode === "gene" ? Boolean(normalReference) : Boolean(cleanSequence) && !invalidSequence && (!useCodingContext || inFrame)
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
            <input type="radio" name="mode" checked={mode === "gene"} onChange={() => { setMode("gene"); setNormalReference(null); }} />
            <Search aria-hidden="true" />
            <span><strong>{l("Gene / species")}</strong><small>{l("Resolve a reference transcript")}</small></span>
          </label>
        </fieldset>

        <div className="workspace-grid task-workspace-grid">
          <div className="form-panel">
            {mode === "sequence" && application === "normal_editing" ? (
              <>
                <label htmlFor="sequence">{l("Target sequence")} <span>5′ → 3′</span></label>
                <label className="protocol-check"><input type="checkbox" checked={codingContext} onChange={(event) => setCodingContext(event.target.checked)} />{l("Annotate coding sequence and amino-acid changes")}</label>
                <textarea
                  id="sequence"
                  value={sequence}
                  onChange={(event) => setSequence(event.target.value)}
                  placeholder={l("Paste a DNA or RNA sequence…")}
                  rows={7}
                />
                <div className={invalidSequence || (useCodingContext && cleanSequence.length > 0 && !inFrame) ? "field-meta error" : "field-meta"}>
                  <span>{l(invalidSequence ? "Use only A, C, G, T or U" : !useCodingContext ? "General target RNA; no reading frame assumed" : inFrame ? "In-frame coding sequence" : "CDS length must be divisible by 3")}</span>
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
                  <label htmlFor="transcript-accession">{l("Transcript accession (optional)")}</label>
                  <input id="transcript-accession" value={transcriptAccession} onChange={(event) => { setTranscriptAccession(event.target.value); setReference(null); }} placeholder="NM_004006.3" />
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
              <legend>{l("ADAR environment")} <InfoTip>Target RNA: ADAR1 −4…+25; ADAR2 −6…+11. A₀ = 0.</InfoTip></legend>
              <label className={adarEnvironment === "ADAR1" ? "selected" : ""}><input type="radio" name="adar-environment" checked={adarEnvironment === "ADAR1"} onChange={() => setAdarEnvironment("ADAR1")} /><span><strong>ADAR1</strong></span></label>
              <label className={adarEnvironment === "ADAR2" ? "selected" : ""}><input type="radio" name="adar-environment" checked={adarEnvironment === "ADAR2"} onChange={() => setAdarEnvironment("ADAR2")} /><span><strong>ADAR2</strong></span></label>
            </fieldset>}

            {application === "normal_editing" && <details className="simple-disclosure"><summary>{l("Target coverage and internal bulge")}</summary>
              <div className="protocol-settings">
                <p>{l("Shift or change target coverage while preserving the ADAR-binding region. Coordinates refer to target RNA, with A0 = 0.")}</p>
                <div className="form-row"><div><label htmlFor="window-start">{l("Window start relative to A0")}</label><input id="window-start" type="number" max="0" value={windowStart} onChange={(e) => setWindowStart(e.target.value)} /></div>
                  <div><label htmlFor="window-end">{l("Window end relative to A0")}</label><input id="window-end" type="number" min="0" value={windowEnd} onChange={(e) => setWindowEnd(e.target.value)} /></div></div>
                <small>{l("Target coverage length differs from guide length after deletions. Figure 4 illustrates guides of about 73–250 nt; validate altered lengths experimentally.")}</small>
                <small>{l("The final text specifies ≥5 nt external flanks, while the Figure 4c box specifies ≥10 nt. Designs here retain ≥10 complementary nt on each side.")}</small>
                <label className="protocol-check"><input type="checkbox" checked={includeInternalBulge} onChange={(e) => setIncludeInternalBulge(e.target.checked)} />{l("Also test an optional 1/0 internal bulge at +4")}</label>
              </div>
            </details>}

            {application === "exon_skipping" && (
              <details className="simple-disclosure"><summary>{l("Advanced settings")} · {arrnaLength} nt</summary><div className="length-control protocol-settings">
                <label htmlFor="arrna-length">arRNA length x <span>{l("default 151 nt")}</span></label>
                <input id="arrna-length" type="number" min="21" max="1001" value={arrnaLength} onChange={(event) => setArrnaLength(event.target.value)} />
                <small>{l("151 nt is the initial design; Figure 4 illustrates about 31–250 nt. Exon groups are <70, 70–150 and >150 nt; coverage and activity determine additional guides.")}</small>
                <label className="protocol-check"><input type="checkbox" checked={evaluateCoveredEse} onChange={(e) => setEvaluateCoveredEse(e.target.checked)} />{l("Evaluate SA-covered ESEs when SA activity is insufficient")}</label>
                <label htmlFor="ese-mismatches">{l("Optional ESE A/C mismatches")}</label>
                <input id="ese-mismatches" value={eseMismatchPositions} onChange={(e) => setEseMismatchPositions(e.target.value)} placeholder={l("Exon A coordinates, e.g. 12, 48")}/>
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
              sourceLabel={mode === "gene" ? [gene, application === "normal_editing" ? normalReference?.transcript : reference?.transcript ?? transcriptAccession].filter(Boolean).join(" · ") : undefined}
            /></details>
            {application === "normal_editing" ? (
              <TranscriptPreview
                mode={mode === "gene" && normalReference ? "sequence" : mode}
                sourceLabel={mode === "gene" && normalReference ? `${normalReference.gene} · ${normalReference.transcript} CDS` : undefined}
                sequence={cleanSequence}
                position={Number(position)}
                codingContext={useCodingContext}
                onPositionChange={(nextPosition) => setPosition(String(nextPosition))}
              />
            ) : (
              <details className="simple-disclosure"><summary>{l("Exon skipping logic")}</summary><div className="preview-panel exon-principle-preview">
                <div className="preview-header">
                  <span>{l("Exon skipping logic")} <InfoTip align="left">{l("Start with an SA A/C guide. Evaluate ESE regions not fully covered, or additional guides when SA activity is insufficient. Optional A/C mismatches can target other splicing-related A sites. Predicted ESEs require experimental confirmation.")} <a href="https://esefinder.ahc.umn.edu/cgi-bin/tools/ESE3/esefinder.cgi?process=matrices" target="_blank" rel="noreferrer">ESEfinder 3.0 ↗</a></InfoTip></span>
                  <span>x = {arrnaLength || "—"} nt</span>
                </div>
                <div className="exon-input-map"><span>INTRON X−1</span><i>SA</i><strong>EXON X</strong><i>SD</i><span>INTRON X</span></div>
                <div className="design-rule-list">
                  <div><b>&lt;70 nt</b><span>{l("Check SA coverage across the exon and toward the donor")}</span></div>
                  <div><b>70–150 nt</b><span>{l("Evaluate ESE regions not adequately covered by SA")}</span></div>
                  <div><b>&gt;150 nt</b><span>{l("Evaluate spatially separated ESE regions")}</span></div>
                </div>
              </div></details>
            )}
          </div>
        </div>
      </form>
    </TaskInputShell>
  );
}
