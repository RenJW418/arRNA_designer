import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, ChevronDown, Database, LoaderCircle, SlidersHorizontal } from "lucide-react";
import { createNormalEditingDesign, normalResultToDesign, normalResultToVariants, type NormalEditingResult } from "../lib/api";
import { createExonSkippingDesign, resolveNcbiCodingSequence, resolveNcbiExon, type ExonSkippingDesign, type ExonSkippingCandidate, type ExonCandidateWindow, type NcbiCodingReference, type NcbiExonReference } from "../lib/exonSkipping";
import { classifyEditingSites, type NormalArrnaVariant } from "../lib/normalEditing";
import { normalizeRestoredExonInput, parseSequenceInput, splitExonContext, type SequenceRange } from "../lib/sequenceExplorer";
import { createAppliedCustomCandidate, type AppliedCustomCandidate, type CustomStructure } from "../lib/customDesign";
import type { RnaTopology } from "../lib/sequenceAnalysis";
import type { SharedDesignInput } from "../lib/urlState";
import { RECOMMENDED_DESIGN_SETTINGS as recommended } from "../lib/designDefaults";
import type { DesignExample } from "../lib/examples";
import type { Application } from "./DesignWorkspace";
import { NORMAL_TUTORIAL_INPUT, SYNTHETIC_EXON_INPUT } from "./TutorialExamples";
import { AdvancedSheet } from "./AdvancedSheet";
import { SequenceExplorer } from "./SequenceExplorer";
import { WindowRangeSelector } from "./WindowRangeSelector";
import { ExonWindowSelector } from "./ExonWindowSelector";
import { CustomStructureEditor } from "./CustomStructureEditor";
import { InitialArrnaResult } from "./InitialArrnaResult";
import { ExonSkippingResult } from "./ExonSkippingResult";
import { NcbiSequenceInput, type NcbiLookupInput } from "./NcbiSequenceInput";
import { useLanguage } from "./LanguageProvider";
import "../sequence-workspace.css";
import "../inline-results.css";
import "../result-theme.css";

interface Props {
  active: boolean;
  initialApplication: Application;
  initialExample?: DesignExample | null;
  initialInput?: SharedDesignInput | null;
  onApplicationChange: (mode: Application) => void;
  onInputChange: (input: SharedDesignInput) => void;
}

