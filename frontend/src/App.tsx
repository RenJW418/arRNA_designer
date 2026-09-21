import { ArrowRight, Dna, FlaskConical, Scissors } from "lucide-react";
import { useEffect, useState } from "react";
import { CitationPage } from "./components/CitationPage";
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
  const { t, l } = useLanguage();
  type View = "home" | "design" | "refine" | "help" | "method" | "citation";
  const [view, setView] = useState<View>("home");
  const [exampleId, setExampleId] = useState<ExampleId | null>(null);
  const [designApplication, setDesignApplication] = useState<Application>("normal_editing");
  const [refinementSeed, setRefinementSeed] = useState<TestedDuplexSeed | null>(null);
  function navigate(nextView: View) {
    if (nextView !== view) window.history.pushState({ leaperView: nextView }, "", window.location.href);
    setView(nextView);
  }
  function openDesign(id: ExampleId | null = null, application: Application = "normal_editing") { setExampleId(id); setDesignApplication(application); navigate("design"); }
  function openRefinement(seed: TestedDuplexSeed | null = null) { setRefinementSeed(seed); navigate("refine"); }

  useEffect(() => {
    window.history.replaceState({ ...(window.history.state ?? {}), leaperView: "home" }, "", window.location.href);
    const restoreView = (event: PopStateEvent) => {
      const candidate = event.state?.leaperView;
      setView((["home", "design", "refine", "help", "method", "citation"] as View[]).includes(candidate) ? candidate : "home");
    };
    window.addEventListener("popstate", restoreView);
    return () => window.removeEventListener("popstate", restoreView);
  }, []);

  return <div className="app-shell simplified-app">
    <header className="site-header">
      <a className="brand" href="/" aria-label={t("nav.home")} onClick={(event) => { event.preventDefault(); navigate("home"); }}><span className="brand-mark">L</span><span>LEAPER</span><span className="brand-subtitle">arRNA design</span></a>
      <nav aria-label={t("nav.primary")}><button type="button" onClick={() => navigate("method")}>{t("nav.method")}</button><button type="button" onClick={() => navigate("help")}>{t("nav.help")}</button><button type="button" onClick={() => navigate("citation")}>{l("Citation")}</button><a href={API_DOCS_URL} target="_blank" rel="noreferrer">API</a></nav>
      <div className="header-actions"><LanguageSwitcher /></div>
    </header>
    <main>{view === "home" ? <>
      <section className="module-entry-section" aria-labelledby="module-entry-title">
        <div className="module-entry-intro">
          <div className="module-entry-heading">
            <p className="eyebrow">LEAPER arRNA Designer</p>
            <h1 id="module-entry-title">{l("What would you like to do?")}</h1>
            <p>{l("Design an arRNA, or refine one you have already tested.")}</p>
            <span className="home-intro-divider" aria-hidden="true" />
            <p className="home-intro-detail">{l("LEAPER helps you design and optimize antisense RNAs for programmable RNA editing, including normal editing, exon skipping, and experiment-guided refinement.")}</p>
          </div>
          <div className="home-mechanism"><LeaperMechanism /></div>
        </div>
        <div className="module-entry-grid">
          <button type="button" onClick={() => openDesign()}><span>01</span><Dna aria-hidden="true" /><strong>{t("home.normalModule")}</strong><small>{t("home.normalModuleBody")}</small><i>{t("home.openModule")}<ArrowRight size={15} /></i></button>
          <button type="button" onClick={() => openDesign(null, "exon_skipping")}><span>02</span><Scissors aria-hidden="true" /><strong>{t("home.exonModule")}</strong><small>{t("home.exonModuleBody")}</small><i>{t("home.openModule")}<ArrowRight size={15} /></i></button>
          <button type="button" className="refinement-entry" onClick={() => openRefinement()}><span>03</span><FlaskConical aria-hidden="true" /><strong>{t("home.refineModule")}</strong><small>{t("home.refineModuleBody")}</small><i>{t("home.openModule")}<ArrowRight size={15} /></i></button>
        </div>
        <div className="home-secondary-actions"><span>{l("Explore an example")}</span><button type="button" onClick={() => openDesign("normal-demo")}>Normal editing</button><button type="button" onClick={() => openDesign("dmd-exon-51", "exon_skipping")}>DMD exon 51</button></div>
        <button className="back-button home-method-link" type="button" onClick={() => navigate("method")}>{l("View design principles")} <ArrowRight size={16} /></button>
      </section>
    </> : view === "method" ? <><section className="method-page-intro"><button className="back-button" type="button" onClick={() => navigate("home")}>{t("common.back")}</button><h1>{t("nav.method")}</h1></section><MethodEvolution /></> : view === "citation" ? <CitationPage onBack={() => navigate("home")} /> : view === "help" ? <HelpGuide onBack={() => navigate("home")} onExample={(id) => openDesign(id, id === "dmd-exon-51" ? "exon_skipping" : "normal_editing")} /> : view === "refine" ? <TestedArrnaRefinement seed={refinementSeed} onExit={() => navigate("home")} /> : <DesignWorkspace key={`${exampleId ?? "blank"}-${designApplication}`} initialExample={exampleId ? DESIGN_EXAMPLES[exampleId] : null} initialApplication={designApplication} onExit={() => navigate("home")} onRefine={openRefinement} />}</main>
    <footer>
      <span>{t("footer.prototype")}</span>
      <span>{t("footer.maintainer")}: Ren Jiwu (任纪武) · <a href="mailto:renjiwu@stu.pku.edu.cn">renjiwu@stu.pku.edu.cn</a></span>
      <span><a href="https://www.apache.org/licenses/LICENSE-2.0" target="_blank" rel="noreferrer">{t("footer.code")}</a> · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">{t("footer.content")}</a></span>
    </footer>
  </div>;
}
