type Application = "normal_editing" | "exon_skipping";
import { useLanguage } from "./LanguageProvider";

interface Props {
  mode: "sequence" | "gene";
  application: Application;
  sequence: string;
  position: number;
  sourceLabel?: string;
}

function SequenceContext({ sequence, position }: Pick<Props, "sequence" | "position">) {
  const { l } = useLanguage();
  if (!sequence) {
    return <p className="design-preview-empty">{l("Paste a sequence to map the selected adenosine beneath the LEAPER design figure.")}</p>;
  }

  const safePosition = Math.max(1, Math.min(position || 1, sequence.length));
  const start = Math.max(0, safePosition - 13);
  const context = sequence.slice(start, start + 25);
  const targetIndex = safePosition - 1 - start;

  return (
    <div className="design-sequence-context" aria-label={`Local sequence context around position ${safePosition}`}>
      <div><span>{start + 1}</span><span>{start + context.length}</span></div>
      <p>
        {context.split("").map((base, index) =>
          index === targetIndex ? <mark key={index}>{base}</mark> : <span key={index}>{base}</span>,
        )}
      </p>
    </div>
  );
}

export function DesignPreview({ mode, application, sequence, position, sourceLabel }: Props) {
  const { l } = useLanguage();
  const isExonSkipping = application === "exon_skipping";
  const primaryImage = isExonSkipping
    ? "/figures/leaper-exon-skipping-design.png"
    : "/figures/leaper3-universal-design.png";
  const title = isExonSkipping ? l("Exon-skipping design") : "LEAPER 3.0 universal design";

  return (
    <aside className="preview-panel scientific-preview">
      <div className="preview-header">
        <div>
          <p>{l("LEAPER design figure")}</p>
          <strong>{title}</strong>
        </div>
        <span>{sourceLabel ?? l(mode === "gene" ? "NCBI reference" : "User sequence")}</span>
      </div>
      <figure className="design-rule-figure manuscript-figure">
        <a href={primaryImage} target="_blank" rel="noreferrer" aria-label={`Open the full-size ${title} figure`}>
          <img
            src={primaryImage}
            alt={isExonSkipping
              ? "Nature Protocols final Figure 4e: circular SA/ESE arRNA design and optional A/C mismatches."
              : "Nature Protocols final Figure 4a: universal arRNA design, 28/0 at -31, 10/0 at +34 and optional 1/0 at +4."}
          />
        </a>
        <figcaption>Nature Protocols · Fig. 4 · {l("select to enlarge")}</figcaption>
      </figure>
      {!isExonSkipping && mode === "sequence" && <SequenceContext sequence={sequence} position={position} />}
      {!isExonSkipping && (
        <details className="custom-design-details">
          <summary>{l("View the custom-design workflow")}</summary>
          <a href="/figures/leaper3-custom-design.png" target="_blank" rel="noreferrer">
            <img
              src="/figures/leaper3-custom-design.png"
              alt="LEAPER 3.0 custom-design workflow covering target selection, external bulges and internal bulges."
              loading="lazy"
            />
          </a>
        </details>
      )}
      <div className="design-rule-facts">
        <span><strong>{isExonSkipping ? "~31–250 nt" : "~73–250 nt"}</strong> {l("illustrated guide range")}</span>
        <span><strong>A–C</strong> {l("target mismatch")}</span>
        <span><strong>{isExonSkipping ? "SA / ESE" : "−31 / +34"}</strong> {l("structural context")}</span>
      </div>
      <p className="prototype-disclosure">{l("Initial designs require experimental validation of target editing, bystander editing or exon skipping.")}</p>
    </aside>
  );
}
