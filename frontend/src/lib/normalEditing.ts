export type EditingCategory = "blocked_ga" | "synonymous" | "editable" | "rna";

export interface EditingSite {
  position: number;
  codon: string;
  editedCodon: string;
  aminoAcid: string;
  editedAminoAcid: string;
  category: EditingCategory;
}

export interface InitialArrnaDesign {
  targetPosition: number;
  targetWindow: string;
  arrnaSequence: string;
  windowStart: number;
  windowEnd: number;
  targetIndex: number;
  upstreamLength: number;
  downstreamLength: number;
  hasFullFlanks: boolean;
}

export type AdarEnvironment = "ADAR1" | "ADAR2";
/** Unified design profile; the individual names remain readable in archived results. */
export type NormalDesignEnvironment = AdarEnvironment | "combined";

export function pairingCoverage(environment: NormalDesignEnvironment) {
  // The combined profile uses the outer boundaries of both reference regions.
  return { upstream: environment === "ADAR1" ? 4 : 6, downstream: environment === "ADAR2" ? 11 : 25 };
}
type InitialVariantId = "baseline" | "downstream-del10" | "upstream-del28" | "dual-deletion";
export type NormalArrnaVariantId = InitialVariantId | `${InitialVariantId}-internal-del1`;

export interface NormalArrnaVariant {
  id: NormalArrnaVariantId;
  label: string;
  shortLabel: string;
  description: string;
  arrnaSequence: string;
  alignedGuide: string;
  deletionCoordinates: number[];
}

export interface PairingValidation {
  valid: boolean;
  requiredUpstream: number;
  requiredDownstream: number;
  message: string;
}

const CODON_TABLE: Record<string, string> = {
  TTT: "F", TTC: "F", TTA: "L", TTG: "L",
  TCT: "S", TCC: "S", TCA: "S", TCG: "S",
  TAT: "Y", TAC: "Y", TAA: "*", TAG: "*",
  TGT: "C", TGC: "C", TGA: "*", TGG: "W",
  CTT: "L", CTC: "L", CTA: "L", CTG: "L",
  CCT: "P", CCC: "P", CCA: "P", CCG: "P",
  CAT: "H", CAC: "H", CAA: "Q", CAG: "Q",
  CGT: "R", CGC: "R", CGA: "R", CGG: "R",
  ATT: "I", ATC: "I", ATA: "I", ATG: "M",
  ACT: "T", ACC: "T", ACA: "T", ACG: "T",
  AAT: "N", AAC: "N", AAA: "K", AAG: "K",
  AGT: "S", AGC: "S", AGA: "R", AGG: "R",
  GTT: "V", GTC: "V", GTA: "V", GTG: "V",
  GCT: "A", GCC: "A", GCA: "A", GCG: "A",
  GAT: "D", GAC: "D", GAA: "E", GAG: "E",
  GGT: "G", GGC: "G", GGA: "G", GGG: "G",
};

export function translateCodon(codon: string): string {
  return CODON_TABLE[codon] ?? "?";
}

export function classifyEditingSites(sequence: string, codingContext = true): EditingSite[] {
  if (!sequence || (codingContext && sequence.length % 3 !== 0) || /[^ACGT]/.test(sequence)) return [];

  return sequence.split("").flatMap((base, index) => {
    if (base !== "A") return [];
    if (!codingContext) return [{ position: index + 1, codon: "", editedCodon: "", aminoAcid: "", editedAminoAcid: "", category: "rna" as EditingCategory }];
    const codonStart = Math.floor(index / 3) * 3;
    const codon = sequence.slice(codonStart, codonStart + 3);
    const offset = index - codonStart;
    const editedCodon = `${codon.slice(0, offset)}G${codon.slice(offset + 1)}`;
    const aminoAcid = CODON_TABLE[codon];
    const editedAminoAcid = CODON_TABLE[editedCodon];
    const category: EditingCategory = index > 0 && sequence[index - 1] === "G"
      ? "blocked_ga"
      : aminoAcid === editedAminoAcid
        ? "synonymous"
        : "editable";

    return [{
      position: index + 1,
      codon,
      editedCodon,
      aminoAcid,
      editedAminoAcid,
      category,
    }];
  });
}

export function reverseComplement(sequence: string): string {
  const complements: Record<string, string> = { A: "U", C: "G", G: "C", T: "A", U: "A" };
  return sequence
    .split("")
    .reverse()
    .map((base) => complements[base])
    .join("");
}

