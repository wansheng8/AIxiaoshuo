const fs = require("fs");
const path = require("path");

function parseEnv(text) {
  const out = {};
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  if (typeof process.loadEnvFile === "function") {
    process.loadEnvFile(file);
    return;
  }
  for (const [key, value] of Object.entries(parseEnv(fs.readFileSync(file, "utf8")))) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function loadEnv() {
  const root = path.resolve(__dirname, "../..");
  loadEnvFile(path.join(root, ".env"));
}

module.exports = { parseEnv, loadEnvFile, loadEnv };
