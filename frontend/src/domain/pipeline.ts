import definition from "@shared/pipeline.json";
import type { Skill } from "./types";

export type PipelineUi = { tab: string; desk: string; action: string; hint: string };

export type PipelineStage = {
  id: string;
  label: string;
  groupLabel?: string;
  target: string;
  builtin?: string;
  inject?: string;
  artifact?: string;
  field?: string;
  scope?: "novel" | "chapter" | "teardown";
  mode?: "replace" | "append";
  deps?: string[];
  refs?: string[];
  editable?: boolean;
  variant?: boolean;
  tab?: string;
  writing?: boolean;
  craftSlot?: boolean;
  craftName?: string;
  auto?: boolean;
  quick?: number;
  size?: number;
  expectMs?: number;
  ui?: PipelineUi;
  line: string;
  index: number;
};

type RawStage = Omit<PipelineStage, "line" | "index">;
type RawDefinition = {
  version: number;
  trim: { writing: string[]; setting: string[] };
  lines: { id: string; label: string; stages: RawStage[] }[];
};

export const PIPELINE_DEFINITION = definition as unknown as RawDefinition;

export const STAGES: PipelineStage[] = (() => {
  let index = 0;
  const out: PipelineStage[] = [];
  for (const line of PIPELINE_DEFINITION.lines) {
    for (const stage of line.stages) {
      out.push({ ...stage, line: line.id, index });
      index += 1;
    }
  }
  return out;
})();

export const OTHER_STAGE: PipelineStage = {
  id: "other",
  label: "其他",
  target: "",
  line: "",
  index: STAGES.length + 1000,
};

export const GUIDE_TARGET = "guide";

const STAGE_BY_ID = new Map(STAGES.map((stage) => [stage.id, stage]));
const STAGE_BY_BUILTIN = new Map<string, PipelineStage>();
const STAGE_BY_TARGET = new Map<string, PipelineStage>();
for (const stage of STAGES) {
  if (stage.builtin && !STAGE_BY_BUILTIN.has(stage.builtin)) STAGE_BY_BUILTIN.set(stage.builtin, stage);
  if (stage.target && !STAGE_BY_TARGET.has(stage.target)) STAGE_BY_TARGET.set(stage.target, stage);
}

