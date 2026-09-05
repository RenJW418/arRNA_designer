type Application = "normal_editing" | "exon_skipping";
import { useLanguage } from "./LanguageProvider";

interface Props {
  mode: "sequence" | "gene";
  application: Application;
  sequence: string;
  position: number;
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

export function DesignPreview({ mode, application, sequence, position }: Props) {
  const { l } = useLanguage();
  const isExonSkipping = application === "exon_skipping";
  const primaryImage = isExonSkipping
    ? "/figures/leaper-exon-skipping-design.svg"
    : "/figures/leaper3-universal-design.svg";
  const title = isExonSkipping ? l("Exon-skipping design") : "LEAPER 3.0 universal design";

  return (
    <aside className="preview-panel scientific-preview">
      <div className="preview-header">
        <div>
          <p>{l("LEAPER design figure")}</p>
          <strong>{title}</strong>
        </div>
        <span>{mode === "gene" ? "DMD · NM_004006.3" : l("User sequence")}</span>
      </div>
      <figure className="design-rule-figure manuscript-figure">
        <a href={primaryImage} target="_blank" rel="noreferrer" aria-label={`Open the full-size ${title} figure`}>
          <img
            src={primaryImage}
            alt={isExonSkipping
              ? "LEAPER design panel for 151-nucleotide circular arRNA-mediated exon skipping."
              : "LEAPER 3.0 universal 115-nucleotide arRNA design with 28/0, 1/0 and 10/0 bulges."}
          />
        </a>
        <figcaption>{l("LEAPER design framework · select to enlarge")}</figcaption>
      </figure>
      {!isExonSkipping && mode === "sequence" && <SequenceContext sequence={sequence} position={position} />}
      {!isExonSkipping && (
        <details className="custom-design-details">
          <summary>{l("View the custom-design workflow")}</summary>
          <a href="/figures/leaper3-custom-design.svg" target="_blank" rel="noreferrer">
            <img
              src="/figures/leaper3-custom-design.svg"
              alt="LEAPER 3.0 custom-design workflow covering target selection, external bulges and internal bulges."
              loading="lazy"
            />
          </a>
        </details>
      )}
      <div className="design-rule-facts">
        <span><strong>{isExonSkipping ? "151 nt" : "115 nt"}</strong> {l("design length")}</span>
        <span><strong>A–C</strong> {l("target mismatch")}</span>
        <span><strong>{isExonSkipping ? "SA / ESE" : "−31 / +34"}</strong> {l("structural context")}</span>
      </div>
      <p className="prototype-disclosure">{l("Vector figure · generated candidates follow the connected normal editing or exon skipping workflow.")}</p>
    </aside>
  );
}
