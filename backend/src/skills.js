const fs = require("fs");
const path = require("path");
const { ROOT, CUSTOM_SKILL_DIR, ensureDirs, uid, now } = require("./store");
const { defaultElementIds } = require("./elements");

const BUILTIN_DIR = path.join(ROOT, "skills", "builtin");

function parseElementsMeta(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeElements(input) {
  if (input === undefined) return undefined;
  if (input === null) return [];
  if (Array.isArray(input)) return input.map((item) => String(item).trim()).filter(Boolean);
  return parseElementsMeta(input);
}

const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;

function assertSafeId(id) {
  const value = String(id == null ? "" : id).trim();
  if (!SAFE_ID.test(value)) {
    const error = new Error("非法 ID");
    error.status = 400;
    throw error;
  }
  return value;
}

function safeJoin(dir, id, ext) {
  const file = path.join(dir, `${assertSafeId(id)}${ext}`);
  const base = path.resolve(dir) + path.sep;
  if (!path.resolve(file).startsWith(base)) {
    const error = new Error("非法路径");
    error.status = 400;
    throw error;
  }
  return file;
}

function oneLine(value) {
  return String(value == null ? "" : value)
    .replace(/[\r\n]+/g, " ")
    .trim();
}

function parseFrontMatter(raw) {
  const match = String(raw).match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) {
    return { meta: {}, body: String(raw).trim() };
  }
  const meta = {};
  for (const line of match[1].split("\n")) {
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (value === "true") meta[key] = true;
    else if (value === "false") meta[key] = false;
    else meta[key] = value;
  }
  return { meta, body: match[2].trim() };
}

function toSkill(id, raw, source) {
  const { meta, body } = parseFrontMatter(raw);
  const metaId = oneLine(meta.id);
  return {
    id: SAFE_ID.test(metaId) ? metaId : id,
    name: meta.name || id,
    scene: meta.scene || "",
    target: meta.target || "content",
    order: Number(meta.order || 99),
    enabled: meta.enabled !== false,
    source,
    body,
    raw,
    updatedAt: meta.updatedAt || "",
    inject: String(meta.inject || "").trim(),
    elements: Object.prototype.hasOwnProperty.call(meta, "elements")
      ? parseElementsMeta(meta.elements)
      : undefined,
    tags: parseElementsMeta(meta.tags),
    whenFlow: parseElementsMeta(meta.whenFlow),
    whenPlatform: parseElementsMeta(meta.whenPlatform),
    whenVoice: String(meta.whenVoice || "").trim(),
  };
}

function conditionPass(skill, ctx = {}) {
  const flow = String(ctx.flow || "");
  const platform = String(ctx.platform || "");
  const voiceActive = Boolean(ctx.voiceActive);
  if (Array.isArray(skill.whenFlow) && skill.whenFlow.length && !skill.whenFlow.includes(flow)) return false;
  if (Array.isArray(skill.whenPlatform) && skill.whenPlatform.length && !skill.whenPlatform.includes(platform)) return false;
  if (skill.whenVoice === "active" && !voiceActive) return false;
  if (skill.whenVoice === "off" && voiceActive) return false;
  return true;
}

function readDirSkills(dir, source) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".md"))
    .map((name) => {
      const id = path.basename(name, ".md").replace(/^\d+-/, "");
      const raw = fs.readFileSync(path.join(dir, name), "utf8");
      return toSkill(id, raw, source);
    });
}

function listSkills() {
  ensureDirs();
  const builtin = readDirSkills(BUILTIN_DIR, "builtin");
  const custom = readDirSkills(CUSTOM_SKILL_DIR, "custom");
  const customById = new Map(custom.map((skill) => [skill.id, skill]));
  const seen = new Set();
  const out = [];
  for (const skill of builtin) {
    const over = customById.get(skill.id);
    if (over) {
      const body = String(over.body || "").trim();
      const factory = String(skill.body || "").trim();
      out.push({
        ...skill,
        body: body || skill.body,
        raw: over.raw,
        updatedAt: over.updatedAt || skill.updatedAt,
        enabled: over.enabled !== false,
        order: Number(over.order) || skill.order,
        upgraded: Boolean(body) && body !== factory,
        elements: over.elements !== undefined ? over.elements : skill.elements,
        tags: over.tags && over.tags.length ? over.tags : skill.tags,
        whenFlow: over.whenFlow && over.whenFlow.length ? over.whenFlow : skill.whenFlow,
        whenPlatform: over.whenPlatform && over.whenPlatform.length ? over.whenPlatform : skill.whenPlatform,
        whenVoice: over.whenVoice || skill.whenVoice,
      });
    } else {
      out.push({ ...skill, upgraded: false });
    }
    seen.add(skill.id);
  }
  for (const skill of custom) {
    if (seen.has(skill.id)) continue;
    out.push(skill);
  }
  return out.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, "zh"));
}

function getSkill(id) {
  return listSkills().find((skill) => skill.id === id) || null;
}

function customPath(id) {
  return safeJoin(CUSTOM_SKILL_DIR, id, ".md");
}

