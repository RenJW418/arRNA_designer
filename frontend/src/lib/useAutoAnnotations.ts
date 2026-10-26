import { useCallback, useEffect, useMemo, useState } from "react";
import { analyzeAnnotations, type AnnotationRegion, type AnnotationResult, type SequenceFeature } from "./sequenceAnalysis";

export interface AnnotationScanState {
  status: "idle" | "waiting" | "loading" | "ready" | "error";
  result: AnnotationResult | null;
  error: string;
}
export interface AutoAnnotations {
  local: AnnotationScanState;
  reference: AnnotationScanState;
  result: AnnotationResult | null;
  features: SequenceFeature[];
  inputError: string;
  referenceInputError: string;
  retry: () => void;
}
const IDLE: AnnotationScanState = { status: "idle", result: null, error: "" };
const WAITING: AnnotationScanState = { ...IDLE, status: "waiting" };

function useAnnotationRequest(key: string, enabled: boolean, load: (signal: AbortSignal) => Promise<AnnotationResult>, delay: number) {
  const [stored, setStored] = useState<{ key: string; state: AnnotationScanState } | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setStored({ key, state: { ...IDLE, status: "loading" } });
      try {
        const result = await load(controller.signal);
        if (!controller.signal.aborted) setStored({ key, state: { status: "ready", result, error: "" } });
      } catch (reason) {
        if (!controller.signal.aborted) setStored({ key, state: { ...IDLE, status: "error", error: reason instanceof Error ? reason.message : "Annotation unavailable. Please retry." } });
      }
    }, delay);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [key, enabled, load, delay]);
  // Key the visible data as well as the request: edits must remove old highlights
  // immediately, even before the effect cleanup or a late response runs.
  return enabled ? (stored?.key === key ? stored.state : WAITING) : IDLE;
}

export function useAutoAnnotations(sequence: string, regions: AnnotationRegion[], accession: string, active: boolean): AutoAnnotations {
  const [revision, setRevision] = useState(0);
  const normalizedAccession = accession.trim().toUpperCase();
  const inputError = sequence.length > 20000 ? "Automatic annotation supports up to 20,000 nt." : "";
  const eligible = !!sequence && /^[ACGT]+$/.test(sequence) && !inputError;
  const referenceInputError = normalizedAccession && !/^[A-Z]{1,6}_?\d{5,12}(?:\.\d{1,6})?$/.test(normalizedAccession)
    ? "Enter one complete NCBI nucleotide accession to load reference annotations." : "";
  const localKey = JSON.stringify([sequence, regions, revision]);
  const referenceKey = JSON.stringify([sequence, normalizedAccession, revision]);
  const loadLocal = useCallback((signal: AbortSignal) => analyzeAnnotations(sequence, undefined, regions, signal), [sequence, regions]);
  const loadReference = useCallback((signal: AbortSignal) => analyzeAnnotations(sequence, normalizedAccession, undefined, signal), [sequence, normalizedAccession]);
  const local = useAnnotationRequest(localKey, active && eligible, loadLocal, 500);
  const reference = useAnnotationRequest(referenceKey, active && eligible && !!normalizedAccession && !referenceInputError, loadReference, 700);
  const result = useMemo<AnnotationResult | null>(() => {
    if (!local.result && !reference.result) return null;
    // The reference endpoint also returns predictions. Keep only its reference
    // features so a slow reference lookup never replaces or duplicates local data.
    const features = [...(local.result?.features ?? []), ...(reference.result?.features.filter(feature => feature.evidence === "reference") ?? [])]
      .sort((a, b) => a.start - b.start || a.end - b.end || a.id.localeCompare(b.id));
    return {
      sequence, features,
      warnings: [...(local.result?.warnings ?? []), ...(reference.result?.warnings ?? [])],
      prediction_method: local.result?.prediction_method ?? reference.result?.prediction_method ?? "",
      reference_accession: reference.result?.reference_accession ?? null,
    };
  }, [sequence, local.result, reference.result]);
  const features = useMemo(() => result?.features ?? [], [result]);
  const retry = useCallback(() => setRevision(value => value + 1), []);
  return { local, reference, result, features, inputError, referenceInputError, retry };
}
