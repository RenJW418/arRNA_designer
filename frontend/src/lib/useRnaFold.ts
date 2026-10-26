import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { normalizeAnalysisSequence, type RnaTopology } from "./sequenceAnalysis";
import { EMPTY_FOLD_STATE, rnaFoldCache, rnaFoldKey } from "./rnaFoldCache";

export function useRnaFold(sequence: string, topology: RnaTopology = "linear", automatic = true) {
  const input = useMemo(() => {
    try {
      const normalized = normalizeAnalysisSequence(sequence, "structure");
      return { sequence: normalized, key: rnaFoldKey(normalized, topology), error: "" };
    } catch (reason) {
      return { sequence: "", key: "", error: sequence.trim() ? reason instanceof Error ? reason.message : "Invalid sequence." : "" };
    }
  }, [sequence, topology]);
  const [requestedKey, setRequestedKey] = useState("");
  const enabled = !!input.key && (automatic || requestedKey === input.key);
  const subscribe = useCallback((listener: () => void) => enabled
    ? rnaFoldCache.subscribe(input.sequence, topology, listener) : () => {}, [enabled, input.sequence, topology]);
  const snapshot = useCallback(() => input.key ? rnaFoldCache.read(input.key) : EMPTY_FOLD_STATE, [input.key]);
  const state = useSyncExternalStore(subscribe, snapshot, snapshot);
  const request = useCallback(() => {
    setRequestedKey(input.key);
    if (input.key) rnaFoldCache.retry(input.key);
  }, [input.key]);
  return { ...state, inputKey: input.key, normalizedSequence: input.sequence, inputError: input.error, request };
}
