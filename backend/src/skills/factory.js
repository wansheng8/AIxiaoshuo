"use strict";

const fs = require("fs");
const path = require("path");
const { CUSTOM_SKILL_DIR, now } = require("../store");
const {
  BUILTIN_DIR,
  safeJoin,
  readDirSkills,
  listSkills,
  getSkill,
  conditionPass,
  customPath,
  serializeSkill,
} = require("./core");
const { defaultElementIds } = require("../elements");
const pipeline = require("../pipeline");

function injectList(skill) {
  return String(skill.inject || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

const CRAFT_SLOTS = pipeline.craftSlots();
const WRITING_INJECT = pipeline.injectTargets().join(",");

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
  const writing = pipeline.isWritingSkill(skill);
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
  const stage = pipeline.stageOf(skill);
  return {
    id: skill.id,
    name: skill.name,
    scene: skill.upgraded ? `${skill.scene} · 已写入对标技法` : skill.scene,
    target: skill.target,
    stage: stage.id,
    stageLabel: stage.label,
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

module.exports = {
  CRAFT_SLOTS,
  WRITING_INJECT,
  injectList,
  factoryPath,
  readBuiltinSkill,
  ensureFactory,
  factoryBody,
  stripCraftSection,
  mergeCraftSection,
  writeSkillOverride,
  extractCraftSection,
  extractCraftOrDelta,
  splitCraftRules,
  restoreSkillFactory,
  restoreAllFactories,
  craftParentId,
  parseCraftSections,
  listInjectedGuides,
  skillPromptBody,
  toPublicSkill,
};
