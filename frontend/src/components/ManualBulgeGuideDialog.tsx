import { ArrowRight, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { BulgeCandidate, BulgeType } from "../lib/bulgeOptimization";
import { getManualGuideCandidate } from "../lib/guidedOptimization";
import type { AdarEnvironment } from "../lib/normalEditing";
import { BulgeEffectRangeDetails } from "./BulgeEffectRangeDetails";
import { useLanguage } from "./LanguageProvider";

interface Props {
  open: boolean;
  candidates: Record<BulgeType, BulgeCandidate[]>;
  environment: AdarEnvironment;
  onClose: () => void;
  onUseCandidate: (candidate: BulgeCandidate) => void;
}

export function ManualBulgeGuideDialog({ open, candidates, environment, onClose, onUseCandidate }: Props) {
  const { l } = useLanguage();
  const [activeType, setActiveType] = useState<BulgeType>("deletion");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const allCandidates = useMemo(() => [...candidates.deletion, ...candidates.mismatch], [candidates]);
  const selectedCandidate = getManualGuideCandidate(allCandidates, activeType, selectedId);

  useEffect(() => {
    if (!open) return;
    closeButtonRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose, open]);

  if (!open || !selectedCandidate) return null;

  return createPortal(<div className="manual-guide-overlay" role="presentation" onMouseDown={(event) => {
    if (event.target === event.currentTarget) onClose();
  }}>
    <section className="manual-guide-dialog" role="dialog" aria-modal="true" aria-labelledby="manual-guide-title" aria-describedby="manual-guide-description">
      <header>
        <div><p className="eyebrow">{l("Manual design guide")}</p><h2 id="manual-guide-title">{l("Compare bulge effect ranges")}</h2><p id="manual-guide-description">{l("Choose a bulge type and size. The chart shows the qualitative core effect range relative to the provisional source anchor.")}</p></div>
        <button ref={closeButtonRef} className="manual-guide-close" type="button" aria-label={l("Close manual design guide")} onClick={onClose}><X size={18} /></button>
      </header>

      <div className="manual-guide-body">
        <div className="manual-guide-controls">
          <div className="manual-guide-type-tabs" role="tablist" aria-label={l("Bulge type")}>
            {(["deletion", "mismatch"] as BulgeType[]).map((type) => <button type="button" role="tab" aria-selected={activeType === type} key={type} onClick={() => {
              setActiveType(type);
              setSelectedId(null);
            }}>{type === "deletion" ? "Deletion" : "Mismatch"}</button>)}
          </div>
          <div className="manual-guide-sizes" aria-label={l("Bulge size")}>
            <span>{l("Choose size")}</span>
            <div>{candidates[activeType].map((candidate) => <button type="button" aria-pressed={selectedCandidate.id === candidate.id} key={candidate.id} onClick={() => setSelectedId(candidate.id)}>{candidate.size} nt</button>)}</div>
          </div>
          <div className="manual-guide-selection">
            <span>{l("Selected candidate")}</span>
            <strong>{selectedCandidate.size} nt {selectedCandidate.type}</strong>
            <small>{environment} · {l("core strong-effect zones")}</small>
          </div>
        </div>

        <div className="manual-guide-preview">
          <BulgeEffectRangeDetails candidate={selectedCandidate} environment={environment} onClose={onClose} showClose={false} />
          <p>{l("Pink regions indicate expected increase; blue regions indicate expected decrease. The source coordinate anchor remains provisional for multi-nucleotide bulges.")}</p>
        </div>
      </div>

      <footer>
        <button className="button button-secondary" type="button" onClick={onClose}>{l("Keep automatic design")}</button>
        <button className="button button-primary" type="button" onClick={() => onUseCandidate(selectedCandidate)}>{l("Use this bulge in manual design")}<ArrowRight size={16} /></button>
      </footer>
    </section>
  </div>, document.body);
}
