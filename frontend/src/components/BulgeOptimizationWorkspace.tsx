import {
  Beaker,
  GripVertical,
  Layers3,
  ListChecks,
  LockKeyhole,
  RotateCcw,
  Trash2,
  ArrowRight,
  Copy,
  Download,
} from "lucide-react";
import { CSSProperties, DragEvent, useEffect, useMemo, useState } from "react";
import {
  Bulge,
  BulgeCandidate,
  BulgeType,
  MAX_BULGES,
  chunkSequenceForDisplay,
  createAutoMismatchSequence,
  createInitialBulges,
  createOptimizationEvidenceState,
  createZeroInitializedEfficiencies,
  evaluateQualitativeEffect,
  getBulgeCandidates,
  OptimizationEvidenceState,
  type OptimizationGoal,
  validateBulgePlacement,
  validateMismatchSequence,
} from "../lib/bulgeOptimization";
import {
  recommendBulgeDesigns,
  type BulgeRecommendation,
} from "../lib/bulgeRecommendation";
import { getGuidedProgress } from "../lib/guidedOptimization";
import { AdarEnvironment, EditingSite, InitialArrnaDesign, NormalArrnaVariant } from "../lib/normalEditing";
import { BulgeEffectRangeDetails } from "./BulgeEffectRangeDetails";
import { BulgeStructureOverview } from "./BulgeStructureOverview";
import { BulgeRecommendationResults } from "./BulgeRecommendationResults";
import { InfoTip } from "./InfoTip";
import { useLanguage } from "./LanguageProvider";
import { ManualBulgeGuideDialog } from "./ManualBulgeGuideDialog";
import { downloadText } from "../lib/exports";

interface Props {
  design: InitialArrnaDesign;
  sites: EditingSite[];
  variant: NormalArrnaVariant;
  environment: AdarEnvironment;
  onEvidenceChange?: (evidence: OptimizationEvidenceState) => void;
  startLocked?: boolean;
  initialBulges?: Bulge[];
  onReviewSource?: () => void;
}

interface PlacementPreview {
  candidate: BulgeCandidate;
  start: number;
  valid: boolean;
  reason?: string;
}

function formatCoordinate(coordinate: number): string {
  if (coordinate === 0) return "A0";
  return coordinate > 0 ? `A+${coordinate}` : `A${coordinate}`;
}

function candidateById(
  candidateId: string | null,
  candidates: Record<BulgeType, BulgeCandidate[]>,
): BulgeCandidate | null {
  if (!candidateId) return null;
  return [...candidates.deletion, ...candidates.mismatch]
    .find((candidate) => candidate.id === candidateId) ?? null;
}

function CandidateGroup({
  type,
  candidates,
  disabled,
  selectedId,
  expandedRangeId,
  onSelect,
  onViewRange,
  onDragStart,
}: {
  type: BulgeType;
  candidates: BulgeCandidate[];
  disabled: boolean;
  selectedId: string | null;
  expandedRangeId: string | null;
  onSelect: (candidate: BulgeCandidate) => void;
  onViewRange: (candidate: BulgeCandidate) => void;
  onDragStart: (event: DragEvent<HTMLButtonElement>, candidate: BulgeCandidate) => void;
}) {
  const { l } = useLanguage();
  const preferredSize = type === "deletion" ? 10 : 5;
  const [chosenId, setChosenId] = useState(() => candidates.find(({ size }) => size === preferredSize)?.id ?? candidates[0]?.id ?? "");
  useEffect(() => {
    if (selectedId && candidates.some(({ id }) => id === selectedId)) {
      setChosenId(selectedId);
      return;
    }
    if (!candidates.some(({ id }) => id === chosenId)) {
      setChosenId(candidates.find(({ size }) => size === preferredSize)?.id ?? candidates[0]?.id ?? "");
    }
  }, [candidates, chosenId, preferredSize, selectedId]);
  const candidate = candidates.find(({ id }) => id === chosenId) ?? candidates[0];
  if (!candidate) return null;
  return <div className="bulge-candidate-group">
    <div>
      <strong>{l(type === "deletion" ? "Deletion bulges" : "Mismatch bulges")} <InfoTip>{l(type === "deletion" ? "A deletion bulge removes aligned bases from the arRNA." : "A mismatch bulge uses consecutive same-base mismatches: A-A, C-C, G-G or T-T (U-U in RNA output).")}</InfoTip></strong>
    </div>
    <div className="bulge-candidate-list">
      <label className="bulge-size-field">
        <span>Bulge size</span>
        <select value={candidate.id} onChange={(event) => {
          const nextCandidate = candidates.find(({ id }) => id === event.target.value);
          if (!nextCandidate) return;
          setChosenId(nextCandidate.id);
          onSelect(nextCandidate);
        }}>
          {candidates.map((option) => <option value={option.id} key={option.id}>{option.size} nt</option>)}
        </select>
      </label>
      <div className="bulge-candidate-item">
        <button
          type="button"
          draggable={!disabled}
          disabled={disabled}
          aria-pressed={selectedId === candidate.id}
          className={selectedId === candidate.id ? "bulge-candidate selected" : "bulge-candidate"}
          onClick={() => onSelect(candidate)}
          onDragStart={(event) => onDragStart(event, candidate)}
        >
          <GripVertical size={13} aria-hidden="true" />
          <span><b>{candidate.size} nt</b><small>{candidate.type}</small></span>
        </button>
        <button className="bulge-range-link" type="button" aria-expanded={expandedRangeId === candidate.id} onClick={() => onViewRange(candidate)}>{l(expandedRangeId === candidate.id ? "Hide effect range" : "View effect range")}</button>
      </div>
    </div>
  </div>;
}

