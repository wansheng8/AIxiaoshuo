#!/usr/bin/env node
// 架构守卫：行数预算 / 层依赖方向 / 存储键收敛 / 映射单源
// 默认报告模式（退出码 0），传 --strict 时存在违规即退出 1。

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STRICT = process.argv.includes("--strict");
const violations = [];
const notes = [];

function walk(dir, out = []) {
  let rows = [];
  try {
    rows = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const row of rows) {
    const full = path.join(dir, row.name);
    if (row.isDirectory()) {
      if (row.name === "node_modules" || row.name === "dist") continue;
      walk(full, out);
    } else {
      out.push(full);
    }
  }
  return out;
}

const rel = (file) => path.relative(ROOT, file).split(path.sep).join("/");
const lineCount = (file) => fs.readFileSync(file, "utf8").split("\n").length;

function find(pattern, text) {
  const re = new RegExp(pattern, "g");
  const out = [];
  let m;
  while ((m = re.exec(text))) out.push(m[1]);
  return out;
}

// 1. 行数预算
const BUDGETS = [
  { label: "Studio.tsx", match: (r) => r.endsWith("Studio.tsx"), max: 400 },
  { label: "backend/src/index.js", match: (r) => r === "backend/src/index.js", max: 200 },
  { label: "backend/src/routes/*", match: (r) => r.startsWith("backend/src/routes/"), max: 300 },
  { label: "backend/src/skills/*", match: (r) => r.startsWith("backend/src/skills/"), max: 400 },
  { label: "frontend styles/*", match: (r) => r.startsWith("frontend/src/styles/") && !r.endsWith("index.css"), max: 500 },
];

const sourceFiles = [
  ...walk(path.join(ROOT, "frontend/src")),
  ...walk(path.join(ROOT, "backend/src")),
  ...walk(path.join(ROOT, "scripts")),
].filter((f) => /\.(ts|tsx|js|mjs|css)$/.test(f));

for (const file of sourceFiles) {
  const r = rel(file);
  for (const budget of BUDGETS) {
    if (!budget.match(r)) continue;
    const lines = lineCount(file);
    if (lines > budget.max) violations.push(`行数预算：${r} 共 ${lines} 行，超出上限 ${budget.max}（${budget.label}）`);
  }
}

// 2. 前端层依赖方向
const FE = path.join(ROOT, "frontend/src");
function feLayer(file) {
  const r = rel(file);
  if (r.startsWith("frontend/src/domain/")) return "domain";
  if (r.startsWith("frontend/src/data/")) return "data";
  if (r.startsWith("frontend/src/components/") || r.startsWith("frontend/src/pages/")) return "ui";
  if (r.startsWith("frontend/src/styles/")) return "ui";
  return "root";
}

function resolveRel(from, spec) {
  return path.resolve(path.dirname(from), spec).split(path.sep).join("/");
}

for (const file of walk(FE).filter((f) => /\.(ts|tsx)$/.test(f))) {
  const layer = feLayer(file);
  if (layer !== "domain" && layer !== "data") continue;
  const text = fs.readFileSync(file, "utf8");
  const specs = [...find('from\\s+"([^"]+)"', text), ...find('import\\s+"([^"]+)"', text)];
  for (const spec of specs) {
    const r = rel(file);
    if (layer === "domain") {
      if (/^(react|react-dom|react-router-dom)$/.test(spec)) {
        violations.push(`层方向：domain 模块 ${r} 导入了 React 运行库 ${spec}`);
        continue;
      }
      if (!spec.startsWith(".")) continue;
      const target = resolveRel(file, spec);
      const targetLayer = target.startsWith(`${FE}/domain/`) ? "domain" : target.startsWith(`${FE}/data/`) ? "data" : "ui";
      if (targetLayer !== "domain") {
        violations.push(`层方向：domain 模块 ${r} 反向依赖 ${targetLayer} 层（${spec}）`);
      }
    }
    if (layer === "data" && spec.startsWith(".")) {
      const target = resolveRel(file, spec);
      if (target.startsWith(`${FE}/components/`) || target.startsWith(`${FE}/pages/`)) {
        violations.push(`层方向：data 模块 ${r} 反向依赖 ui 层（${spec}）`);
      }
    }
  }
}

