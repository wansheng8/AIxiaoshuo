#!/usr/bin/env node
// CSS 拆分守卫：入口 @import 顺序 + 拼接规则序列与基线一致（含 R19/R20 修复点白名单）。

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STYLES = path.join(ROOT, "frontend/src/styles");
const ENTRY = path.join(STYLES, "index.css");
const BASELINE = path.join(ROOT, "scripts/fixtures/styles-baseline.css");

const EXPECTED = [
  "00-tokens", "01-shell", "02-picker", "03-workspace", "04-stage-rail", "05-stage",
  "06-controls-assets", "07-reader", "08-inspector-craft", "09-home", "10-skills",
  "11-history-bind", "12-board-review", "13-studio-responsive", "14-teardown",
  "15-voice-import", "16-prompt-preview",
];

const fails = [];
const fail = (msg) => fails.push(msg);

function parseRules(text) {
  const rules = [];
  let i = 0;
  let depth = 0;
  let cursor = 0;
  while (i < text.length) {
    if (text.startsWith("/*", i)) {
      const j = text.indexOf("*/", i + 2);
      i = j < 0 ? text.length : j + 2;
      continue;
    }
    const c = text[i];
    if (c === '"' || c === "'") {
      const q = c;
      let j = i + 1;
      while (j < text.length) {
        if (text[j] === "\\") { j += 2; continue; }
        if (text[j] === q) { j += 1; break; }
        j += 1;
      }
      i = j;
      continue;
    }
    if (c === "{") {
      depth += 1;
    } else if (c === "}") {
      depth -= 1;
      if (depth === 0) {
        rules.push(text.slice(cursor, i + 1));
        cursor = i + 1;
      }
    }
    i += 1;
  }
  return rules;
}

const normalize = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ").trim();
const selectorOf = (rule) => normalize(rule.slice(0, rule.indexOf("{")));

function stripNested(rule, selector) {
  const sel = selectorOf(rule);
  if (!sel.startsWith("@")) return rule;
  const open = rule.indexOf("{");
  const close = rule.lastIndexOf("}");
  const inner = rule.slice(open + 1, close);
  const nested = parseRules(inner);
  if (!nested.some((r) => selectorOf(r) === selector)) return rule;
  const kept = nested.filter((r) => selectorOf(r) !== selector);
  return rule.slice(0, open + 1) + kept.join("\n") + "\n" + rule.slice(close);
}

const ORPHAN_TRIO = ".trio { grid-template-columns: 1fr; }";

// 1. 入口文件必须只含按序 @import
if (!fs.existsSync(ENTRY)) {
  fail("缺少样式入口 frontend/src/styles/index.css");
} else {
  const entry = fs.readFileSync(ENTRY, "utf8");
  const imports = [...entry.matchAll(/@import\s+"\.\/([^"]+)\.css"\s*;/g)].map((m) => m[1]);
  const stripped = normalize(entry.replace(/@import\s+"[^"]+"\s*;/g, ""));
  if (stripped) fail("styles/index.css 除 @import 外还包含其他规则");
  if (imports.join(",") !== EXPECTED.join(",")) {
    fail(`styles/index.css 的 @import 顺序与设计不一致：${imports.join(" ")}`);
  }
}

// 2. 单文件行数预算（R21）
for (const name of EXPECTED) {
  const file = path.join(STYLES, `${name}.css`);
  if (!fs.existsSync(file)) { fail(`缺少样式文件 ${name}.css`); continue; }
  const lines = fs.readFileSync(file, "utf8").split("\n").length;
  if (lines > 500) fail(`${name}.css 共 ${lines} 行，超出 500 行上限`);
}

// 3. 拼接结果与基线一致（R18），扣除显式修复点
if (fs.existsSync(BASELINE)) {
  const concat = EXPECTED.map((n) => fs.readFileSync(path.join(STYLES, `${n}.css`), "utf8")).join("");
  const baseline = fs.readFileSync(BASELINE, "utf8");

  const baselineRules = parseRules(baseline)
    .filter((r) => selectorOf(r) !== ":root" && normalize(r) !== ORPHAN_TRIO)
    .map(normalize);
  const concatRules = parseRules(concat)
    .map((r) => stripNested(r, ".trio"))
    .filter((r) => selectorOf(r) !== ":root")
    .map(normalize);

  const n = Math.max(baselineRules.length, concatRules.length);
  let diff = 0;
  for (let i = 0; i < n; i += 1) {
    if (baselineRules[i] === concatRules[i]) continue;
    diff += 1;
    if (diff <= 5) {
      fail(`CSS 拼接与基线不一致（第 ${i + 1} 条规则）\n  基线：${baselineRules[i] ?? "<无>"}\n  拼接：${concatRules[i] ?? "<无>"}`);
    }
  }
  if (diff > 5) fail(`CSS 拼接与基线共有 ${diff} 条规则不一致`);

  // R19：token 定义
  const rootRule = parseRules(concat).find((r) => selectorOf(r) === ":root");
  if (!rootRule) fail("未找到 :root token 定义");
  else {
    for (const token of ["--fg", "--accent", "--bg-soft", "--dim"]) {
      if (!new RegExp(`${token}\\s*:`).test(rootRule)) fail(`:root 缺少变量定义 ${token}`);
    }
  }

  // R20：.trio 归位到 960 媒体块
  const trios = parseRules(concat).filter((r) => selectorOf(r) === ".trio");
  if (trios.length !== 1) fail(`.trio 顶层规则应恰好 1 条，实为 ${trios.length} 条`);
  const in960 = parseRules(concat)
    .filter((r) => selectorOf(r) === "@media (max-width: 960px)")
    .some((r) => parseRules(r.slice(r.indexOf("{") + 1, r.lastIndexOf("}"))).some((x) => selectorOf(x) === ".trio"));
  if (!in960) fail(".trio 规则未归位到 @media (max-width: 960px) 块内");
} else {
  fail("缺少基线 scripts/fixtures/styles-baseline.css");
}

if (fails.length) {
  for (const line of fails) console.error(`✗ ${line}`);
  console.error(`css-order-test: ${fails.length} 项失败`);
  process.exit(1);
}
console.log("css-order-test: 全部通过");