function serializeSkill(skill) {
  const lines = [
    "---",
    `id: ${oneLine(skill.id)}`,
    `name: ${oneLine(skill.name)}`,
    `scene: ${oneLine(skill.scene || "")}`,
    `target: ${oneLine(skill.target || "content")}`,
    `order: ${skill.order || 80}`,
    `enabled: ${skill.enabled !== false}`,
    `updatedAt: ${oneLine(skill.updatedAt || now())}`,
    `inject: ${oneLine(skill.inject || "")}`,
  ];
  if (skill.elements !== undefined) {
    lines.push(`elements: ${(skill.elements || []).join(",")}`);
  }
  if (Array.isArray(skill.tags) && skill.tags.length) lines.push(`tags: ${skill.tags.join(",")}`);
  if (Array.isArray(skill.whenFlow) && skill.whenFlow.length) lines.push(`whenFlow: ${skill.whenFlow.join(",")}`);
  if (Array.isArray(skill.whenPlatform) && skill.whenPlatform.length) {
    lines.push(`whenPlatform: ${skill.whenPlatform.join(",")}`);
  }
  if (skill.whenVoice) lines.push(`whenVoice: ${oneLine(skill.whenVoice)}`);
  lines.push("---", "", skill.body || "", "");
  return lines.join("\n");
}

function createSkill(input) {
  ensureDirs();
  const name = String(input.name || "").trim();
  const body = String(input.body || "").trim();
  if (!name || !body) {
    const error = new Error("自定义 Skill 需要名称和说明书正文");
    error.status = 400;
    throw error;
  }
  const skill = {
    id: uid("sk"),
    name,
    scene: String(input.scene || "").trim(),
    target: String(input.target || "content").trim(),
    order: Number(input.order) || 80,
    enabled: input.enabled !== false,
    source: "custom",
    body,
    updatedAt: now(),
  };
  if (input.inject) skill.inject = String(input.inject).trim();
  const elements = normalizeElements(input.elements);
  if (elements !== undefined) skill.elements = elements;
  skill.tags = normalizeElements(input.tags) || [];
  skill.whenFlow = normalizeElements(input.whenFlow) || [];
  skill.whenPlatform = normalizeElements(input.whenPlatform) || [];
  skill.whenVoice = String(input.whenVoice || "").trim();
  fs.writeFileSync(customPath(skill.id), serializeSkill(skill), "utf8");
  return getSkill(skill.id);
}

function updateSkill(id, input) {
  const current = getSkill(id);
  if (!current || current.source !== "custom") {
    const error = new Error("只能修改自定义 Skill");
    error.status = 404;
    throw error;
  }
  const name = String(input.name ?? current.name).trim();
  const body = String(input.body ?? current.body).trim();
  if (!name || !body) {
    const error = new Error("自定义 Skill 需要名称和说明书正文");
    error.status = 400;
    throw error;
  }
  const next = {
    ...current,
    name,
    scene: String(input.scene ?? current.scene).trim(),
    target: String(input.target ?? current.target).trim(),
    order: input.order === undefined ? Number(current.order) || 80 : Number(input.order) || 80,
    enabled: input.enabled === undefined ? current.enabled !== false : Boolean(input.enabled),
    body,
    updatedAt: now(),
  };
  if (input.inject !== undefined) next.inject = String(input.inject || "").trim();
  if (input.elements !== undefined) next.elements = normalizeElements(input.elements);
  if (input.tags !== undefined) next.tags = normalizeElements(input.tags) || [];
  if (input.whenFlow !== undefined) next.whenFlow = normalizeElements(input.whenFlow) || [];
  if (input.whenPlatform !== undefined) next.whenPlatform = normalizeElements(input.whenPlatform) || [];
  if (input.whenVoice !== undefined) next.whenVoice = String(input.whenVoice || "").trim();
  recordHistory(current, input.note || "编辑前快照");
  fs.writeFileSync(customPath(id), serializeSkill(next), "utf8");
  return getSkill(id);
}

function deleteSkill(id) {
  const current = getSkill(id);
  if (!current || current.source !== "custom") {
    const error = new Error("只能删除自定义 Skill");
    error.status = 404;
    throw error;
  }
  const file = customPath(id);
  if (fs.existsSync(file)) fs.unlinkSync(file);
  return { ok: true };
}

const TARGETS = ["brief", "world", "characters", "props", "outline", "beats", "content", "polish", "review", "threads"];

const HISTORY_DIR = path.join(ROOT, "data", "skill-history");

function recordHistory(skill, note) {
  if (!skill || !skill.id) return;
  try {
    fs.mkdirSync(HISTORY_DIR, { recursive: true });
    const file = safeJoin(HISTORY_DIR, skill.id, ".json");
    let list = [];
    if (fs.existsSync(file)) {
      try {
        list = JSON.parse(fs.readFileSync(file, "utf8"));
      } catch {
        list = [];
      }
      if (!Array.isArray(list)) list = [];
    }
    list.unshift({
      id: uid("ver"),
      at: now(),
      note: String(note || ""),
      name: skill.name,
      scene: skill.scene,
      target: skill.target,
      enabled: skill.enabled !== false,
      order: Number(skill.order) || 99,
      body: String(skill.body || ""),
      elements: skill.elements,
      tags: skill.tags,
      whenFlow: skill.whenFlow,
      whenPlatform: skill.whenPlatform,
      whenVoice: skill.whenVoice,
    });
    fs.writeFileSync(file, JSON.stringify(list.slice(0, 20), null, 2), "utf8");
  } catch {
    // history is best-effort and never blocks the edit
  }
}

function listHistory(id) {
  const file = safeJoin(HISTORY_DIR, id, ".json");
  if (!fs.existsSync(file)) return [];
  try {
    const list = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!Array.isArray(list)) return [];
    return list.map((row) => ({
      id: row.id,
      at: row.at,
      note: row.note || "",
      chars: String(row.body || "").replace(/\s+/g, "").length,
    }));
  } catch {
    return [];
  }
}

function readHistoryEntry(id, entryId) {
  const file = safeJoin(HISTORY_DIR, id, ".json");
  if (!fs.existsSync(file)) return null;
  try {
    const list = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!Array.isArray(list)) return null;
    return list.find((row) => row.id === entryId) || null;
  } catch {
    return null;
  }
}