// 3. 后端层依赖方向
const BE = path.join(ROOT, "backend/src");
const BE_DOMAIN = new Set([
  "store.js", "pipeline.js", "prompt.js", "apply.js", "context.js", "quality.js", "craft.js",
  "imitate.js", "genre.js", "beats.js", "review.js", "aigc.js", "baseline.js", "emotion.js",
  "providers.js", "llm.js", "env.js", "fileio.js", "schema.js", "importers.js", "elements.js",
  "teardown.js", "teardown-context.js", "spark-deck.js", "spark-dims.js",
]);

for (const file of walk(BE).filter((f) => f.endsWith(".js"))) {
  const r = rel(file);
  const text = fs.readFileSync(file, "utf8");
  const reqs = find('require\\(\\s*"([^"]+)"', text);
  if (r.startsWith("backend/src/routes/")) {
    for (const req of reqs) {
      if (req === "../index" || req === "./index") violations.push(`层方向：路由 ${r} 反向依赖装配层（${req}）`);
    }
  }
  if (r.startsWith("backend/src/services/")) {
    for (const req of reqs) {
      if (req.includes("routes")) violations.push(`层方向：服务 ${r} 反向依赖路由层（${req}）`);
    }
  }
  if (r === "backend/src/index.js" || r.startsWith("backend/src/skills/")) continue;
  if (BE_DOMAIN.has(path.basename(file))) {
    for (const req of reqs) {
      if (req.includes("routes") || req.includes("services")) {
        violations.push(`层方向：领域模块 ${r} 反向依赖上层（${req}）`);
      }
    }
  }
}

// 4. 存储键收敛
const STORAGE_ALLOW = "frontend/src/data/storage.ts";
for (const file of walk(FE).filter((f) => /\.(ts|tsx)$/.test(f))) {
  const r = rel(file);
  if (r === STORAGE_ALLOW) continue;
  const text = fs.readFileSync(file, "utf8");
  if (/["'`]moshu\./.test(text)) {
    violations.push(`存储键：${r} 直接书写了 moshu.* 字符串键，应改用 data/storage.ts 常量`);
  }
}

// 5. 映射单源
const TABS_ALLOW = ["frontend/src/domain/pipeline.ts", "frontend/src/pages/studio/studio-tabs.ts"];
for (const file of walk(FE).filter((f) => /\.(ts|tsx)$/.test(f))) {
  const r = rel(file);
  if (TABS_ALLOW.includes(r)) continue;
  const text = fs.readFileSync(file, "utf8");
  if (/const\s+(TABS|RAIL_EXTRAS)\s*[:=]/.test(text)) {
    violations.push(`映射单源：${r} 重复声明了阶段/页签清单（TABS/RAIL_EXTRAS）`);
  }
}

// 6. 阶段清单散落提示（仅提示，不判违规）
for (const file of walk(FE).filter((f) => /\.(ts|tsx)$/.test(f))) {
  const r = rel(file);
  if (r.startsWith("frontend/src/domain/") || r.startsWith("frontend/src/pages/studio/studio-tabs.ts")) continue;
  const text = fs.readFileSync(file, "utf8");
  const ids = ["beats", "outline", "polish", "review"].filter((id) => new RegExp(`"${id}"`).test(text));
  if (ids.length >= 3) notes.push(`映射提示：${r} 内出现多个阶段 id 字面量（${ids.join(", ")}），确认是否应改为派生`);
}

for (const line of violations) console.error(`✗ ${line}`);
for (const line of notes) console.warn(`· ${line}`);

if (violations.length) {
  console.error(`architecture-test: ${violations.length} 项违规${STRICT ? "" : "（报告模式）"}`);
  if (STRICT) process.exit(1);
} else {
  console.log("architecture-test: 全部通过");
}
