import { useMemo } from "react";
import { ChevronDown, Plus, RotateCcw, Trash2 } from "lucide-react";
import { normalResultToDesign, type NormalEditingResult } from "../lib/api";
import { classifyEditingSites, type NormalDesignEnvironment, type NormalArrnaVariant } from "../lib/normalEditing";
import { buildCustomDesign, initialCustomStructures, type CustomStructure } from "../lib/customDesign";
import { createProposalAlignedGuide } from "../lib/bulgeOptimization";
import { useLanguage } from "./LanguageProvider";
import { DuplexPairingSchematic } from "./DuplexPairingSchematic";
import { WindowRangeSelector, type WindowRangeSelectorProps } from "./WindowRangeSelector";

interface Props {
  result: NormalEditingResult;
  variant: NormalArrnaVariant;
  structures: CustomStructure[] | null;
  onChange: (structures: CustomStructure[] | null) => void;
  environment?: NormalDesignEnvironment;
  windowSelection?: WindowRangeSelectorProps;
  windowResetRevision?: number;
}

// Nature Protocols final, Fig. 4a: positional categories, all three defaults are n/0.
const EXTERNAL_PRESETS = [
  { position: -31, size: 28, label: "Upstream −31 · 28/0", zh: "上游 −31 · 28/0" },
  { position: 34, size: 10, label: "Downstream +34 · 10/0", zh: "下游 +34 · 10/0" },
] as const;
const INTERNAL_PRESET = { position: 4, size: 1 };

