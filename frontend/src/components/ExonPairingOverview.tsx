import { useId } from "react";
import type { ExonSkippingCandidate, ExonSkippingDesign } from "../lib/exonSkipping";
import { useLanguage } from "./LanguageProvider";
import "../pairing-overview.css";

interface Props {
  candidate: ExonSkippingCandidate;
  design: ExonSkippingDesign;
}

/** Display the returned duplex without introducing an editing target or guide. */
export function ExonPairingOverview({ candidate, design }: Props) {
  const { l, language } = useLanguage();
  const zh = language === "zh-CN";
  const mismatchLabel = zh ? "A–C 错配" : "A–C mismatch";
  const id = useId();
  const left = 96, right = 956, targetY = 48, guideY = targetY + 24;
  const target = candidate.target_sequence.toUpperCase();
  const guide = Array.from(candidate.arrna_sequence.toUpperCase().replace(/T/g, "U")).reverse();
  const length = target.length;
  const first = candidate.global_start, last = candidate.global_end;
  const step = length > 1 ? (right - left) / (length - 1) : right - left;
  const x = (position: number) => length > 1 ? left + (position - first) * step : (left + right) / 2;
  const exonStart = design.normalized_upstream_intron.length + 1;
  const exonEnd = exonStart + design.exon_length - 1;
  // Actual returned bases are authoritative: a perfect-match ESE has no A–C node.
  const aSites = Array.from(target).flatMap((base, index) => base === "A" ? [{
    index, position: first + index, mismatch: guide[index] === "C",
  }] : []);
  const mismatchSites = aSites.filter(site => site.mismatch);
  const mismatchPositions = new Set(mismatchSites.map(site => site.position));
  const mismatchRadii = new Map(mismatchSites.map((site, index) => {
    const previous = mismatchSites[index - 1], next = mismatchSites[index + 1];
    const nearest = Math.min(previous ? x(site.position) - x(previous.position) : Infinity,
      next ? x(next.position) - x(site.position) : Infinity);
    return [site.position, Math.max(.2, Math.min(8, nearest * .38))];
  }));
  const radiusAt = (position: number) => mismatchRadii.get(position) ?? 8;
  const eseRegions = design.ese_regions.flatMap((region, index) => {
    if (!Number.isInteger(region.start) || !Number.isInteger(region.end) || region.start > region.end
      || region.start < 1 || region.end > design.exon_length) return [];
    const start = Math.max(first, exonStart + region.start - 1);
    const end = Math.min(last, exonStart + region.end - 1);
    return start <= end ? [{ start, end, index }] : [];
  });
  const boundaries = [{ position: exonStart - .5, label: "SA" }, { position: exonEnd + .5, label: "SD" }]
    .filter(boundary => boundary.position >= first && boundary.position <= last);
  const pairStride = Math.max(1, Math.ceil(10 / step));

  return <section className="exon-pairing-overview normal-pairing-schematic" aria-label={l("Base-pairing view")}>
    <div className="normal-schematic-scroll">
      <svg className="exon-pairing-svg" viewBox="0 0 1000 116" data-start={first} data-end={last} data-left={left} data-right={right}
        data-target-y={targetY} data-guide-y={guideY} role="img" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`}>
        <title id={`${id}-title`}>{l("Target and arRNA pairing schematic")}</title>
        <desc id={`${id}-description`}>{zh
          ? `靶序列 ${first}–${last}。上方靶 RNA 为 5′ 到 3′，下方 arRNA 为 3′ 到 5′。圆点标示其他 A，圆节点仅标示返回序列中的实际 A–C 错配；浅色区为预测 ESE。SA 和 SD 位于相邻碱基之间。`
          : `Target ${first}–${last}. Target RNA runs 5′ to 3′ above the antiparallel arRNA, shown 3′ to 5′. Dots mark other A sites; circular nodes show only actual A–C mismatches in the returned sequences. Shaded regions are predicted ESEs. SA and SD lie between adjacent bases.`}</desc>
        {eseRegions.map(region => {
          const startX = x(Math.max(first, region.start - .5));
          const endX = x(Math.min(last, region.end + .5));
          return <rect className="exon-schematic-ese-region" key={region.index} data-region-index={region.index} data-start={region.start} data-end={region.end}
            x={startX} y={targetY - 11} width={Math.max(2, endX - startX)} height="22" rx="4">
            <title>{`${l("Predicted ESE region")} ${region.index + 1} · ${region.start}–${region.end}`}</title>
          </rect>;
        })}
        <path className="normal-schematic-target-line" d={`M ${left} ${targetY} H ${right}`} />
        <path className="normal-schematic-guide-line" d={`M ${left} ${guideY} H ${right}`} />
        {Array.from({ length: Math.floor(Math.max(0, length - 1) / pairStride) + 1 }, (_, index) => index * pairStride).map(index => {
          const position = first + index;
          if (index >= length || mismatchPositions.has(position)) return null;
          return <line className="normal-schematic-pair" data-position={position} key={position} x1={x(position)} x2={x(position)} y1={targetY + 2} y2={guideY - 2} />;
        })}
        {mismatchSites.map(site => {
          const radius = radiusAt(site.position);
          return <line className="normal-schematic-target-pair" data-position={site.position} key={site.position}
            x1={x(site.position)} x2={x(site.position)} y1={targetY + radius + 1} y2={guideY - radius - 1} />;
        })}
        {aSites.map(site => {
          const radius = site.mismatch ? radiusAt(site.position) : Math.max(.35, Math.min(2.3, step * .25));
          return <g className={`normal-schematic-a ${site.mismatch ? "selected exon-schematic-mismatch" : "rna"}`} data-position={site.position} data-mismatch={site.mismatch} data-base="A"
            transform={`translate(${x(site.position)} ${targetY})`} key={site.position}>
            <title>{`A${site.position} · ${site.mismatch ? mismatchLabel : l("Other A sites")}`}</title>
            {site.mismatch ? <><circle className="normal-schematic-target-node" r={radius} style={{ strokeWidth: Math.min(1.8, radius * .3) }} />
              {radius >= 4 && <text textAnchor="middle" dy=".35em" style={{ fontSize: Math.min(11, radius * 1.5) }}>A</text>}</>
              : <><circle className="normal-schematic-site-hit" r={Math.min(6, Math.max(2, step * .4))} /><circle className="normal-schematic-site-dot" r={radius} /></>}
          </g>;
        })}
        {mismatchSites.map(site => {
          const radius = radiusAt(site.position);
          return <g className="normal-schematic-target-guide exon-schematic-guide-base" data-position={site.position} data-base={guide[site.index]}
            transform={`translate(${x(site.position)} ${guideY})`} key={site.position}>
            <title>{`arRNA ${guide[site.index]} · ${zh ? "配对靶位置" : "target position"} ${site.position} · arRNA ${length - site.index} (5′→3′)`}</title>
            <circle r={radius} style={{ strokeWidth: Math.min(1.6, radius * .3) }} />
            {radius >= 4 && <text textAnchor="middle" dy=".35em" style={{ fontSize: Math.min(11, radius * 1.5) }}>{guide[site.index]}</text>}
          </g>;
        })}
        {boundaries.map(boundary => <g className="exon-schematic-splice" data-boundary={boundary.label} data-position={boundary.position} key={boundary.label}>
          <title>{`${boundary.label} · ${boundary.position}`}</title>
          <line className="exon-schematic-splice-boundary" x1={x(boundary.position)} x2={x(boundary.position)} y1="25" y2={guideY + 12} />
          <text className="exon-schematic-splice-label" x={x(boundary.position)} y="17" textAnchor="middle">{boundary.label}</text>
        </g>)}
        <text className="normal-schematic-strand-label target" x="12" y={targetY + 4}>{l("Target")}</text>
        <text className="normal-schematic-strand-label guide" x="12" y={guideY + 4}>arRNA</text>
        <text className="normal-schematic-direction" x={left - 14} y={targetY + 4} textAnchor="end">5′</text>
        <text className="normal-schematic-direction" x={right + 14} y={targetY + 4}>3′</text>
        <text className="normal-schematic-direction guide" x={left - 14} y={guideY + 4} textAnchor="end">3′</text>
        <text className="normal-schematic-direction guide" x={right + 14} y={guideY + 4}>5′</text>
      </svg>
    </div>
    <div className="normal-schematic-legend">
      {aSites.some(site => !site.mismatch) && <span><i className="site-dot" />{l("Other A sites")}</span>}
      {eseRegions.length > 0 && <span><i className="exon-ese-swatch" />{zh ? "预测 ESE" : "Predicted ESE"}</span>}
      {mismatchSites.length > 0 && <span><i className="exon-mismatch-swatch" />{mismatchLabel}</span>}
    </div>
  </section>;
}