function restoreHistory(id, entryId) {
  const current = getSkill(id);
  if (!current) {
    const error = new Error("Skill 不存在");
    error.status = 404;
    throw error;
  }
  const entry = readHistoryEntry(id, entryId);
  if (!entry) {
    const error = new Error("这条版本已不存在");
    error.status = 404;
    throw error;
  }
  recordHistory(current, "恢复前自动快照");
  const next = {
    ...current,
    name: String(entry.name || current.name),
    scene: String(entry.scene ?? current.scene),
    target: String(entry.target || current.target),
    enabled: entry.enabled !== false,
    order: Number(entry.order) || current.order,
    body: String(entry.body || ""),
    updatedAt: now(),
  };
  if (Object.prototype.hasOwnProperty.call(entry, "elements")) next.elements = entry.elements;
  if (Array.isArray(entry.tags)) next.tags = entry.tags;
  if (Array.isArray(entry.whenFlow)) next.whenFlow = entry.whenFlow;
  if (Array.isArray(entry.whenPlatform)) next.whenPlatform = entry.whenPlatform;
  if (typeof entry.whenVoice === "string") next.whenVoice = entry.whenVoice;
  fs.writeFileSync(customPath(id), serializeSkill(next), "utf8");
  return getSkill(id);
}

function clearHistory(id) {
  const file = safeJoin(HISTORY_DIR, id, ".json");
  if (fs.existsSync(file)) fs.unlinkSync(file);
  return { ok: true };
}

function updateBuiltinMeta(id, input) {
  ensureDirs();
  const builtin = readBuiltinSkill(id);
  if (!builtin) {
    const error = new Error("内置 Skill 不存在");
    error.status = 404;
    throw error;
  }
  const current = getSkill(id) || builtin;
  const enabled = input.enabled === undefined ? current.enabled !== false : Boolean(input.enabled);
  const order = input.order === undefined ? Number(current.order) || builtin.order : Number(input.order) || builtin.order;
  const body = String(current.body || "").trim();
  const elements = input.elements === undefined ? current.elements : normalizeElements(input.elements);
  const tags = input.tags === undefined ? current.tags : normalizeElements(input.tags) || [];
  const whenFlow = input.whenFlow === undefined ? current.whenFlow : normalizeElements(input.whenFlow) || [];
  const whenPlatform =
    input.whenPlatform === undefined ? current.whenPlatform : normalizeElements(input.whenPlatform) || [];
  const whenVoice = input.whenVoice === undefined ? current.whenVoice : String(input.whenVoice || "").trim();
  const sameList = (a, b) => JSON.stringify(a || []) === JSON.stringify(b || []);
  const file = customPath(id);
  const pristine =
    enabled &&
    order === builtin.order &&
    body === String(builtin.body || "").trim() &&
    elements === undefined &&
    sameList(tags, builtin.tags) &&
    sameList(whenFlow, builtin.whenFlow) &&
    sameList(whenPlatform, builtin.whenPlatform) &&
    String(whenVoice || "") === String(builtin.whenVoice || "");
  if (pristine) {
    if (fs.existsSync(file)) fs.unlinkSync(file);
  } else {
    recordHistory(current, input.note || "调整启用/排序");
    const row = {
      ...builtin,
      body,
      enabled,
      order,
      updatedAt: now(),
      inject: current.inject || "",
      tags: tags || [],
      whenFlow: whenFlow || [],
      whenPlatform: whenPlatform || [],
      whenVoice: whenVoice || "",
    };
    if (elements !== undefined) row.elements = elements;
    fs.writeFileSync(customPath(id), serializeSkill(row), "utf8");
  }
  return getSkill(id);
}

function cloneSkill(id) {
  ensureDirs();
  const src = getSkill(id);
  if (!src) {
    const error = new Error("Skill 不存在");
    error.status = 404;
    throw error;
  }
  const skill = {
    id: uid("sk"),
    name: `${src.name} 副本`.slice(0, 40),
    scene: src.scene,
    target: src.target,
    order: Number(src.order) || 80,
    enabled: src.enabled !== false,
    source: "custom",
    body: String(src.body || ""),
    inject: src.inject || "",
    updatedAt: now(),
  };
  if (Array.isArray(src.elements)) skill.elements = src.elements.slice();
  if (Array.isArray(src.tags)) skill.tags = src.tags.slice();
  if (Array.isArray(src.whenFlow)) skill.whenFlow = src.whenFlow.slice();
  if (Array.isArray(src.whenPlatform)) skill.whenPlatform = src.whenPlatform.slice();
  if (src.whenVoice) skill.whenVoice = src.whenVoice;
  fs.writeFileSync(customPath(skill.id), serializeSkill(skill), "utf8");
  return getSkill(skill.id);
}

function exportSkills(ids) {
  const picked =
    Array.isArray(ids) && ids.length ? listSkills().filter((skill) => ids.includes(skill.id)) : listSkills();
  return {
    version: 1,
    exportedAt: now(),
    skills: picked
      .filter((skill) => skill.source === "custom" || skill.upgraded)
      .map((skill) => ({
        name: skill.name,
        scene: skill.scene,
        target: skill.target,
        order: Number(skill.order) || 80,
        enabled: skill.enabled !== false,
        inject: skill.inject || "",
        body: String(skill.body || ""),
        elements: Array.isArray(skill.elements) ? skill.elements : undefined,
        tags: Array.isArray(skill.tags) && skill.tags.length ? skill.tags : undefined,
        whenFlow: Array.isArray(skill.whenFlow) && skill.whenFlow.length ? skill.whenFlow : undefined,
        whenPlatform:
          Array.isArray(skill.whenPlatform) && skill.whenPlatform.length ? skill.whenPlatform : undefined,
        whenVoice: skill.whenVoice || undefined,
      })),
  };
}