export function CustomStructureEditor({ result, variant, structures, onChange, environment: draftEnvironment, windowSelection, windowResetRevision }: Props) {
  const { language } = useLanguage();
  const tx = (en: string, zh: string) => language === "en" ? en : zh;
  const environment = draftEnvironment ?? result.pairing.adar_environment;
  const sequence = windowSelection?.sequence ?? result.normalized_input.sequence;
  const targetPosition = windowSelection?.targetPosition ?? result.normalized_input.target_position;
  const bounded = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, Number.isFinite(value) ? Math.round(value) : 0));
  const first = windowSelection ? targetPosition + bounded(windowSelection.startRelative, 1 - targetPosition, 0) : result.window_start;
  const last = windowSelection ? targetPosition + bounded(windowSelection.endRelative, 0, sequence.length - targetPosition) : result.window_end;
  const targetWindow = windowSelection ? sequence.slice(first - 1, last) : result.target_window;
  const targetIndex = windowSelection ? targetPosition - first : result.target_index;
  const specs = useMemo(() => structures ?? initialCustomStructures(variant, environment), [structures, variant, environment]);
  const draft = useMemo(() => buildCustomDesign(targetWindow, targetIndex, environment, specs), [targetWindow, targetIndex, environment, specs]);
  const update = (id: string, patch: Partial<CustomStructure>) => onChange(specs.map((s) => s.id === id ? { ...s, ...patch } : s));
  const presetUnavailable = ({ position, size }: { position: number; size: number }) => {
    if (specs.some((s) => s.type === "deletion" && s.position === position && s.size === size)) return tx("Already added", "已添加");
    return buildCustomDesign(targetWindow, targetIndex, environment,
      [...specs, { id: "preset-preview", type: "deletion", position, size }]).errors.join(" ");
  };
  const addPreset = (preset: { position: number; size: number }) => {
    if (!presetUnavailable(preset)) onChange([...specs, { id: crypto.randomUUID(), type: "deletion", ...preset }]);
  };
  const internalUnavailable = presetUnavailable(INTERNAL_PRESET);
  const fullContext = Boolean(windowSelection);
  const design = useMemo(() => fullContext ? {
    targetPosition, targetWindow: sequence, arrnaSequence: "", windowStart: 1, windowEnd: sequence.length,
    targetIndex: targetPosition - 1, upstreamLength: targetPosition - 1, downstreamLength: sequence.length - targetPosition,
    hasFullFlanks: targetPosition > 75 && sequence.length - targetPosition >= 75,
  } : normalResultToDesign(result), [fullContext, result, sequence, targetPosition]);
  const sites = useMemo(() => classifyEditingSites(sequence, result.normalized_input.coding_context), [sequence, result.normalized_input.coding_context]);
  const previewVariant = useMemo(() => fullContext ? { ...variant, alignedGuide: createProposalAlignedGuide(sequence, targetPosition - 1) } : variant, [fullContext, variant, sequence, targetPosition]);
  return <section className={`custom-structure-editor sf-design-card${windowSelection ? " sf-combined-editor" : ""}`}>
    {windowSelection && <WindowRangeSelector key={windowResetRevision} {...windowSelection} embedded preview={{ design, sites, variant: previewVariant, structures: draft.bulges }} />}
    <div className={`sf-design-card-heading${windowSelection ? " sf-custom-fields-heading" : ""}`}>
      <h3>{tx("Custom structures", "自定义结构")}</h3>
      <button className="sf-card-reset" type="button" aria-label={tx("Reset custom structures", "重置自定义结构")} onClick={() => onChange(null)}><RotateCcw size={14} aria-hidden="true" />{tx("Reset", "重置")}</button>
    </div>
    <p className="sf-design-card-caption">{tx("Positions relative to A0.", "位置相对于 A0。")}</p>
    {!windowSelection && <div className="custom-pairing-panel">
      <DuplexPairingSchematic design={design} sites={sites} variant={variant} structures={draft.bulges} />
    </div>}
    <div className="sf-structure-rows">{specs.map((s, i) => <div className="sf-structure-row" key={s.id}>
      <label>{tx("Structure", "结构")} {i + 1}<select value={s.type} onChange={(e) => update(s.id, { type: e.target.value as CustomStructure["type"], bases: s.bases ?? "A" })}>
        <option value="deletion">n/0 · {tx("Target bulge", "靶链凸起")}</option><option value="insertion">0/n · {tx("arRNA bulge", "arRNA 凸起")}</option><option value="mismatch">n/n · {tx("Mismatch", "错配")}</option>
      </select></label>
      <label>{tx("Position", "位置")}<input type="number" step="1" value={Number.isFinite(s.position) ? s.position : ""} onChange={(e) => update(s.id, { position: e.target.value === "" ? NaN : Number(e.target.value) })} /></label>
      <label>{tx("Size", "长度")}<input type="number" min="1" max="50" step="1" value={Number.isFinite(s.size) ? s.size : ""} onChange={(e) => update(s.id, { size: e.target.value === "" ? NaN : Number(e.target.value) })} /></label>
      {s.type !== "deletion" && <label>{tx("arRNA bases · 3′→5′", "arRNA 碱基 · 3′→5′")}<input value={s.bases ?? ""} onChange={(e) => update(s.id, { bases: e.target.value.toUpperCase().replace(/T/g, "U") })} placeholder="ACGU" /></label>}
      <button className="sf-icon-button" type="button" onClick={() => onChange(specs.filter((v) => v.id !== s.id))} aria-label={tx(`Remove structure ${i + 1}`, `删除结构 ${i + 1}`)}><Trash2 size={17} /></button>
    </div>)}</div>
    <div className="sf-inline-actions sf-structure-add-actions">
      <details className="sf-external-presets" onKeyDown={(event) => {
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); event.currentTarget.open = false; event.currentTarget.querySelector("summary")?.focus(); }
      }}>
        <summary className="sf-text-button"><Plus size={14} aria-hidden="true" />{tx("External bulge", "外部凸起")}<ChevronDown size={13} aria-hidden="true" /></summary>
        <div className="sf-bulge-preset-options">
          {EXTERNAL_PRESETS.map((preset) => {
            const unavailable = presetUnavailable(preset);
            return <button type="button" key={preset.position} disabled={Boolean(unavailable)} title={unavailable || undefined} onClick={(event) => {
              addPreset({ position: preset.position, size: preset.size });
              const menu = event.currentTarget.closest("details");
              if (menu) { menu.open = false; menu.querySelector("summary")?.focus(); }
            }}>{tx(preset.label, preset.zh)}</button>;
          })}
        </div>
      </details>
      <button type="button" className="sf-text-button" disabled={Boolean(internalUnavailable)} title={internalUnavailable || "+4 · 1/0"} onClick={() => addPreset(INTERNAL_PRESET)}><Plus size={14} aria-hidden="true" />{tx("Internal bulge", "内部凸起")}</button>
    </div>
    {[...new Set(draft.errors)].map((v) => <p className="sf-error" role="alert" key={v}>{v}</p>)}
  </section>;
}
