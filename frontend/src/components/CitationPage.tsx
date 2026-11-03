import { ArrowLeft, Check, Copy, ExternalLink } from "lucide-react";
import { useRef, useState } from "react";
import { BUILD_VERSION_PLAIN } from "../lib/buildInfo";
import { useLanguage } from "./LanguageProvider";

interface Props { onBack: () => void; }

const REFERENCES = [
  { label: "LEAPER 1.0", citation: "Qu L. et al. Programmable RNA editing by recruiting endogenous ADAR using engineered RNAs. Nature Biotechnology (2019).", doi: "10.1038/s41587-019-0178-z" },
  { label: "LEAPER 2.0", citation: "Yi Z. et al. Engineered circular ADAR-recruiting RNAs increase the efficiency and fidelity of RNA editing in vitro and in vivo. Nature Biotechnology (2022).", doi: "10.1038/s41587-021-01180-3" },
  { label: "LEAPER 3.0", citation: "Song D. et al. RNA structure programs endogenous ADAR for precise and efficient editing. Cell (2026).", doi: "10.1016/j.cell.2026.04.047" },
  { label: "Exon skipping", citation: "Guo W. et al. Long-term reversal of Duchenne muscular dystrophy via circular arRNA-guided exon skipping in monkeys and humans. Cell (2026).", doi: "10.1016/j.cell.2026.05.030" },
];

// How to cite this server. The DOI and the public HTTPS domain are not
// available yet, so both stay null and the page renders an explicit "pending"
// notice instead of a fake value or a blank. Fill in `doi` and `url` once they
// exist and the structured entry, the copyable citation and the BibTeX below
// all update from this single place — no other change is required. Do not put
// a temporary address or a made-up DOI here.
const SERVER_CITATION = {
  // The full author list is still AUTHOR_INPUT_NEEDED in the manuscript, so
  // the page reuses the maintainer's name already shown below and marks the
  // complete list as pending. Replace `author` when the list is finalized.
  author: "Ren Jiwu",
  title: "LEAPER arRNA Designer",
  serverName: "LEAPER arRNA Designer web server",
  version: BUILD_VERSION_PLAIN,
  doi: null as string | null, // DOI pending — set upon release archiving.
  url: null as string | null, // Public HTTPS domain pending — set once decided.
  accessYear: new Date().getFullYear(),
};

function buildPlainCitation(): string {
  const { author, title, version, serverName, doi, url, accessYear } = SERVER_CITATION;
  let text = `${author}. ${title}, version ${version}. ${serverName}. Accessed ${accessYear}.`;
  if (doi) text += ` doi: ${doi}.`;
  if (url) text += ` Available at: ${url}.`;
  return text;
}

function buildBibTeX(): string {
  const { author, title, version, serverName, doi, url, accessYear } = SERVER_CITATION;
  const fields = [
    `author = {${author}}`,
    `title = {${title}}`,
    `howpublished = {${serverName}, version ${version}}`,
    `year = {${accessYear}}`,
    `note = {Accessed ${accessYear}}`,
  ];
  if (doi) fields.push(`doi = {${doi}}`);
  if (url) fields.push(`url = {${url}}`);
  return `@misc{leaper-arrna-designer,\n  ${fields.join(",\n  ")}\n}`;
}

function CopyableCitation({ label, text }: { label: string; text: string }) {
  const { l } = useLanguage();
  const [copied, setCopied] = useState(false);
  const codeRef = useRef<HTMLElement | null>(null);

  async function copy() {
    let ok = false;
    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch {
      ok = false;
    }
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
      return;
    }
    // Clipboard failed (or is unavailable). Select the text so it can still be
    // copied by hand.
    const node = codeRef.current;
    if (node) {
      const range = document.createRange();
      range.selectNodeContents(node);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
  }

  return <div className="citation-copy">
    <div className="citation-copy-head">
      <h3>{label}</h3>
      <button className="button button-secondary" type="button" onClick={copy}>{copied ? <Check size={15} /> : <Copy size={15} />}{l(copied ? "Copied" : "Copy")}</button>
    </div>
    <pre><code ref={codeRef}>{text}</code></pre>
  </div>;
}

