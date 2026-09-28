export type ExampleId = "normal-demo" | "dmd-exon-51";

export interface DesignExample {
  id: ExampleId;
  title: string;
  description: string;
  application: "normal_editing" | "exon_skipping";
  mode: "sequence" | "gene";
  sequence?: string;
  position?: number;
  gene?: string;
  species?: string;
  exonNumber?: number;
  arrnaLength?: number;
  status: "demonstration";
}

export const DESIGN_EXAMPLES: Record<ExampleId, DesignExample> = {
  "normal-demo": {
    id: "normal-demo",
    title: "SERPINA1 PiZZ correction",
    description: "The Z allele of SERPINA1 (c.1096G>A, p.Glu342Lys) in 153 nt of in-frame coding sequence. Editing the mutant A at position 76 back to inosine restores the glutamate codon.",
    application: "normal_editing",
    mode: "sequence",
    // NM_000295.5 c.1021-1173, carrying the Z substitution at c.1096. The window
    // keeps 75 nt of context on each side so all four architectures are offered.
    sequence: "GACCTCTCCGGGGTCACAGAGGAGGCACCCCTGAAGCTCTCCAAGGCCGTGCATAAGGCTGTGCTGACCATCGACAAGAAAGGGACTGAAGCTGCTGGGGCCATGTTTTTAGAGGCCATACCCATGTCTATCCCCCCCGAGGTCAAGTTCAAC",
    position: 76,
    status: "demonstration",
  },
  "dmd-exon-51": {
    id: "dmd-exon-51",
    title: "DMD exon 51 transcript example",
    description: "Resolves the current human reference transcript through NCBI, then designs exon-skipping arRNAs.",
    application: "exon_skipping",
    mode: "gene",
    gene: "DMD",
    species: "9606",
    exonNumber: 51,
    arrnaLength: 151,
    status: "demonstration",
  },
};
