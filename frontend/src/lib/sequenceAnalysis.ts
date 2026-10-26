import { apiPost } from "./api.ts";

/** All coordinates are 1-based and inclusive in the submitted sequence. */
export interface SequenceFeature {
  id: string;
  start: number;
  end: number;
  kind: string;
  label: string;
  evidence: "reference" | "predicted" | "user";
  source: string;
  description: string;
  source_url?: string | null;
  score?: number | null;
  protein?: string | null;
}

export interface AnnotationRegion {
  start: number;
  end: number;
  kind: string;
  label?: string;
}

export interface AnnotationRequest {
  sequence: string;
  transcript_accession?: string;
  regions?: AnnotationRegion[];
}

export interface AnnotationResult {
  sequence: string;
  features: SequenceFeature[];
  warnings: string[];
  prediction_method: string;
  reference_accession?: string | null;
}

export type RnaTopology = "linear" | "circular";

export interface RnaFoldResult {
  sequence: string;
  structure: string;
  mfe: number;
  ensemble_free_energy: number;
  ensemble_diversity: number;
  unpaired_probabilities: number[];
  mean_unpaired_probability: number;
  mfe_unpaired_fraction: number;
  pairs: Array<{ i: number; j: number; probability: number }>;
  coordinates: Array<{ x: number; y: number }>;
  engine: string;
  version: string;
  temperature: number;
  topology: RnaTopology;
}

export function normalizeAnalysisSequence(input: string, kind: "annotation" | "structure"): string {
  const lines = input.trim().split(/\r?\n/);
  if (lines[0]?.startsWith(">")) lines.shift();
  const sequence = lines.join("").replace(/\s/g, "").toUpperCase();
  if (!/^[ACGTU]+$/.test(sequence)) throw new Error("Enter one sequence containing only A, C, G, T or U.");
  const minimum = kind === "structure" ? 5 : 1;
  const maximum = kind === "structure" ? 1001 : 20000;
  if (sequence.length < minimum || sequence.length > maximum) {
    throw new Error(`Sequence length must be ${minimum}–${maximum.toLocaleString("en-US")} nt.`);
  }
  return kind === "structure" ? sequence.replace(/T/g, "U") : sequence.replace(/U/g, "T");
}

export function parseDotBracketPairs(structure: string): Array<{ i: number; j: number }> {
  const stack: number[] = [];
  const pairs: Array<{ i: number; j: number }> = [];
  for (let index = 0; index < structure.length; index += 1) {
    const symbol = structure[index];
    if (symbol === "(") stack.push(index + 1);
    else if (symbol === ")") {
      const i = stack.pop();
      if (i === undefined) throw new Error("The returned RNA structure has unbalanced pairs.");
      pairs.push({ i, j: index + 1 });
    } else if (symbol !== ".") throw new Error("The returned RNA structure contains an unsupported symbol.");
  }
  if (stack.length) throw new Error("The returned RNA structure has unbalanced pairs.");
  return pairs.sort((a, b) => a.i - b.i);
}

function validInterval(start: number, end: number, length: number): boolean {
  return Number.isInteger(start) && Number.isInteger(end) && start >= 1 && end >= start && end <= length;
}

