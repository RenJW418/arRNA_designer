import { useMemo } from "react";
import { classifyEditingSites, EditingSite } from "../lib/normalEditing";
import { useLanguage } from "./LanguageProvider";

interface Props {
  mode: "sequence" | "gene";
  sequence: string;
  position: number;
  sourceLabel?: string;
  onPositionChange?: (position: number) => void;
}

const CATEGORY_LABELS: Record<EditingSite["category"], string> = {
  blocked_ga: "GA context, difficult to edit",
  synonymous: "Synonymous A-to-G edit",
  editable: "Editable A-to-G site",
};

export function TranscriptPreview({ mode, sequence, position, sourceLabel, onPositionChange }: Props) {
  const { l } = useLanguage();
  const safePosition = Math.max(1, Math.min(position || 1, sequence.length || 1));
  const sites = useMemo(() => classifyEditingSites(sequence), [sequence]);
  const sitesByPosition = useMemo(
    () => new Map(sites.map((site) => [site.position, site])),
    [sites],
  );
  const start = Math.max(0, safePosition - 1 - 76);
  const end = Math.min(sequence.length, safePosition + 76);
  const context = sequence.slice(start, end);
  const rows = Array.from({ length: Math.ceil(context.length / 30) }, (_, rowIndex) => {
    const rowStart = rowIndex * 30;
    return {
      sequence: context.slice(rowStart, rowStart + 30),
      absoluteStart: start + rowStart,
    };
  });

  return (
    <aside className="preview-panel">
      <div className="preview-header">
        <p>{l("Reference context")}</p>
        <span>{sourceLabel ?? l(mode === "gene" ? "NCBI reference" : "User sequence")}</span>
      </div>
      {mode === "gene" ? (
        <>
          <div className="transcript-track preview-track">
            <span className="exon short">49</span><i />
            <span className="exon medium">50</span><i />
            <span className="exon target">51</span><i />
            <span className="exon long">52</span>
          </div>
          <div className="preview-stats">
            <span><strong>Exon 51</strong> {l("selected region")}</span>
            <span><strong>233 nt</strong> {l("exon length")}</span>
            <span><strong>− strand</strong> {l("orientation")}</span>
          </div>
          <div className="mock-sequence">
            <span>…CTGGAATGCTGTT</span><mark>A</mark><span>GAGACAGCCTGAA…</span>
          </div>
        </>
      ) : context ? (
        <>
          <div className="sequence-window-meta">
            <span>{start + 1}</span>
            <strong>{context.length} nt {l("window")}</strong>
            <span>{end}</span>
          </div>
          <div className="long-sequence" aria-label="Editing-site sequence context">
            {rows.map((row) => (
              <div className="long-sequence-row" key={row.absoluteStart}>
                <span className="row-coordinate">{row.absoluteStart + 1}</span>
                <div className="row-bases">
                  {row.sequence.split("").map((base, localIndex) => {
                    const absoluteIndex = row.absoluteStart + localIndex;
                    const basePosition = absoluteIndex + 1;
                    const site = sitesByPosition.get(basePosition);
                    const selected = basePosition === safePosition;
                    const codonEnd = absoluteIndex % 3 === 2;
                    if (site) {
                      return (
                        <button
                          type="button"
                          key={basePosition}
                          className={`sequence-base editing-a ${site.category} ${selected ? "selected" : ""} ${codonEnd ? "codon-end" : ""}`}
                          onClick={() => onPositionChange?.(basePosition)}
                          title={`${basePosition}: ${CATEGORY_LABELS[site.category]}; ${site.codon} → ${site.editedCodon}; ${site.aminoAcid} → ${site.editedAminoAcid}`}
                          aria-label={`Position ${basePosition}, ${CATEGORY_LABELS[site.category]}`}
                        >
                          {base}
                        </button>
                      );
                    }
                    return <span key={basePosition} className={`sequence-base ${selected ? "selected" : ""} ${codonEnd ? "codon-end" : ""}`}>{base}</span>;
                  })}
                </div>
                <span className="row-coordinate end">{row.absoluteStart + row.sequence.length}</span>
              </div>
            ))}
          </div>
          <p className="preview-help">
            {l("Showing up to 76 nt on each side of position")} {safePosition}, 153 nt {l("in total.")} {l("Click a colored A to select it.")}
          </p>
        </>
      ) : (
        <div className="empty-preview">
          <span>ACGT</span>
          <p>{l("Your in-frame sequence context will appear here.")}</p>
        </div>
      )}
      <div className="legend editing-legend">
        <span><i className="legend-target" /> {l("Selected site")}</span>
        <span><i className="legend-editable" /> {l("Editable A")}</span>
        <span><i className="legend-synonymous" /> {l("Synonymous A")}</span>
        <span><i className="legend-blocked" /> {l("GA, difficult to edit")}</span>
      </div>
    </aside>
  );
}
