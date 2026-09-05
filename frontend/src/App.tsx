import { ArrowRight, BookOpen, Dna, FlaskConical, Microscope, Scissors } from "lucide-react";
import { useState } from "react";
import { DesignWorkspace, type Application } from "./components/DesignWorkspace";
import { HelpGuide } from "./components/HelpGuide";
import { useLanguage } from "./components/LanguageProvider";
import { LanguageSwitcher } from "./components/LanguageSwitcher";
import { LeaperMechanism } from "./components/LeaperMechanism";
import { MethodEvolution } from "./components/MethodEvolution";
import { TestedArrnaRefinement } from "./components/TestedArrnaRefinement";
import { DESIGN_EXAMPLES, ExampleId } from "./lib/examples";
import { resolveApiDocsUrl } from "./lib/apiNavigation";
import type { TestedDuplexSeed } from "./lib/testedDuplex";

const API_DOCS_URL = resolveApiDocsUrl(
  import.meta.env.VITE_API_DOCS_URL,
  import.meta.env.VITE_API_BASE_URL,
);

export function App() {
  const { t } = useLanguage();
  const [view, setView] = useState<"home" | "design" | "refine" | "help">("home");
  const [exampleId, setExampleId] = useState<ExampleId | null>(null);
  const [designApplication, setDesignApplication] = useState<Application>("normal_editing");
  const [refinementSeed, setRefinementSeed] = useState<TestedDuplexSeed | null>(null);
  function openDesign(id: ExampleId | null = null, application: Application = "normal_editing") { setExampleId(id); setDesignApplication(application); setView("design"); }
  function openRefinement(seed: TestedDuplexSeed | null = null) { setRefinementSeed(seed); setView("refine"); }

  return <div className="app-shell">
    <header className="site-header">
      <a className="brand" href="/" aria-label={t("nav.home")} onClick={(event) => { event.preventDefault(); setView("home"); }}><span className="brand-mark">L</span><span>LEAPER</span><span className="brand-subtitle">arRNA design</span></a>
      <nav aria-label={t("nav.primary")}><button type="button" onClick={() => setView("home")}>{t("nav.method")}</button><button type="button" onClick={() => setView("help")}>{t("nav.help")}</button><a href={API_DOCS_URL} target="_blank" rel="noreferrer">API</a></nav>
      <div className="header-actions"><LanguageSwitcher /></div>
    </header>
    <main>{view === "home" ? <>
      <section className="hero"><div className="hero-copy">
        <p className="eyebrow">{t("home.eyebrow")}</p><h1>{t("home.title")}</h1><p className="hero-lede">{t("home.lede")}</p>
        <div className="hero-actions"><button className="button button-primary" onClick={() => openDesign()}>{t("home.start")} <ArrowRight aria-hidden="true" size={17} /></button><a className="button button-secondary" href="#method">{t("home.workflow")}</a></div>
        <div className="hero-examples" aria-label={t("home.examplesLabel")}><button type="button" onClick={() => openDesign("normal-demo")}>{t("home.normalExample")}</button><button type="button" onClick={() => openDesign("dmd-exon-51", "exon_skipping")}>{t("home.exonExample")}</button><span>{t("home.demo")}</span></div>
      </div><LeaperMechanism /></section>
      <MethodEvolution />
      <section className="module-entry-section" aria-labelledby="module-entry-title">
        <div className="module-entry-heading"><p className="eyebrow">{t("home.modulesEyebrow")}</p><h2 id="module-entry-title">{t("home.modulesTitle")}</h2><p>{t("home.modulesBody")}</p></div>
        <div className="module-entry-grid">
          <button type="button" onClick={() => openDesign()}><span>01</span><Dna aria-hidden="true" /><strong>{t("home.normalModule")}</strong><small>{t("home.normalModuleBody")}</small><i>{t("home.openModule")}<ArrowRight size={15} /></i></button>
          <button type="button" onClick={() => openDesign(null, "exon_skipping")}><span>02</span><Scissors aria-hidden="true" /><strong>{t("home.exonModule")}</strong><small>{t("home.exonModuleBody")}</small><i>{t("home.openModule")}<ArrowRight size={15} /></i></button>
          <button type="button" className="refinement-entry" onClick={() => openRefinement()}><span>03</span><FlaskConical aria-hidden="true" /><strong>{t("home.refineModule")}</strong><small>{t("home.refineModuleBody")}</small><i>{t("home.openModule")}<ArrowRight size={15} /></i></button>
        </div>
      </section>
      <section className="principles" aria-label={t("home.principles")}><article><Dna aria-hidden="true" /><p className="principle-index">01</p><h2>{t("home.startWays")}</h2><p>{t("home.startWaysBody")}</p></article><article><Microscope aria-hidden="true" /><p className="principle-index">02</p><h2>{t("home.referenceAware")}</h2><p>{t("home.referenceAwareBody")}</p></article><article><BookOpen aria-hidden="true" /><p className="principle-index">03</p><h2>{t("home.reproducible")}</h2><p>{t("home.reproducibleBody")}</p></article></section>
    </> : view === "help" ? <HelpGuide onBack={() => setView("home")} onExample={(id) => openDesign(id, id === "dmd-exon-51" ? "exon_skipping" : "normal_editing")} /> : view === "refine" ? <TestedArrnaRefinement seed={refinementSeed} onExit={() => setView("home")} /> : <DesignWorkspace key={`${exampleId ?? "blank"}-${designApplication}`} initialExample={exampleId ? DESIGN_EXAMPLES[exampleId] : null} initialApplication={designApplication} onExit={() => setView("home")} onRefine={openRefinement} />}</main>
    <footer>
      <span>{t("footer.prototype")}</span>
      <span>{t("footer.maintainer")}: Ren Jiwu (任纪武) · <a href="mailto:renjiwu@stu.pku.edu.cn">renjiwu@stu.pku.edu.cn</a></span>
      <span><a href="https://www.apache.org/licenses/LICENSE-2.0" target="_blank" rel="noreferrer">{t("footer.code")}</a> · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">{t("footer.content")}</a></span>
    </footer>
  </div>;
}
