import { ReactNode, useId, useState } from "react";
import { useLanguage } from "./LanguageProvider";

interface Props {
  children: ReactNode;
  label?: string;
  align?: "left" | "right";
}

export function InfoTip({ children, label, align = "right" }: Props) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const { t } = useLanguage();

  return <span
    className={`info-tip info-tip-${align} ${open ? "open" : ""}`}
    // Opening on mouse-enter alone can make a newly mounted tip appear under a
    // stationary pointer after page navigation. Requiring pointer movement keeps
    // tips closed on entry while preserving the intended hover interaction.
    onMouseMove={() => setOpen(true)}
    onMouseLeave={() => setOpen(false)}
  >
    <button
      type="button"
      className="info-tip-trigger"
      aria-label={label ?? t("tip.show")}
      aria-expanded={open}
      aria-describedby={open ? id : undefined}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          setOpen(false);
          event.currentTarget.blur();
        }
      }}
    >?</button>
    <span className="info-tip-content" id={id} role="tooltip">{children}</span>
  </span>;
}
