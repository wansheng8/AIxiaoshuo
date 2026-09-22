"use strict";

const fs = require("fs");
const path = require("path");
const { ROOT, uid, now } = require("../store");
const { safeJoin, getSkill, customPath, serializeSkill } = require("./core");

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

module.exports = {
  recordHistory,
  listHistory,
  readHistoryEntry,
  restoreHistory,
  clearHistory,
};
