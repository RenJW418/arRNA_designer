export type EditingCategory = "blocked_ga" | "synonymous" | "editable";

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
export type NormalArrnaVariantId = "baseline" | "downstream-del10" | "upstream-del28" | "dual-deletion";

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

export function classifyEditingSites(sequence: string): EditingSite[] {
  if (!sequence || sequence.length % 3 !== 0 || /[^ACGT]/.test(sequence)) return [];

  return sequence.split("").flatMap((base, index) => {
    if (base !== "A") return [];
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
): InitialArrnaDesign | null {
  const targetIndex = targetPosition - 1;
  if (targetIndex < 0 || targetIndex >= sequence.length || sequence[targetIndex] !== "A") return null;

  const windowStartIndex = Math.max(0, targetIndex - flankLength);
  const windowEndIndex = Math.min(sequence.length, targetIndex + flankLength + 1);
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
    hasFullFlanks: upstreamLength === flankLength && downstreamLength === flankLength,
  };
}

export function validateAdarPairing(
  design: InitialArrnaDesign,
  environment: AdarEnvironment,
): PairingValidation {
  const requiredDownstream = environment === "ADAR1" ? 4 : 6;
  const requiredUpstream = environment === "ADAR1" ? 20 : 11;
  const problems: string[] = [];
  if (design.downstreamLength < requiredDownstream) {
    problems.push(`arRNA 5′ side requires ${requiredDownstream} paired nt, but only ${design.downstreamLength} nt are available`);
  }
  if (design.upstreamLength < requiredUpstream) {
    problems.push(`arRNA 3′ side requires ${requiredUpstream} paired nt, but only ${design.upstreamLength} nt are available`);
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

export function designNormalArrnaVariants(design: InitialArrnaDesign): NormalArrnaVariant[] {
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

  if (design.downstreamLength >= 75) {
    variants.push(createDeletionVariant(
      design,
      "downstream-del10",
      "Downstream +34 deletion arRNA",
      "+34 deletion 10",
      "Deletes the 10 arRNA bases aligned to A+34–A+43; 32 distal paired nt remain.",
      downstreamDeletion,
    ));
  }
  if (design.upstreamLength >= 75) {
    variants.push(createDeletionVariant(
      design,
      "upstream-del28",
      "Upstream −31 deletion arRNA",
      "−31 deletion 28",
      "Deletes the 28 arRNA bases aligned to A−31–A−58; 17 distal paired nt remain.",
      upstreamDeletion,
    ));
  }
  if (design.downstreamLength >= 75 && design.upstreamLength >= 75) {
    variants.push(createDeletionVariant(
      design,
      "dual-deletion",
      "Dual-deletion arRNA",
      "Dual deletion",
      "Combines A+34 deletion 10 and A−31 deletion 28.",
      [...downstreamDeletion, ...upstreamDeletion],
    ));
  }
  return variants;
}
