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

  useEffect(() => {
    setShowAll(false);
    setCopiedId(null);
  }, [recommendations[0]?.id]);

  if (recommendations.length === 0) return null;
  const visibleRecommendations = getVisibleRecommendations(recommendations, showAll);

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

    <div className="bulge-recommendation-list">
      {visibleRecommendations.map((recommendation) => {
        const originalIndex = recommendations.findIndex(({ id }) => id === recommendation.id);
        const optimizedSequence = createOptimizedArrnaSequence(
          alignedGuide,
          targetWindow,
          targetIndex,
          recommendation.allBulges,
        );
        const applied = appliedRecommendationId === recommendation.id;
        const changedNucleotides = recommendation.addedBulges.reduce((sum, { size }) => sum + size, 0);
        const decreasedCount = recommendation.impact.decreasedBystanders.length;
        const targetReason = recommendation.impact.targetEffect === "increase"
          ? (language === "zh-CN" ? "A0 位于 core-increase zone" : "A0 falls within a core-increase zone")
          : (language === "zh-CN" ? "A0 避开 core-decrease zone" : "A0 avoids core-decrease zones");
        const reason = language === "zh-CN"
          ? `${targetReason}，同时降低 ${decreasedCount} 个 bystander A；新增 ${recommendation.addedBulges.length} 个 bulge，共扰动 ${changedNucleotides} nt 配对。`
          : `${targetReason} while ${decreasedCount} bystander A site${decreasedCount === 1 ? "" : "s"} fall within core-decrease zones; ${recommendation.addedBulges.length} added bulge${recommendation.addedBulges.length === 1 ? "" : "s"} disrupt ${changedNucleotides} paired nt.`;

        return <article className={`${originalIndex === 0 ? "recommended" : ""} ${applied ? "applied" : ""}`} key={recommendation.id}>
          <div className="bulge-recommendation-rank">
            <span>{String(originalIndex + 1).padStart(2, "0")}</span>
            {originalIndex === 0 && <b>{l("Recommended")}</b>}
          </div>
          <div className="bulge-recommendation-main">
            <strong>{formatBulge(recommendation)}</strong>
            {originalIndex === 0 && <p className="bulge-recommendation-reason"><b>{l("Why this is first")}</b>{reason}</p>}
            <div className="bulge-recommendation-impact">
              <span className={`target ${recommendation.impact.targetEffect}`}>A0 {l(`expected ${recommendation.impact.targetEffect}`)}</span>
              <span className="decrease">{decreasedCount} {l("bystander A expected decrease")}</span>
              <span className="increase">{recommendation.impact.increasedBystanders.length} {l("bystander A expected increase")}</span>
              {recommendation.impact.unresolvedSites.length > 0 && <span className="unresolved">{recommendation.impact.unresolvedSites.length} {l("unresolved overlap")}</span>}
            </div>
            <code title={optimizedSequence}>{optimizedSequence}</code>
          </div>
          {showScoreDetails && <dl className="bulge-recommendation-score">
            <div><dt>{l("Rule score")}</dt><dd>{recommendation.score.total.toFixed(1)}</dd></div>
            <div><dt>{l("Structural cost")}</dt><dd>{recommendation.addedBulges.length} bulge · {changedNucleotides} nt</dd></div>
          </dl>}
          <div className="bulge-recommendation-actions">
            <button className="button button-secondary" type="button" onClick={async () => {
              await navigator.clipboard.writeText(optimizedSequence);
              setCopiedId(recommendation.id);
            }}><Copy size={14} aria-hidden="true" />{l(copiedId === recommendation.id ? "Copied" : "Copy")}</button>
            <button className="button button-secondary" type="button" onClick={() => downloadText(`LEAPER_${recommendation.id}.fasta`, `>LEAPER_${recommendation.id}_5to3\n${optimizedSequence}\n`, "text/plain;charset=utf-8")}><Download size={14} aria-hidden="true" />FASTA</button>
            <button className={applied ? "button button-secondary" : "button button-primary"} type="button" onClick={() => onApply(recommendation)}>
              {applied ? <Check size={15} aria-hidden="true" /> : <ChevronRight size={15} aria-hidden="true" />}
              {l(applied ? "Design in workspace" : "View structure")}
            </button>
          </div>
        </article>;
      })}
    </div>

    {recommendations.length > 1 && <footer className="bulge-recommendation-disclosure">
      <button className="button button-secondary" type="button" aria-expanded={showAll} onClick={() => setShowAll((open) => !open)}>
        {showAll ? <ChevronUp size={15} aria-hidden="true" /> : <ChevronDown size={15} aria-hidden="true" />}
        {l(showAll ? "Show recommended design only" : "Compare all designs")} {!showAll && `(${recommendations.length})`}
      </button>
    </footer>}
  </section>;
}
