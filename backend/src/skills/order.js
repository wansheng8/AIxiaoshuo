"use strict";

const fs = require("fs");
const { ensureDirs, now } = require("../store");
const {
  customPath,
  serializeSkill,
  getSkill,
  normalizeElements,
  listSkills,
} = require("./core");
const { updateSkill } = require("./io");
const { recordHistory } = require("./history");
const { readBuiltinSkill } = require("./factory");
const pipeline = require("../pipeline");

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

function writeSkillOrder(id, order) {
  const skill = getSkill(id);
  if (!skill) {
    const error = new Error("Skill 不存在");
    error.status = 404;
    throw error;
  }
  if (skill.source === "builtin") return updateBuiltinMeta(id, { order });
  return updateSkill(id, { order, note: "调整顺序" });
}

function persistOrders(updates) {
  const backups = [];
  try {
    for (const row of updates) {
      const file = customPath(row.id);
      const exists = fs.existsSync(file);
      backups.push({ file, exists, content: exists ? fs.readFileSync(file, "utf8") : "" });
      writeSkillOrder(row.id, row.order);
    }
  } catch (err) {
    for (const backup of backups.reverse()) {
      if (backup.exists) fs.writeFileSync(backup.file, backup.content, "utf8");
      else if (fs.existsSync(backup.file)) fs.unlinkSync(backup.file);
    }
    throw err;
  }
  return updates.length;
}

function moveNeighbors(members, id, opts) {
  const direction = String(opts.direction || "");
  const idx = members.findIndex((skill) => skill.id === id);
  if (direction === "up") {
    if (idx <= 0) return null;
    return { prev: members[idx - 2] || null, next: members[idx - 1] };
  }
  if (direction === "down") {
    if (idx < 0 || idx >= members.length - 1) return null;
    return { prev: members[idx + 1], next: members[idx + 2] || null };
  }
  if (opts.beforeId) {
    const at = members.findIndex((skill) => skill.id === opts.beforeId);
    if (at < 0) {
      const error = new Error("参照 Skill 不存在");
      error.status = 404;
      throw error;
    }
    if (members[at].id === id) return null;
    return { prev: members[at - 1] || null, next: members[at] };
  }
  const at = members.findIndex((skill) => skill.id === opts.afterId);
  if (at < 0) {
    const error = new Error("参照 Skill 不存在");
    error.status = 404;
    throw error;
  }
  if (members[at].id === id) return null;
  return { prev: members[at], next: members[at + 1] || null };
}

function moveSkillOrder(id, opts = {}) {
  const direction = String(opts.direction || "");
  const provided = [direction, opts.beforeId, opts.afterId].filter(Boolean).length;
  if (provided !== 1 || (direction && !["up", "down"].includes(direction))) {
    const error = new Error("move 需要且只需要 direction 或 beforeId / afterId 之一");
    error.status = 400;
    throw error;
  }
  const target = getSkill(id);
  if (!target) {
    const error = new Error("Skill 不存在");
    error.status = 404;
    throw error;
  }
  const stage = pipeline.stageOf(target);
  const rank = target.source === "builtin" ? 0 : 1;
  const sameRank = (skill) =>
    pipeline.stageOf(skill).id === stage.id && (skill.source === "builtin" ? 0 : 1) === rank;
  let members = listSkills().filter(sameRank);
  let bounds = moveNeighbors(members, id, opts);
  if (!bounds) return { ok: true, moved: false, skills: listSkills() };

  if (pipeline.gapTight(bounds.prev && bounds.prev.order, bounds.next && bounds.next.order)) {
    const stageMembers = listSkills().filter((skill) => pipeline.stageOf(skill).id === stage.id);
    const values = pipeline.compactValues(stageMembers.length);
    const changes = stageMembers
      .map((skill, i) => ({ id: skill.id, order: values[i], before: pipeline.subOrderOf(skill) }))
      .filter((row) => row.order !== row.before);
    persistOrders(changes);
    members = listSkills().filter(sameRank);
    bounds = moveNeighbors(members, id, opts);
    if (!bounds) return { ok: true, moved: false, skills: listSkills() };
  }

  const order = pipeline.placeBetween(
    bounds.prev ? pipeline.subOrderOf(bounds.prev) : null,
    bounds.next ? pipeline.subOrderOf(bounds.next) : null
  );
  persistOrders([{ id, order }]);
  return { ok: true, moved: true, order, skills: listSkills() };
}

module.exports = {
  updateBuiltinMeta,
  writeSkillOrder,
  persistOrders,
  moveNeighbors,
  moveSkillOrder,
};
