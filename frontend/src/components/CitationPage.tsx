import { ArrowLeft, ExternalLink } from "lucide-react";
import { useLanguage } from "./LanguageProvider";

interface Props { onBack: () => void; }

const REFERENCES = [
  { label: "LEAPER 1.0", citation: "Qu L. et al. Programmable RNA editing by recruiting endogenous ADAR using engineered RNAs. Nature Biotechnology (2019).", doi: "10.1038/s41587-019-0178-z" },
  { label: "LEAPER 2.0", citation: "Yi Z. et al. Engineered circular ADAR-recruiting RNAs increase the efficiency and fidelity of RNA editing in vitro and in vivo. Nature Biotechnology (2022).", doi: "10.1038/s41587-021-01180-3" },
  { label: "LEAPER 3.0", citation: "Song D. et al. RNA structure programs endogenous ADAR for precise and efficient editing. Cell (2026).", doi: "10.1016/j.cell.2026.04.047" },
  { label: "Exon skipping", citation: "Guo W. et al. Long-term reversal of Duchenne muscular dystrophy via circular arRNA-guided exon skipping in monkeys and humans. Cell (2026).", doi: "10.1016/j.cell.2026.05.030" },
];

export function CitationPage({ onBack }: Props) {
  const { l } = useLanguage();
  return <section className="citation-page">
    <button className="back-button" type="button" onClick={onBack}><ArrowLeft size={16} />{l("Back to overview")}</button>
    <header><p className="eyebrow">LEAPER arRNA Designer</p><h1>{l("Citation")}</h1><p>{l("The citation for this Web Server will be added after publication. Until then, cite the LEAPER studies that support the method used in your work.")}</p></header>
    <div className="citation-list">
      {REFERENCES.map((reference) => <article key={reference.doi}><span>{reference.label}</span><p>{reference.citation}</p><a href={`https://doi.org/${reference.doi}`} target="_blank" rel="noreferrer">DOI: {reference.doi}<ExternalLink size={13} /></a></article>)}
    </div>
    <aside className="citation-contact"><strong>{l("Maintainer")}</strong><span>Ren Jiwu (任纪武)</span><a href="mailto:renjiwu@stu.pku.edu.cn">renjiwu@stu.pku.edu.cn</a></aside>
  </section>;
}

