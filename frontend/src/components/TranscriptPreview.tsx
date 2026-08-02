interface Props {
  mode: "sequence" | "gene";
  sequence: string;
  position: number;
}

export function TranscriptPreview({ mode, sequence, position }: Props) {
  const safePosition = Math.max(1, Math.min(position || 1, sequence.length || 1));
  const start = Math.max(0, safePosition - 13);
  const context = sequence.slice(start, start + 25);
  const targetIndex = safePosition - 1 - start;

  return (
    <aside className="preview-panel">
      <div className="preview-header">
        <p>Reference context</p>
        <span>{mode === "gene" ? "NM_004006.3" : "User sequence"}</span>
      </div>
      {mode === "gene" ? (
        <>
          <div className="transcript-track preview-track">
            <span className="exon short">49</span><i />
            <span className="exon medium">50</span><i />
            <span className="exon target">51</span><i />
            <span className="exon long">52</span>
          </div>
          <div className="preview-stats">
            <span><strong>Exon 51</strong> selected region</span>
            <span><strong>233 nt</strong> exon length</span>
            <span><strong>− strand</strong> orientation</span>
          </div>
          <div className="mock-sequence">
            <span>…CTGGAATGCTGTT</span><mark>A</mark><span>GAGACAGCCTGAA…</span>
          </div>
        </>
      ) : context ? (
        <>
          <div className="sequence-ruler"><span>{start + 1}</span><span>{start + context.length}</span></div>
          <div className="mock-sequence large">
            {context.split("").map((base, index) =>
              index === targetIndex ? <mark key={index}>{base}</mark> : <span key={index}>{base}</span>,
            )}
          </div>
          <p className="preview-help">Position {safePosition} is highlighted. Paste a longer sequence to inspect its local context.</p>
        </>
      ) : (
        <div className="empty-preview">
          <span>ACGT</span>
          <p>Your sequence context will appear here.</p>
        </div>
      )}
      <div className="legend"><span><i className="legend-target" /> Target site</span><span><i className="legend-exon" /> Exon</span></div>
    </aside>
  );
}
