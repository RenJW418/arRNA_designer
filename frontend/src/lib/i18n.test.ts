import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_LANGUAGE,
  localizeText,
  normalizeLanguage,
  translate,
} from "./i18n.ts";

test("English is the stable default language", () => {
  assert.equal(DEFAULT_LANGUAGE, "en");
  assert.equal(normalizeLanguage(null), "en");
  assert.equal(normalizeLanguage("fr"), "en");
});

test("loaded example notices localize their title without changing scientific identifiers", () => {
  assert.equal(
    localizeText("zh-CN", "DMD exon 51 transcript example loaded"),
    "DMD exon 51 转录本示例 已加载",
  );
});

test("a stored Simplified Chinese choice is accepted", () => {
  assert.equal(normalizeLanguage("zh-CN"), "zh-CN");
});

test("translations support named interpolation", () => {
  assert.equal(
    translate("zh-CN", "design.position", { position: 104 }),
    "位置 104",
  );
});

test("scientific identifiers remain unchanged inside translated copy", () => {
  const copy = translate("zh-CN", "design.scientificTerms");
  for (const term of ["arRNA", "ADAR1/2", "SA", "ESE", "FASTA", "CSV", "JSON"]) {
    assert.match(copy, new RegExp(term.replace("/", "\\/")));
  }
});

test("dynamic design warnings localize without translating scientific terms", () => {
  assert.equal(
    localizeText("zh-CN", "SA candidate is 143 nt because the supplied flanking sequence is shorter than 151 nt."),
    "由于输入的 flank 短于 151 nt，SA candidate 长度为 143 nt。",
  );
  assert.equal(
    localizeText("zh-CN", "arRNA 5' side requires 6 paired nt; only 4 are available"),
    "arRNA 5′ 端需要 6 个配对 nt；当前仅有 4 个",
  );
});

test("the simplified task layout has complete Chinese navigation copy", () => {
  assert.equal(localizeText("zh-CN", "What would you like to do?"), "您想进行哪项操作？");
  assert.equal(localizeText("zh-CN", "Design progress"), "设计进度");
  assert.equal(localizeText("zh-CN", "Final arRNA sequence"), "最终 arRNA 序列");
  assert.equal(localizeText("zh-CN", "Citation"), "引用");
});