function guideStage(skill: Pick<Skill, "inject">): PipelineStage | null {
  const inject = String(skill.inject || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  for (const key of inject) {
    const stage = STAGE_BY_BUILTIN.get(key) || STAGE_BY_TARGET.get(key) || STAGE_BY_ID.get(key);
    if (stage) return stage;
  }
  return null;
}

export function stageOf(skill: Pick<Skill, "id" | "target" | "inject">): PipelineStage {
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

function uniqueTargets(line: string): { id: string; label: string }[] {
  const out: { id: string; label: string }[] = [];
  const seen = new Set<string>();
  for (const stage of STAGES.filter((row) => row.line === line)) {
    if (seen.has(stage.target)) continue;
    seen.add(stage.target);
    out.push({ id: stage.target, label: stage.groupLabel || stage.label });
  }
  return out;
}

export const TARGETS = uniqueTargets("writing");
export const ALL_GROUPS = uniqueTargets("writing").concat(uniqueTargets("teardown"));

export type StageGroup = { id: string; label: string; stageIds: string[] };

export const WRITING_GROUPS: StageGroup[] = (() => {
  const groups: StageGroup[] = [
    { id: "brief", label: "立项", stageIds: ["brief"] },
    { id: "setting", label: "设定", stageIds: ["characters", "world", "props"] },
    { id: "outline", label: "大纲", stageIds: ["outline", "beats"] },
    { id: "draft", label: "正文审校", stageIds: ["content", "continue", "polish", "review", "suggest", "threads"] },
  ];
  const writing = STAGES.filter((stage) => stage.line === "writing");
  const known = new Set(writing.map((stage) => stage.id));
  const listed = new Set<string>();
  for (const group of groups) {
    for (const id of group.stageIds) {
      if (!known.has(id)) throw new Error(`WRITING_GROUPS 含未知阶段：${id}`);
      if (listed.has(id)) throw new Error(`WRITING_GROUPS 阶段重复：${id}`);
      listed.add(id);
    }
  }
  for (const stage of writing) {
    if (!listed.has(stage.id)) throw new Error(`WRITING_GROUPS 遗漏阶段：${stage.id}`);
  }
  return groups;
})();

export function stagesOfGroup(group: StageGroup): PipelineStage[] {
  return group.stageIds
    .map((id) => STAGE_BY_ID.get(id))
    .filter((stage): stage is PipelineStage => Boolean(stage));
}

export function panelOfStage(stage: PipelineStage): { desk: string; tab?: string } {
  if (stage.ui) return { desk: stage.ui.desk, tab: stage.ui.tab };
  if (stage.line === "teardown") return { desk: "", tab: stage.tab };
  if (stage.id === "threads") return { desk: "threads" };
  if (stage.id === "board") return { desk: "board" };
  return { desk: "write", tab: "content" };
}

export const AUTO_STAGES = STAGES.filter((stage) => stage.auto);

export const TEARDOWN_TABS: { id: string; skillId: string; label: string; field: string }[] = STAGES.filter(
  (stage) => stage.line === "teardown" && stage.field && stage.tab
).map((stage) => ({
  id: stage.tab as string,
  skillId: stage.builtin || "",
  label: stage.label,
  field: stage.field as string,
}));

export type PipeSlotId = "brief" | "characters" | "world" | "outline" | "beats" | "props" | "content";

export type PipeStep = {
  id: PipeSlotId;
  label: string;
  skillId: string;
  desk: string;
  tab: string;
  action: string;
  hint: string;
};

export const PIPELINE: PipeStep[] = AUTO_STAGES.filter((stage) => stage.artifact).map((stage) => ({
  id: stage.artifact as PipeSlotId,
  label: stage.label,
  skillId: stage.builtin || "",
  desk: stage.ui?.desk || "lore",
  tab: stage.ui?.tab || "brief",
  action: stage.ui?.action || stage.label,
  hint: stage.ui?.hint || "",
}));

export const PIPE_SKILL_IDS = new Set(AUTO_STAGES.map((stage) => stage.builtin).filter(Boolean) as string[]);

export function pipeSkillId(id: string): string {
  const stage = STAGES.find((row) => row.artifact === id);
  return stage?.builtin || id;
}

export function pipeSkillSlot(skillId: string): string {
  const stage = STAGE_BY_BUILTIN.get(skillId);
  return stage?.artifact || "";
}

export function expectJobChars(id: string, wordsMax: number): number {
  const stage = STAGE_BY_BUILTIN.get(id) || STAGES.find((row) => row.artifact === id || row.id === id);
  if (!stage) return 800;
  if (stage.builtin === "continue") return Math.min(900, Math.max(400, Math.round(wordsMax * 0.35)));
  if (stage.artifact === "content") return wordsMax;
  return stage.size && stage.size > 0 ? stage.size : 800;
}

export function expectJobMs(id: string): number {
  const stage = STAGE_BY_BUILTIN.get(id) || STAGES.find((row) => row.artifact === id || row.id === id);
  return stage?.expectMs || 28000;
}

function subOrderOf(skill: Skill): number {
  const value = Number(skill.order);
  if (Number.isFinite(value)) return value;
  return skill.source === "builtin" ? 0 : 100;
}

export function compareSkills(a: Skill, b: Skill): number {
  const sa = stageOf(a);
  const sb = stageOf(b);
  if (sa.index !== sb.index) return sa.index - sb.index;
  const ra = a.source === "builtin" ? 0 : 1;
  const rb = b.source === "builtin" ? 0 : 1;
  if (ra !== rb) return ra - rb;
  const na = subOrderOf(a);
  const nb = subOrderOf(b);
  if (na !== nb) return na - nb;
  return String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0;
}

export function sortedSkills(list: Skill[]): Skill[] {
  return [...list].sort(compareSkills);
}

export function groupSkills(list: Skill[]): { label: string; items: Skill[] }[] {
  const groups: { label: string; items: Skill[] }[] = [];
  for (const target of ALL_GROUPS) {
    const items = sortedSkills(list.filter((skill) => skill.target === target.id));
    if (items.length) groups.push({ label: target.label, items });
  }
  const known = new Set(ALL_GROUPS.map((target) => target.id));
  const other = sortedSkills(list.filter((skill) => !known.has(skill.target)));
  if (other.length) groups.push({ label: "其他", items: other });
  return groups;
}
