const fs = require("fs");
const path = require("path");
const { hydrateCraft, parseThreads, defaultCraft } = require("./craft");
const { hydrateLexicon } = require("./quality");
const { CATALOG, blankProvider, guessVendor, hydrateSettings, normalizeProvider, providerReady, vendorName } = require("./providers");
const { atomicWriteJson } = require("./fileio");
const { migrate, stamp } = require("./schema");

const ROOT = path.resolve(__dirname, "../..");
const DATA_DIR = path.join(ROOT, "data");
const NOVEL_DIR = path.join(DATA_DIR, "novels");
const CUSTOM_SKILL_DIR = path.join(DATA_DIR, "skills");
const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");

function ensureDirs() {
  for (const dir of [DATA_DIR, NOVEL_DIR, CUSTOM_SKILL_DIR]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function uid(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function now() {
  return new Date().toISOString();
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    if (err && err.code !== "ENOENT") {
      console.warn(`[store] 读取失败 ${file}: ${err.message}`);
    }
    return fallback;
  }
}

function writeJson(file, data, opts) {
  atomicWriteJson(file, data, opts);
}

const migratedFiles = new Set();

function readMigrated(file, kind, fallback) {
  const doc = readJson(file, fallback);
  if (!doc || typeof doc !== "object") return doc;
  const { doc: next, changed } = migrate(kind, doc);
  if (changed && file && !migratedFiles.has(file)) {
    migratedFiles.add(file);
    try {
      atomicWriteJson(file, next, { backup: true, keep: 3 });
    } catch (err) {
      console.warn(`[store] 迁移写回失败 ${file}: ${err.message}`);
    }
  }
  return next;
}

function listNovels() {
  ensureDirs();
  return fs
    .readdirSync(NOVEL_DIR)
    .filter((name) => name.endsWith(".json"))
    .map((name) => {
      const novel = readJson(path.join(NOVEL_DIR, name), null);
      if (!novel) return null;
      const words = (novel.chapters || []).reduce((sum, ch) => sum + (ch.wordCount || 0), 0);
      return {
        id: novel.id,
        title: novel.title,
        logline: novel.logline || "",
        genre: novel.genre || "",
        updatedAt: novel.updatedAt,
        chapterCount: (novel.chapters || []).length,
        wordCount: words,
        status: novel.status || "active",
      };
    })
    .filter(Boolean)
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

function listNovelCards(archived = false) {
  return listNovels().filter((item) =>
    archived ? item.status === "archived" : item.status !== "archived"
  );
}

function novelPath(id) {
  const value = String(id || "");
  if (!/^nv_[a-z0-9_]+$/i.test(value)) return "";
  const file = path.resolve(NOVEL_DIR, `${value}.json`);
  const root = path.resolve(NOVEL_DIR) + path.sep;
  if (!file.startsWith(root)) return "";
  return file;
}

function getNovel(id) {
  const file = novelPath(id);
  if (!file) return null;
  const novel = readMigrated(file, "novel", null);
  if (!novel || novel.status === "archived") return null;
  return hydrateNovel(novel);
}

function getNovelRaw(id) {
  const file = novelPath(id);
  if (!file) return null;
  const novel = readMigrated(file, "novel", null);
  if (!novel) return null;
  return hydrateNovel(novel);
}

function scrubBrokenMarkdown(text) {
  const s = String(text || "").trim();
  if (!s || /\[object Object\]/.test(s)) return "";
  return String(text || "");
}

function hydrateNovel(novel) {
  novel.world = scrubBrokenMarkdown(novel.world);
  novel.characters = scrubBrokenMarkdown(novel.characters);
  novel.outline = scrubBrokenMarkdown(novel.outline);
  novel.brief = scrubBrokenMarkdown(novel.brief);
  novel.props = novel.props || "";
  novel.rev = Number(novel.rev) > 0 ? Math.round(Number(novel.rev)) : 1;
  novel.media = novel.media || {};
  novel.history = Array.isArray(novel.history) ? novel.history : [];
  novel.lexicon = hydrateLexicon(novel.lexicon);
  novel.chapters = Array.isArray(novel.chapters)
    ? [...novel.chapters].sort((a, b) => (Number(a.index) || 0) - (Number(b.index) || 0))
    : [];
  recoverEmptyProse(novel);
  return hydrateCraft(novel);
}

function recoverEmptyProse(novel) {
  const logs = Array.isArray(novel.logs) ? novel.logs : [];
  const history = Array.isArray(novel.history) ? novel.history : [];
  novel.chapters = (novel.chapters || []).map((ch) => {
    if (String(ch.content || "").trim()) return ch;
    const log = logs.find(
      (row) =>
        row.chapterId === ch.id &&
        row.skillId === "chapter-prose" &&
        (row.status === "success" || row.status === "stopped") &&
        Number(row.outputChars) >= 80
    );
    if (!log) return ch;
    const sized = history.find((row) => {
      if (row.skillId !== "chapter-prose") return false;
      const n = Array.from(String(row.output || "").replace(/\s+/g, "")).length;
      return n >= 80 && Math.abs(n - Number(log.outputChars)) <= 80;
    });
    const hit =
      sized ||
      history.find((row) => row.skillId === "chapter-prose" && String(row.output || "").trim().length >= 80);
    if (!hit) return ch;
    const content = String(hit.output || "")
      .replace(/^\uFEFF/, "")
      .replace(/^(?:#{1,6}\s*)?(第[零一二三四五六七八九十百\d]+章[^\n]*\n+)+/u, "")
      .trim();
    return { ...ch, content, wordCount: Array.from(content.replace(/\s+/g, "")).length };
  });
}

function createNovel({ title, genre, logline, brief, world, characters, outline, chapterTitle, style, theme, pov, threads, craft }) {
  ensureDirs();
  const created = now();
  const threadList = Array.isArray(threads) ? threads : parseThreads(threads);
  const novel = {
    id: uid("nv"),
    title: String(title || "").trim() || "未命名稿本",
    logline: String(logline || "").trim(),
    genre: String(genre || "").trim() || "长篇小说",
    status: "active",
    createdAt: created,
    updatedAt: created,
    brief: String(brief || "").trim(),
    world: String(world || "").trim(),
    characters: String(characters || "").trim(),
    outline: String(outline || "").trim(),
    props: "",
    media: {},
    history: [],
    style: String(style || "").trim(),
    theme: String(theme || "").trim(),
    pov: String(pov || "").trim() || "第三人称有限",
    threads: threadList,
    craft: { ...defaultCraft(), ...(craft && typeof craft === "object" ? craft : {}) },
    lexicon: { keep: [], map: [] },
    chapters: [
      {
        id: uid("ch"),
        index: 1,
        title: String(chapterTitle || "").trim(),
        beats: "",
        content: "",
        wordCount: 0,
        updatedAt: created,
      },
    ],
    logs: [],
  };
  const ready = stamp("novel", hydrateNovel(novel));
  writeJson(novelPath(ready.id), ready);
  return ready;
}

function saveNovel(novel, opts = {}) {
  const ready = hydrateNovel({ ...novel });
  const file = novelPath(ready.id);
  if (!file) throw Object.assign(new Error("无效的小说工程 id"), { status: 400 });
  const stored = readJson(file, null);
  const storedRev = Number(stored && stored.rev) > 0 ? Math.round(Number(stored.rev)) : 0;
  const expected = opts.expectedRev == null ? null : Number(opts.expectedRev);
  if (expected != null && Number.isFinite(expected) && storedRev > 0 && expected !== storedRev) {
    const conflictDir = path.join(DATA_DIR, "conflicts");
    fs.mkdirSync(conflictDir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    try {
      fs.copyFileSync(file, path.join(conflictDir, `${ready.id}.server-${ts}.json`));
    } catch (err) {
      console.warn(`[store] 冲突副本(服务端)写入失败: ${err.message}`);
    }
    atomicWriteJson(path.join(conflictDir, `${ready.id}.incoming-${ts}.json`), ready);
    const error = new Error(`检测到另一处改动（服务端版本 ${storedRev}，你的版本 ${expected}）。两份内容已存到 data/conflicts，请刷新页面后重试`);
    error.status = 409;
    error.conflict = true;
    error.currentRev = storedRev;
    throw error;
  }
  const base = Math.max(storedRev, Number(ready.rev) || 0);
  ready.rev = base + 1;
  ready.updatedAt = now();
  const next = stamp("novel", ready);
  writeJson(file, next);
  return next;
}

function archiveNovel(id) {
  const file = novelPath(id);
  if (!file) return null;
  const novel = readJson(file, null);
  if (!novel) return null;
  novel.status = "archived";
  novel.rev = (Number(novel.rev) > 0 ? Math.round(Number(novel.rev)) : 0) + 1;
  novel.updatedAt = now();
  writeJson(file, stamp("novel", novel));
  return true;
}

function restoreNovel(id) {
  const novel = getNovelRaw(id);
  if (!novel) return null;
  novel.status = "active";
  return saveNovel(novel);
}

function duplicateNovel(id) {
  const src = getNovelRaw(id);
  if (!src) return null;
  const created = now();
  const novel = {
    ...src,
    id: uid("nv"),
    title: `${String(src.title || "未命名稿本").trim()} 副本`,
    status: "active",
    rev: 1,
    createdAt: created,
    updatedAt: created,
    media: { ...(src.media || {}) },
    history: [],
    logs: [],
    chapters: (src.chapters || []).map((ch, index) => ({
      ...ch,
      id: uid("ch"),
      index: index + 1,
      updatedAt: created,
    })),
  };
  writeJson(novelPath(novel.id), novel);
  return novel;
}

function purgeNovel(id) {
  const file = novelPath(id);
  if (!file || !fs.existsSync(file)) return null;
  fs.unlinkSync(file);
  return true;
}

function maskKey(key) {
  const value = String(key || "");
  if (!value) return "";
  if (value.length <= 4) return "••••";
  return `••••${value.slice(-4)}`;
}

function getSettings() {
  ensureDirs();
  const file = readMigrated(SETTINGS_FILE, "settings", {});
  const state = hydrateSettings(file, uid);
  const active = state.providers.find((row) => row.id === state.activeId) || state.providers[0] || blankProvider();
  return {
    ...active,
    activeId: state.activeId,
    providers: state.providers,
  };
}

function publicSettings() {
  const settings = getSettings();
  return {
    protocol: settings.protocol,
    baseUrl: settings.baseUrl,
    model: settings.model,
    apiKeyMasked: maskKey(settings.apiKey),
    note: settings.note,
    contextLength: settings.contextLength,
    maxTokens: settings.maxTokens,
    temperature: settings.temperature,
    thinking: settings.thinking,
    retryAttempts: settings.retryAttempts,
    retryBaseMs: settings.retryBaseMs,
    retryMaxMs: settings.retryMaxMs,
    configured: providerReady(settings),
    activeId: settings.activeId,
    providers: settings.providers.map((row) => ({
      id: row.id,
      vendor: row.vendor,
      name: row.name,
      protocol: row.protocol,
      baseUrl: row.baseUrl,
      model: row.model,
      apiKeyMasked: maskKey(row.apiKey),
      note: row.note,
      contextLength: row.contextLength,
      maxTokens: row.maxTokens,
      temperature: row.temperature,
      thinking: row.thinking,
      retryAttempts: row.retryAttempts,
      retryBaseMs: row.retryBaseMs,
      retryMaxMs: row.retryMaxMs,
      models: row.models || [],
    })),
    catalog: CATALOG,
  };
}

function saveSettings(input) {
  ensureDirs();
  const current = getSettings();
  let body = input && typeof input === "object" ? input : {};
  let providers;
  if (Array.isArray(body.providers)) {
    const idMap = {};
    providers = body.providers.map((row) => {
      const prev = current.providers.find((item) => item.id === row.id);
      const rawId = String((row && row.id) || "").trim();
      const id = !rawId || rawId.startsWith("tmp_") ? uid("pv") : rawId;
      if (rawId) idMap[rawId] = id;
      return normalizeProvider(
        { ...row, id },
        prev ? prev.apiKey : "",
        prev
      );
    });
    const mappedActive = String(body.activeId || current.activeId || "").trim();
    body = { ...body, activeId: idMap[mappedActive] || mappedActive };
  } else if (!current.providers.length) {
    const vendor = guessVendor(body.baseUrl || current.baseUrl);
    providers = [
      normalizeProvider(
        {
          id: uid("pv"),
          vendor,
          name: vendorName(vendor, body.note || current.note),
          protocol: body.protocol || current.protocol,
          baseUrl: body.baseUrl ?? current.baseUrl,
          model: body.model ?? current.model,
          apiKey: body.apiKey || current.apiKey,
          note: body.note ?? current.note,
          contextLength: body.contextLength ?? current.contextLength,
          maxTokens: body.maxTokens ?? current.maxTokens,
          temperature: body.temperature ?? current.temperature,
          thinking: body.thinking == null ? current.thinking : body.thinking,
          retryAttempts: body.retryAttempts ?? current.retryAttempts,
          retryBaseMs: body.retryBaseMs ?? current.retryBaseMs,
          retryMaxMs: body.retryMaxMs ?? current.retryMaxMs,
        }
      ),
    ];
  } else {
    providers = current.providers.map((row) => {
      if (row.id !== current.activeId) return row;
      return normalizeProvider(
        {
          ...row,
          protocol: body.protocol ?? row.protocol,
          baseUrl: body.baseUrl ?? row.baseUrl,
          model: body.model ?? row.model,
          note: body.note ?? row.note,
          contextLength: body.contextLength ?? row.contextLength,
          maxTokens: body.maxTokens ?? row.maxTokens,
          temperature: body.temperature ?? row.temperature,
          thinking: body.thinking == null ? row.thinking : body.thinking,
          retryAttempts: body.retryAttempts ?? row.retryAttempts,
          retryBaseMs: body.retryBaseMs ?? row.retryBaseMs,
          retryMaxMs: body.retryMaxMs ?? row.retryMaxMs,
        },
        body.apiKey || row.apiKey,
        row
      );
    });
  }
  let activeId = String(body.activeId || current.activeId || "").trim();
  if (!providers.some((row) => row.id === activeId)) {
    activeId = providers[0] ? providers[0].id : "";
  }
  writeJson(SETTINGS_FILE, stamp("settings", { activeId, providers }), { backup: true, keep: 10 });
  return publicSettings();
}

module.exports = {
  ROOT,
  CUSTOM_SKILL_DIR,
  uid,
  now,
  ensureDirs,
  listNovels,
  listNovelCards,
  getNovel,
  getNovelRaw,
  createNovel,
  saveNovel,
  archiveNovel,
  restoreNovel,
  duplicateNovel,
  purgeNovel,
  getSettings,
  publicSettings,
  saveSettings,
};
