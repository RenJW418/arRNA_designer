import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { RnaTopology } from "../lib/sequenceAnalysis";
import { RnaStructurePanel } from "./RnaStructurePanel";
import { useLanguage } from "./LanguageProvider";

interface Props {
  sequence: string;
  topology: RnaTopology;
  label?: string;
  onClose: () => void;
  trigger: HTMLButtonElement | null;
}

export function RnaFoldModal({ sequence, topology, label, onClose, trigger }: Props) {
  const { language } = useLanguage();
  const tr = (en: string, zh: string) => language === "zh-CN" ? zh : en;
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const dialog = dialogRef.current!;
    const previousOverflow = document.body.style.overflow;
    const background = Array.from(document.body.children).filter((element): element is HTMLElement => element instanceof HTMLElement && !element.contains(dialog));
    const inertStates = background.map(element => ({ element, inert: element.getAttribute("inert") }));
    background.forEach(element => element.setAttribute("inert", ""));
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    function keydown(event: KeyboardEvent) {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onCloseRef.current(); return; }
      if (event.key !== "Tab") return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex="0"]'));
      const first = focusable[0], last = focusable.at(-1);
      if (!first) { event.preventDefault(); dialog.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", keydown, true);
    return () => {
      document.removeEventListener("keydown", keydown, true);
      document.body.style.overflow = previousOverflow;
      inertStates.forEach(({ element, inert }) => inert === null ? element.removeAttribute("inert") : element.setAttribute("inert", inert));
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, [trigger]);
  return createPortal(<div className="rna-fold-modal-backdrop" onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="rna-fold-modal" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
      <header className="rna-fold-modal-header"><h2 id={titleId}>{label || tr("arRNA structure", "arRNA 结构")}</h2><button ref={closeRef} type="button" className="rna-fold-modal-close" aria-label={tr("Close RNAfold structure", "关闭 RNAfold 结构")} onClick={onClose}><X size={20} aria-hidden="true" /></button></header>
      <RnaStructurePanel sequence={sequence} label={label} topology={topology} autoCalculate hideControls />
    </div>
  </div>, document.body);
}
