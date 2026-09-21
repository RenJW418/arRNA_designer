import {
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Copy,
  Download,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  createOptimizedArrnaSequence,
  type BulgeRecommendation,
} from "../lib/bulgeRecommendation";
import { downloadText } from "../lib/exports";
import { getVisibleRecommendations } from "../lib/guidedOptimization";
import { InfoTip } from "./InfoTip";
import { useLanguage } from "./LanguageProvider";
import { BulgeStructureOverview } from "./BulgeStructureOverview";

interface Props {
  recommendations: BulgeRecommendation[];
  alignedGuide: string;
  targetWindow: string;
  targetIndex: number;
  appliedRecommendationId: string | null;
  showScoreDetails: boolean;
  onApply: (recommendation: BulgeRecommendation) => void;
}

function formatCoordinate(coordinate: number): string {
  if (coordinate === 0) return "A0";
  return coordinate > 0 ? `A+${coordinate}` : `A${coordinate}`;
}

function formatBulge(recommendation: BulgeRecommendation): string {
  return recommendation.addedBulges.map(({ type, size, start, end }) =>
    `${type === "deletion" ? "Deletion" : "Mismatch"} ${size} · ${formatCoordinate(start)}–${formatCoordinate(end)}`,
  ).join(" + ");
}

export function BulgeRecommendationResults({
  recommendations,
  alignedGuide,
  targetWindow,
  targetIndex,
  appliedRecommendationId,
  showScoreDetails,
  onApply,
}: Props) {
  const { l, language } = useLanguage();
  const [showAll, setShowAll] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    setShowAll(false);
    setCopiedId(null);
    setSelectedId(recommendations[0]?.id ?? null);
  }, [recommendations[0]?.id]);

  if (recommendations.length === 0) return null;
  const visibleRecommendations = getVisibleRecommendations(recommendations, showAll);
  const selected = recommendations.find(({ id }) => id === selectedId) ?? recommendations[0];
  const selectedIndex = recommendations.findIndex(({ id }) => id === selected.id);
  const optimizedSequence = createOptimizedArrnaSequence(alignedGuide, targetWindow, targetIndex, selected.allBulges);
  const changedNucleotides = selected.addedBulges.reduce((sum, { size }) => sum + size, 0);
  const decreasedCount = selected.impact.decreasedBystanders.length;
  const targetReason = selected.impact.targetEffect === "increase"
    ? (language === "zh-CN" ? "A0 位于 core-increase zone" : "A0 falls within a core-increase zone")
    : (language === "zh-CN" ? "A0 避开 core-decrease zone" : "A0 avoids core-decrease zones");
  const reason = language === "zh-CN"
    ? `${targetReason}，同时降低 ${decreasedCount} 个 bystander A；新增 ${selected.addedBulges.length} 个 bulge，共扰动 ${changedNucleotides} nt 配对。`
    : `${targetReason} while ${decreasedCount} bystander A site${decreasedCount === 1 ? "" : "s"} fall within core-decrease zones; ${selected.addedBulges.length} added bulge${selected.addedBulges.length === 1 ? "" : "s"} disrupt ${changedNucleotides} paired nt.`;

  return <section className="bulge-recommendations" aria-labelledby="bulge-recommendation-title">
    <header>
      <div>
        <p className="eyebrow">{l("Recommended result")}</p>
        <h3 id="bulge-recommendation-title">{showAll
          ? `${recommendations.length} ${l("ranked arRNA designs")}`
          : l("Top recommended arRNA")}</h3>
      </div>
      <InfoTip align="left">{l("The ranking compares qualitative core-effect rules. It does not predict a new editing-efficiency percentage.")}</InfoTip>
    </header>

    <div className="bulge-recommendation-layout">
      <aside className="bulge-recommendation-sidebar" aria-label={l("Ranked arRNA designs")}>
        <div className="task-candidate-list">{visibleRecommendations.map((recommendation) => {
          const index = recommendations.findIndex(({ id }) => id === recommendation.id);
          return <button className={`task-candidate ${recommendation.id === selected.id ? "selected" : ""}`} type="button" aria-pressed={recommendation.id === selected.id} onClick={() => setSelectedId(recommendation.id)} key={recommendation.id}><span>{String(index + 1).padStart(2, "0")} · {l("Candidate")} {index + 1}</span><small>{recommendation.addedBulges.length} bulge · {recommendation.addedBulges.reduce((sum, { size }) => sum + size, 0)} nt</small></button>;
        })}</div>
        {recommendations.length > 1 && <button className="back-button recommendation-list-toggle" type="button" aria-expanded={showAll} onClick={() => setShowAll((open) => !open)}>{showAll ? <ChevronUp size={15} /> : <ChevronDown size={15} />}{l(showAll ? "Show recommended design only" : "Compare all designs")} {!showAll && `(${recommendations.length})`}</button>}
      </aside>

      <div className="bulge-recommendation-detail">
        <div className="bulge-recommendation-detail-heading"><div><span>{selectedIndex === 0 ? l("Top recommendation") : `${l("Candidate")} ${selectedIndex + 1}`}</span><strong>{formatBulge(selected)}</strong></div>{showScoreDetails && <b>{l("Rule score")} {selected.score.total.toFixed(1)}</b>}</div>
        <BulgeStructureOverview bulges={selected.allBulges} windowStart={-targetIndex} windowEnd={targetWindow.length - targetIndex - 1} />
        {selectedIndex === 0 && <p className="bulge-recommendation-reason"><b>{l("Why this is first")}</b>{reason}</p>}
        {showScoreDetails && <div className="bulge-recommendation-impact"><span className={`target ${selected.impact.targetEffect}`}>A0 {l(`expected ${selected.impact.targetEffect}`)}</span><span className="decrease">{decreasedCount} {l("bystander A expected decrease")}</span><span className="increase">{selected.impact.increasedBystanders.length} {l("bystander A expected increase")}</span>{selected.impact.unresolvedSites.length > 0 && <span className="unresolved">{selected.impact.unresolvedSites.length} {l("unresolved overlap")}</span>}</div>}
        <div className="bulge-recommendation-sequence"><span>{l("Final arRNA sequence")} · 5′→3′</span><code>{optimizedSequence}</code><small>{optimizedSequence.length} nt</small></div>
        <div className="bulge-recommendation-actions"><button className="button button-primary" type="button" onClick={async () => { await navigator.clipboard.writeText(optimizedSequence); setCopiedId(selected.id); }}><Copy size={14} />{l(copiedId === selected.id ? "Copied" : "Copy")}</button><button className="button button-secondary" type="button" onClick={() => downloadText(`LEAPER_${selected.id}.fasta`, `>LEAPER_${selected.id}_5to3\n${optimizedSequence}\n`, "text/plain;charset=utf-8")}><Download size={14} />FASTA</button><button className={appliedRecommendationId === selected.id ? "button button-secondary" : "button button-primary"} type="button" onClick={() => onApply(selected)}>{appliedRecommendationId === selected.id ? <Check size={15} /> : <ChevronRight size={15} />}{l(appliedRecommendationId === selected.id ? "Design in workspace" : "Edit in manual design")}</button></div>
      </div>
    </div>
  </section>;
}
