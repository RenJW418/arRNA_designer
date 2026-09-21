import {
  Bulge,
  createInitialBulges,
  getCoreEffectZones,
} from "./bulgeOptimization.ts";
import type { AdarEnvironment } from "./normalEditing.ts";

export interface TestedDuplexInput {
  targetSequence: string;
  arrnaSequence: string;
  targetAPosition: number;
  environment: AdarEnvironment;
}

export interface TestedDuplexSeed extends TestedDuplexInput {
  source?: "generated" | "external";
  label?: string;
  preparedDuplex?: TestedDuplex;
}

export interface GeneratedDuplexInput extends TestedDuplexInput {
  targetWindow: string;
  alignedGuide: string;
  windowStart: number;
  targetIndex: number;
  deletionCoordinates: number[];
}

export interface UnsupportedStructure {
  id: string;
  start: number;
  end: number;
  targetBases: string;
  guideBases: string;
  reason: "unsupported_mismatch";
}

export interface TestedDuplex {
  targetSequence: string;
  arrnaSequence: string;
  targetAPosition: number;
  environment: AdarEnvironment;
  targetWindow: string;
  alignedGuide: string;
  windowStart: number;
  windowEnd: number;
  targetIndex: number;
  initialBulges: Bulge[];
  unsupportedStructures: UnsupportedStructure[];
  ambiguous: boolean;
}

interface AlignmentResult {
  target: string;
  guide: string;
  targetStart: number;
  ambiguous: boolean;
}

const GAP_SCORE = -2;

export function normalizeTestedSequence(value: string): string {
  const compact = value.toUpperCase().replace(/\s/g, "");
  if (!compact) throw new Error("Enter a nucleotide sequence.");
  if (/[^ACGTU]/.test(compact)) throw new Error("Use only A, C, G, T or U nucleotide symbols.");
  return compact.replace(/T/g, "U");
}

function isComplementary(target: string, guide: string): boolean {
  return (target === "A" && guide === "U")
    || (target === "U" && guide === "A")
    || (target === "C" && guide === "G")
    || (target === "G" && guide === "C");
}

function pairScore(target: string, guide: string, targetIndex: number, selectedIndex: number): number {
  if (targetIndex === selectedIndex) return guide === "C" ? 30 : -30;
  if (isComplementary(target, guide)) return 4;
  if (target === guide) return 1;
  return -3;
}

/**
 * Semi-global alignment: the complete arRNA is aligned while unpaired target
 * flanks are free. The selected A-C column acts as the biological anchor.
 */
