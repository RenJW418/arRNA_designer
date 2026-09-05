import { ArrowLeft, ArrowRight, BookOpen, Download, FlaskConical } from "lucide-react";
import type { ExampleId } from "../lib/examples";
import { useLanguage } from "./LanguageProvider";

interface Props { onBack: () => void; onExample: (id: ExampleId) => void; }

export function HelpGuide({ onBack, onExample }: Props) {
  const { t } = useLanguage();
  return <section className="help-guide">
    <button className="back-button" type="button" onClick={onBack}><ArrowLeft size={16} />{t("common.back")}</button>
    <header className="help-hero"><p className="eyebrow">{t("help.eyebrow")}</p><h1>{t("help.title")}</h1><p>{t("help.intro")}</p></header>
    <div className="help-grid"><article><BookOpen /><span>01</span><h2>{t("help.inputTitle")}</h2><p>{t("help.inputBody")}</p></article><article><FlaskConical /><span>02</span><h2>{t("help.evidenceTitle")}</h2><p>{t("help.evidenceBody")}</p></article><article><Download /><span>03</span><h2>{t("help.exportTitle")}</h2><p>{t("help.exportBody")}</p></article></div>
    <section className="help-optimization">
      <header><p className="eyebrow">{t("help.optimizeEyebrow")}</p><h2>{t("help.optimizeTitle")}</h2><p>{t("help.optimizeIntro")}</p></header>
      <ol>
        <li><span>1</span><div><strong>{t("help.measureTitle")}</strong><p>{t("help.measureBody")}</p></div></li>
        <li><span>2</span><div><strong>{t("help.autoTitle")}</strong><p>{t("help.autoBody")}</p></div></li>
        <li><span>3</span><div><strong>{t("help.manualTitle")}</strong><p>{t("help.manualBody")}</p></div></li>
      </ol>
    </section>
    <section className="help-examples"><div><p className="eyebrow">{t("help.examplesEyebrow")}</p><h2>{t("help.examplesTitle")}</h2><p>{t("help.examplesBody")}</p></div><div><button className="button button-secondary" type="button" onClick={() => onExample("normal-demo")}>{t("help.normalExample")} <ArrowRight size={15} /></button><button className="button button-primary" type="button" onClick={() => onExample("dmd-exon-51")}>{t("help.exonExample")} <ArrowRight size={15} /></button></div></section>
    <section className="help-interpretation"><h2>{t("help.limitsTitle")}</h2><p>{t("help.limitsBody")}</p></section>
  </section>;
}
