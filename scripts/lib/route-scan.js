"use strict";

const fs = require("fs");
const path = require("path");

const BACKEND_SRC = path.resolve(__dirname, "../../backend/src");
const METHODS = "get|post|put|delete|patch";

function readIfExists(file) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

function joinPath(mount, sub) {
  const base = String(mount || "").replace(/\/+$/, "");
  const tail = String(sub || "");
  if (!tail || tail === "/") return base || "/";
  return `${base}${tail.startsWith("/") ? tail : `/${tail}`}`;
}

function collect(pattern, text) {
  const out = [];
  const re = new RegExp(pattern, "g");
  let match;
  while ((match = re.exec(text))) out.push([match[1].toUpperCase(), match[2]]);
  return out;
}

function scanRoutes(srcDir = BACKEND_SRC) {
  const indexFile = path.join(srcDir, "index.js");
  const index = readIfExists(indexFile);
  const rows = new Set();

  for (const [method, route] of collect(`app\\.(${METHODS})\\(\\s*"([^"]+)"`, index)) {
    if (route === "*" || route.includes("*")) continue;
    rows.add(`${method} ${route}`);
  }

  const collectRouter = (base, file) => {
    const text = readIfExists(path.join(srcDir, "routes", `${file}.js`));
    for (const [method, route] of collect(`router\\.(${METHODS})\\(\\s*"([^"]+)"`, text)) {
      if (route.includes("*")) continue;
      rows.add(`${method} ${joinPath(base, route)}`);
    }
  };

  const mountRe = new RegExp(
    `app\\.use\\(\\s*"([^"]+)"\\s*,\\s*require\\(\\s*"\\./routes/([^"]+)"\\s*\\)`,
    "g"
  );
  let mount;
  while ((mount = mountRe.exec(index))) {
    collectRouter(mount[1], mount[2]);
  }

  const bindings = new Map();
  const bindRe = /const\s+([A-Za-z_$][\w$]*)\s*=\s*require\(\s*"\.\/routes\/([^"]+)"\s*\)/g;
  let bind;
  while ((bind = bindRe.exec(index))) bindings.set(bind[1], bind[2]);

  const varMountRe = /app\.use\(\s*"([^"]+)"\s*,\s*([A-Za-z_$][\w$]*)\s*\)/g;
  while ((mount = varMountRe.exec(index))) {
    const file = bindings.get(mount[2]);
    if (file) collectRouter(mount[1], file);
  }

  return [...rows].sort();
}

module.exports = { scanRoutes, BACKEND_SRC };

if (require.main === module) {
  process.stdout.write(`${JSON.stringify(scanRoutes(), null, 2)}\n`);
}