export function designInitialArrna(
  sequence: string,
  targetPosition: number,
  flankLength = 75,
  options: { windowStartRelative?: number; windowEndRelative?: number } = {},
): InitialArrnaDesign | null {
  const targetIndex = targetPosition - 1;
  if (targetIndex < 0 || targetIndex >= sequence.length || sequence[targetIndex] !== "A") return null;

  const startRelative = options.windowStartRelative ?? -flankLength;
  const endRelative = options.windowEndRelative ?? flankLength;
  if (!Number.isInteger(startRelative) || !Number.isInteger(endRelative) || startRelative > 0 || endRelative < 0) return null;
  const windowStartIndex = Math.max(0, targetIndex + startRelative);
  const windowEndIndex = Math.min(sequence.length, targetIndex + endRelative + 1);
  const targetWindow = sequence.slice(windowStartIndex, windowEndIndex);
  const upstreamLength = targetIndex - windowStartIndex;
  const downstreamLength = windowEndIndex - targetIndex - 1;
  const targetIndexInWindow = targetIndex - windowStartIndex;
  const complementaryGuide = reverseComplement(targetWindow);
  const mismatchIndex = complementaryGuide.length - 1 - targetIndexInWindow;
  const arrnaSequence = `${complementaryGuide.slice(0, mismatchIndex)}C${complementaryGuide.slice(mismatchIndex + 1)}`;

  return {
    targetPosition,
    targetWindow,
    arrnaSequence,
    windowStart: windowStartIndex + 1,
    windowEnd: windowEndIndex,
    targetIndex: targetIndexInWindow,
    upstreamLength,
    downstreamLength,
    hasFullFlanks: upstreamLength === -startRelative && downstreamLength === endRelative,
  };
}

export function validateAdarPairing(
  design: InitialArrnaDesign,
  environment: NormalDesignEnvironment,
): PairingValidation {
  const { downstream: requiredDownstream, upstream: requiredUpstream } = pairingCoverage(environment);
  const problems: string[] = [];
  if (design.downstreamLength < requiredDownstream) {
    problems.push(`Target downstream coverage requires ${requiredDownstream} nt, but only ${design.downstreamLength} nt are available`);
  }
  if (design.upstreamLength < requiredUpstream) {
    problems.push(`Target upstream coverage requires ${requiredUpstream} nt, but only ${design.upstreamLength} nt are available`);
  }
  return {
    valid: problems.length === 0,
    requiredUpstream,
    requiredDownstream,
    message: problems.join("; "),
  };
}

function createDeletionVariant(
  design: InitialArrnaDesign,
  id: NormalArrnaVariantId,
  label: string,
  shortLabel: string,
  description: string,
  deletionCoordinates: number[],
): NormalArrnaVariant {
  const deleted = new Set(deletionCoordinates);
  const alignedGuide = design.arrnaSequence.split("").reverse().map((base, targetIndex) => {
    const relativeCoordinate = targetIndex - design.targetIndex;
    return deleted.has(relativeCoordinate) ? "-" : base;
  }).join("");
  const arrnaSequence = design.arrnaSequence.split("").filter((_, arrnaIndex) => {
    const targetIndex = design.arrnaSequence.length - 1 - arrnaIndex;
    const relativeCoordinate = targetIndex - design.targetIndex;
    return !deleted.has(relativeCoordinate);
  }).join("");
  return { id, label, shortLabel, description, arrnaSequence, alignedGuide, deletionCoordinates };
}

export function designNormalArrnaVariants(design: InitialArrnaDesign, includeInternalBulge = false, environment: NormalDesignEnvironment = "combined"): NormalArrnaVariant[] {
  if (!validateAdarPairing(design, environment).valid) return [];
  const variants: NormalArrnaVariant[] = [createDeletionVariant(
    design,
    "baseline",
    "Baseline arRNA",
    "No deletion",
    "A–C target mismatch; all other positions are complementary.",
    [],
  )];
  const downstreamDeletion = Array.from({ length: 10 }, (_, index) => 34 + index);
  const upstreamDeletion = Array.from({ length: 28 }, (_, index) => -31 - index);

  if (design.downstreamLength >= 53) {
    variants.push(createDeletionVariant(
      design,
      "downstream-del10",
      "Downstream +34 deletion arRNA",
      "+34 deletion 10",
      "Deletes the 10 arRNA bases aligned to A+34–A+43; at least 10 distal paired nt remain.",
      downstreamDeletion,
    ));
  }
  if (design.upstreamLength >= 68) {
    variants.push(createDeletionVariant(
      design,
      "upstream-del28",
      "Upstream −31 deletion arRNA",
      "−31 deletion 28",
      "Deletes the 28 arRNA bases aligned to A−31–A−58; at least 10 distal paired nt remain.",
      upstreamDeletion,
    ));
  }
  if (design.downstreamLength >= 53 && design.upstreamLength >= 68) {
    variants.push(createDeletionVariant(
      design,
      "dual-deletion",
      "Dual-deletion arRNA",
      "Dual deletion",
      "Combines A+34 deletion 10 and A−31 deletion 28.",
      [...downstreamDeletion, ...upstreamDeletion],
    ));
  }
  if (includeInternalBulge) {
    for (const variant of [...variants]) {
      variants.push(createDeletionVariant(
        design,
        `${variant.id}-internal-del1` as NormalArrnaVariantId,
        `${variant.label} with +4 internal deletion`,
        `${variant.shortLabel}; +4 deletion 1`,
        "Optional 1/0 internal bulge at +4; test target and bystander editing experimentally.",
        [...variant.deletionCoordinates, 4],
      ));
    }
  }
  return variants;
}
