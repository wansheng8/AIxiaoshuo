"use strict";

const fs = require("fs");
const path = require("path");
const assert = require("assert");
const { scanRoutes } = require("./lib/route-scan");

const FIXTURE = path.resolve(__dirname, "fixtures/api-contract.json");
const baseline = JSON.parse(fs.readFileSync(FIXTURE, "utf8"));
const current = scanRoutes();

const added = current.filter((row) => !baseline.includes(row));
const missing = baseline.filter((row) => !current.includes(row));

if (added.length || missing.length) {
  if (added.length) console.error(`[api-contract] 新增未登记路由：\n  ${added.join("\n  ")}`);
  if (missing.length) console.error(`[api-contract] 丢失已登记路由：\n  ${missing.join("\n  ")}`);
  process.exit(1);
}

assert.strictEqual(current.length, baseline.length);
console.log(`api-contract-test: ${current.length}/${baseline.length} 通过`);
