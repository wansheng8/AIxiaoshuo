const path = require("path");

const FILE = path.join(__dirname, "..", "..", "shared", "spark-dims.json");
const DIMS = require(FILE);

const KEYS = DIMS.map((dim) => dim.key);
const BY_KEY = Object.fromEntries(DIMS.map((dim) => [dim.key, dim]));
const MULTI_LIMIT = 3;

function dim(key) {
  return BY_KEY[key] || null;
}

function optionsFor(key) {
  const found = dim(key);
  return found ? found.options.slice() : [];
}

function isMultiple(key) {
  const found = dim(key);
  return Boolean(found && found.multiple);
}

function limitFor(key) {
  return isMultiple(key) ? MULTI_LIMIT : 1;
}

function optionBlock() {
  return DIMS.map((item) => `${item.key}（${item.multiple ? `可多选 1-${MULTI_LIMIT} 个` : "单选 1 个"}）：${item.options.join("、")}`).join("\n");
}

function normalizePicks(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const out = {};
  for (const key of KEYS) {
    const found = dim(key);
    const list = Array.isArray(src[key]) ? src[key] : [];
    const allowed = new Set(found.options);
    const values = [];
    for (const item of list) {
      const value = String(item || "").trim();
      if (!value || !allowed.has(value) || values.includes(value)) continue;
      values.push(value);
      if (values.length >= limitFor(key)) break;
    }
    if (values.length) out[key] = values;
  }
  return out;
}

module.exports = { DIMS, KEYS, MULTI_LIMIT, dim, optionsFor, isMultiple, limitFor, optionBlock, normalizePicks };
