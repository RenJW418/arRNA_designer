import type { TranslationKey } from "../lib/i18n";
import { useLanguage } from "./LanguageProvider";

const stages: Array<{ version: string; versionKey?: TranslationKey; titleKey: TranslationKey; descriptionKey: TranslationKey; image: string }> = [
  { version: "LEAPER 1.0", titleKey: "method.stage1Title", descriptionKey: "method.stage1Body", image: "/figures/leaper-1-0.svg" },
  { version: "LEAPER 2.0", titleKey: "method.stage2Title", descriptionKey: "method.stage2Body", image: "/figures/leaper-2-0.svg" },
  { version: "LEAPER 3.0", titleKey: "method.stage3Title", descriptionKey: "method.stage3Body", image: "/figures/leaper-3-0.svg" },
  { version: "Exon skipping", versionKey: "method.stage4Version", titleKey: "method.stage4Title", descriptionKey: "method.stage4Body", image: "/figures/leaper-exon-skipping.svg" },
];

export function MethodEvolution() {
  const { t } = useLanguage();
  return <section className="method-evolution" id="method" aria-labelledby="method-title">
    <div className="section-heading"><div><p className="eyebrow">{t("method.eyebrow")}</p><h2 id="method-title">{t("method.title")}</h2></div><p>{t("method.intro")}</p></div>
    <ol className="method-timeline original-figure-grid">{stages.map(({ version, versionKey, titleKey, descriptionKey, image }, index) => {
      const title = t(titleKey);
      return <li key={version}><div className="method-index" aria-hidden="true">{String(index + 1).padStart(2, "0")}</div><a href={image} target="_blank" rel="noreferrer" aria-label={t("method.open", { version })}><img src={image} alt={t("method.alt", { version, title })} loading="lazy" /></a><p className="method-version">{versionKey ? t(versionKey) : version}</p><h3>{title}</h3><p>{t(descriptionKey)}</p></li>;
    })}</ol>
  </section>;
}
