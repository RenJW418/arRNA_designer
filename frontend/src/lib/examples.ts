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
    title: "Normal-editing demonstration",
    description: "A deterministic 153 nt coding-sequence example with an editable A at position 77.",
    application: "normal_editing",
    mode: "sequence",
    sequence: `${"ATC".repeat(25)}CAC${"GCC".repeat(25)}`,
    position: 77,
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