function alignAntiparallelGuide(target: string, guide: string, selectedIndex: number): AlignmentResult {
  if (target.length === guide.length) {
    return { target, guide, targetStart: 0, ambiguous: false };
  }
  const rows = target.length + 1;
  const columns = guide.length + 1;
  const score = Array.from({ length: rows }, () => Array<number>(columns).fill(Number.NEGATIVE_INFINITY));
  const paths = Array.from({ length: rows }, () => Array<number>(columns).fill(0));
  const trace = Array.from({ length: rows }, () => Array<"diag" | "up" | "left" | null>(columns).fill(null));

  score[0][0] = 0;
  paths[0][0] = 1;
  for (let i = 1; i < rows; i += 1) {
    score[i][0] = 0;
    paths[i][0] = 1;
    trace[i][0] = "up";
  }
  for (let j = 1; j < columns; j += 1) {
    score[0][j] = score[0][j - 1] + GAP_SCORE;
    paths[0][j] = 1;
    trace[0][j] = "left";
  }

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < columns; j += 1) {
      const options = [
        { direction: "diag" as const, value: score[i - 1][j - 1] + pairScore(target[i - 1], guide[j - 1], i - 1, selectedIndex) },
        { direction: "up" as const, value: score[i - 1][j] + (i - 1 === selectedIndex ? -40 : GAP_SCORE) },
        { direction: "left" as const, value: score[i][j - 1] + GAP_SCORE },
      ];
      const best = Math.max(...options.map(({ value }) => value));
      const winners = options.filter(({ value }) => value === best);
      score[i][j] = best;
      paths[i][j] = Math.min(2, winners.reduce((sum, { direction }) => {
        const previous = direction === "diag" ? paths[i - 1][j - 1]
          : direction === "up" ? paths[i - 1][j]
            : paths[i][j - 1];
        return sum + previous;
      }, 0));
      trace[i][j] = winners[0].direction;
    }
  }

  const endScore = Math.max(...score.map((row) => row[guide.length]));
  const endRows = score.flatMap((row, index) => row[guide.length] === endScore ? [index] : []);
  let i = endRows[0];
  let j = guide.length;
  const alignedTarget: string[] = [];
  const alignedGuide: string[] = [];
  while (j > 0) {
    const direction = trace[i][j];
    if (direction === "diag") {
      alignedTarget.push(target[i - 1]);
      alignedGuide.push(guide[j - 1]);
      i -= 1;
      j -= 1;
    } else if (direction === "up") {
      alignedTarget.push(target[i - 1]);
      alignedGuide.push("-");
      i -= 1;
    } else if (direction === "left") {
      alignedTarget.push("-");
      alignedGuide.push(guide[j - 1]);
      j -= 1;
    } else {
      throw new Error("The target-arRNA alignment could not be resolved.");
    }
  }

  const targetStart = i;
  alignedTarget.reverse();
  alignedGuide.reverse();
  return {
    target: alignedTarget.join(""),
    guide: alignedGuide.join(""),
    targetStart,
    ambiguous: endRows.length > 1 || endRows.some((rowIndex) => paths[rowIndex][guide.length] > 1),
  };
}

interface StructureRun {
  start: number;
  end: number;
  kind: "deletion" | "supported_mismatch" | "unsupported_mismatch";
  targetBases: string;
  guideBases: string;
}

function groupStructures(target: string, guide: string, targetIndex: number): StructureRun[] {
  const runs: StructureRun[] = [];
  let targetOffset = -1;
  for (let column = 0; column < target.length; column += 1) {
    if (target[column] === "-") {
      throw new Error("arRNA insertions relative to the target are not supported in this refinement module.");
    }
    targetOffset += 1;
    const relative = targetOffset - targetIndex;
    const isEditingMismatch = relative === 0 && target[column] === "A" && guide[column] === "C";
    const kind = guide[column] === "-"
      ? "deletion"
      : isEditingMismatch || isComplementary(target[column], guide[column])
        ? null
        : target[column] === guide[column]
          ? "supported_mismatch" as const
          : "unsupported_mismatch" as const;
    if (!kind) continue;
    const previous = runs.at(-1);
    if (previous && previous.kind === kind && previous.end + 1 === relative) {
      previous.end = relative;
      previous.targetBases += target[column];
      previous.guideBases += guide[column];
    } else {
      runs.push({
        start: relative,
        end: relative,
        kind,
        targetBases: target[column],
        guideBases: guide[column],
      });
    }
  }
  return runs;
}

