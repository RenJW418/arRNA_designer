import normal from "../../public/examples/normal-input.json";
import exon from "../../public/examples/exon-input.json";
import type { SharedDesignInput } from "../lib/urlState";
import { useLanguage } from "./LanguageProvider";

export const SYNTHETIC_EXON_INPUT: SharedDesignInput = {
  mode: "sequence", adar: "ADAR1", upstreamIntron: exon.upstream_intron,
  targetExon: exon.exon, downstreamIntron: exon.downstream_intron,
  arrnaLength: String(exon.arrna_length), evaluateCoveredEse: exon.evaluate_covered_ese,
  eseMismatchPositions: exon.ese_mismatch_positions.join(","),
};
export const NORMAL_TUTORIAL_INPUT: SharedDesignInput = {
  mode: "sequence", adar: normal.adar_environment, sequence: normal.sequence,
  position: String(normal.target_position), codingContext: normal.coding_context,
  windowStart: String(normal.window_start_relative), windowEnd: String(normal.window_end_relative),
  includeInternalBulge: normal.include_internal_bulge,
};
interface Props { onNormal: () => void; onExon: () => void; }
export function TutorialExamples({ onNormal, onExon }: Props) {
  const { language } = useLanguage();
  const text = (en: string, zh: string) => language === "en" ? en : zh;
  const cards = [
    { name: text("PiZZ normal editing", "PiZZ 常规编辑"), body: text("153 nt in-frame CDS; A76; −75…+75. Go uses the recommended 1 nt internal bulge at +4 and displays Baseline 151 nt and the selected Three bulges 112 nt.", "153 nt 同框 CDS；A76；−75…+75。Go 默认开启 +4 处的 1 nt 内部凸起，显示 Baseline 151 nt 和默认选中的 Three bulges 112 nt。"), nameId: "normal", action: onNormal },
    { name: text("Synthetic exon skipping", "合成外显子跳跃"), body: text("56 nt synthetic exon with intron context; 151 nt guide. Go uses recommended settings and returns an SA candidate; its window already covers the predicted ESE regions, so no additional ESE guide is needed. No NCBI request is required. These sequences are teaching data.", "56 nt 合成外显子与上下游内含子；151 nt 向导。Go 使用推荐设置并返回 SA 候选；该窗口已覆盖预测 ESE 区域，因此无需额外 ESE 向导。无需 NCBI 请求。这些序列仅用于教学。"), nameId: "exon", action: onExon },
  ];
  return <section className="tutorial-examples" id="worked-examples">
    <h2>{text("Try complete examples", "体验完整示例")}</h2>
    <p>{text("Load a ready-to-run input, then use the ordinary workflow and export controls. Download the JSON inputs and archived sample outputs below. Go restores recommended settings; downloaded JSON files may specify different settings for direct API use. Tutorial outputs are computations, not evidence of editing or exon skipping.", "载入可直接运行的输入，再使用正常工作流和导出操作。下方可下载 JSON 输入与归档示例输出。Go 会恢复推荐设置；下载的 JSON 可包含供直接调用 API 使用的不同设置。教程输出是计算结果，不代表编辑或外显子跳跃的实验证据。")}</p>
    <div className="tutorial-example-grid">{cards.map(c => <article key={c.nameId}><h3>{c.name}</h3><p>{c.body}</p><button className="button button-secondary" type="button" onClick={c.action}>{text("Load example", "载入示例")}</button><div className="tutorial-downloads"><a download href={`/examples/${c.nameId}-input.json`}>{text("Input JSON", "输入 JSON")}</a><a download href={`/examples/${c.nameId}-output.json`}>{text("Sample output JSON", "示例输出 JSON")}</a></div></article>)}</div>
  </section>;
}
