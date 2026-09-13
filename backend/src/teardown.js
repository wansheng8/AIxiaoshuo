const fs = require("fs");
const path = require("path");
const { ROOT, uid, now } = require("./store");
const { parseManuscript, countWords } = require("./importers");
const { atomicWriteJson } = require("./fileio");
const { migrate, stamp } = require("./schema");

const TEARDOWN_DIR = path.join(ROOT, "data", "teardowns");
const DEFAULT_SCOPE = 30;

const TAB_FIELDS = [
  { id: "beats", field: "beats", label: "章节章纲" },
  { id: "cast", field: "cast", label: "角色档案" },
  { id: "golden", field: "golden", label: "黄金三章" },
  { id: "events", field: "events", label: "事件线" },
  { id: "outline", field: "outline", label: "整体大纲" },
  { id: "outline-detail", field: "outlineDetail", label: "详细大纲" },
  { id: "outline-fine", field: "outlineFine", label: "精细大纲" },
  { id: "imitate", field: "imitate", label: "仿写骨架" },
];

const SKILL_FIELD = {
  "teardown-beats": "beats",
  "teardown-cast": "cast",
  "teardown-golden": "golden",
  "teardown-events": "events",
  "teardown-outline": "outline",
  "teardown-detail": "outlineDetail",
  "teardown-fine": "outlineFine",
  "teardown-craft": "recipes",
  "teardown-imitate": "imitate",
};

function ensureTeardownDir() {
  fs.mkdirSync(TEARDOWN_DIR, { recursive: true });
}

function teardownPath(id) {
  const value = String(id || "");
  if (!/^td_[a-z0-9_]+$/i.test(value)) return "";
  const file = path.resolve(TEARDOWN_DIR, `${value}.json`);
  const root = path.resolve(TEARDOWN_DIR) + path.sep;
  if (!file.startsWith(root)) return "";
  return file;
}

function readJson(file, fallback) {
  try {
    const { doc } = migrate("teardown", JSON.parse(fs.readFileSync(file, "utf8")));
    return doc;
  } catch (err) {
    if (err && err.code !== "ENOENT") {
      console.warn(`[teardown] 读取失败 ${file}: ${err.message}`);
    }
    return fallback;
  }
}

function writeJson(file, data) {
  atomicWriteJson(file, stamp("teardown", data));
}

