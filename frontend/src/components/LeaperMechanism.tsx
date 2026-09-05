import { useLanguage } from "./LanguageProvider";

const imagePath = "/figures/leaper-mechanism-comparison.svg";

export function LeaperMechanism() {
  const { t } = useLanguage();
  return <figure className="mechanism-figure manuscript-figure">
    <figcaption><span>{t("mechanism.title")}</span><strong>{t("mechanism.figure")}</strong></figcaption>
    <a className="manuscript-figure-link" href={imagePath} target="_blank" rel="noreferrer" aria-label={t("mechanism.open")}><img src={imagePath} alt={t("mechanism.alt")} fetchPriority="high" /></a>
    <dl className="mechanism-facts"><div><dt>{t("mechanism.editor")}</dt><dd>{t("mechanism.editorValue")}</dd></div><div><dt>{t("mechanism.guide")}</dt><dd>{t("mechanism.guideValue")}</dd></div><div><dt>{t("mechanism.outcome")}</dt><dd>{t("mechanism.outcomeValue")}</dd></div></dl>
  </figure>;
}
