import { useEffect, useState } from "react";
import { encodeState, pathForView, resolveView, restoredStateFor, type SharedDesignInput, type SharedState, type View } from "./lib/urlState";
import { CitationPage } from "./components/CitationPage";
import type { Application } from "./components/DesignWorkspace";
import { SequenceDesignWorkspace } from "./components/SequenceDesignWorkspace";
import { HelpGuide } from "./components/HelpGuide";
import { NORMAL_TUTORIAL_INPUT, SYNTHETIC_EXON_INPUT } from "./components/TutorialExamples";
import { useLanguage } from "./components/LanguageProvider";
import { LanguageSwitcher } from "./components/LanguageSwitcher";
import { MethodEvolution } from "./components/MethodEvolution";
import { DESIGN_EXAMPLES, ExampleId } from "./lib/examples";
import { resolveApiDocsUrl } from "./lib/apiNavigation";
import { BUILD_COMMIT_SHORT, BUILD_VERSION, COMMIT_URL } from "./lib/buildInfo";

const API_DOCS_URL = resolveApiDocsUrl(
  import.meta.env.VITE_API_DOCS_URL,
  import.meta.env.VITE_API_BASE_URL,
);

export function App() {
  const { t, l } = useLanguage();
  // The whole restorable state lives in the URL fragment, which the browser
  // never sends to the server, so a shared link carries a design without the
  // sequence reaching an access log.
  // A static path must not drag a design out of the fragment: on /help,
  // /method or /citation the fragment belongs to a different page, so it is
  // ignored when initializing the design state.
  const restored = typeof window === "undefined" ? null : restoredStateFor(window.location.pathname, window.location.hash);
  const [view, setView] = useState<View>(typeof window === "undefined" ? "home" : resolveView(window.location.pathname, window.location.hash));
  const [exampleId, setExampleId] = useState<ExampleId | null>((restored?.example as ExampleId) ?? null);
  const [designApplication, setDesignApplication] = useState<Application>(restored?.application ?? "normal_editing");
  const [workspaceRevision, setWorkspaceRevision] = useState(0);
  const [designInput, setDesignInput] = useState<SharedDesignInput | null>(restored?.input ?? null);

  function writeUrl(next: SharedState, push: boolean) {
    // Static pages move their route into the path; home and design keep the
    // sequence/design state in the fragment. The fragment is never sent to the
    // server, so a sequence still cannot reach a request URL or an access log.
    const fragment = encodeState(next);
    const url = pathForView(next.view) + window.location.search + fragment;
    if (push) window.history.pushState(null, "", url);
    else window.history.replaceState(null, "", url);
  }

  function navigate(nextView: View, overrides: Partial<SharedState> = {}) {
    const next: SharedState = {
      view: nextView,
      application: overrides.application ?? designApplication,
      example: overrides.example ?? undefined,
      input: overrides.input ?? undefined,
    };
    if (nextView !== view || overrides.example || overrides.input) writeUrl(next, true);
    setView(nextView);
  }

  function openDesign(id: ExampleId | null = null, application: Application = "normal_editing") {
    setWorkspaceRevision((v) => v + 1);
    setExampleId(id);
    setDesignApplication(application);
    setDesignInput(null);
    navigate("design", { application, example: id ?? undefined });
  }
  function openTutorial(application: Application, input: SharedDesignInput) {
    setWorkspaceRevision((v) => v + 1);
    setExampleId(null); setDesignApplication(application); setDesignInput(input);
    navigate("design", { application, input });
  }

  // Generating a design replaces the current entry rather than pushing a new
  // one, so Back still leaves the module instead of stepping through edits.
  function recordDesignInput(input: SharedDesignInput) {
    setDesignInput(input);
    setView("design");
    writeUrl({ view: "design", application: designApplication, example: exampleId ?? undefined, input }, false);
  }

  useEffect(() => {
    const restore = () => {
      const state = restoredStateFor(window.location.pathname, window.location.hash);
      setWorkspaceRevision((v) => v + 1);
      setView(resolveView(window.location.pathname, window.location.hash));
      setExampleId((state?.example as ExampleId) ?? null);
      setDesignApplication(state?.application ?? "normal_editing");
      setDesignInput(state?.input ?? null);
    };
    window.addEventListener("popstate", restore);
    window.addEventListener("hashchange", restore);
    return () => {
      window.removeEventListener("popstate", restore);
      window.removeEventListener("hashchange", restore);
    };
  }, []);

  return <div className="app-shell simplified-app">
    <header className="site-header">
      <a className="brand" href="/" aria-label={t("nav.home")} onClick={(event) => { event.preventDefault(); navigate("home"); }}><img className="brand-mark" src="/brand-mark.svg" width="72" height="26" alt="" /><span className="brand-wordmark">LEAPER</span><span className="brand-subtitle">arRNA design</span></a>
      <nav aria-label={t("nav.primary")}>
        <button type="button" onClick={() => navigate("help")}>{t("nav.help")}</button>
        <button type="button" onClick={() => navigate("method")}>{t("nav.method")}</button>
        <button type="button" onClick={() => navigate("citation")}>{l("Citation")}</button>
        <a href="https://weilab.pku.edu.cn/" target="_blank" rel="noopener noreferrer">{l("Laboratory")}</a>
      </nav>
      <div className="header-actions"><LanguageSwitcher /></div>
    </header>
    <main>
      <div hidden={view !== "home" && view !== "design"}>
        <SequenceDesignWorkspace key={workspaceRevision} active={view === "home" || view === "design"} initialExample={exampleId ? DESIGN_EXAMPLES[exampleId] : null} initialApplication={designApplication} initialInput={designInput} onApplicationChange={setDesignApplication} onInputChange={recordDesignInput} />
      </div>
      {view === "method" ? <><section className="method-page-intro"><button className="back-button" type="button" onClick={() => navigate("home")}>{t("common.back")}</button><h1>{t("nav.method")}</h1></section><MethodEvolution /></> : view === "citation" ? <CitationPage onBack={() => navigate("home")} /> : view === "help" ? <HelpGuide onBack={() => navigate("home")} onExample={(id) => openDesign(id, id === "dmd-exon-51" ? "exon_skipping" : "normal_editing")} onNormalTutorial={() => openTutorial("normal_editing", NORMAL_TUTORIAL_INPUT)} onExonTutorial={() => openTutorial("exon_skipping", SYNTHETIC_EXON_INPUT)} docsUrl={API_DOCS_URL} /> : null}</main>
    {/* NAR requires the landing page itself to carry the free-access statement,
        the licences and the maintenance commitment, so this footer is rendered
        for every view rather than only on the citation page. */}
    <footer className="site-footer">
      <p className="site-footer-access">{t("footer.freeAccess")}</p>
      <p className="site-footer-licences">
        <span>{t("footer.code")}</span>
        <span aria-hidden="true">·</span>
        <span>{t("footer.content")}</span>
      </p>
      <p className="site-footer-maintenance">{t("footer.maintenance")}</p>
      <p className="site-footer-meta">
        <span>{t("footer.prototype", { version: BUILD_VERSION })}</span>
        <span aria-hidden="true">·</span>
        {COMMIT_URL ? (
          <a href={COMMIT_URL} target="_blank" rel="noopener noreferrer">{BUILD_COMMIT_SHORT}</a>
        ) : (
          <span>{BUILD_COMMIT_SHORT}</span>
        )}
        <span aria-hidden="true">·</span>
        <span>{t("footer.maintainer")}: <a href="mailto:renjiwu@stu.pku.edu.cn">Ren Jiwu (任纪武)</a></span>
      </p>
    </footer>
  </div>;
}
