"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const FIXTURE = path.resolve(__dirname, "fixtures/deps-lock.json");

function pick(file) {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, file), "utf8"));
  return {
    dependencies: pkg.dependencies || {},
    devDependencies: pkg.devDependencies || {},
  };
}

function snapshot() {
  return {
    backend: pick("backend/package.json"),
    frontend: pick("frontend/package.json"),
  };
}

function diff(label, base, cur) {
  const out = [];
  for (const section of ["dependencies", "devDependencies"]) {
    const keys = new Set([...Object.keys(base[section] || {}), ...Object.keys(cur[section] || {})]);
    for (const key of keys) {
      const a = (base[section] || {})[key];
      const b = (cur[section] || {})[key];
      if (a !== b) out.push(`${label}.${section}.${key}: ${a || "(无)"} -> ${b || "(无)"}`);
    }
  }
  return out;
}

const current = snapshot();

if (process.argv.includes("--write")) {
  fs.writeFileSync(FIXTURE, `${JSON.stringify(current, null, 2)}\n`);
  console.log("deps-lock-test: 基线已写入");
  process.exit(0);
}

const baseline = JSON.parse(fs.readFileSync(FIXTURE, "utf8"));
const changes = [...diff("backend", baseline.backend, current.backend), ...diff("frontend", baseline.frontend, current.frontend)];

if (changes.length) {
  console.error(`[deps-lock] 依赖清单发生变化：\n  ${changes.join("\n  ")}`);
  process.exit(1);
}

console.log("deps-lock-test: 依赖清单一致");
