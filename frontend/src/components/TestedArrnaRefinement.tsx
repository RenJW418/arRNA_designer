import { ArrowLeft, ArrowRight, Check, FlaskConical, RotateCcw } from "lucide-react";
import { CSSProperties, FormEvent, useMemo, useState } from "react";
import type { EditingSite, InitialArrnaDesign, NormalArrnaVariant } from "../lib/normalEditing";
import {
  createTestedDuplex,
  type TestedDuplex,
  type TestedDuplexSeed,
} from "../lib/testedDuplex";
import { BulgeOptimizationWorkspace } from "./BulgeOptimizationWorkspace";
import { InfoTip } from "./InfoTip";
import { useLanguage } from "./LanguageProvider";

interface Props {
  seed?: TestedDuplexSeed | null;
  onExit: () => void;
}

type Stage = "input" | "confirm" | "optimize";

function createEditingSites(duplex: TestedDuplex): EditingSite[] {
  return duplex.targetWindow.split("").flatMap((base, index) => base === "A" ? [{
    position: duplex.windowStart + index,
    codon: "",
    editedCodon: "",
    aminoAcid: "?",
    editedAminoAcid: "?",
    category: "editable" as const,
  }] : []);
}

function createWorkspaceDesign(duplex: TestedDuplex): InitialArrnaDesign {
  return {
    targetPosition: duplex.targetAPosition,
    targetWindow: duplex.targetWindow,
    arrnaSequence: duplex.arrnaSequence,
    windowStart: duplex.windowStart,
    windowEnd: duplex.windowEnd,
    targetIndex: duplex.targetIndex,
    upstreamLength: duplex.targetIndex,
    downstreamLength: duplex.targetWindow.length - duplex.targetIndex - 1,
    hasFullFlanks: duplex.targetIndex >= 75 && duplex.targetWindow.length - duplex.targetIndex - 1 >= 75,
  };
}

function createWorkspaceVariant(duplex: TestedDuplex, label: string): NormalArrnaVariant {
  return {
    id: "baseline",
    label,
    shortLabel: label,
    description: "Experimentally tested arRNA supplied by the user.",
    arrnaSequence: duplex.arrnaSequence,
    alignedGuide: duplex.alignedGuide,
    deletionCoordinates: duplex.initialBulges
      .filter(({ type }) => type === "deletion")
      .flatMap(({ start, end }) => Array.from({ length: end - start + 1 }, (_, index) => start + index)),
  };
}

function PairingPreview({ duplex }: { duplex: TestedDuplex }) {
  const { l } = useLanguage();
  const chunks = Array.from({ length: Math.ceil(duplex.targetWindow.length / 30) }, (_, chunkIndex) => {
    const start = chunkIndex * 30;
    return {
      start,
      target: duplex.targetWindow.slice(start, start + 30),
      guide: duplex.alignedGuide.slice(start, start + 30),
    };
  });
  const unsupportedCoordinates = new Set(duplex.unsupportedStructures.flatMap(({ start, end }) =>
    Array.from({ length: end - start + 1 }, (_, index) => start + index)));

  return <div className="tested-pairing-preview" aria-label={l("Inferred target-arRNA alignment")}>
    {chunks.map(({ start, target, guide }) => {
      const style = { "--tested-columns": target.length } as CSSProperties;
      return <section className="tested-pairing-row" style={style} key={start}>
        <div className="tested-pairing-coordinates">
          <span>A{start - duplex.targetIndex >= 0 ? "+" : ""}{start - duplex.targetIndex}</span>
          <span>A{start + target.length - 1 - duplex.targetIndex >= 0 ? "+" : ""}{start + target.length - 1 - duplex.targetIndex}</span>
        </div>
        <div className="tested-strand target"><span><b>Target RNA</b><small>5′→3′</small></span>{target.split("").map((base, index) => {
          const coordinate = start + index - duplex.targetIndex;
          return <i className={`${coordinate === 0 ? "target-a" : ""} ${unsupportedCoordinates.has(coordinate) ? "unsupported" : ""}`} key={coordinate}>{base}</i>;
        })}</div>
        <div className="tested-pairing-marks"><span />{target.split("").map((_, index) => <i key={index}>|</i>)}</div>
        <div className="tested-strand guide"><span><b>arRNA</b><small>3′→5′</small></span>{guide.split("").map((base, index) => {
          const coordinate = start + index - duplex.targetIndex;
          return <i className={`${coordinate === 0 ? "target-c" : ""} ${base === "-" ? "deletion" : ""} ${unsupportedCoordinates.has(coordinate) ? "unsupported" : ""}`} key={coordinate}>{base}</i>;
        })}</div>
      </section>;
    })}
  </div>;
}

