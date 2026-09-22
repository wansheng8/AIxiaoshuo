const fs = require("fs");
const path = require("path");
const { ROOT } = require("./store");

const PIPELINE_FILE = path.join(ROOT, "shared", "pipeline.json");

const STEP = 100;
const GAP_EPSILON = 1e-4;
const GUIDE_TARGET = "guide";

function loadDefinition() {
  let raw;
  try {
    raw = fs.readFileSync(PIPELINE_FILE, "utf8");
  } catch (err) {
    throw new Error(`[moshu] 无法读取流水线定义 ${PIPELINE_FILE}：${err.message}`);
  }
  let json;
  try {
    json = JSON.parse(raw);
  } catch (err) {
    throw new Error(`[moshu] 流水线定义 JSON 解析失败：${err.message}`);
  }
  if (!json || !Array.isArray(json.lines) || !json.lines.length) {
    throw new Error("[moshu] 流水线定义缺少 lines 数组");
  }
  const seen = new Set();
  let index = 0;
  const stages = [];
  for (const line of json.lines) {
    if (!line || !Array.isArray(line.stages)) {
      throw new Error(`[moshu] 流水线「${line && line.id}」缺少 stages 数组`);
    }
    const lineTargets = new Map();
    for (const stage of line.stages) {
      if (!stage.id || !stage.label || !stage.target) {
        throw new Error(`[moshu] 流水线阶段缺少 id/label/target：${JSON.stringify(stage)}`);
      }
      if (seen.has(stage.id)) {
        throw new Error(`[moshu] 流水线阶段 id 重复：${stage.id}`);
      }
      const prevStage = lineTargets.get(stage.target);
      if (prevStage && !stage.variant && !prevStage.variant) {
        throw new Error(`[moshu] 流水线「${line.id}」阶段 target 重复：${stage.target}`);
      }
      seen.add(stage.id);
      lineTargets.set(stage.target, stage);
      stages.push({ ...stage, line: line.id, index });
      index += 1;
    }
  }
  if (!json.trim || !json.trim.writing || !json.trim.setting) {
    throw new Error("[moshu] 流水线定义缺少 trim.writing / trim.setting");
  }
  return { version: json.version || 1, trim: json.trim, lines: json.lines, stages };
}

const DEFINITION = loadDefinition();
const STAGES = DEFINITION.stages;

const OTHER_STAGE = { id: "other", label: "其他", target: "", line: "", index: STAGES.length + 1000 };

const STAGE_BY_ID = new Map(STAGES.map((stage) => [stage.id, stage]));
const STAGE_BY_BUILTIN = new Map();
const STAGE_BY_TARGET = new Map();
for (const stage of STAGES) {
  if (stage.builtin && !STAGE_BY_BUILTIN.has(stage.builtin)) STAGE_BY_BUILTIN.set(stage.builtin, stage);
  if (stage.target && !STAGE_BY_TARGET.has(stage.target)) STAGE_BY_TARGET.set(stage.target, stage);
}