function importSkills(raw) {
  ensureDirs();
  const rows = Array.isArray(raw) ? raw : Array.isArray(raw?.skills) ? raw.skills : [];
  if (!rows.length) {
    const error = new Error("没有可导入的说明书");
    error.status = 400;
    throw error;
  }
  const created = [];
  for (const row of rows) {
    const name = String(row?.name || "").trim();
    const body = String(row?.body || "").trim();
    if (!name || !body) continue;
    const skill = {
      id: uid("sk"),
      name,
      scene: String(row.scene || "").trim(),
      target: String(row.target || "content").trim(),
      order: Number(row.order) || 80,
      enabled: row.enabled !== false,
      source: "custom",
      body,
      updatedAt: now(),
    };
    if (row.inject) skill.inject = String(row.inject).trim();
    const elements = normalizeElements(row.elements);
    if (elements !== undefined) skill.elements = elements;
    skill.tags = normalizeElements(row.tags) || [];
    skill.whenFlow = normalizeElements(row.whenFlow) || [];
    skill.whenPlatform = normalizeElements(row.whenPlatform) || [];
    skill.whenVoice = String(row.whenVoice || "").trim();
    fs.writeFileSync(customPath(skill.id), serializeSkill(skill), "utf8");
    created.push(skill.id);
  }
  if (!created.length) {
    const error = new Error("没有可导入的说明书（每条都需要名称和正文）");
    error.status = 400;
    throw error;
  }
  return { created };
}

