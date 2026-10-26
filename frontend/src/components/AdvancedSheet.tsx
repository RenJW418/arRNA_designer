import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { useLanguage } from "./LanguageProvider";
import "../advanced-sheet.css";

export interface AdvancedSheetProps {
  id: string;
  open: boolean;
  onClose: () => void;
  revealKey?: number;
  title?: string;
  children: ReactNode;
}

export function AdvancedSheet({ id, open, onClose, revealKey = 0, title, children }: AdvancedSheetProps) {
  const { language } = useLanguage();
  const titleId = useId();
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel || panel.closest("[inert]")) return;
      if (!panel.contains(document.activeElement)) panel.focus({ preventScroll: true });
      panel.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
        block: "start",
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open, revealKey]);

  const closeLabel = language === "zh-CN" ? "关闭高级设置" : "Close advanced settings";
  return <section id={id} ref={panelRef} className="advanced-inline-panel" hidden={!open} aria-labelledby={titleId} tabIndex={-1} onKeyDown={(event) => {
    if (event.key === "Escape" && !event.defaultPrevented) {
      event.preventDefault();
      onClose();
    }
  }}>
    <header className="advanced-inline-header">
      <h2 id={titleId}>{title ?? (language === "zh-CN" ? "高级设置" : "Advanced")}</h2>
      <button type="button" className="advanced-inline-close" aria-label={closeLabel} onClick={onClose}>
        <X size={21} aria-hidden="true" />
      </button>
    </header>
    <div className="advanced-inline-body">{children}</div>
  </section>;
}
