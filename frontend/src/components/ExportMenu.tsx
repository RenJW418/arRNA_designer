import { ChevronDown, Download } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLanguage } from "./LanguageProvider";

export function ExportMenu({ onDownload }: { onDownload: (format: "fasta" | "csv" | "json") => void }) {
  const { l } = useLanguage();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open]);
  return <div className="export-menu" ref={root} onBlur={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }} onKeyDown={(event) => {
    if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); }
  }}>
    <button className="button button-secondary" type="button" ref={trigger} aria-expanded={open} onClick={() => setOpen(!open)}><Download size={16} />{l("Download")}<ChevronDown size={14} /></button>
    {open && <div className="export-menu-options">{(["fasta", "csv", "json"] as const).map((format) => <button type="button" key={format} onClick={() => { onDownload(format); setOpen(false); trigger.current?.focus(); }}>{format.toUpperCase()}</button>)}</div>}
  </div>;
}