function listCraftOverrides() {
  return listSkills()
    .filter((skill) => /^tdcraft_/.test(skill.id))
    .map((skill) => {
      const parent = craftParentId(skill.id);
      const body = String(skill.body || "");
      const sections = body.match(/^###\s*\[([a-z0-9-]+)\]/gim) || [];
      return {
        id: skill.id,
        name: skill.name,
        scene: skill.scene,
        updatedAt: skill.updatedAt,
        legacy: Boolean(parent),
        parent: parent || "",
        chars: body.replace(/\s+/g, "").length,
        slots: sections
          .map((line) => (line.match(/\[([a-z0-9-]+)\]/i) || [])[1])
          .filter(Boolean),
      };
    })
    .sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
}

function deleteCraftOverride(id) {
  if (!/^tdcraft_/.test(String(id || ""))) {
    const error = new Error("只能删除拆书法覆盖层");
    error.status = 400;
    throw error;
  }
  const file = customPath(id);
  if (!fs.existsSync(file)) {
    const error = new Error("覆盖层不存在");
    error.status = 404;
    throw error;
  }
  fs.unlinkSync(file);
  return { ok: true };
}

function skillAuthorMessages(idea, target) {
  const hint = target && TARGETS.includes(target) ? target : "按需求自行选择";
  return [
    {
      role: "system",
      content: `你是墨枢的中文写作 Skill 作者。根据作者的一句话，写成一份可执行的中文说明书。说明书要让后文写出连载人味：心疼、嘴硬、犹豫、碎碎念、思维拐弯、对白说一半。禁止写成只填结构的流水线。禁止为去AI而故意写差。
只输出一个 JSON 对象，不要 Markdown 围栏，不要解释。字段：
- name：4 到 10 个汉字的名称
- scene：一句话说明何时使用
- target：只能是 ${TARGETS.join("、")} 之一
  - body：Markdown 说明书，必须含「## 先有感觉」「## 适用场景」「## 输入」「## 输出结构」「## 约束」「## 执行步骤」。「先有感觉」写清怎么让人物心疼、嘴硬、犹豫、误判、说一半，结构和禁区为这点感觉服务。
若 target 是 characters、world 或 props，输出结构必须使用「### 名称（身份或类型）」以及「描述：」「提示词：」两节。
全文简体中文。`,
    },
    {
      role: "user",
      content: `作者需求：${idea}\n建议写入位置：${hint}`,
    },
  ];
}

function parseSkillDraft(text) {
  const raw = String(text || "").trim();
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const payload = fence ? fence[1] : raw;
  const start = payload.indexOf("{");
  const end = payload.lastIndexOf("}");
  if (start < 0 || end < 0) {
    const error = new Error("模型没有返回完整的 Skill 草稿");
    error.status = 502;
    throw error;
  }
  let json;
  try {
    json = JSON.parse(payload.slice(start, end + 1));
  } catch {
    const error = new Error("Skill 草稿无法解析");
    error.status = 502;
    throw error;
  }
  const name = String(json.name || "").trim();
  const body = String(json.body || "").trim();
  if (!name || !body) {
    const error = new Error("草稿缺少名称或说明书");
    error.status = 502;
    throw error;
  }
  return {
    name,
    scene: String(json.scene || "").trim(),
    target: TARGETS.includes(json.target) ? json.target : "content",
    body,
  };
}

function cleanPrefList(value, maxItems = 16, maxLen = 48) {
  const list = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  return list
    .map((item) => String(item || "").trim())
    .filter((item) => item && item !== "不限定")
    .slice(0, maxItems)
    .map((item) => item.slice(0, maxLen));
}

function normalizeSparkPrefs(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  return {
    genres: cleanPrefList(src.genres),
    romance: cleanPrefList(src.romance),
    hooks: cleanPrefList(src.hooks),
    heroes: cleanPrefList(src.heroes),
    leads: cleanPrefList(src.leads).slice(0, 1),
    povs: cleanPrefList(src.povs).slice(0, 1),
    tones: cleanPrefList(src.tones).slice(0, 1),
    endings: cleanPrefList(src.endings).slice(0, 1),
    length: cleanPrefList(src.length).slice(0, 1),
    pace: cleanPrefList(src.pace).slice(0, 1),
    platforms: cleanPrefList(src.platforms),
    avoid: cleanPrefList(src.avoid, 4, 240),
  };
}

function formatSparkPrefs(prefs) {
  const rows = [
    ["频道/类型", prefs.genres],
    ["CP/感情线", prefs.romance],
    ["爽点偏好", prefs.hooks],
    ["主角设定", prefs.heroes],
    ["叙事主角", prefs.leads],
    ["人称视角", prefs.povs],
    ["文风调性", prefs.tones],
    ["结局走向", prefs.endings],
    ["故事篇幅", prefs.length],
    ["章均篇幅", prefs.pace],
    ["目标平台", prefs.platforms],
    ["想避开", prefs.avoid],
  ];
  return rows.map(([label, items]) => `${label}：${items.length ? items.join("、") : "不限定"}`).join("\n");
}

function craftFromSparkPrefs(prefs) {
  const pace = prefs.pace[0] || "";
  const n = Number((pace.match(/(\d{3,5})/) || [])[1] || 0);
  if (pace.includes("8000") || pace.includes("6000") || n >= 5500) {
    return { wordsMin: 4500, wordsMax: 7000, density: "密", pace: 70 };
  }
  if (pace.includes("5000") || n >= 4500) {
    return { wordsMin: 3500, wordsMax: 5200, density: "密", pace: 62 };
  }
  if (pace.includes("3000") || n >= 2800) {
    return { wordsMin: 2200, wordsMax: 3800, density: "中", pace: 55 };
  }
  if (pace.includes("2000") || n >= 1500) {
    return { wordsMin: 1500, wordsMax: 2200, density: "中", pace: 50 };
  }
  return {};
}

function sparkMarkdown(value) {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return value.map(sparkMarkdown).filter(Boolean).join("\n\n");
  if (typeof value === "object") {
    const name = String(value.name || value.title || value.姓名 || value.场景 || "").trim();
    const role = String(value.role || value.type || value.身份 || value.类型 || value.status || "").trim();
    const desc = sparkMarkdown(value.desc || value.description || value.描述 || value.body || value.text || "");
    const prompt = sparkMarkdown(value.prompt || value.提示词 || "");
    const plant = sparkMarkdown(value.plant || value.埋设 || "");
    const payoff = sparkMarkdown(value.payoff || value.回收 || "");
    const note = sparkMarkdown(value.note || value.备注 || "");
    if (name || desc || plant) {
      const head = name ? `### ${name}${role ? `（${role}）` : ""}` : "";
      return [
        head,
        desc && (desc.startsWith("描述") ? desc : `描述：\n${desc}`),
        prompt && (prompt.startsWith("提示词") ? prompt : `提示词：\n${prompt}`),
        plant && `埋设：${plant}`,
        payoff && `回收：${payoff}`,
        note && `备注：${note}`,
      ]
        .filter(Boolean)
        .join("\n");
    }
    return Object.values(value).map(sparkMarkdown).filter(Boolean).join("\n\n");
  }
  return String(value).trim();
}

function sparkAuthorMessages(idea, rawPrefs) {
  const seed = String(idea || "").trim();
  const prefs = normalizeSparkPrefs(rawPrefs);
  const prefBlock = formatSparkPrefs(prefs);
  const lengthNote = prefs.length[0] || "";
  const outlineHint = lengthNote.includes("短篇")
    ? "大纲压成一卷，冲突尽快见血，总字数按五万内收束。"
    : lengthNote.includes("中篇")
      ? "大纲两到三卷，总字数按二十到五十万铺开。"
      : lengthNote.includes("长篇")
        ? "大纲三卷以上，留升级和身份掉马空间，总字数按百万量级铺线。"
        : "篇幅不限定，按题材自己定体量，不要无故注水。";
  return [
    {
      role: "system",
      content: `你是墨枢的开书编辑。根据作者脑洞立一部能追更的中文长篇。
只输出一个 JSON 对象，不要 Markdown 围栏，不要解释。字段：
- title：四到八个汉字的书名，好记、能上榜
 - genre：优先用作者点选的频道/类型；未点选时用玄幻、仙侠、都市、科幻、历史、悬疑、无限流 之一，或自拟二字到四字类型
- logline：一句话卖点，谁想要什么，被什么挡住
- brief：立项说明，400 到 700 字，用 ### 小标题，必须含「卖点」「主角」「核心冲突」「调性」
 - world：3 到 4 个场景/设定卡，每卡格式严格为：
### 名称（类型）
描述：
两到四句可拍摄的规则或场面。
提示词：
画面提示，40 到 80 字。
 - characters：4 个主要人物卡，每卡格式严格为：
### 姓名（身份）
描述：
外表抓手、此刻欲望、旧伤、秘密、说话风格，120 到 200 字。
提示词：
绘人提示，80 字以内。
 - outline：全书大纲，600 到 900 字，用 ### 小标题拆「第一卷」「第二卷」「第三卷」，每卷写出冲突升级和章末钩子
  - style：优先用作者点选的文风调性；未点选时用 网文爽快、轻松吐槽、细密心理、白描克制、冷硬悬疑、甜宠日常、压抑暗黑、热血燃 之一
  - theme：一句话主题，这本书在问什么
  - pov：优先用作者点选的人称视角；未点选时用 第三人称有限、第一人称、第三人称全知、多视角轮换 之一
 - threads：2 到 4 条伏笔，每条格式严格为：
### 伏笔名（open）
埋设：第几章、什么物件或哪句没说完的话
回收：打算哪一章兑现
备注：和主题或人物秘密怎么咬合
 - chapterTitle：第一章章名，不要带「第X章」
全文简体中文。书名不要带书名号。JSON 字符串里的换行写成 \\n。
作者偏好必须成为骨架：点选标签和自定义标签同等有效，必须写进卖点、人物和冲突，禁止把选项清单复读进正文。
叙事主角、人称视角、文风调性、结局走向一旦点选或自拟，必须遵守。
标成「不限定」的维度由你决定，不要同时堆互斥套路。
「想避开」里的元素不得出现在卖点、人物、大纲和伏笔里。
${outlineHint}
目标平台约束尺度、HE/BE 预期和标题气质：番茄偏爽点短打，起点偏长线升级，晋江偏情感关系，盐选偏强情节，LOFTER 偏人设氛围，七猫偏女频爽点，剧本杀偏闭环线索，出版向偏人物与主题。
脑洞可以很碎，也可以写人物细节、必须出现的物件或场面。若脑洞为空，按偏好发明一个够劲的网文脑洞。`,
    },
    {
      role: "user",
      content: `${seed ? `脑洞：${seed}` : "脑洞：作者没写，请按偏好发明一个够劲的开书脑洞。"}\n\n作者偏好：\n${prefBlock}`,
    },
  ];
}

function parseSparkDraft(text) {
  const raw = String(text || "").trim();
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const payload = fence ? fence[1] : raw;
  const start = payload.indexOf("{");
  const end = payload.lastIndexOf("}");
  if (start < 0 || end < 0) {
    const error = new Error("模型没有返回完整的开书草稿");
    error.status = 502;
    throw error;
  }
  let json;
  try {
    json = JSON.parse(payload.slice(start, end + 1));
  } catch {
    const error = new Error("开书草稿无法解析");
    error.status = 502;
    throw error;
  }
  const title = String(json.title || "").trim().replace(/[《》]/g, "");
  const logline = String(json.logline || "").trim();
  const brief = sparkMarkdown(json.brief);
  if (!title || !logline) {
    const error = new Error("草稿缺少书名或卖点");
    error.status = 502;
    throw error;
  }
  return {
    title,
    genre: String(json.genre || "").trim() || "长篇小说",
    logline,
    brief,
    world: sparkMarkdown(json.world),
    characters: sparkMarkdown(json.characters),
    outline: sparkMarkdown(json.outline),
    chapterTitle: String(json.chapterTitle || "").trim().replace(/^第[零一二三四五六七八九十百\d]+章\s*/, ""),
    style: String(json.style || "").trim(),
    theme: String(json.theme || "").trim(),
    pov: String(json.pov || "").trim(),
    threads: sparkMarkdown(json.threads),
  };
}

function injectList(skill) {
  return String(skill.inject || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

const WRITING_INJECT = "kickoff,characters,world,outline,chapter-beats,chapter-prose,continue,polish,props";

const CRAFT_SLOTS = [
  { id: "kickoff", name: "立项" },
  { id: "characters", name: "人物" },
  { id: "world", name: "世界" },
  { id: "outline", name: "大纲" },
  { id: "chapter-beats", name: "细纲" },
  { id: "chapter-prose", name: "正文" },
  { id: "continue", name: "续写" },
  { id: "polish", name: "润色" },
  { id: "props", name: "道具" },
];

const FACTORY_DIR = path.join(CUSTOM_SKILL_DIR, ".factory");
const CRAFT_HEADING = "## 对标技法";

function factoryPath(id) {
  return safeJoin(FACTORY_DIR, id, ".md");
}

function readBuiltinSkill(id) {
  return readDirSkills(BUILTIN_DIR, "builtin").find((skill) => skill.id === id) || null;
}

function ensureFactory(id) {
  fs.mkdirSync(FACTORY_DIR, { recursive: true });
  const file = factoryPath(id);
  if (fs.existsSync(file)) return;
  const builtin = readBuiltinSkill(id);
  if (builtin && builtin.body) fs.writeFileSync(file, `${String(builtin.body).trim()}\n`, "utf8");
}

function factoryBody(id) {
  const file = factoryPath(id);
  if (fs.existsSync(file)) return fs.readFileSync(file, "utf8").trim();
  const builtin = readBuiltinSkill(id);
  return builtin ? String(builtin.body || "").trim() : "";
}

function stripCraftSection(body) {
  const text = String(body || "");
  const idx = text.search(new RegExp(`\\n${CRAFT_HEADING}\\s*\\n`));
  if (idx >= 0) return text.slice(0, idx).trimEnd();
  return text.trimEnd();
}

function mergeCraftSection(baseBody, piece) {
  const base = stripCraftSection(baseBody);
  const bit = String(piece || "").trim();
  if (!bit) return base;
  return `${base}\n\n${CRAFT_HEADING}\n${bit}\n`;
}

function writeSkillOverride(id, body) {
  const builtin = readBuiltinSkill(id);
  if (!builtin) return null;
  ensureFactory(id);
  const row = {
    ...builtin,
    body: String(body || "").trim(),
    updatedAt: now(),
    inject: "",
  };
  fs.writeFileSync(customPath(id), serializeSkill(row), "utf8");
  return getSkill(id);
}

function extractCraftSection(body) {
  const text = String(body || "");
  const marker = `\n${CRAFT_HEADING}\n`;
  const padded = text.startsWith(CRAFT_HEADING) ? `\n${text}` : text;
  const idx = padded.indexOf(marker);
  if (idx < 0) return "";
  return padded.slice(idx + marker.length).trim();
}

function extractCraftOrDelta(body, factory) {
  const craft = extractCraftSection(body);
  if (craft) return craft;
  const current = String(body || "").trim();
  const base = String(factory || "").trim();
  if (base && current.startsWith(base)) return current.slice(base.length).trim();
  if (current && current !== base) return current;
  return "";
}

function splitCraftRules(section) {
  const text = String(section || "").trim();
  if (!text) return [];
  const parts = text
    .split(/\n(?=-[\s])/)
    .map((row) => row.replace(/^-[\s]+/, "").trim())
    .filter(Boolean);
  return parts.length ? parts : [text];
}

function restoreSkillFactory(id) {
  const current = getSkill(id);
  if (!current || current.source !== "builtin") {
    const error = new Error("只能恢复内置说明书");
    error.status = 400;
    throw error;
  }
  const file = customPath(id);
  if (!current.upgraded && !fs.existsSync(file)) {
    const error = new Error("这份说明书已经是出厂正文");
    error.status = 400;
    throw error;
  }
  if (fs.existsSync(file)) fs.unlinkSync(file);
  const restored = getSkill(id);
  if (!restored) {
    const error = new Error("恢复失败");
    error.status = 500;
    throw error;
  }
  return restored;
}

function restoreAllFactories() {
  const ids = listSkills()
    .filter((skill) => skill.source === "builtin" && skill.upgraded)
    .map((skill) => skill.id);
  for (const id of ids) restoreSkillFactory(id);
  return { restored: ids };
}

function craftParentId(id) {
  const text = String(id || "");
  const at = text.indexOf("__");
  return at > 0 ? text.slice(0, at) : "";
}

function parseCraftSections(text) {
  const raw = String(text || "").trim();
  const parts = raw.split(/^###\s*\[([a-z0-9-]+)\][^\n]*$/im);
  const map = {};
  if (parts.length < 3) return map;
  const allowed = new Set(CRAFT_SLOTS.map((slot) => slot.id));
  for (let i = 1; i < parts.length; i += 2) {
    const id = String(parts[i] || "").trim();
    const body = String(parts[i + 1] || "").trim();
    if (allowed.has(id) && body) map[id] = body;
  }
  return map;
}

function listInjectedGuides(skillId, ctx = {}) {
  return listSkills()
    .filter((skill) => {
      if (skill.enabled === false) return false;
      if (/^tdcraft_/.test(skill.id)) return false;
      if (!injectList(skill).includes(skillId)) return false;
      if (!conditionPass(skill, ctx)) return false;
      const parent = craftParentId(skill.id);
      if (!parent) return true;
      const row = getSkill(parent);
      return !row || row.enabled !== false;
    })
    .map((skill) => `## ${skill.name}\n${String(skill.body || "").trim().slice(0, 2500)}`)
    .join("\n\n");
}

function dropSkillPreamble(body) {
  const text = String(body || "").trim();
  if (!text) return "";
  const drop = new Set(["先有感觉", "连载作者", "适用场景", "输入"]);
  const parts = text.split(/^## /m);
  const kept = [parts[0].trim()];
  for (let i = 1; i < parts.length; i += 1) {
    const nl = parts[i].indexOf("\n");
    const title = (nl < 0 ? parts[i] : parts[i].slice(0, nl)).trim();
    if (drop.has(title)) continue;
    kept.push(`## ${parts[i].trim()}`);
  }
  return kept.filter(Boolean).join("\n\n").trim();
}

function dropSubSection(body, name) {
  const lines = String(body || "").split(/\r?\n/);
  const out = [];
  let skipping = false;
  for (const line of lines) {
    if (!skipping && new RegExp(`^#{1,6}\\s*${name}\\s*$`).test(line.trim())) {
      skipping = true;
      continue;
    }
    if (skipping) {
      if (/^#{1,3}\s/.test(line)) skipping = false;
      else continue;
    }
    out.push(line);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function dropVoiceConflictSections(body) {
  let text = String(body || "");
  for (const name of ["排版与标点", "去AI味"]) {
    text = dropSubSection(text, name);
  }
  return text;
}

function clipHeadingSection(body, heading, max) {
  const marker = `\n## ${heading}\n`;
  const idx = String(body || "").indexOf(marker);
  if (idx < 0) return body;
  const head = body.slice(0, idx + marker.length);
  const rest = body.slice(idx + marker.length);
  if (rest.length <= max) return body;
  return `${head}${rest.slice(0, max).trimEnd()}\n`;
}

function skillPromptBody(skill, opts = {}) {
  let base = String((skill && skill.body) || "").trim();
  const writing = skill && ["chapter-prose", "continue", "polish"].includes(skill.id);
  if (writing) {
    base = dropSkillPreamble(base);
    base = clipHeadingSection(base, "对标技法", 1800);
    if (opts.voiceActive) base = dropVoiceConflictSections(base);
  }
  const guides = skill && skill.id ? listInjectedGuides(skill.id, opts) : "";
  const extra = guides ? `# 对标升级（必须遵守，让成品更好看）\n${guides}` : "";
  return [base, extra].filter(Boolean).join("\n\n");
}


function toPublicSkill(skill) {
  if (!skill) return null;
  if (/^tdcraft_/.test(skill.id)) return null;
  const upgraded = Boolean(skill.upgraded);
  const factory = upgraded ? factoryBody(skill.id) : "";
  const craftBody = upgraded ? extractCraftOrDelta(skill.body, factory) : "";
  return {
    id: skill.id,
    name: skill.name,
    scene: skill.upgraded ? `${skill.scene} · 已写入对标技法` : skill.scene,
    target: skill.target,
    order: skill.order,
    enabled: skill.enabled,
    source: skill.source,
    body: skill.body,
    updatedAt: skill.updatedAt,
    inject: skill.inject,
    upgraded,
    factoryBody: upgraded ? factory : undefined,
    craftBody: upgraded ? craftBody : undefined,
    craftRules: upgraded ? splitCraftRules(craftBody) : undefined,
    elements: Array.isArray(skill.elements) ? skill.elements : undefined,
    tags: Array.isArray(skill.tags) ? skill.tags : [],
    whenFlow: Array.isArray(skill.whenFlow) ? skill.whenFlow : [],
    whenPlatform: Array.isArray(skill.whenPlatform) ? skill.whenPlatform : [],
    whenVoice: skill.whenVoice || "",
    defaultElements: defaultElementIds(skill),
  };
}

function frontMatterToSkill(text) {
  const raw = String(text || "").replace(/^\uFEFF/, "");
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  const meta = {};
  let body = raw;
  if (match) {
    body = match[2];
    for (const line of match[1].split(/\r?\n/)) {
      const idx = line.indexOf(":");
      if (idx < 0) continue;
      const key = line.slice(0, idx).trim();
      const value = line.slice(idx + 1).trim();
      if (key) meta[key] = value;
    }
  }
  return { meta, body: String(body || "").trim() };
}

function exportSkillMarkdown(id) {
  const skill = getSkill(id);
  if (!skill || /^tdcraft_/.test(skill.id)) {
    const error = new Error("Skill 不存在");
    error.status = 404;
    throw error;
  }
  return serializeSkill(skill);
}

function importSkillMarkdown(text, filename = "") {
  ensureDirs();
  const { meta, body } = frontMatterToSkill(text);
  const fallbackName = String(filename || "")
    .replace(/\.[^.]+$/, "")
    .replace(/^skill-/i, "")
    .trim();
  const name = String(meta.name || fallbackName).trim();
  if (!name || !body) {
    const error = new Error("Markdown 缺少 name 或说明书正文");
    error.status = 400;
    throw error;
  }
  const rawId = String(meta.id || "").trim();
  let id = uid("sk");
  if (rawId && SAFE_ID.test(rawId) && !fs.existsSync(safeJoin(CUSTOM_SKILL_DIR, rawId, ".md"))) {
    id = rawId;
  }
  const skill = {
    id,
    name,
    scene: String(meta.scene || "").trim(),
    target: TARGETS.includes(meta.target) ? meta.target : "content",
    order: Number(meta.order) || 80,
    enabled: meta.enabled === "false" ? false : true,
    source: "custom",
    body,
    updatedAt: now(),
    tags: normalizeElements(meta.tags) || [],
    whenFlow: normalizeElements(meta.whenFlow) || [],
    whenPlatform: normalizeElements(meta.whenPlatform) || [],
    whenVoice: String(meta.whenVoice || "").trim(),
  };
  if (meta.inject) skill.inject = String(meta.inject).trim();
  fs.writeFileSync(customPath(skill.id), serializeSkill(skill), "utf8");
  return toPublicSkill(getSkill(skill.id));
}

function upsertInjectSkill(input) {
  ensureDirs();
  const id = String(input.id || "").trim();
  const name = String(input.name || "").trim();
  const body = String(input.body || "").trim();
  if (!id || !name || !body) {
    const error = new Error("技法 Skill 需要标识、名称和说明书");
    error.status = 400;
    throw error;
  }
  if (!/^[a-z0-9_]+$/i.test(id)) {
    const error = new Error("技法 Skill 标识只能包含字母、数字和下划线");
    error.status = 400;
    throw error;
  }
  const skill = {
    id,
    name,
    scene: String(input.scene || "拆书技法").trim(),
    target: "guide",
    order: 85,
    enabled: true,
    source: "custom",
    body,
    inject: String(input.inject ?? WRITING_INJECT).trim(),
    updatedAt: now(),
  };
  fs.writeFileSync(customPath(id), serializeSkill(skill), "utf8");
  return getSkill(id);
}

function applyCraftToSkills({ craftId, title, body }) {
  const clean = String(body || "")
    .replace(/^```[a-z]*\n?/i, "")
    .replace(/\n?```$/i, "")
    .trim();
  const sections = parseCraftSections(clean);
  const pieces = sections;
  for (const slot of CRAFT_SLOTS) {
    const piece = pieces[slot.id];
    if (!piece) continue;
    writeSkillOverride(slot.id, mergeCraftSection(factoryBody(slot.id), piece));
  }
  const main = upsertInjectSkill({
    id: craftId,
    name: `对标：${title}`.slice(0, 24),
    scene: `拆书技法，来自《${title}》`,
    body: clean,
    inject: "",
  });
  return main;
}

module.exports = {
  listSkills,
  getSkill,
  createSkill,
  updateSkill,
  deleteSkill,
  updateBuiltinMeta,
  cloneSkill,
  exportSkills,
  importSkills,
  exportSkillMarkdown,
  importSkillMarkdown,
  listHistory,
  restoreHistory,
  readHistoryEntry,
  clearHistory,
  listCraftOverrides,
  deleteCraftOverride,
  skillAuthorMessages,
  parseSkillDraft,
  sparkAuthorMessages,
  parseSparkDraft,
  normalizeSparkPrefs,
  craftFromSparkPrefs,
  listInjectedGuides,
  upsertInjectSkill,
  parseCraftSections,
  applyCraftToSkills,
  skillPromptBody,
  toPublicSkill,
  restoreSkillFactory,
  restoreAllFactories,
  CRAFT_SLOTS,
};
