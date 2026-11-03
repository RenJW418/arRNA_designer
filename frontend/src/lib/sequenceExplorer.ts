export interface SequenceRange { start: number; end: number }

export function parseSequenceInput(raw: string): { sequence: string; error: string | null } {
  const lines = raw.trim().split(/\r\n?|\n/).map((line) => line.trim());
  const headers = lines.filter((line) => line.startsWith(">"));
  if (headers.length > 1 || (headers.length === 1 && !lines[0].startsWith(">"))) {
    return { sequence: "", error: "Paste a single sequence or one FASTA record; multiple records cannot be combined." };
  }
  const sequence = (headers.length ? lines.slice(1) : lines).join("").replace(/\s/g, "").toUpperCase();
  if (/[^ACGTU]/.test(sequence)) {
    return { sequence: "", error: "Use only A, C, G, T or U nucleotide symbols. Remove ambiguous bases, numbers and punctuation." };
  }
  if (headers.length && !sequence) return { sequence: "", error: "The FASTA record has no sequence." };
  return { sequence, error: null };
}

export function splitExonContext(sequence: string, range: SequenceRange): {
  upstreamIntron: string; targetExon: string; downstreamIntron: string;
} {
  if (!Number.isInteger(range.start) || !Number.isInteger(range.end)
    || range.start < 2 || range.end >= sequence.length || range.start > range.end) {
    throw new RangeError("Choose an internal exon with 1-based inclusive boundaries and at least one base on each side.");
  }
  return {
    upstreamIntron: sequence.slice(0, range.start - 1),
    targetExon: sequence.slice(range.start - 1, range.end),
    downstreamIntron: sequence.slice(range.end),
  };
}

export function normalizeRestoredExonInput(upstream: string, target: string, downstream: string): {
  sequence: string; exonRange: SequenceRange | null; error: string | null;
} {
  const parts = [upstream, target, downstream].map(parseSequenceInput);
  const labels = ["Upstream intron", "Target exon", "Downstream intron"];
  for (let index = 0; index < parts.length; index++) {
    const part = parts[index];
    if (part.error || !part.sequence) {
      return {
        sequence: "", exonRange: null,
        error: `${labels[index]}: ${part.error ?? "Enter at least one nucleotide."}`,
      };
    }
  }
  return {
    sequence: parts.map((part) => part.sequence).join(""),
    exonRange: {
      start: parts[0].sequence.length + 1,
      end: parts[0].sequence.length + parts[1].sequence.length,
    },
    error: null,
  };
}