export function createTestedDuplex(input: TestedDuplexInput): TestedDuplex {
  const targetSequence = normalizeTestedSequence(input.targetSequence);
  const arrnaSequence = normalizeTestedSequence(input.arrnaSequence);
  if (!Number.isInteger(input.targetAPosition) || input.targetAPosition < 1 || input.targetAPosition > targetSequence.length) {
    throw new Error("Target A position must be a valid 1-based sequence coordinate.");
  }
  if (targetSequence[input.targetAPosition - 1] !== "A") {
    throw new Error("The selected target coordinate must contain A.");
  }

  const displayedGuide = arrnaSequence.split("").reverse().join("");
  const alignment = alignAntiparallelGuide(targetSequence, displayedGuide, input.targetAPosition - 1);
  const targetWindow = alignment.target.replace(/-/g, "");
  const alignedGuide = alignment.guide;
  const targetIndex = input.targetAPosition - 1 - alignment.targetStart;
  if (targetWindow[targetIndex] !== "A" || alignedGuide[targetIndex] !== "C") {
    throw new Error("The selected target A could not be aligned to C in the arRNA.");
  }

  const structures = groupStructures(alignment.target, alignment.guide, targetIndex);
  const initialBulges = structures.map((run, index) => {
    const size = run.end - run.start + 1;
    const type = run.kind === "deletion" ? "deletion" : "mismatch";
    const supported = run.kind !== "unsupported_mismatch";
    return new Bulge({
      id: `imported-${run.kind}-${index + 1}`,
      candidateId: supported ? `${type}-${size}` : undefined,
      type,
      start: run.start,
      size,
      source: "initial",
      effectSupport: supported ? "supported" : "unsupported",
      effectZones: supported ? getCoreEffectZones(input.environment, type, size) : [],
      mismatchBases: type === "mismatch" ? run.guideBases : undefined,
    });
  });
  const unsupportedStructures = structures.flatMap((run, index) => run.kind === "unsupported_mismatch" ? [{
    id: `unsupported-${index + 1}`,
    start: run.start,
    end: run.end,
    targetBases: run.targetBases,
    guideBases: run.guideBases,
    reason: "unsupported_mismatch" as const,
  }] : []);

  return {
    targetSequence,
    arrnaSequence,
    targetAPosition: input.targetAPosition,
    environment: input.environment,
    targetWindow,
    alignedGuide,
    windowStart: alignment.targetStart + 1,
    windowEnd: alignment.targetStart + targetWindow.length,
    targetIndex,
    initialBulges,
    unsupportedStructures,
    ambiguous: alignment.ambiguous,
  };
}

/**
 * Review a tested duplex while preserving a generated design's exact alignment.
 * Re-inference is needed only after the user changes one of the defining inputs.
 */
export function reviewTestedDuplex(
  input: TestedDuplexInput,
  preparedDuplex?: TestedDuplex | null,
): TestedDuplex {
  const targetSequence = normalizeTestedSequence(input.targetSequence);
  const arrnaSequence = normalizeTestedSequence(input.arrnaSequence);
  if (preparedDuplex
    && preparedDuplex.targetSequence === targetSequence
    && preparedDuplex.arrnaSequence === arrnaSequence
    && preparedDuplex.targetAPosition === input.targetAPosition
    && preparedDuplex.environment === input.environment) {
    return preparedDuplex;
  }
  return createTestedDuplex({ ...input, targetSequence, arrnaSequence });
}

export function createGeneratedTestedDuplex(input: GeneratedDuplexInput): TestedDuplex {
  const targetSequence = normalizeTestedSequence(input.targetSequence);
  const targetWindow = normalizeTestedSequence(input.targetWindow);
  const arrnaSequence = normalizeTestedSequence(input.arrnaSequence);
  const alignedGuide = input.alignedGuide.toUpperCase().replace(/T/g, "U");
  if (/[^ACGU-]/.test(alignedGuide) || alignedGuide.length !== targetWindow.length) {
    throw new Error("The generated target-arRNA alignment is invalid.");
  }
  if (targetWindow[input.targetIndex] !== "A" || alignedGuide[input.targetIndex] !== "C") {
    throw new Error("The generated target A-C alignment is invalid.");
  }
  return {
    targetSequence,
    arrnaSequence,
    targetAPosition: input.targetAPosition,
    environment: input.environment,
    targetWindow,
    alignedGuide,
    windowStart: input.windowStart,
    windowEnd: input.windowStart + targetWindow.length - 1,
    targetIndex: input.targetIndex,
    initialBulges: createInitialBulges(input.deletionCoordinates, input.environment),
    unsupportedStructures: [],
    ambiguous: false,
  };
}