export function CitationPage({ onBack }: Props) {
  const { l, language } = useLanguage();
  return <section className="citation-page">
    <button className="back-button" type="button" onClick={onBack}><ArrowLeft size={16} />{l("Back to overview")}</button>
    <header><p className="eyebrow">LEAPER arRNA Designer</p><h1>{l("Citation")}</h1><p>{language === "en" ? "When using this tool, please cite LEAPER 3.0, the Nature Protocols protocol and the NAR web server article. Publication details for the latter two will be added here." : "使用本工具时，请引用 LEAPER 3.0、Nature Protocols 方法文章及 NAR 网站文章。后两篇的正式引用信息将补充在此处。"}</p></header>
    <section className="citation-server">
      <h2>{l("How to cite this server")}</h2>
      <p>{l("Cite the server itself with the entry below. The DOI and the public HTTPS address are not available yet, so they are shown as pending rather than as placeholder values.")}</p>
      <div className="citation-server-entry">
        <dl>
          <div><dt>{l("Authors")}</dt><dd>{SERVER_CITATION.author}<span className="citation-pending">{l("Complete author list pending manuscript finalization.")}</span></dd></div>
          <div><dt>{l("Title")}</dt><dd>{SERVER_CITATION.title}</dd></div>
          <div><dt>{l("Server name")}</dt><dd>{SERVER_CITATION.serverName}</dd></div>
          <div><dt>{l("Version")}</dt><dd>{SERVER_CITATION.version}</dd></div>
          <div><dt>{l("Access year")}</dt><dd>{SERVER_CITATION.accessYear}</dd></div>
          <div><dt>DOI</dt><dd>{SERVER_CITATION.doi ?? l("DOI pending — to be added upon release archiving.")}</dd></div>
          <div><dt>URL</dt><dd>{SERVER_CITATION.url ?? l("Public HTTPS domain pending — to be added once the domain is decided.")}</dd></div>
        </dl>
      </div>
      <CopyableCitation label={l("Plain text citation")} text={buildPlainCitation()} />
      <CopyableCitation label="BibTeX" text={buildBibTeX()} />
    </section>
    <div className="citation-list">
      {REFERENCES.filter((reference) => reference.label === "LEAPER 3.0").map((reference) => <article key={reference.doi}><span>{reference.label}</span><p>{reference.citation}</p><a href={`https://doi.org/${reference.doi}`} target="_blank" rel="noreferrer">DOI: {reference.doi}<ExternalLink size={13} /></a></article>)}
      <article><span>Nature Protocols</span><p>{language === "en" ? "LEAPER 3.0 experimental protocol · citation details pending." : "LEAPER 3.0 实验 Protocol · 正式引用信息待补充。"}</p></article>
      <article><span>Nucleic Acids Research</span><p>{language === "en" ? "LEAPER arRNA design web server · citation details pending." : "LEAPER arRNA 设计网站 · 正式引用信息待补充。"}</p></article>
    </div>
    <details className="citation-method-note"><summary>{language === "en" ? "Related studies" : "相关研究"}</summary><div className="citation-list">{REFERENCES.filter((reference) => reference.label !== "LEAPER 3.0").map((reference) => <article key={reference.doi}><span>{reference.label}</span><p>{reference.citation}</p><a href={`https://doi.org/${reference.doi}`} target="_blank" rel="noreferrer">DOI: {reference.doi}<ExternalLink size={13} /></a></article>)}</div></details>
    <section className="citation-method-note"><h2>{language === "en" ? "Protocol alignment and versioned outputs" : "Protocol 对齐与版本化输出"}</h2><p>{language === "en" ? "The website design rules follow the author-provided fixed final LEAPER 3.0 protocol manuscript prepared for Nature Protocols. Its publication or journal acceptance status has not been verified. The guide alignment version is 2026-10-06; design JSON records the applied engine and rule-set identifiers. The protocol manuscript and this website do not yet have a published citation here. Cite the relevant published studies above and retain your JSON record when reporting a design." : "网站设计规则遵循作者提供的 LEAPER 3.0 固定 final protocol 稿件（拟用于 Nature Protocols）。其发表或期刊接受状态未核实。帮助对齐版本为 2026-10-06；设计 JSON 保存所用引擎与规则集标识。此处尚无该 Protocol 稿件或网站的正式发表引用。报告设计时应引用上述相关已发表研究，并保留 JSON 记录。"}</p><p>{language === "en" ? "Computational examples and interface tests are not biological validation. Use the literature for the experimental method and report measured editing and exon-skipping outcomes independently." : "计算示例和界面测试不是生物学验证。实验方法应参考文献，编辑与外显子跳跃的实测结果应分别报告。"}</p></section>
    <aside className="citation-contact"><strong>{l("Maintainer")}</strong><span>Ren Jiwu (任纪武)</span><a href="mailto:renjiwu@stu.pku.edu.cn">renjiwu@stu.pku.edu.cn</a></aside>
  </section>;
}