export function SequenceDesignWorkspace({ active, initialApplication, initialExample, initialInput, onApplicationChange, onInputChange }: Props) {
  const { language } = useLanguage();
  const tx = (en: string, zh: string) => language === "en" ? en : zh;
  const restoredExon = initialInput?.targetExon ? normalizeRestoredExonInput(initialInput.upstreamIntron ?? "", initialInput.targetExon, initialInput.downstreamIntron ?? "") : null;
  const initialRaw = initialApplication === "exon_skipping" && restoredExon ? restoredExon.sequence : initialInput?.sequence || initialExample?.sequence || "";
  const [mode, setMode] = useState<Application>(initialApplication);
  const [raw, setRaw] = useState(initialRaw);
  const [position, setPosition] = useState(initialInput?.position ?? String(initialExample?.position ?? ""));
  const [exonRange, setExonRange] = useState<SequenceRange | null>(restoredExon?.exonRange ?? null);
  const [inputCodingContext, setInputCodingContext] = useState(initialInput?.codingContext ?? !!initialExample?.sequence);
  const [codingContext, setCodingContext] = useState(inputCodingContext);
  const [windowStart, setWindowStart] = useState(initialInput?.windowStart ?? String(recommended.windowStart));
  const [windowEnd, setWindowEnd] = useState(initialInput?.windowEnd ?? String(recommended.windowEnd));
  const [windowResetRevision, setWindowResetRevision] = useState(0);
  const [internal, setInternal] = useState(initialInput?.includeInternalBulge ?? recommended.includeInternalBulge);
  const [exonWindow, setExonWindow] = useState<SequenceRange | null>(null);
  const [exonWindowOverrides, setExonWindowOverrides] = useState<ExonCandidateWindow[]>([]);
  const [exonDefaultWindows, setExonDefaultWindows] = useState<Record<string, SequenceRange>>({});
  const [selectedExonId, setSelectedExonId] = useState<string>();
  const selectedExonIdRef = useRef<string | undefined>(undefined);
  const [normalReference, setNormalReference] = useState<NcbiCodingReference | null>(null);
  const [exonReference, setExonReference] = useState<NcbiExonReference | null>(null);
  const [ncbiOpen, setNcbiOpen] = useState(false);
  const [ncbiLoading, setNcbiLoading] = useState(false);
  const [ncbiError, setNcbiError] = useState("");
  const lookupVersion = useRef(0);
  const ncbiTriggerRef = useRef<HTMLButtonElement>(null);
  const [normalResult, setNormalResult] = useState<NormalEditingResult | null>(null);
  const [exonResult, setExonResult] = useState<ExonSkippingDesign | null>(null);
  const [selectedNormal, setSelectedNormal] = useState<NormalArrnaVariant | null>(null);
  const [customStructures, setCustomStructures] = useState<CustomStructure[] | null>(null);
  const [appliedCustoms, setAppliedCustoms] = useState<AppliedCustomCandidate[]>([]);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | undefined>();
  const foldTopology = recommended.foldTopology;
  const [appliedSettings, setAppliedSettings] = useState<{ codingContext: boolean; foldTopology: RnaTopology } | null>(null);
  const [resultRevision, setResultRevision] = useState(0);
  const [goResultRevision, setGoResultRevision] = useState(0);
  const selectedNormalId = useRef<string | null>(null);
  const [open, setOpen] = useState(false);
  const [advancedReveal, setAdvancedReveal] = useState(0);
  const [error, setError] = useState(restoredExon?.error ?? "");
  const [loading, setLoading] = useState(false);
  const requestVersion = useRef(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const resultRef = useRef<HTMLElement>(null);
  const advancedTriggerRef = useRef<HTMLButtonElement>(null);
  const lastScrolledRevision = useRef(0);
  const parsed = useMemo(() => parseSequenceInput(raw), [raw]);
  const sequence = parsed.sequence.replace(/U/g, "T");
  const sites = useMemo(() => classifyEditingSites(sequence, codingContext), [sequence, codingContext]);
  const selectedSite = sites.find((s) => s.position === Number(position));
  const variants = useMemo(() => normalResult ? normalResultToVariants(normalResult) : [], [normalResult]);
  const design = useMemo(() => normalResult ? normalResultToDesign(normalResult) : null, [normalResult]);
  const selectedCustom = appliedCustoms.find((candidate) => candidate.variant.id === selectedCandidateId);
  const editorResult = selectedCustom?.snapshot.source_result ?? normalResult;
  const resultSites = useMemo(() => classifyEditingSites(sequence, appliedSettings?.codingContext ?? codingContext), [sequence, appliedSettings?.codingContext, codingContext]);
  const hasResult = !!normalResult || !!exonResult;
  const selectedExon = exonResult?.candidates.find(candidate => candidate.id === selectedExonId) ?? exonResult?.candidates[0] ?? null;
  const onExonSelection = useCallback((candidate: ExonSkippingCandidate) => {
    if (selectedExonIdRef.current === candidate.id) return;
    requestVersion.current += 1; setLoading(false); setError("");
    selectedExonIdRef.current = candidate.id;
    setSelectedExonId(candidate.id);
    setExonWindow({ start: candidate.global_start, end: candidate.global_end });
  }, []);
  const onNormalSelection = useCallback((v: NormalArrnaVariant | AppliedCustomCandidate["variant"]) => {
    if (selectedNormalId.current === v.id) return;
    requestVersion.current += 1; setLoading(false); setError("");
    selectedNormalId.current = v.id;
    setSelectedCandidateId(v.id);
    const custom = appliedCustoms.find((candidate) => candidate.variant.id === v.id);
    const source = custom?.snapshot.source_result ?? normalResult;
    if (custom) {
      setSelectedNormal(custom.snapshot.source_candidate);
      setCustomStructures(custom.structures.map((structure) => ({ ...structure })));
    } else {
      setSelectedNormal(variants.find((variant) => variant.id === v.id) ?? null);
      setCustomStructures(null);
    }
    // Each saved card keeps its own settings, even when a later Apply changes
    // the active window.
    if (source) {
      setWindowStart(String(source.normalized_input.window_start_relative ?? -source.target_index));
      setWindowEnd(String(source.normalized_input.window_end_relative ?? source.target_window.length - source.target_index - 1));
      setWindowResetRevision((revision) => revision + 1);
      setCodingContext(source.normalized_input.coding_context ?? inputCodingContext);
      setInternal(source.normalized_input.include_internal_bulge ?? false);
    }
  }, [appliedCustoms, normalResult, variants, appliedSettings, inputCodingContext]);
  useEffect(() => { if (!active) { setOpen(false); setNcbiOpen(false); requestVersion.current += 1; lookupVersion.current += 1; setLoading(false); setNcbiLoading(false); } }, [active]);
  useEffect(() => () => { requestVersion.current += 1; lookupVersion.current += 1; }, []);
  useEffect(() => {
    if (!hasResult) { lastScrolledRevision.current = 0; return; }
    if (!active || lastScrolledRevision.current === resultRevision) return;
    const frame = window.requestAnimationFrame(() => {
      if (!resultRef.current) return;
      lastScrolledRevision.current = resultRevision;
      // A thumbnail may have opened its viewer before this scheduled frame.
      if (resultRef.current.closest("[inert]")) return;
      resultRef.current.focus({ preventScroll: true });
      const selectedCard = selectedCandidateId?.startsWith("custom-")
        ? resultRef.current.querySelector<HTMLElement>('.normal-candidate-card[data-selected="true"]') : null;
      (selectedCard ?? resultRef.current).scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
        block: selectedCard ? "center" : "start",
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [resultRevision, hasResult, active, selectedCandidateId]);

  function showAdvanced() {
    setOpen(true);
    setAdvancedReveal((value) => value + 1);
  }
  function closeAdvanced() {
    setOpen(false);
    advancedTriggerRef.current?.focus({ preventScroll: true });
  }

  function cancelLookup() {
    lookupVersion.current += 1;
    setNcbiLoading(false); setNcbiError("");
  }
  function closeNcbi() {
    cancelLookup(); setNcbiOpen(false);
    ncbiTriggerRef.current?.focus({ preventScroll: true });
  }
  function clearReference() {
    setNormalReference(null); setExonReference(null);
  }

  async function loadNcbi(input: NcbiLookupInput) {
    if (ncbiLoading) return;
    const gene = input.gene.trim(), species = input.species.trim();
    if (!gene || !species) { setNcbiError(tx("Enter a gene symbol and species.", "请输入基因名称和物种。")); return; }
    const exonNumber = Number(input.exonNumber);
    if (mode === "exon_skipping" && (!Number.isInteger(exonNumber) || exonNumber < 2)) {
      setNcbiError(tx("Enter an internal exon number of 2 or greater.", "请输入大于或等于 2 的内部外显子编号。")); return;
    }
    const version = ++lookupVersion.current;
    // Fetching is independent of Go: keep the current sequence and results until
    // a valid response arrives, and discard any older design response.
    requestVersion.current += 1; setLoading(false); setError("");
    setNcbiLoading(true); setNcbiError("");
    try {
      if (mode === "normal_editing") {
        const reference = await resolveNcbiCodingSequence(species, gene);
        if (lookupVersion.current !== version) return;
        const fetched = parseSequenceInput(reference.cds_sequence);
        if (fetched.error || !fetched.sequence || fetched.sequence.length % 3 !== 0) {
          throw new Error(tx("NCBI did not return a valid coding sequence.", "NCBI 未返回有效的编码序列。"));
        }
        resetRecommendedSettings(); invalidate();
        setRaw(fetched.sequence.replace(/T/g, "U")); setPosition(""); setExonRange(null);
        setNormalReference(reference); setExonReference(null); setSequenceCodingContext(true);
      } else {
        const reference = await resolveNcbiExon(species, gene, exonNumber, recommended.arrnaLength, input.transcriptAccession.trim() || undefined);
        if (lookupVersion.current !== version) return;
        const fetched = normalizeRestoredExonInput(reference.upstream_intron, reference.exon, reference.downstream_intron);
        if (fetched.error || !fetched.exonRange) throw new Error(fetched.error || tx("NCBI did not return a complete exon context.", "NCBI 未返回完整的外显子背景序列。"));
        resetRecommendedSettings(); invalidate();
        setRaw(fetched.sequence.replace(/T/g, "U")); setPosition(""); setExonRange(fetched.exonRange);
        setExonReference(reference); setNormalReference(null); setSequenceCodingContext(false);
      }
      setNcbiOpen(false); setOpen(false);
      inputRef.current?.focus({ preventScroll: true });
    } catch (reason) {
      if (lookupVersion.current === version) setNcbiError(reason instanceof Error ? reason.message : tx("The NCBI sequence could not be loaded. Try again.", "未能获取 NCBI 序列，请重试。"));
    } finally {
      if (lookupVersion.current === version) setNcbiLoading(false);
    }
  }

  function invalidate() {
    cancelLookup();
    requestVersion.current += 1; setLoading(false); setError(""); setNormalResult(null); setExonResult(null);
    selectedNormalId.current = null;
    setSelectedNormal(null); setSelectedCandidateId(undefined); setCustomStructures(null); setAppliedCustoms([]); setAppliedSettings(null);
    selectedExonIdRef.current = undefined;
    setSelectedExonId(undefined); setExonWindow(null); setExonWindowOverrides([]); setExonDefaultWindows({});
  }
  function editSettings() {
    requestVersion.current += 1; setLoading(false); setError("");
  }
  function resetWindow() {
    setWindowStart(String(recommended.windowStart)); setWindowEnd(String(recommended.windowEnd));
    setWindowResetRevision((revision) => revision + 1);
  }
  function resetRecommendedSettings() {
    editSettings(); resetWindow();
    setInternal(recommended.includeInternalBulge);
    setExonWindowOverrides([]);
    setExonWindow(selectedExon ? exonDefaultWindows[selectedExon.id] ?? null : null);
    setCustomStructures(null);
  }
  function setSequenceCodingContext(value: boolean) {
    setInputCodingContext(value); setCodingContext(value);
  }
  function changeRaw(value: string) {
    resetRecommendedSettings();
    invalidate(); clearReference(); setRaw(value); setPosition(""); setExonRange(null); setSequenceCodingContext(false);
  }
  function changeMode(value: Application) {
    if (mode === value) return;
    resetRecommendedSettings();
    invalidate(); clearReference(); setSequenceCodingContext(false); setMode(value); onApplicationChange(value); setPosition(""); setExonRange(null);
  }
  function selectTarget(value: number | string) {
    if (Number(value) !== Number(position)) resetWindow();
    invalidate(); setPosition(String(value));
  }
  function selectExon(value: SequenceRange) {
    invalidate();
    if (value.start !== exonRange?.start || value.end !== exonRange?.end) setExonReference(null);
    setExonRange(value);
  }
  function revise() { invalidate(); window.setTimeout(() => inputRef.current?.focus(), 0); }
  function loadExample() {
    resetRecommendedSettings();
    invalidate(); clearReference(); setPosition(""); setExonRange(null);
    const input = mode === "normal_editing" ? NORMAL_TUTORIAL_INPUT : SYNTHETIC_EXON_INPUT;
    if (mode === "normal_editing") { setRaw(input.sequence ?? ""); setPosition(input.position ?? ""); setSequenceCodingContext(input.codingContext ?? true); }
    else { setSequenceCodingContext(false); setRaw(`${input.upstreamIntron}${input.targetExon}${input.downstreamIntron}`); setExonRange({ start: input.upstreamIntron!.length + 1, end: input.upstreamIntron!.length + input.targetExon!.length }); }
  }
  async function generate(source: "recommended" | "draft") {
    if (ncbiLoading) return;
    const useRecommended = source === "recommended";
    // Build the request directly: React state resets are not synchronous.
    const settings = useRecommended ? {
      ...recommended, windowStart: String(recommended.windowStart), windowEnd: String(recommended.windowEnd),
      arrnaLength: String(recommended.arrnaLength), codingContext: inputCodingContext,
    } : {
      adar: recommended.adar, windowStart, windowEnd, arrnaLength: String(recommended.arrnaLength), codingContext, foldTopology,
      includeInternalBulge: internal, evaluateCoveredEse: recommended.evaluateCoveredEse, eseMismatchPositions: recommended.eseMismatchPositions,
    };
    if (useRecommended) {
      resetRecommendedSettings(); setCodingContext(inputCodingContext);
    }
    setError("");
    if (parsed.error || !sequence) { setError(parsed.error ?? tx("Paste a sequence first.", "请先粘贴序列。")); return; }
    const version = ++requestVersion.current;
    const requestedStructures = useRecommended ? null : customStructures?.map((structure) => ({ ...structure })) ?? null;
    const preferredCandidateId = useRecommended ? undefined : selectedNormal?.id;
    setLoading(true);
    try {
      let input: SharedDesignInput = {
        mode: "sequence", sequence, position,
        ...(normalReference ? { gene: normalReference.gene, species: normalReference.species, transcriptAccession: normalReference.transcript } : {}),
        ...(exonReference ? { gene: exonReference.gene, species: exonReference.species, transcriptAccession: exonReference.transcript, exonNumber: String(exonReference.exon_number) } : {}),
        adar: settings.adar, codingContext: settings.codingContext,
        windowStart: settings.windowStart, windowEnd: settings.windowEnd, arrnaLength: settings.arrnaLength,
        includeInternalBulge: settings.includeInternalBulge, evaluateCoveredEse: settings.evaluateCoveredEse,
        eseMismatchPositions: settings.eseMismatchPositions,
      };
      if (mode === "normal_editing") {
        if (!selectedSite) throw new Error(tx("Click the target A in your sequence.", "请在序列中点击目标 A。"));
        if (![settings.windowStart, settings.windowEnd].every((s) => s.trim() !== "" && Number.isInteger(Number(s))) || Number(settings.windowStart) > 0 || Number(settings.windowEnd) < 0) throw new Error(tx("Use integer window boundaries spanning A0.", "请设置覆盖 A0 的整数窗口边界。"));
        const result = await createNormalEditingDesign(sequence, Number(position), settings.adar, normalReference, { windowStartRelative: Number(settings.windowStart), windowEndRelative: Number(settings.windowEnd), includeInternalBulge: settings.includeInternalBulge, codingContext: settings.codingContext });
        if (requestVersion.current !== version) return;
        const nextVariants = normalResultToVariants(result);
        const nextSelected = nextVariants.find((variant) => variant.id === preferredCandidateId)
          ?? (settings.includeInternalBulge ? nextVariants.find((variant) => variant.id === "dual-deletion-internal-del1") : undefined)
          ?? nextVariants.find((variant) => variant.id === "dual-deletion")
          ?? nextVariants.find((variant) => variant.id === "downstream-del10")
          ?? nextVariants.find((variant) => variant.id === "upstream-del28")
          ?? nextVariants[0] ?? null;
        if (!nextSelected && (requestedStructures !== null || (!useRecommended && appliedCustoms.length > 0))) throw new Error(tx("No candidate is available for these custom settings.", "当前设置未产生可供自定义的候选。"));
        const nextCustom = requestedStructures !== null && nextSelected
          ? createAppliedCustomCandidate(result, nextSelected, requestedStructures, appliedCustoms.length + 1, settings.foldTopology) : null;
        // Commit the result only after all draft settings have validated.
        const nextSelectedId = nextCustom ? nextCustom.variant.id : nextSelected?.id;
        selectedNormalId.current = nextSelectedId ?? null;
        setSelectedCandidateId(nextSelectedId);
        setSelectedNormal(nextSelected);
        if (useRecommended) setAppliedCustoms([]);
        else if (nextCustom) setAppliedCustoms((candidates) => [...candidates, nextCustom]);
        setNormalResult(result); setExonResult(null);
      } else {
        if (!exonRange) throw new Error(tx("Mark the target exon in the sequence window.", "请在序列窗口中标记目标外显子。"));
        const parts = splitExonContext(sequence, exonRange);
        let candidateWindows = useRecommended ? [] : exonWindowOverrides.map(window => ({ ...window }));
        if (!useRecommended && selectedExon && exonWindow) {
          const { start, end } = exonWindow;
          candidateWindows = candidateWindows.filter(window => window.candidate_id !== selectedExon.id);
          const defaultWindow = exonDefaultWindows[selectedExon.id];
          if (!defaultWindow || start !== defaultWindow.start || end !== defaultWindow.end) {
            if (![start, end].every(Number.isInteger) || start < 1 || end > sequence.length || end - start + 1 < 21 || end - start + 1 > 1001) {
              throw new Error(tx("Choose a window of 21–1001 nt within the input sequence.", "请选择输入序列范围内、长度为 21–1001 nt 的窗口。"));
            }
            candidateWindows.push({ candidate_id: selectedExon.id, start, end });
          }
        }
        const result = await createExonSkippingDesign(parts.upstreamIntron, parts.targetExon, parts.downstreamIntron, recommended.arrnaLength, exonReference ?? undefined, { candidateWindows });
        if (requestVersion.current !== version) return;
        const nextSelected = (!useRecommended && result.candidates.find(candidate => candidate.id === selectedExon?.id)) || result.candidates[0];
        selectedExonIdRef.current = nextSelected?.id;
        setSelectedExonId(nextSelected?.id);
        setExonWindow(nextSelected ? { start: nextSelected.global_start, end: nextSelected.global_end } : null);
        setExonWindowOverrides(result.design_settings?.candidate_windows ?? candidateWindows);
        if (useRecommended || !exonResult) setExonDefaultWindows(Object.fromEntries(result.candidates.map(candidate => [candidate.id, { start: candidate.global_start, end: candidate.global_end }])));
        input = { ...input, ...parts, sequence: undefined }; setExonResult(result); setNormalResult(null); setAppliedCustoms([]);
      }
      setAppliedSettings({ codingContext: settings.codingContext, foldTopology: settings.foldTopology });
      if (useRecommended) setGoResultRevision((revision) => revision + 1);
      setResultRevision((revision) => revision + 1);
      onInputChange(input); setOpen(false);
    } catch (reason) { if (requestVersion.current === version) setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { if (requestVersion.current === version) setLoading(false); }
  }

  const inputWindow = Number(position) > 0 && mode === "normal_editing" ? { start: Math.max(1, Number(position) + Number(windowStart)), end: Math.min(sequence.length, Number(position) + Number(windowEnd)) } : null;
  const reference = normalReference ?? exonReference;
  return <div className={`sequence-first-workspace ${hasResult ? "has-result" : ""}`}>
    <section className="sf-entry" aria-labelledby="sf-title">
      <div className="sf-identity"><h1 id="sf-title">LEAPER<span>3.0</span></h1></div>
      <form noValidate onSubmit={(event) => { event.preventDefault(); void generate("recommended"); }} className="sf-entry-form">
        <div className="sf-input-toolbar">
          <div className="sf-mode-switch" role="group" aria-label={tx("Application", "应用模式")}><button type="button" aria-pressed={mode === "normal_editing"} onClick={() => changeMode("normal_editing")}>Normal</button><button type="button" aria-pressed={mode === "exon_skipping"} onClick={() => changeMode("exon_skipping")}>Exon skipping</button></div>
        </div>
        <div className={`sf-sequence-box${raw ? " has-sequence" : ""}`}><textarea ref={inputRef} aria-label={tx("Target sequence", "靶序列")} value={raw} onChange={(e) => changeRaw(e.target.value)} spellCheck={false} autoCapitalize="off" placeholder={tx("Enter the target RNA sequence…", "输入要编辑的靶 RNA 序列…")} rows={raw ? 3 : 1} /></div>
        <div className="sf-input-status"><span>{sequence ? `${sequence.length.toLocaleString()} nt · 5′→3′` : tx("Target RNA · 5′→3′", "靶 RNA · 5′→3′")}</span><button ref={ncbiTriggerRef} id="sf-ncbi-trigger" className="sf-ncbi-trigger" type="button" aria-label={tx("Fetch sequence from NCBI", "从 NCBI 获取序列")} aria-controls="sf-ncbi-input" aria-expanded={ncbiOpen} onClick={() => ncbiOpen ? closeNcbi() : setNcbiOpen(true)}><Database size={14} aria-hidden="true" />{tx("From NCBI", "从 NCBI 获取")}</button><button type="button" onClick={loadExample}>{tx("Try an example", "试用示例")}</button>{raw && <button type="button" onClick={() => changeRaw("")}>{tx("Clear", "清空")}</button>}</div>
        <NcbiSequenceInput mode={mode} open={ncbiOpen && active} loading={ncbiLoading} error={ncbiError} initialGene={initialInput?.gene ?? initialExample?.gene} initialSpecies={initialInput?.species ?? initialExample?.species} initialExonNumber={initialInput?.exonNumber ?? (initialExample?.exonNumber ? String(initialExample.exonNumber) : undefined)} initialAccession={initialInput?.transcriptAccession} onLookup={loadNcbi} onEdit={cancelLookup} onClose={closeNcbi} />
        {reference && <div className="sf-ncbi-source" role="status"><Database size={13} aria-hidden="true" /><span>NCBI · {reference.gene} · <a href={`https://www.ncbi.nlm.nih.gov/nuccore/${encodeURIComponent(reference.transcript)}`} target="_blank" rel="noreferrer">{reference.transcript}</a> · {normalReference ? "CDS" : `${tx("Exon", "外显子")} ${exonReference!.exon_number}`}</span></div>}
        {parsed.error && <p className="sf-error" role="alert">{parsed.error}</p>}
        {sequence && <div className="sf-target-picker"><div className="sf-target-heading"><p>{mode === "normal_editing" ? tx("Click an A to select your target.", "点击 A，选择编辑位点。") : tx("Click two boundaries or drag to select the exon.", "点击两个边界，或拖动选择外显子。")}</p>{mode === "normal_editing" ? <label>A<input type="number" min="1" max={sequence.length} aria-label={tx("Target A position", "目标 A 位置")} value={position} onChange={(e) => selectTarget(e.target.value)} /></label> : <div className="sf-exon-bounds"><label>{tx("Exon", "外显子")}<input type="number" min="2" max={sequence.length - 1} aria-label={tx("Exon start", "外显子起点")} value={exonRange?.start ?? ""} onChange={(e) => selectExon({ start: Number(e.target.value), end: exonRange?.end ?? Number(e.target.value) })} /></label><span>–</span><input type="number" min="2" max={sequence.length - 1} aria-label={tx("Exon end", "外显子终点")} value={exonRange?.end ?? ""} onChange={(e) => selectExon({ start: exonRange?.start ?? Number(e.target.value), end: Number(e.target.value) })} /></div>}</div>
          <SequenceExplorer sequence={parsed.sequence} mode={mode} targetPosition={Number(position) || null} onTargetChange={selectTarget} exonRange={exonRange} onExonRangeChange={selectExon} windowRange={inputWindow} compact minimal showFeatureList={false} />
        </div>}
        {error && <p className="sf-error" role="alert">{error}</p>}
        <div className="sf-go-row"><button type="submit" className="sf-go" disabled={loading || ncbiLoading || !sequence || (mode === "normal_editing" ? !selectedSite : !exonRange)}>{loading ? <LoaderCircle size={18} className="sf-spin" /> : <>{tx("Go", "开始")}<ArrowRight size={18} /></>}</button></div>
      </form>
    </section>
    {hasResult && <section ref={resultRef} className="sf-inline-results" aria-label={tx("Design results", "设计结果")} tabIndex={-1}>
    {normalResult && design && (variants.length > 0 || appliedCustoms.length > 0) && <InitialArrnaResult showHeader={false} key={`${normalResult.window_start}-${normalResult.window_end}-${normalResult.normalized_input.target_position}`} design={design} variants={variants} result={normalResult} sites={resultSites} foldTopology={appliedSettings?.foldTopology ?? "linear"} selectedCandidateId={selectedCandidateId} customCandidates={appliedCustoms} onRevise={revise} onSelectionChange={onNormalSelection} />}
    {normalResult && variants.length === 0 && <section className="sf-empty-result"><h2>{tx("More sequence context is needed", "需要更多序列上下文")}</h2>{normalResult.warnings.map((v) => <p key={v}>{v}</p>)}<button type="button" onClick={revise}>{tx("Revise sequence", "修改序列")}</button></section>}
    {exonResult && <ExonSkippingResult key={goResultRevision} design={exonResult} selectedCandidateId={selectedExonId} onSelectionChange={onExonSelection} onRevise={revise} foldTopology={appliedSettings?.foldTopology ?? "linear"} />}
    </section>}
    <div className="sf-bottom">
      <button ref={advancedTriggerRef} type="button" className="sf-advanced-trigger" onClick={() => open ? closeAdvanced() : showAdvanced()} aria-controls="advanced-settings" aria-expanded={open && active}>
        <SlidersHorizontal className="sf-advanced-icon" size={16} strokeWidth={1.7} aria-hidden="true" />
        <span>Advanced</span>
        <ChevronDown className="sf-advanced-chevron" size={15} strokeWidth={1.7} aria-hidden="true" />
      </button>
    </div>
    <AdvancedSheet id="advanced-settings" open={open && active} revealKey={advancedReveal} onClose={closeAdvanced} title="Advanced">
      <div className="sf-advanced-content">
        <section id="sf-panel-design" aria-labelledby="sf-design-settings-heading">
          <div className="sf-section-heading"><div><h3 id="sf-design-settings-heading">{tx("Design settings", "设计设置")}</h3><p>{mode === "normal_editing" ? tx("Recommended window: A0 ±75 nt · 151 nt", "推荐窗口：A0 上下游各 75 nt · 共 151 nt") : tx("Adjust the selected candidate’s coverage.", "调整当前候选的覆盖范围。")}</p></div><span className="sf-mode-label">{mode === "normal_editing" ? "Normal" : "Exon skipping"}</span></div>
          {mode === "normal_editing" ? <>
            {editorResult && selectedNormal
              ? <CustomStructureEditor result={editorResult} variant={selectedNormal} structures={customStructures} onChange={(value) => { editSettings(); setCustomStructures(value); }} windowResetRevision={windowResetRevision} windowSelection={{ sequence, targetPosition: selectedSite?.position ?? null, startRelative: Number(windowStart), endRelative: Number(windowEnd), onEdit: editSettings, onChange: (start, end) => { editSettings(); setWindowStart(String(start)); setWindowEnd(String(end)); } }} />
              : <WindowRangeSelector key={windowResetRevision} sequence={sequence} targetPosition={selectedSite?.position ?? null} startRelative={Number(windowStart)} endRelative={Number(windowEnd)} onEdit={editSettings} onChange={(start, end) => { editSettings(); setWindowStart(String(start)); setWindowEnd(String(end)); }} />}
          </> : <ExonWindowSelector key={windowResetRevision} sequence={sequence} exonRange={exonRange} candidate={selectedExon} design={exonResult} value={exonWindow}
            onEdit={editSettings} onChange={range => { editSettings(); setExonWindow(range); }} onReset={() => {
              editSettings();
              setExonWindow(selectedExon ? exonDefaultWindows[selectedExon.id] ?? { start: selectedExon.global_start, end: selectedExon.global_end } : null);
            }} />}
        </section>
        {error && <p className="sf-error" role="alert">{error}</p>}
        <div className="sf-apply-row"><button type="button" className="sf-restore" aria-label="Restore recommended settings" onClick={resetRecommendedSettings}>{tx("Restore defaults", "恢复推荐设置")}</button><button type="button" className="sf-primary sf-apply" aria-label="Apply settings" disabled={loading || ncbiLoading || !sequence || (mode === "normal_editing" ? !selectedSite : !exonRange)} onClick={() => generate("draft")}>{loading ? <><LoaderCircle size={16} className="sf-spin" aria-hidden="true" />{tx("Applying…", "正在应用…")}</> : <>{tx("Apply", "应用")}<ArrowRight size={16} aria-hidden="true" /></>}</button></div>
      </div>
    </AdvancedSheet>
  </div>;
}