function guideStage(skill) {
  const inject = String((skill && skill.inject) || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  for (const key of inject) {
    const stage = STAGE_BY_BUILTIN.get(key) || STAGE_BY_TARGET.get(key) || STAGE_BY_ID.get(key);
    if (stage) return stage;
  }
  return null;
}

function stageOf(skill) {
  if (!skill) return OTHER_STAGE;
  const byBuiltin = STAGE_BY_BUILTIN.get(String(skill.id || ""));
  if (byBuiltin) return byBuiltin;
  const byTarget = STAGE_BY_TARGET.get(String(skill.target || ""));
  if (byTarget) return byTarget;
  if (String(skill.target || "") === GUIDE_TARGET) {
    const byGuide = guideStage(skill);
    if (byGuide) return byGuide;
  }
  return OTHER_STAGE;
}

function stageIndex(stage) {
  return stage ? stage.index : OTHER_STAGE.index;
}

function stagesInLine(lineId) {
  return STAGES.filter((stage) => stage.line === lineId);
}

function writingTargets() {
  return new Set(STAGES.filter((stage) => stage.writing).map((stage) => stage.target));
}

function proseContextTargets() {
  return new Set(STAGES.filter((stage) => stage.writing && stage.target === "content").map((stage) => stage.target));
}

function injectTargets() {
  return STAGES.filter((stage) => stage.inject).map((stage) => stage.inject);
}

function craftSlots() {
  return STAGES.filter((stage) => stage.craftSlot).map((stage) => ({ id: stage.inject || stage.builtin, name: stage.craftName || stage.label }));
}

function creatableTargets() {
  const out = [];
  const seen = new Set();
  for (const stage of stagesInLine("writing")) {
    if (!seen.has(stage.target)) {
      seen.add(stage.target);
      out.push(stage.target);
    }
  }
  return out;
}

function autoStages() {
  return STAGES.filter((stage) => stage.auto);
}

function quickStages() {
  return STAGES.filter((stage) => Number.isFinite(stage.quick)).sort((a, b) => a.quick - b.quick);
}

function dropOrder(writing) {
  const list = writing ? DEFINITION.trim.writing : DEFINITION.trim.setting;
  return Array.isArray(list) ? list.slice() : [];
}

function isWritingSkill(skill) {
  return writingTargets().has(String((skill && skill.target) || ""));
}

function isProseContextSkill(skill) {
  return proseContextTargets().has(String((skill && skill.target) || ""));
}

function stageBySkill(skill) {
  if (!skill) return null;
  const byBuiltin = STAGE_BY_BUILTIN.get(String(skill.id || ""));
  if (byBuiltin) return byBuiltin;
  const byTarget = STAGE_BY_TARGET.get(String(skill.target || ""));
  if (byTarget) return byTarget;
  if (String(skill.target || "") === GUIDE_TARGET) return guideStage(skill);
  return null;
}

function fieldOf(stage) {
  if (!stage) return "";
  if (stage.field) return stage.field;
  if (stage.target === "content") return "content";
  return stage.artifact || stage.target || "";
}

function modeOf(stage) {
  return stage && stage.mode === "append" ? "append" : "replace";
}

function depsOf(stage) {
  return stage && Array.isArray(stage.deps) ? stage.deps.slice() : [];
}

function refsOf(stage) {
  return stage && Array.isArray(stage.refs) ? stage.refs.slice() : [];
}

function writingSkillIds() {
  return STAGES.filter((stage) => stage.writing && stage.builtin).map((stage) => stage.builtin);
}

function teardownTabs() {
  return STAGES.filter((stage) => stage.line === "teardown" && stage.field && stage.tab).map((stage) => ({
    id: stage.tab,
    field: stage.field,
    label: stage.label,
  }));
}

function teardownSkillField() {
  const out = {};
  for (const stage of STAGES) {
    if (stage.line === "teardown" && stage.builtin && stage.field) out[stage.builtin] = stage.field;
  }
  return out;
}

function subOrderOf(skill) {
  const value = Number(skill && skill.order);
  if (Number.isFinite(value)) return value;
  return skill && skill.source === "builtin" ? 0 : 100;
}

function compareSkills(a, b) {
  const sa = stageOf(a);
  const sb = stageOf(b);
  if (sa.index !== sb.index) return sa.index - sb.index;
  const ra = a && a.source === "builtin" ? 0 : 1;
  const rb = b && b.source === "builtin" ? 0 : 1;
  if (ra !== rb) return ra - rb;
  const na = subOrderOf(a);
  const nb = subOrderOf(b);
  if (na !== nb) return na - nb;
  const ida = String((a && a.id) || "");
  const idb = String((b && b.id) || "");
  if (ida < idb) return -1;
  if (ida > idb) return 1;
  return 0;
}

function normalizeSkills(list) {
  return [...(list || [])].sort(compareSkills);
}

function placeBetween(prevSub, nextSub) {
  const prev = prevSub == null ? null : Number(prevSub);
  const next = nextSub == null ? null : Number(nextSub);
  if (prev == null && next == null) return STEP;
  if (prev == null) return next - STEP;
  if (next == null) return prev + STEP;
  return (prev + next) / 2;
}

function gapTight(prevSub, nextSub) {
  if (prevSub == null || nextSub == null) return false;
  return Math.abs(Number(nextSub) - Number(prevSub)) < GAP_EPSILON;
}

function compactValues(count) {
  const out = [];
  for (let i = 0; i < Number(count); i += 1) out.push((i + 1) * STEP);
  return out;
}

module.exports = {
  PIPELINE_FILE,
  DEFINITION,
  STAGES,
  OTHER_STAGE,
  GUIDE_TARGET,
  STEP,
  GAP_EPSILON,
  stageOf,
  stageIndex,
  stagesInLine,
  writingTargets,
  proseContextTargets,
  injectTargets,
  craftSlots,
  creatableTargets,
  autoStages,
  quickStages,
  dropOrder,
  isWritingSkill,
  isProseContextSkill,
  stageBySkill,
  fieldOf,
  modeOf,
  depsOf,
  refsOf,
  writingSkillIds,
  teardownTabs,
  teardownSkillField,
  subOrderOf,
  compareSkills,
  normalizeSkills,
  placeBetween,
  gapTight,
  compactValues,
};
