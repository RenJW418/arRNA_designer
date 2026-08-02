import { ArrowRight, BookOpen, Dna, LockKeyhole, Microscope } from "lucide-react";
import { useState } from "react";
import { DesignWorkspace } from "./components/DesignWorkspace";

export function App() {
  const [started, setStarted] = useState(false);

  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="brand" href="/" aria-label="LEAPER home">
          <span className="brand-mark">L</span>
          <span>LEAPER</span>
          <span className="brand-subtitle">arRNA design</span>
        </a>
        <nav aria-label="Primary navigation">
          <a href="#method">Method</a>
          <a href="#privacy">Data privacy</a>
          <a href="http://127.0.0.1:8010/docs" target="_blank" rel="noreferrer">
            API
          </a>
        </nav>
        <span className="research-label">Research use only</span>
      </header>

      <main>
        {!started ? (
          <>
            <section className="hero">
              <div className="hero-copy">
                <p className="eyebrow">Programmable RNA editing</p>
                <h1>Design arRNAs with the reference context intact.</h1>
                <p className="hero-lede">
                  Move from a target sequence or gene to a reproducible LEAPER design
                  workspace—transcript-aware, coordinate-explicit, and built for
                  experimental review.
                </p>
                <div className="hero-actions">
                  <button className="button button-primary" onClick={() => setStarted(true)}>
                    Start a design <ArrowRight aria-hidden="true" size={17} />
                  </button>
                  <a className="button button-secondary" href="#method">
                    Read the workflow
                  </a>
                </div>
                <p className="privacy-note">
                  <LockKeyhole aria-hidden="true" size={15} />
                  Submitted sequences are temporary and are not retained long-term.
                </p>
              </div>

              <div className="sequence-figure" aria-label="Example transcript structure">
                <div className="figure-label">
                  <span>DMD · NM_004006.3</span>
                  <span>Transcript context</span>
                </div>
                <div className="transcript-track hero-track">
                  <span className="exon short" />
                  <i />
                  <span className="exon medium" />
                  <i />
                  <span className="exon target">51</span>
                  <i />
                  <span className="exon long" />
                  <i />
                  <span className="exon short" />
                </div>
                <div className="sequence-context">
                  <span className="sequence-dim">AACUGGAGAUCU</span>
                  <strong>A</strong>
                  <span className="sequence-dim">GCUUACCGGAUC</span>
                </div>
                <div className="annotation-line">
                  <span>splice acceptor</span>
                  <span className="target-label">editing site</span>
                  <span>splice donor</span>
                </div>
              </div>
            </section>

            <section className="principles" id="method">
              <article>
                <Dna aria-hidden="true" />
                <p className="principle-index">01</p>
                <h2>Two ways to begin</h2>
                <p>Paste a sequence directly, or resolve a gene and species through NCBI.</p>
              </article>
              <article>
                <Microscope aria-hidden="true" />
                <p className="principle-index">02</p>
                <h2>Reference-aware</h2>
                <p>Keep assembly, transcript version, exon boundaries and strand visible.</p>
              </article>
              <article id="privacy">
                <BookOpen aria-hidden="true" />
                <p className="principle-index">03</p>
                <h2>Reproducible output</h2>
                <p>Export parameters and provenance alongside each candidate design.</p>
              </article>
            </section>
          </>
        ) : (
          <DesignWorkspace onExit={() => setStarted(false)} />
        )}
      </main>

      <footer>
        <span>LEAPER arRNA Designer · v0.1 prototype</span>
        <span>Not for diagnostic or clinical use</span>
      </footer>
    </div>
  );
}
