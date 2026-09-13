const fs = require("fs");
const path = require("path");

const DEFAULT_KEEP = 10;

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function pruneBackups(dir, keep) {
  try {
    const files = fs
      .readdirSync(dir)
      .filter((name) => name.endsWith(".bak"))
      .sort();
    const extra = files.slice(0, Math.max(0, files.length - Math.max(1, keep)));
    for (const name of extra) fs.unlinkSync(path.join(dir, name));
  } catch {
    // 备份目录清理失败不影响主写入
  }
}

function snapshot(file, opts = {}) {
  try {
    if (!fs.existsSync(file)) return "";
    const backupsRoot = opts.backupsRoot || path.join(path.dirname(file), "backups");
    const dir = path.join(backupsRoot, path.basename(file, path.extname(file)));
    fs.mkdirSync(dir, { recursive: true });
    const target = path.join(dir, `${path.basename(file)}.${stamp()}.bak`);
    fs.copyFileSync(file, target);
    pruneBackups(dir, Number(opts.keep) > 0 ? Number(opts.keep) : DEFAULT_KEEP);
    return target;
  } catch {
    return "";
  }
}

function atomicWriteText(file, text, opts = {}) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now().toString(36)}.tmp`;
  fs.writeFileSync(tmp, text, "utf8");
  if (opts.backup) snapshot(file, opts);
  fs.renameSync(tmp, file);
  return file;
}

function atomicWriteJson(file, data, opts = {}) {
  const text = JSON.stringify(data, null, opts.pretty === false ? 0 : 2);
  return atomicWriteText(file, text, opts);
}

module.exports = { atomicWriteText, atomicWriteJson, snapshot, DEFAULT_KEEP };