function countHeadingItems(text) {
  const matches = String(text || "").match(/^###\s+.+/gm);
  if (matches && matches.length) return matches.length;
  const bullets = String(text || "").match(/^[-*]\s+\S+/gm);
  return bullets ? bullets.length : String(text || "").trim() ? 1 : 0;
}

function countFineItems(text) {
  const lines = String(text || "")
    .split(/\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && (line.includes("｜") || line.includes("|")));
  return lines.length || countHeadingItems(text);
}

function tabCounts(row) {
  const scoped = scopedChapters(row);
  const beatDone = scoped.filter((ch) => String(ch.beat || "").trim()).length;
  return {
    beats: beatDone || (String(row.beats || "").trim() ? countHeadingItems(row.beats) : scoped.length),
    cast: countHeadingItems(row.cast),
    golden: countHeadingItems(row.golden),
    events: countHeadingItems(row.events),
    outline: countHeadingItems(row.outline),
    "outline-detail": countHeadingItems(row.outlineDetail),
    "outline-fine": countFineItems(row.outlineFine),
    imitate: countHeadingItems(row.imitate),
  };
}

function hydrate(raw) {
  if (!raw || !raw.id) return null;
  const chapters = Array.isArray(raw.chapters)
    ? raw.chapters.map((ch, index) => ({
        id: ch.id || uid("tc"),
        index: Number(ch.index) || index + 1,
        title: String(ch.title || ""),
        content: String(ch.content || ""),
        wordCount: Number(ch.wordCount) || countWords(ch.content),
        beat: String(ch.beat || ""),
      }))
    : [];
  const scopeEnd = Math.max(0, Math.min(Number(raw.scopeEnd) || Math.min(DEFAULT_SCOPE, chapters.length), chapters.length));
  return {
    id: raw.id,
    title: String(raw.title || "未命名拆书"),
    sourceName: String(raw.sourceName || ""),
    importedAt: String(raw.importedAt || ""),
    updatedAt: String(raw.updatedAt || now()),
    status: raw.status === "archived" ? "archived" : "active",
    scopeEnd,
    skillId: String(raw.skillId || ""),
    chapters,
    beats: String(raw.beats || ""),
    cast: String(raw.cast || ""),
    golden: String(raw.golden || ""),
    events: String(raw.events || ""),
    outline: String(raw.outline || ""),
    outlineDetail: String(raw.outlineDetail || ""),
    outlineFine: String(raw.outlineFine || ""),
    recipes: String(raw.recipes || ""),
    imitate: String(raw.imitate || ""),
    logs: Array.isArray(raw.logs) ? raw.logs.slice(0, 40) : [],
  };
}

function scopedChapters(row) {
  const end = Number(row.scopeEnd) || Math.min(DEFAULT_SCOPE, (row.chapters || []).length);
  return (row.chapters || []).filter((ch) => ch.index <= end);
}

function toCard(row) {
  const words = (row.chapters || []).reduce((sum, ch) => sum + (ch.wordCount || 0), 0);
  return {
    id: row.id,
    title: row.title,
    sourceName: row.sourceName,
    updatedAt: row.updatedAt,
    chapterCount: (row.chapters || []).length,
    scopeEnd: row.scopeEnd,
    wordCount: words,
    status: row.status,
    skillId: row.skillId || "",
    tabs: tabCounts(row),
  };
}

function listTeardowns(archived = false) {
  ensureTeardownDir();
  return fs
    .readdirSync(TEARDOWN_DIR)
    .filter((name) => name.endsWith(".json"))
    .map((name) => hydrate(readJson(path.join(TEARDOWN_DIR, name), null)))
    .filter(Boolean)
    .filter((row) => (archived ? row.status === "archived" : row.status !== "archived"))
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    .map(toCard);
}

function getTeardown(id) {
  const file = teardownPath(id);
  if (!file) return null;
  return hydrate(readJson(file, null));
}

function saveTeardown(row) {
  const current = hydrate(row);
  if (!current) {
    const error = new Error("拆书工程无效");
    error.status = 400;
    throw error;
  }
  current.updatedAt = now();
  writeJson(teardownPath(current.id), current);
  return current;
}

function createTeardown(input) {
  const row = hydrate({
    id: uid("td"),
    title: String(input.title || "").trim() || "未命名拆书",
    sourceName: "",
    importedAt: "",
    status: "active",
    scopeEnd: 0,
    chapters: [],
  });
  return saveTeardown(row);
}

function importTeardown(input) {
  const markdown = String(input.markdown || "").replace(/^\uFEFF/, "");
  if (countWords(markdown) < 500) {
    const error = new Error("正文不足 500 字，请粘贴或上传完整章节");
    error.status = 400;
    throw error;
  }
  const parsed = parseManuscript(markdown, { splitEmpty: true });
  const chapters = parsed.chapters.map((ch, index) => ({
    id: uid("tc"),
    index: index + 1,
    title: ch.title || `第${index + 1}节`,
    content: ch.content,
    wordCount: countWords(ch.content),
    beat: "",
  }));
  if (!chapters.length) {
    const error = new Error("没有切出章节，请换一份带「第N章」的正文");
    error.status = 400;
    throw error;
  }
  const existing = input.id ? getTeardown(input.id) : null;
  const row = hydrate({
    ...(existing || {}),
    id: existing?.id || uid("td"),
    title: String(input.title || "").trim() || existing?.title || parsed.title || "未命名拆书",
    sourceName: String(input.sourceName || existing?.sourceName || ""),
    importedAt: now(),
    status: "active",
    chapters,
    scopeEnd: Math.min(DEFAULT_SCOPE, chapters.length),
    beats: "",
    cast: "",
    golden: "",
    events: "",
    outline: "",
    outlineDetail: "",
    outlineFine: "",
    recipes: "",
    imitate: "",
  });
  return saveTeardown(row);
}

function patchTeardown(id, input) {
  const current = getTeardown(id);
  if (!current) return null;
  if (input.title !== undefined) current.title = String(input.title || "").trim() || current.title;
  if (input.scopeEnd !== undefined) {
    const n = Number(input.scopeEnd);
    current.scopeEnd = Math.max(1, Math.min(current.chapters.length, Number.isFinite(n) ? Math.round(n) : current.scopeEnd));
  }
  if (input.status === "archived" || input.status === "active") current.status = input.status;
  return saveTeardown(current);
}

function purgeTeardown(id) {
  const file = teardownPath(id);
  if (!file || !fs.existsSync(file)) return null;
  fs.unlinkSync(file);
  return true;
}

function parseBeatBlocks(output) {
  const text = String(output || "").trim();
  if (!text) return [];
  const chunks = text.split(/^###\s+/m).filter(Boolean);
  return chunks.map((chunk) => {
    const nl = chunk.indexOf("\n");
    const head = (nl >= 0 ? chunk.slice(0, nl) : chunk).trim();
    const body = (nl >= 0 ? chunk.slice(nl + 1) : "").trim();
    const num = head.match(/第\s*(\d+)\s*章/);
    return {
      index: num ? Number(num[1]) : 0,
      title: head.replace(/^第\s*\d+\s*章\s*/, "").trim(),
      body: `### ${head}\n${body}`.trim(),
    };
  });
}

function applyTeardownOutput(row, skill, output, extra = {}) {
  const next = hydrate(row);
  const field = SKILL_FIELD[skill.id];
  if (skill.id === "teardown-beats") {
    const blocks = parseBeatBlocks(output);
    for (const block of blocks) {
      const ch = next.chapters.find((item) => item.index === block.index);
      if (ch) ch.beat = block.body;
    }
    next.beats = next.chapters
      .filter((ch) => ch.beat)
      .map((ch) => ch.beat)
      .join("\n\n");
    if (!next.beats.trim()) next.beats = String(output || "").trim();
    return next;
  }
  if (skill.id === "teardown-fine") {
    const text = String(output || "").trim();
    const fromIndex = Number(extra && extra.fromIndex) || 0;
    if (fromIndex > 1 && next.outlineFine.trim()) {
      next.outlineFine = `${next.outlineFine.trim()}\n\n${text}`;
    } else {
      next.outlineFine = text;
    }
    return next;
  }
  if (field) next[field] = String(output || "").trim();
  return next;
}

function craftSkillId(teardownId) {
  return `tdcraft_${String(teardownId || "").replace(/^td_/, "")}`;
}

function withoutBodies(row) {
  if (!row) return null;
  return {
    ...row,
    chapters: (row.chapters || []).map((ch) => ({
      id: ch.id,
      index: ch.index,
      title: ch.title,
      wordCount: ch.wordCount,
      beat: ch.beat || "",
      content: "",
    })),
  };
}

function getTeardownChapter(id, chapterId) {
  const row = getTeardown(id);
  if (!row) return null;
  return (row.chapters || []).find((ch) => ch.id === chapterId) || null;
}

module.exports = {
  DEFAULT_SCOPE,
  TAB_FIELDS,
  SKILL_FIELD,
  listTeardowns,
  getTeardown,
  saveTeardown,
  createTeardown,
  importTeardown,
  patchTeardown,
  purgeTeardown,
  scopedChapters,
  applyTeardownOutput,
  craftSkillId,
  tabCounts,
  toCard,
  withoutBodies,
  getTeardownChapter,
};