export function BulgeOptimizationWorkspace({
  design,
  sites,
  variant,
  environment,
  onEvidenceChange,
  startLocked = false,
  initialBulges: suppliedInitialBulges,
  onReviewSource,
}: Props) {
  const { l } = useLanguage();
  const cloneStartingBulges = () => (suppliedInitialBulges
    ?? createInitialBulges(variant.deletionCoordinates, environment))
    .map((bulge) => new Bulge({ ...bulge }));
  const [sourceVariant, setSourceVariant] = useState<NormalArrnaVariant | null>(() => startLocked ? variant : null);
  const [bulges, setBulges] = useState<Bulge[]>(() => startLocked ? cloneStartingBulges() : []);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [placementPreview, setPlacementPreview] = useState<PlacementPreview | null>(null);
  const [placementMessage, setPlacementMessage] = useState("");
  const [efficiencies, setEfficiencies] = useState<Record<number, number>>(() => startLocked
    ? createZeroInitializedEfficiencies(
      sites.filter(({ position }) => position >= design.windowStart && position <= design.windowEnd).map(({ position }) => position),
      design.windowStart + design.targetIndex,
    )
    : {});
  const [confirmedEfficiencyPositions, setConfirmedEfficiencyPositions] = useState<Set<number>>(new Set());
  const [optimizationGoal, setOptimizationGoal] = useState<OptimizationGoal>("improve-target");
  const [editingMismatchId, setEditingMismatchId] = useState<string | null>(null);
  const [mismatchDraft, setMismatchDraft] = useState("");
  const [mismatchError, setMismatchError] = useState("");
  const [effectRangeCandidateId, setEffectRangeCandidateId] = useState<string | null>(null);
  const [recommendations, setRecommendations] = useState<BulgeRecommendation[]>([]);
  const [appliedRecommendationId, setAppliedRecommendationId] = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [hasDesigned, setHasDesigned] = useState(false);
  const [focusedBulgeId, setFocusedBulgeId] = useState<string | null>(null);
  const [manualGuideOpen, setManualGuideOpen] = useState(false);
  const [measurementsOpen, setMeasurementsOpen] = useState(false);
  const [scoreDetailsOpen, setScoreDetailsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [designGateAttempted, setDesignGateAttempted] = useState(false);

  const activeVariant = sourceVariant ?? variant;
  const lockedToDifferentVariant = sourceVariant !== null && sourceVariant.id !== variant.id;
  const remainingBulges = MAX_BULGES - bulges.length;
  const candidates = useMemo(() => getBulgeCandidates(environment), [environment]);
  const targetAbsolutePosition = design.windowStart + design.targetIndex;
  const targetEfficiency = efficiencies[targetAbsolutePosition];
  const guidedProgress = getGuidedProgress(Boolean(sourceVariant), targetEfficiency !== undefined, recommendations.length);
  const effectRangeCandidate = candidateById(effectRangeCandidateId, candidates);
  const windowSites = useMemo(() => {
    const byPosition = new Map(sites.map((site) => [site.position, site]));
    return design.targetWindow.split("").map((base, index) => {
      const absolutePosition = design.windowStart + index;
      return {
        base,
        absolutePosition,
        relativeCoordinate: index - design.targetIndex,
        site: byPosition.get(absolutePosition),
      };
    });
  }, [design, sites]);

  const previewBulge = useMemo(() => {
    if (!placementPreview?.valid) return null;
    return new Bulge({
      id: "placement-preview",
      candidateId: placementPreview.candidate.id,
      type: placementPreview.candidate.type,
      start: placementPreview.start,
      size: placementPreview.candidate.size,
      source: "user",
      effectZones: placementPreview.candidate.effectZones,
    });
  }, [placementPreview]);
  const displayedBulges = previewBulge ? [...bulges, previewBulge] : bulges;
  const displayedBulgeLabels = new Map(displayedBulges.map((bulge, index) => [bulge.id, `B${index + 1}`]));

  const guideBases = useMemo(() => windowSites.map(({ relativeCoordinate }, index) => {
    const userBulge = bulges.find((bulge) => bulge.source === "user"
      && relativeCoordinate >= bulge.start && relativeCoordinate <= bulge.end);
    if (userBulge?.type === "deletion") return "−";
    if (userBulge?.type === "mismatch") {
      return userBulge.mismatchBases?.[relativeCoordinate - userBulge.start] ?? "?";
    }
    return activeVariant.alignedGuide[index]?.replace("-", "−") ?? "−";
  }), [activeVariant, bulges, windowSites]);

  const optimizedSequence = guideBases.filter((base) => base !== "−").reverse().join("");
  const sequenceRows = useMemo(() => chunkSequenceForDisplay(
    windowSites.map((entry, index) => ({ ...entry, index })),
    30,
  ), [windowSites]);

  useEffect(() => {
    onEvidenceChange?.(createOptimizationEvidenceState(
      sourceVariant?.id,
      efficiencies,
      bulges,
      optimizedSequence,
      confirmedEfficiencyPositions,
      optimizationGoal,
    ));
  }, [bulges, confirmedEfficiencyPositions, efficiencies, onEvidenceChange, optimizationGoal, optimizedSequence, sourceVariant?.id]);

  function selectCandidate(candidate: BulgeCandidate) {
    setSelectedCandidateId(candidate.id);
    setEffectRangeCandidateId(candidate.id);
    setFocusedBulgeId(null);
    setManualGuideOpen(false);
  }

  function lockSource(nextVariant: NormalArrnaVariant) {
    setSourceVariant({ ...nextVariant, deletionCoordinates: [...nextVariant.deletionCoordinates] });
    setBulges(cloneStartingBulges());
    setEfficiencies(createZeroInitializedEfficiencies(
      windowSites.filter(({ site }) => Boolean(site)).map(({ absolutePosition }) => absolutePosition),
      design.windowStart + design.targetIndex,
    ));
    setConfirmedEfficiencyPositions(new Set());
    setOptimizationGoal("improve-target");
    setSelectedCandidateId(null);
    setPlacementPreview(null);
    setPlacementMessage("");
    setEditingMismatchId(null);
    setRecommendations([]);
    setAppliedRecommendationId(null);
    setAdvancedOpen(false);
    setHasDesigned(false);
    setFocusedBulgeId(null);
    setDesignGateAttempted(false);
  }

  function previewPlacement(candidate: BulgeCandidate, start: number) {
    const startIndex = start + design.targetIndex;
    if (startIndex < 0 || startIndex + candidate.size > design.targetWindow.length) {
      setPlacementPreview({ candidate, start, valid: false, reason: l("The bulge extends beyond this arRNA.") });
      return;
    }
    const validation = validateBulgePlacement(bulges, { start, size: candidate.size });
    setPlacementPreview({ candidate, start, ...validation });
  }

  function placeCandidate(candidate: BulgeCandidate, start: number) {
    const startIndex = start + design.targetIndex;
    if (startIndex < 0 || startIndex + candidate.size > design.targetWindow.length) {
      setPlacementMessage(l("The bulge extends beyond this arRNA."));
      return;
    }
    const validation = validateBulgePlacement(bulges, { start, size: candidate.size });
    if (!validation.valid) {
      setPlacementMessage(validation.reason ? l(validation.reason) : l("This bulge cannot be placed here."));
      return;
    }
    const targetSegment = design.targetWindow.slice(startIndex, startIndex + candidate.size);
    const next = new Bulge({
      id: `user-${Date.now()}-${bulges.length + 1}`,
      candidateId: candidate.id,
      type: candidate.type,
      start,
      size: candidate.size,
      source: "user",
      effectZones: candidate.effectZones,
      mismatchBases: candidate.type === "mismatch" ? createAutoMismatchSequence(targetSegment) : undefined,
    });
    setBulges((current) => [...current, next]);
    setFocusedBulgeId(next.id);
    setPlacementMessage(`${candidate.label} added at ${formatCoordinate(start)}–${formatCoordinate(next.end)}.`);
    setPlacementPreview(null);
    setSelectedCandidateId(null);
    if (next.type === "mismatch") {
      setEditingMismatchId(next.id);
      setMismatchDraft(next.mismatchBases ?? "");
      setMismatchError("");
    }
    setAppliedRecommendationId(null);
  }

  function removeBulge(id: string) {
    setBulges((current) => current.filter((bulge) => bulge.id !== id));
    setFocusedBulgeId((current) => current === id ? null : current);
    setAppliedRecommendationId(null);
    if (editingMismatchId === id) {
      setEditingMismatchId(null);
      setMismatchDraft("");
      setMismatchError("");
    }
  }

  function beginMismatchEdit(bulge: Bulge) {
    setEditingMismatchId(bulge.id);
    setMismatchDraft(bulge.mismatchBases ?? "");
    setMismatchError("");
  }

  function saveMismatchEdit() {
    const activeBulge = bulges.find((bulge) => bulge.id === editingMismatchId);
    if (!activeBulge) return;
    const startIndex = activeBulge.start + design.targetIndex;
    const targetSegment = design.targetWindow.slice(startIndex, startIndex + activeBulge.size);
    const normalized = mismatchDraft.toUpperCase().replace(/T/g, "U").replace(/\s/g, "");
    const error = validateMismatchSequence(targetSegment, normalized);
    if (error) {
      setMismatchError(error);
      return;
    }
    setBulges((current) => current.map((bulge) => bulge.id === activeBulge.id
      ? bulge.withMismatchBases(normalized)
      : bulge));
    setMismatchDraft(normalized);
    setMismatchError("");
    setAppliedRecommendationId(null);
  }

  function setEfficiency(absolutePosition: number, value: string) {
    setRecommendations([]);
    setAppliedRecommendationId(null);
    setHasDesigned(false);
    if (value === "") {
      setEfficiencies((current) => {
        const next = { ...current };
        if (absolutePosition === targetAbsolutePosition) delete next[absolutePosition];
        else next[absolutePosition] = 0;
        return next;
      });
      setConfirmedEfficiencyPositions((current) => {
        const next = new Set(current);
        next.delete(absolutePosition);
        return next;
      });
      return;
    }
    const numeric = Math.min(100, Math.max(0, Number(value)));
    if (!Number.isFinite(numeric)) return;
    if (absolutePosition === targetAbsolutePosition) setDesignGateAttempted(false);
    setEfficiencies((current) => ({ ...current, [absolutePosition]: numeric }));
    setConfirmedEfficiencyPositions((current) => new Set(current).add(absolutePosition));
  }

  function changeOptimizationGoal(nextGoal: OptimizationGoal) {
    setOptimizationGoal(nextGoal);
    setRecommendations([]);
    setAppliedRecommendationId(null);
    setHasDesigned(false);
  }

  function designOptimizedArrnas() {
    if (!sourceVariant || targetEfficiency === undefined) return;
    setHasDesigned(true);
    setMeasurementsOpen(false);
    const initialBulges = cloneStartingBulges();
    const observedSites = windowSites.flatMap(({ site, absolutePosition, relativeCoordinate }) => site ? [{
      coordinate: relativeCoordinate,
      absolutePosition,
      observedEfficiency: efficiencies[absolutePosition] ?? 0,
    }] : []);
    const results = recommendBulgeDesigns({
      candidates: [...candidates.deletion, ...candidates.mismatch],
      initialBulges,
      targetWindow: design.targetWindow,
      targetIndex: design.targetIndex,
      sites: observedSites,
      optimizationGoal,
      maxResults: 10,
    });
    setRecommendations(results);
    setAppliedRecommendationId(null);
    setPlacementMessage(results.length > 0
      ? `${results.length} ${l("rule-ranked arRNA designs generated.")}`
      : l("No legal bulge combination matches the current qualitative rules."));
  }

  function attemptOptimizedDesign() {
    if (targetEfficiency === undefined) {
      setDesignGateAttempted(true);
      window.requestAnimationFrame(() => document.getElementById("target-a0-efficiency")?.focus());
      return;
    }
    setDesignGateAttempted(false);
    designOptimizedArrnas();
  }

  function applyRecommendation(recommendation: BulgeRecommendation) {
    if (!sourceVariant) return;
    const initialBulges = cloneStartingBulges();
    const addedBulges = recommendation.addedBulges.map((bulge, index) => new Bulge({
      ...bulge,
      id: `applied-${index + 1}-${bulge.type}-${bulge.size}-${bulge.start}`,
    }));
    setBulges([...initialBulges, ...addedBulges]);
    setAppliedRecommendationId(recommendation.id);
    setAdvancedOpen(true);
    setFocusedBulgeId(addedBulges[0]?.id ?? initialBulges[0]?.id ?? null);
    setSelectedCandidateId(null);
    setPlacementPreview(null);
    setEditingMismatchId(null);
    setPlacementMessage(l("Recommended design loaded into the workspace."));
  }

  function onCandidateDragStart(event: DragEvent<HTMLButtonElement>, candidate: BulgeCandidate) {
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData("application/x-leaper-bulge", candidate.id);
    setSelectedCandidateId(candidate.id);
  }

  return <section className={`bulge-optimization ${advancedOpen ? "is-manual" : "is-automatic"}`} aria-label={l("Experiment-guided refinement")}>
    {!startLocked && <div className="bulge-optimization-heading">
      <div className="result-step-heading">
        <span>3</span>
        <div><p className="eyebrow">{l("Experiment-guided refinement")}</p><h2 id="bulge-optimization-title">{l("Optimize a tested arRNA")}</h2></div>
      </div>
      <div className="bulge-count"><Layers3 size={15} aria-hidden="true" /><strong>{bulges.length}/{MAX_BULGES}</strong><span>{l("bulges used")}</span></div>
    </div>}

    {!startLocked && <div className="bulge-source-bar">
      <div><span>{l("Experimental starting point")}</span><strong>{l(sourceVariant?.label ?? variant.label)} <InfoTip>{l(sourceVariant ? "All observations and added bulges in this session belong to this locked arRNA." : "Select the exact generated arRNA used in the experiment, then lock it before entering observations.")}</InfoTip></strong></div>
      {!sourceVariant
        ? <button className="button button-primary" type="button" onClick={() => lockSource(variant)}><LockKeyhole size={15} />{l("Use this tested arRNA")}</button>
        : lockedToDifferentVariant
          ? <button className="button button-secondary" type="button" onClick={() => lockSource(variant)}><RotateCcw size={15} />{l("Start over from")} {l(variant.shortLabel)}</button>
          : <span className="bulge-source-locked"><LockKeyhole size={14} />{l("Source fixed")}</span>}
    </div>}

    {startLocked ? <>
      <ol className="tested-refinement-steps" aria-label={l("Refinement workflow")}>
        {[l("Enter sequences"), l("Enter experimental results"), l("View results")].map((label, index) => {
          const active = hasDesigned || advancedOpen ? 2 : 1;
          return <li className={index < active ? "complete" : index === active ? "current" : "pending"} aria-current={index === active ? "step" : undefined} key={label}><span>{index < active ? "✓" : index + 1}</span><strong>{label}</strong></li>;
        })}
      </ol>
      <div className="tested-workspace-toolbar"><div><strong>{l(activeVariant.label)}</strong><span>{environment} · A{design.targetPosition}</span></div><button className="back-button" type="button" onClick={onReviewSource}>{l("Review alignment")}</button></div>
    </> :
    <ol className="bulge-guided-progress" aria-label={l("Optimization progress")}> 
      {[l("Choose tested arRNA"), l("Enter experimental results"), l("Generate optimized designs")].map((label, index) => <li className={guidedProgress[index]} aria-current={guidedProgress[index] === "current" ? "step" : undefined} key={label}>
        <span>{guidedProgress[index] === "complete" ? "✓" : index + 1}</span>
        <strong>{label}</strong>
      </li>)}
    </ol>}

    {!sourceVariant ? <div className="bulge-empty-state">
      <Beaker size={25} aria-hidden="true" />
      <div><strong>{l("First identify the tested arRNA.")}</strong><p>{l("Choose a generated version above and lock it as the source.")}</p></div>
    </div> : <>
      {advancedOpen && <div className="bulge-mode-bar">
        <h2>{l("Manual design")}</h2>
        <button className="button button-secondary" type="button" onClick={() => { setAdvancedOpen(false); setManualGuideOpen(false); }}>{l("Return to automatic design")}</button>
      </div>}

      <div className={advancedOpen ? "bulge-workbench advanced" : "bulge-workbench guided"}>
        {advancedOpen && <aside className="bulge-library" aria-label={l("Bulge candidate library")}>
          <div className="bulge-panel-heading"><div><strong>{l("Choose a candidate")} <InfoTip>{l("Drag a candidate onto the arRNA, or select it and click its starting base.")}</InfoTip></strong></div></div>
          <button className="bulge-range-guide-button" type="button" onClick={() => setManualGuideOpen(true)}>{l("Compare all bulge effect ranges")}</button>
          <CandidateGroup type="deletion" candidates={candidates.deletion} disabled={remainingBulges <= 0} selectedId={selectedCandidateId} expandedRangeId={effectRangeCandidateId} onSelect={selectCandidate} onViewRange={(candidate) => setEffectRangeCandidateId((current) => current === candidate.id ? null : candidate.id)} onDragStart={onCandidateDragStart} />
          <CandidateGroup type="mismatch" candidates={candidates.mismatch} disabled={remainingBulges <= 0} selectedId={selectedCandidateId} expandedRangeId={effectRangeCandidateId} onSelect={selectCandidate} onViewRange={(candidate) => setEffectRangeCandidateId((current) => current === candidate.id ? null : candidate.id)} onDragStart={onCandidateDragStart} />
          {effectRangeCandidate && <BulgeEffectRangeDetails candidate={effectRangeCandidate} environment={environment} onClose={() => setEffectRangeCandidateId(null)} />}
          <p className="bulge-provisional-note"><strong>{environment} · {l("core strong-effect zones")}</strong><InfoTip>{l("Expected arrows are shown only where the experimental smoothed fold-change is at least 1.2 or at most 0.8.")}</InfoTip></p>
        </aside>}

        <div className="bulge-editor">
          {!advancedOpen && hasDesigned && <div className="measurement-summary"><strong>A0 · {targetEfficiency}% {l("Observed")}</strong><button className="back-button" type="button" aria-expanded={measurementsOpen} onClick={() => setMeasurementsOpen(!measurementsOpen)}>{l(measurementsOpen ? "Hide measurements" : "Edit measurements")}</button></div>}
          <div hidden={!advancedOpen && hasDesigned && !measurementsOpen}>
          <div className="bulge-panel-heading"><div><strong>{l(advancedOpen ? "Place and measure" : "Enter experimental editing efficiencies")} <InfoTip>{l("The complete sequence is shown in 30 nt rows. Enter observed editing efficiency directly beneath each A.")}</InfoTip></strong></div></div>
          <div className="bulge-input-requirements">
            <span className="required"><b>A0</b>{l("Required")}</span>
            <span><b>{l("Other A sites")}</b>{l("Optional · defaults to 0")}</span>
          </div>
          {advancedOpen && <div className="evidence-separation-note">
            <strong>{l("Evidence")}</strong>
            <span><i className="observed" />{l("Observed")}</span>
            <span><i className="predicted" />{l("Expected")}</span>
            <InfoTip>{l("Blue fill is the observed experimental editing efficiency entered by the user. Arrows show only the qualitative expected direction from a bulge rule and never alter the measured percentage.")}</InfoTip>
          </div>}
          {(advancedOpen || appliedRecommendationId) && <BulgeStructureOverview
            bulges={displayedBulges}
            windowStart={-design.targetIndex}
            windowEnd={design.targetWindow.length - design.targetIndex - 1}
            focusedBulgeId={advancedOpen ? focusedBulgeId : null}
            onClearFocus={() => setFocusedBulgeId(null)}
          />}
          <div className="bulge-sequence-board" onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setPlacementPreview(null);
          }}>
            {sequenceRows.map((row) => {
              const rowStyle = { "--bulge-columns": 30 } as CSSProperties;
              const first = row[0];
              const last = row.at(-1) ?? first;
              return <section className="bulge-sequence-chunk" aria-label={`${formatCoordinate(first.relativeCoordinate)} to ${formatCoordinate(last.relativeCoordinate)}`} key={first.absolutePosition}>
                <div className="bulge-coordinate-row" style={rowStyle}>
                  <span>{formatCoordinate(first.relativeCoordinate)}–{formatCoordinate(last.relativeCoordinate)}</span>
                  {row.map(({ relativeCoordinate }) => <i key={relativeCoordinate}>{relativeCoordinate % 10 === 0 ? formatCoordinate(relativeCoordinate) : ""}</i>)}
                </div>
                <div className="bulge-sequence-row bulge-target-row" style={rowStyle}>
                  <span><b>Target RNA</b><small>5′→3′</small></span>
                  {row.map(({ base, relativeCoordinate, absolutePosition, site }) => {
                    const effect = site ? evaluateQualitativeEffect(relativeCoordinate, displayedBulges) : null;
                    const efficiency = efficiencies[absolutePosition];
                    const occupied = displayedBulges.some((bulge) => relativeCoordinate >= bulge.start && relativeCoordinate <= bulge.end);
                    const preview = placementPreview && relativeCoordinate >= placementPreview.start
                      && relativeCoordinate < placementPreview.start + placementPreview.candidate.size;
                    const classes = [
                      "bulge-base",
                      site ? "is-a" : "",
                      relativeCoordinate === 0 ? "is-target-a" : "",
                      effect && effect.status !== "none" ? `effect-${effect.status}` : "",
                      effect && effect.overlap !== "none" ? `effect-${effect.overlap}` : "",
                      occupied ? "is-bulge-interval" : "",
                      preview ? (placementPreview.valid ? "placement-valid" : "placement-invalid") : "",
                    ].filter(Boolean).join(" ");
                    const baseStyle = efficiency === undefined ? undefined : { "--measured-efficiency": `${efficiency}%` } as CSSProperties;
                    const effectDescription = effect?.status && effect.status !== "none"
                      ? `; ${effect.effects.map(({ bulgeId, effect: direction }) => `${displayedBulgeLabels.get(bulgeId)} ${direction}`).join(", ")}`
                      : "";
                    return <span className={classes} style={baseStyle} title={site ? `A${absolutePosition}${efficiency === undefined ? ": not measured" : `: ${efficiency}%`}${effectDescription}` : undefined} key={absolutePosition}>
                      {efficiency !== undefined && <i className="efficiency-fill" />}
                      <b>{base}</b>
                      {effect && effect.effects.length > 0 && <span className="effect-source-badges">
                        {effect.effects.map(({ bulgeId, effect: direction }) => <i className={direction} aria-label={`${displayedBulgeLabels.get(bulgeId)} core predicted ${direction}`} key={bulgeId}>{displayedBulgeLabels.get(bulgeId)}{direction === "increase" ? "↑" : "↓"}</i>)}
                      </span>}
                    </span>;
                  })}
                </div>
                <div className="bulge-efficiency-row" style={rowStyle}>
                  <span><b>{l("Observed")}</b><small>{l("editing %")}</small></span>
                  {row.map(({ absolutePosition, site }) => {
                    const isTarget = absolutePosition === targetAbsolutePosition;
                    return site
                      ? <label className={`inline-efficiency-field ${isTarget ? "required" : "optional"}`} title={`${isTarget ? "Required target" : "Optional bystander"} A${absolutePosition} editing efficiency`} key={absolutePosition}>
                        <input id={isTarget ? "target-a0-efficiency" : undefined} aria-label={`${isTarget ? "Required target" : "Optional bystander"} A${absolutePosition} editing efficiency (%)`} type="number" min="0" max="100" step="0.1" required={isTarget} value={efficiencies[absolutePosition] ?? ""} onChange={(event) => setEfficiency(absolutePosition, event.target.value)} placeholder={isTarget ? l("Required") : "0"} />
                      </label>
                      : <span className="inline-efficiency-empty" aria-hidden="true" key={absolutePosition} />;
                  })}
                </div>
                {advancedOpen && <div className="bulge-pair-row" style={rowStyle}><span>{l("Pairing")}</span>{row.map(({ base, index, relativeCoordinate }) => <i key={relativeCoordinate}>{({ A: "U", U: "A", T: "A", C: "G", G: "C" }[base] === guideBases[index]) ? "|" : ""}</i>)}</div>}
                <div className="bulge-sequence-row bulge-guide-row" style={rowStyle}>
                  <span><b>arRNA</b><small>3′→5′</small></span>
                  {row.map(({ relativeCoordinate, absolutePosition, index }) => {
                    const occupyingBulge = displayedBulges.find((bulge) => relativeCoordinate >= bulge.start && relativeCoordinate <= bulge.end);
                    const preview = placementPreview && relativeCoordinate >= placementPreview.start
                      && relativeCoordinate < placementPreview.start + placementPreview.candidate.size;
                    const classes = [
                      "bulge-base",
                      occupyingBulge ? `bulge-${occupyingBulge.type}` : "",
                      occupyingBulge?.source === "initial" ? "bulge-initial" : "",
                      preview ? (placementPreview.valid ? "placement-valid" : "placement-invalid") : "",
                    ].filter(Boolean).join(" ");
                    return <button
                      type="button"
                      className={classes}
                      disabled={!selectedCandidateId}
                      onClick={() => {
                        const candidate = candidateById(selectedCandidateId, candidates);
                        if (candidate) placeCandidate(candidate, relativeCoordinate);
                      }}
                      onDragOver={(event) => {
                        const candidate = candidateById(event.dataTransfer.getData("application/x-leaper-bulge") || selectedCandidateId, candidates);
                        if (!candidate) return;
                        event.preventDefault();
                        event.dataTransfer.dropEffect = "copy";
                        previewPlacement(candidate, relativeCoordinate);
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        const candidate = candidateById(event.dataTransfer.getData("application/x-leaper-bulge") || selectedCandidateId, candidates);
                        if (candidate) placeCandidate(candidate, relativeCoordinate);
                      }}
                      aria-label={`Place selected bulge starting at ${formatCoordinate(relativeCoordinate)}`}
                      key={absolutePosition}
                    ><b>{guideBases[index]}</b></button>;
                  })}
                </div>
              </section>;
            })}
          </div>
          {advancedOpen && <div className="bulge-sequence-status" aria-live="polite">
            <span>{placementPreview?.reason ?? (placementMessage || `${remainingBulges} additional bulge${remainingBulges === 1 ? "" : "s"} available.`)}</span>
            <span><i className="effect-key increase" />Core increase <i className="effect-key decrease" />Core decrease <i className="effect-key concordant" />Concordant overlap <i className="effect-key conflicting" />Conflicting overlap</span>
          </div>}

          {!advancedOpen && <section className="bulge-auto-design" aria-labelledby="bulge-auto-design-title">
            <div>
              <span>{l("Next step")}</span>
              <strong id="bulge-auto-design-title">{l("Generate optimized arRNAs")}</strong>
              <small>{targetEfficiency === undefined
                ? l("Enter the observed editing efficiency for A0 to enable design.")
                : l("The first result is the recommended design; up to 10 alternatives remain available for comparison.")}</small>
            </div>
            <fieldset className="bulge-optimization-goal">
              <legend>{l("Optimization goal")}</legend>
              <label>
                <input type="radio" name="bulge-optimization-goal" checked={optimizationGoal === "improve-target"} onChange={() => changeOptimizationGoal("improve-target")} />
                <span><b>{l("Improve A0")}</b><small>{l("Prefer A0 increase and reduce bystanders")}</small></span>
              </label>
              <label>
                <input type="radio" name="bulge-optimization-goal" checked={optimizationGoal === "preserve-target"} onChange={() => changeOptimizationGoal("preserve-target")} />
                <span><b>{l("Preserve A0")}</b><small>{l("Do not reward further A0 increase; reduce bystanders")}</small></span>
              </label>
            </fieldset>
            <div className="bulge-design-action">
              <button className={`button button-primary ${targetEfficiency === undefined ? "is-gated" : ""}`} type="button" aria-disabled={targetEfficiency === undefined} onClick={attemptOptimizedDesign}>
                <ListChecks size={16} aria-hidden="true" />
                {l("Design optimized arRNAs")}
              </button>
              {designGateAttempted && targetEfficiency === undefined && <p className="bulge-design-gate-message" role="alert">{l("Enter the observed editing efficiency for A0 to enable design.")}</p>}
            </div>
          </section>}

          </div>

          {!advancedOpen && hasDesigned && recommendations.length === 0 && <div className="bulge-recommendation-empty" role="status">
            <strong>{l("No recommendation was generated.")}</strong>
            <span>{l(optimizationGoal === "improve-target"
              ? "No legal bulge combination increases A0 under the current qualitative rules. Try another starting arRNA or inspect the rules in Advanced bulge editing."
              : "No legal bulge combination reduces a measured bystander without decreasing A0 under the current qualitative rules.")}</span>
          </div>}

          {!advancedOpen && <BulgeRecommendationResults
            recommendations={recommendations}
            alignedGuide={sourceVariant.alignedGuide}
            targetWindow={design.targetWindow}
            targetIndex={design.targetIndex}
            appliedRecommendationId={appliedRecommendationId}
            showScoreDetails={scoreDetailsOpen}
            onApply={applyRecommendation}
          />}

          {!advancedOpen && <details className="simple-disclosure refinement-settings"><summary>{l("Advanced settings")}</summary>
            <label className="setting-checkbox"><input type="checkbox" checked={scoreDetailsOpen} onChange={(event) => setScoreDetailsOpen(event.target.checked)} />{l("Show ranking details")}</label>
            <button className="back-button" type="button" onClick={() => setManualGuideOpen(true)}>{l("Compare all bulge effect ranges")}</button>
          </details>}
          {!advancedOpen && <aside className="manual-design-fallback">
            {hasDesigned && <div><strong>{l("Not satisfied with the automatic designs?")}</strong></div>}
            <button className="button button-secondary" type="button" onClick={() => setManualGuideOpen(true)}>{l("Try manual design")}<ArrowRight size={15} aria-hidden="true" /></button>
          </aside>}
        </div>
      </div>

      {advancedOpen && <section className="bulge-stack-panel bulge-stack-panel-full">
          <div className="bulge-panel-heading"><div><strong>{l("Current bulge stack")} · {bulges.length}/{MAX_BULGES} <InfoTip>{l("A design may contain up to 4 bulges, including starting structures. Occupied arRNA intervals cannot overlap.")}</InfoTip></strong></div></div>
          <div className="bulge-stack-list">
            {bulges.length === 0 && <p className="bulge-panel-empty">{l("This starting arRNA has no deletion bulges.")}</p>}
            {bulges.map((bulge) => <article className={`${bulge.source === "initial" ? "initial" : "user"} ${focusedBulgeId === bulge.id ? "focused" : ""}`} key={bulge.id}>
              <span>{bulge.source === "initial" ? <LockKeyhole size={13} /> : <GripVertical size={13} />}</span>
              <div><strong>{bulge.type === "deletion" ? "Deletion" : "Mismatch"} · {bulge.size} nt</strong><small>{formatCoordinate(bulge.start)}–{formatCoordinate(bulge.end)} · {bulge.effectSupport === "unsupported" ? l("locked · unsupported effect") : l(bulge.source === "initial" ? "starting arRNA" : "added optimization")}</small></div>
              <button type="button" className="bulge-text-button" aria-pressed={focusedBulgeId === bulge.id} onClick={() => setFocusedBulgeId((current) => current === bulge.id ? null : bulge.id)}>{l(focusedBulgeId === bulge.id ? "Hide effect range" : "View effect range")}</button>
              {bulge.type === "mismatch" && bulge.source === "user" && <button type="button" className="bulge-text-button" onClick={() => beginMismatchEdit(bulge)}>{l("Edit bases")}</button>}
              {bulge.source === "user" && <button type="button" className="bulge-icon-button" aria-label={`Remove ${bulge.type} at ${formatCoordinate(bulge.start)}`} onClick={() => removeBulge(bulge.id)}><Trash2 size={14} /></button>}
            </article>)}
          </div>
          {editingMismatchId && (() => {
            const activeBulge = bulges.find((bulge) => bulge.id === editingMismatchId);
            if (!activeBulge) return null;
            return <div className="mismatch-editor"><label htmlFor="mismatch-bases">{l("Aligned mismatch bases")} · arRNA 3′→5′ <InfoTip>{activeBulge.size} {l("positions must remain same-base mismatches with the target.")}</InfoTip></label><div><input id="mismatch-bases" value={mismatchDraft} maxLength={activeBulge.size} onChange={(event) => setMismatchDraft(event.target.value.toUpperCase())} /><button className="button button-secondary" type="button" onClick={saveMismatchEdit}>{l("Apply")}</button></div>{mismatchError && <p role="alert">{l(mismatchError)}</p>}</div>;
          })()}
      </section>}

      {advancedOpen && <div className="optimized-arrna-output"><span>{l("Current optimized arRNA")} · 5′→3′</span><code>{optimizedSequence}</code><small>{optimizedSequence.length} nt</small><div className="manual-export-actions">
        <button className="button button-primary" type="button" onClick={async () => { await navigator.clipboard.writeText(optimizedSequence); setCopied(true); }}>{copied ? null : <Copy size={15} />}{l(copied ? "Copied" : "Copy sequence")}</button>
        <button className="button button-secondary" type="button" onClick={() => downloadText("LEAPER_manual_arRNA.fasta", `>LEAPER_manual_arRNA_5to3\n${optimizedSequence}\n`, "text/plain;charset=utf-8")}><Download size={15} />FASTA</button>
      </div></div>}
      <ManualBulgeGuideDialog
        open={manualGuideOpen}
        candidates={candidates}
        environment={environment}
        onClose={() => setManualGuideOpen(false)}
        onUseCandidate={(candidate) => {
          selectCandidate(candidate);
          setAdvancedOpen(true);
          setManualGuideOpen(false);
        }}
      />
    </>}
  </section>;
}
