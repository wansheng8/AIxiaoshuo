"use strict";

const fs = require("fs");
const { ensureDirs, now } = require("../store");
const { customPath, serializeSkill, getSkill, listSkills } = require("./core");
const {
  CRAFT_SLOTS,
  WRITING_INJECT,
  craftParentId,
  parseCraftSections,
  writeSkillOverride,
  mergeCraftSection,
  factoryBody,
} = require("./factory");

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
  listCraftOverrides,
  deleteCraftOverride,
  upsertInjectSkill,
  applyCraftToSkills,
};
