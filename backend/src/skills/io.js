"use strict";

const fs = require("fs");
const { CUSTOM_SKILL_DIR, ensureDirs, uid, now } = require("../store");
const {
  SAFE_ID,
  safeJoin,
  normalizeElements,
  customPath,
  serializeSkill,
  getSkill,
  listSkills,
  CREATABLE_TARGETS,
} = require("./core");
const { recordHistory } = require("./history");
const { toPublicSkill } = require("./factory");

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
    target: CREATABLE_TARGETS.includes(meta.target) ? meta.target : "content",
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

module.exports = {
  createSkill,
  updateSkill,
  deleteSkill,
  cloneSkill,
  exportSkills,
  importSkills,
  exportSkillMarkdown,
  importSkillMarkdown,
};
