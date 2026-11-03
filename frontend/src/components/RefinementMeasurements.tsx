import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useLanguage } from "./LanguageProvider";

interface Props {
  targetPosition: number;
  windowStart: number;
  targetSequence: string;
  efficiencies: Record<number, number>;
  invalidDrafts: Record<number, string>;
  onChange: (position: number, value: string) => void;
}

export function RefinementMeasurements({ targetPosition, windowStart, targetSequence, efficiencies, invalidDrafts, onChange }: Props) {
  const { l } = useLanguage();
  const [selectedPosition, setSelectedPosition] = useState<number | null>(null);
  const [columns, setColumns] = useState(30);
  const sequenceRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const baseButtons = useRef(new Map<number, HTMLButtonElement>());

  useEffect(() => {
    const element = sequenceRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const resize = () => {
      // The short final row uses the same column width as complete rows.
      if (element.clientWidth > 0) setColumns(Math.min(30, Math.max(5, Math.floor(element.clientWidth / 36))));
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (selectedPosition === null) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [selectedPosition, columns]);

  const rows = Array.from({ length: Math.ceil(targetSequence.length / columns) }, (_, index) => ({
    start: index * columns,
    sequence: targetSequence.slice(index * columns, (index + 1) * columns),
  }));
  const relativeLabel = (position: number) => position === targetPosition ? "A0" : `A${position > targetPosition ? "+" : ""}${position - targetPosition}`;
  const selectedInvalid = selectedPosition !== null && invalidDrafts[selectedPosition] !== undefined;

  function openEditor(position: number) {
    if (position === selectedPosition) {
      inputRef.current?.focus();
      inputRef.current?.select();
    } else setSelectedPosition(position);
  }

  function closeEditor() {
    const position = selectedPosition;
    setSelectedPosition(null);
    if (position !== null) baseButtons.current.get(position)?.focus();
  }

  return <section className="refinement-measurements" aria-label={l("Experimental measurements")}>
    <div className="refinement-sequence-heading"><strong>{l("Target RNA")} · 5′→3′</strong><span>{l("Click an A to enter its editing efficiency. A0 is required.")}</span></div>
    <div className="refinement-clickable-sequence" ref={sequenceRef}>
      {rows.map(({ start, sequence }) => {
        const selectedInRow = selectedPosition !== null && selectedPosition >= windowStart + start && selectedPosition < windowStart + start + sequence.length;
        return <div className="refinement-sequence-line" key={start}>
          <div className="refinement-sequence-coordinates" style={{ "--measurement-columns": columns } as CSSProperties}><span>{windowStart + start}</span>{sequence.length > 1 && <span style={{ gridColumn: sequence.length }}>{windowStart + start + sequence.length - 1}</span>}</div>
          <div className="refinement-sequence-bases" style={{ "--measurement-columns": columns } as CSSProperties}>
            {sequence.split("").map((base, index) => {
              const position = windowStart + start + index;
              const isTarget = position === targetPosition;
              const invalid = invalidDrafts[position] !== undefined;
              const value = efficiencies[position];
              const selected = selectedPosition === position;
              if (base !== "A") return <span className="refinement-sequence-base" key={position}><small /><b>{base}</b><small /></span>;
              const status = invalid ? l("Invalid value") : value !== undefined ? `${value}%` : l("Not measured");
              return <button type="button" key={position}
                id={isTarget ? "target-a0-efficiency" : `measurement-site-${position}`}
                ref={(element) => { if (element) baseButtons.current.set(position, element); else baseButtons.current.delete(position); }}
                className={`refinement-sequence-base is-adenosine${isTarget ? " is-target" : ""}${invalid ? " is-invalid" : ""}${value !== undefined ? " is-measured" : ""}`}
                aria-label={`${relativeLabel(position)} · ${l("Target")} A${position} · ${status}${isTarget ? ` · ${l("Required")}` : ""}`}
                aria-pressed={selected} aria-expanded={selected}
                aria-controls={selected ? "refinement-site-editor" : undefined}
                title={`${relativeLabel(position)} · A${position} · ${status}`}
                onClick={() => openEditor(position)}>
                <small className="refinement-target-marker">{isTarget ? "A0" : ""}</small><b>A</b>
                <small className="refinement-site-value">{invalid ? "!" : value !== undefined ? `${value}%` : "·"}</small>
              </button>;
            })}
          </div>
          {selectedInRow && selectedPosition !== null && <form id="refinement-site-editor" className="refinement-site-editor" onSubmit={(event) => {
            event.preventDefault();
            if (!selectedInvalid) closeEditor();
          }} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); closeEditor(); } }}>
            <label htmlFor="refinement-site-value"><strong>{relativeLabel(selectedPosition)}</strong><span>{l("Target")} A{selectedPosition} · {l("Observed editing (%)")}</span></label>
            <div className="refinement-percentage-field">
              <input ref={inputRef} id="refinement-site-value" type="number" inputMode="decimal" min="0" max="100" step="any"
                aria-invalid={selectedInvalid || undefined} aria-describedby={selectedInvalid ? "refinement-site-error" : "refinement-measurement-note"}
                value={invalidDrafts[selectedPosition] ?? efficiencies[selectedPosition] ?? ""}
                onChange={(event) => onChange(selectedPosition, event.target.value)} placeholder="0–100" />
              <span aria-hidden="true">%</span>
            </div>
            <button type="submit" className="button button-primary" disabled={selectedInvalid}>{l("Done")}</button>
            <button type="button" className="refinement-clear-value" onClick={() => { onChange(selectedPosition, ""); inputRef.current?.focus(); }}>{l("Clear")}</button>
            {selectedInvalid && <p id="refinement-site-error" role="alert">{l("Enter a value from 0 to 100, or clear it.")}</p>}
          </form>}
        </div>;
      })}
    </div>
    <p id="refinement-measurement-note" className="refinement-measurement-note">{l("Unmeasured sites stay blank. 0% is a measured result.")}</p>
  </section>;
}