export function createAnnotationRequest(sequence: string, accession?: string, regions?: AnnotationRegion[]): AnnotationRequest {
  const normalized = normalizeAnalysisSequence(sequence, "annotation");
  const trimmedAccession = accession?.trim();
  if (regions?.some(region => !validInterval(region.start, region.end, normalized.length) || !region.kind.trim())) {
    throw new Error("Each region must have a kind and valid 1-based inclusive coordinates.");
  }
  return {
    sequence: normalized,
    ...(trimmedAccession ? { transcript_accession: trimmedAccession } : {}),
    ...(regions?.length ? { regions: regions.map(region => ({ ...region })) } : {}),
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function isProbability(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

export function validateAnnotationResult(result: unknown, sequence: string): AnnotationResult {
  const normalized = normalizeAnalysisSequence(sequence, "annotation");
  if (!isObject(result) || typeof result.sequence !== "string" || result.sequence.toUpperCase().replace(/U/g, "T") !== normalized
      || !Array.isArray(result.features) || !Array.isArray(result.warnings)
      || result.warnings.some(warning => typeof warning !== "string") || typeof result.prediction_method !== "string"
      || (result.reference_accession != null && typeof result.reference_accession !== "string")) {
    throw new Error("The annotation service returned an invalid result. Please try again.");
  }
  const ids = new Set<string>();
  for (const feature of result.features) {
    if (!isObject(feature) || typeof feature.start !== "number" || typeof feature.end !== "number"
        || !validInterval(feature.start, feature.end, normalized.length)
        || ["id", "kind", "label", "source", "description"].some(key => typeof feature[key] !== "string")
        || !["reference", "predicted", "user"].includes(String(feature.evidence))
        || (feature.source_url != null && typeof feature.source_url !== "string")
        || (feature.protein != null && typeof feature.protein !== "string")
        || (feature.score != null && (typeof feature.score !== "number" || !Number.isFinite(feature.score)))
        || ids.has(feature.id as string)) {
      throw new Error("The annotation service returned an invalid feature. Please try again.");
    }
    ids.add(feature.id as string);
  }
  return result as unknown as AnnotationResult;
}

export function validateRnaFoldResult(result: unknown, sequence: string, topology: RnaTopology): RnaFoldResult {
  const normalized = normalizeAnalysisSequence(sequence, "structure");
  const invalid = () => new Error("RNAfold returned an incomplete or inconsistent result. Please calculate again.");
  if (!isObject(result) || result.sequence !== normalized || result.topology !== topology
      || typeof result.structure !== "string" || result.structure.length !== normalized.length
      || typeof result.engine !== "string" || !result.engine || typeof result.version !== "string"
      || ![result.mfe, result.ensemble_free_energy, result.ensemble_diversity, result.temperature].every(value => typeof value === "number" && Number.isFinite(value))
      || !Array.isArray(result.coordinates) || result.coordinates.length !== normalized.length
      || !Array.isArray(result.unpaired_probabilities) || result.unpaired_probabilities.length !== normalized.length
      || !result.unpaired_probabilities.every(isProbability)
      || !isProbability(result.mean_unpaired_probability) || !isProbability(result.mfe_unpaired_fraction)
      || !Array.isArray(result.pairs)) throw invalid();
  const mfePairs = parseDotBracketPairs(result.structure);
  const mean = result.unpaired_probabilities.reduce((sum: number, probability: number) => sum + probability, 0) / normalized.length;
  if (Math.abs(mean - result.mean_unpaired_probability) > 0.0001
      || Math.abs((normalized.length - mfePairs.length * 2) / normalized.length - result.mfe_unpaired_fraction) > 0.0001) throw invalid();
  for (const coordinate of result.coordinates) {
    if (!isObject(coordinate) || typeof coordinate.x !== "number" || typeof coordinate.y !== "number"
        || !Number.isFinite(coordinate.x) || !Number.isFinite(coordinate.y)) throw invalid();
  }
  for (const pair of result.pairs) {
    if (!isObject(pair) || typeof pair.i !== "number" || typeof pair.j !== "number"
        || !validInterval(pair.i, pair.j, normalized.length) || pair.i === pair.j || !isProbability(pair.probability)) throw invalid();
  }
  return result as unknown as RnaFoldResult;
}

export function structureBounds(coordinates: RnaFoldResult["coordinates"]): { x: number; y: number; width: number; height: number } {
  if (!coordinates.length) throw new Error("RNA structure coordinates are missing.");
  const xs = coordinates.map(coordinate => coordinate.x);
  const ys = coordinates.map(coordinate => coordinate.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const width = Math.max(64, maxX - minX + 48);
  const height = Math.max(64, maxY - minY + 48);
  return { x: (minX + maxX - width) / 2, y: (minY + maxY - height) / 2, width, height };
}

export async function analyzeAnnotations(sequence: string, accession?: string, regions?: AnnotationRegion[], signal?: AbortSignal): Promise<AnnotationResult> {
  const request = createAnnotationRequest(sequence, accession, regions);
  return validateAnnotationResult(await apiPost<unknown>("/analysis/annotations", request, signal), request.sequence);
}

export async function analyzeRnaStructure(sequence: string, topology: RnaTopology, signal?: AbortSignal): Promise<RnaFoldResult> {
  const normalized = normalizeAnalysisSequence(sequence, "structure");
  return validateRnaFoldResult(await apiPost<unknown>("/analysis/rnafold", { sequence: normalized, topology }, signal), normalized, topology);
}