export function TestedArrnaRefinement({ seed, onExit }: Props) {
  const { l } = useLanguage();
  const [targetSequence, setTargetSequence] = useState(seed?.targetSequence ?? "");
  const [arrnaSequence, setArrnaSequence] = useState(seed?.arrnaSequence ?? "");
  const [targetAPosition, setTargetAPosition] = useState(String(seed?.targetAPosition ?? 1));
  const [environment, setEnvironment] = useState(seed?.environment ?? "ADAR1");
  const [stage, setStage] = useState<Stage>(() => seed?.preparedDuplex ? "confirm" : "input");
  const [duplex, setDuplex] = useState<TestedDuplex | null>(seed?.preparedDuplex ?? null);
  const [error, setError] = useState("");
  const sourceLabel = seed?.label ?? l("Imported tested arRNA");

  const workspace = useMemo(() => duplex ? {
    design: createWorkspaceDesign(duplex),
    variant: createWorkspaceVariant(duplex, sourceLabel),
    sites: createEditingSites(duplex),
  } : null, [duplex, sourceLabel]);

  function reviewAlignment(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const next = createTestedDuplex({
        targetSequence,
        arrnaSequence,
        targetAPosition: Number(targetAPosition),
        environment,
      });
      setDuplex(next);
      setStage("confirm");
    } catch (caught) {
      setError(caught instanceof Error ? l(caught.message) : l("The target-arRNA alignment could not be resolved."));
    }
  }

  return <section className="tested-refinement-page">
    <button className="back-button" type="button" onClick={onExit}><ArrowLeft size={16} aria-hidden="true" />{l("Back to overview")}</button>
    <header className="tested-refinement-header">
      <p className="eyebrow">Module 3 · {l("Experiment-guided bulge refinement")}</p>
      <h1>{l("Optimize a tested arRNA")}</h1>
      <p>{l("Start from the exact target and arRNA used in your experiment. Record editing efficiencies, then generate or manually explore supported bulge refinements.")}</p>
    </header>

    <ol className="tested-refinement-steps" aria-label={l("Refinement workflow")}>
      {[l("Enter tested duplex"), l("Confirm alignment"), l("Refine arRNA")].map((label, index) => {
        const activeIndex = stage === "input" ? 0 : stage === "confirm" ? 1 : 2;
        return <li className={index < activeIndex ? "complete" : index === activeIndex ? "current" : "pending"} aria-current={index === activeIndex ? "step" : undefined} key={label}><span>{index < activeIndex ? <Check size={14} /> : index + 1}</span><strong>{label}</strong></li>;
      })}
    </ol>

    {stage === "input" && <form className="tested-duplex-form" onSubmit={reviewAlignment}>
      {seed?.source === "generated" && <div className="tested-prefill-note"><Check size={16} /><div><strong>{l("Generated design loaded")}</strong><span>{l("Confirm that these are the exact sequences used in the experiment before continuing.")}</span></div></div>}
      <div className="tested-sequence-fields">
        <label><span>{l("Target RNA sequence")} <b>5′→3′</b></span><textarea value={targetSequence} onChange={(event) => setTargetSequence(event.target.value)} placeholder={l("Paste the tested target sequence")} required /></label>
        <label><span>{l("Tested arRNA sequence")} <b>5′→3′</b> <InfoTip>{l("Enter the synthesized/exported arRNA sequence in its 5′→3′ direction.")}</InfoTip></span><textarea value={arrnaSequence} onChange={(event) => setArrnaSequence(event.target.value)} placeholder={l("Paste the exact arRNA used in the experiment")} required /></label>
      </div>
      <div className="tested-duplex-options">
        <label><span>{l("Target A position")}</span><input type="number" min="1" step="1" value={targetAPosition} onChange={(event) => setTargetAPosition(event.target.value)} required /><small>{l("1-based coordinate in the target sequence")}</small></label>
        <fieldset><legend>ADAR environment</legend>{(["ADAR1", "ADAR2"] as const).map((value) => <label key={value}><input type="radio" name="tested-adar" checked={environment === value} onChange={() => setEnvironment(value)} /><span>{value}</span></label>)}</fieldset>
      </div>
      {error && <p className="tested-form-error" role="alert">{error}</p>}
      <button className="button button-primary tested-primary-action" type="submit">{l("Review inferred alignment")}<ArrowRight size={16} /></button>
    </form>}

    {stage === "confirm" && duplex && <section className="tested-alignment-card">
      <div className="tested-alignment-heading"><div><p className="eyebrow">{l("Alignment check")}</p><h2>{l("Confirm the tested duplex")}</h2><p>{l("The arRNA is shown antiparallel. Existing structures will be locked when the optimization workspace opens.")}</p></div><button className="button button-secondary" type="button" onClick={() => setStage("input")}><RotateCcw size={15} />{l("Change input")}</button></div>
      <dl className="tested-alignment-summary">
        <div><dt>{l("Paired target region")}</dt><dd>{duplex.windowStart}–{duplex.windowEnd} · {duplex.targetWindow.length} nt</dd></div>
        <div><dt>{l("Target")}</dt><dd>A{duplex.targetAPosition} · A–C</dd></div>
        <div><dt>{l("Starting structures")}</dt><dd>{duplex.initialBulges.length}</dd></div>
        <div><dt>{l("Unsupported effects")}</dt><dd>{duplex.unsupportedStructures.length}</dd></div>
      </dl>
      {duplex.ambiguous && <div className="tested-alignment-warning" role="note"><strong>{l("Check this alignment carefully.")}</strong><span>{l("More than one alignment received the same score; the displayed alignment is the deterministic first match.")}</span></div>}
      {duplex.unsupportedStructures.length > 0 && <div className="tested-unsupported-note" role="note"><strong>{l("Locked unsupported mismatch")}</strong><span>{l("It is preserved in the starting arRNA and blocks overlapping bulges, but no effect range is calculated for it.")}</span></div>}
      <PairingPreview duplex={duplex} />
      <button className="button button-primary tested-primary-action" type="button" onClick={() => setStage("optimize")}><FlaskConical size={16} />{l("Confirm and enter experimental results")}</button>
    </section>}

    {stage === "optimize" && duplex && workspace && <>
      <div className="tested-workspace-toolbar"><div><strong>{l("Confirmed tested duplex")}</strong><span>{sourceLabel} · A{duplex.targetAPosition} · {duplex.environment}</span></div><button className="button button-secondary" type="button" onClick={() => setStage("confirm")}>{l("Review alignment")}</button></div>
      <BulgeOptimizationWorkspace
        key={`${duplex.targetSequence}-${duplex.arrnaSequence}-${duplex.environment}`}
        design={workspace.design}
        sites={workspace.sites}
        variant={workspace.variant}
        environment={duplex.environment}
        startLocked
        initialBulges={duplex.initialBulges}
      />
    </>}
  </section>;
}
