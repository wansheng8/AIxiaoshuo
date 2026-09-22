"use strict";

const fs = require("fs");
const path = require("path");
const { ROOT, CUSTOM_SKILL_DIR, ensureDirs, now } = require("../store");
const pipeline = require("../pipeline");

const BUILTIN_DIR = path.join(ROOT, "skills", "builtin");

const CREATABLE_TARGETS = pipeline.creatableTargets();

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
  return pipeline.normalizeSkills(out);
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

module.exports = {
  BUILTIN_DIR,
  CREATABLE_TARGETS,
  SAFE_ID,
  assertSafeId,
  safeJoin,
  oneLine,
  parseElementsMeta,
  normalizeElements,
  parseFrontMatter,
  toSkill,
  conditionPass,
  readDirSkills,
  listSkills,
  getSkill,
  customPath,
  serializeSkill,
};
