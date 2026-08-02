import { ArrowLeft, Check, Dna, Search, ShieldCheck } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { TranscriptPreview } from "./TranscriptPreview";

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

  const cleanSequence = useMemo(
    () => sequence.toUpperCase().replace(/[^A-Z]/g, ""),
    [sequence],
  );
  const invalidSequence = cleanSequence.length > 0 && /[^ACGTUNRYSWKMBDHV]/.test(cleanSequence);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (mode === "sequence" && (!cleanSequence || invalidSequence)) return;
    setSubmitted(true);
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
            {mode === "sequence" ? (
              <>
                <label htmlFor="sequence">Target sequence <span>5′ → 3′</span></label>
                <textarea
                  id="sequence"
                  value={sequence}
                  onChange={(event) => setSequence(event.target.value)}
                  placeholder="Paste a DNA or RNA sequence…"
                  rows={7}
                />
                <div className={invalidSequence ? "field-meta error" : "field-meta"}>
                  <span>{invalidSequence ? "Contains unsupported characters" : "IUPAC nucleotide codes accepted"}</span>
                  <span>{cleanSequence.length.toLocaleString()} nt</span>
                </div>
                <label htmlFor="position">Editing position <span>1-based sequence coordinate</span></label>
                <input id="position" type="number" min="1" max={cleanSequence.length || undefined} value={position} onChange={(event) => setPosition(event.target.value)} />
              </>
            ) : (
              <>
                <div className="form-row">
                  <div>
                    <label htmlFor="species">Species</label>
                    <select id="species" value={species} onChange={(event) => setSpecies(event.target.value)}>
                      <option value="9606">Homo sapiens</option>
                      <option value="10090">Mus musculus</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="gene">Gene symbol</label>
                    <input id="gene" value={gene} onChange={(event) => setGene(event.target.value.toUpperCase())} />
                  </div>
                </div>
                <div className="reference-notice">
                  NCBI lookup is represented with example DMD transcript data in this prototype.
                </div>
                <label htmlFor="transcript">Reference transcript</label>
                <select id="transcript">
                  <option>NM_004006.3 · Dp427m · MANE Select</option>
                  <option>NM_000109.4 · Dp427c</option>
                </select>
              </>
            )}

            <fieldset className="application-picker">
              <legend>Application type</legend>
              <label><input type="radio" checked={application === "normal_editing"} onChange={() => setApplication("normal_editing")} /> Normal editing</label>
              <label><input type="radio" checked={application === "exon_skipping"} onChange={() => setApplication("exon_skipping")} /> Exon skipping</label>
            </fieldset>

            {application === "exon_skipping" && (
              <div>
                <label htmlFor="exon">Target exon</label>
                <select id="exon"><option>Exon 51 · 233 nt · frame disrupting</option><option>Exon 52 · 118 nt</option></select>
              </div>
            )}

            <button className="button button-primary submit-button" type="submit">
              Review design input
            </button>
          </div>
          <TranscriptPreview mode={mode} sequence={cleanSequence} position={Number(position)} />
        </div>
      </form>
    </section>
  );
}
