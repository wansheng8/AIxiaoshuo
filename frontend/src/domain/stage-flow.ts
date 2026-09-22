import { STAGES, type PipelineStage } from "./pipeline";
import type { Chapter, Novel } from "./types";

export type StageStatus = "todo" | "active" | "done" | "failed" | "skipped";
export type StageAction = "run" | "rerun" | "skip" | "edit" | "view";

export type StageCardModel = {
  stage: PipelineStage;
  order: number;
  status: StageStatus;
  filled: boolean;
  produced: { label: string; preview: string }[];
  deps: { id: string; label: string; satisfied: boolean }[];
  refs: { kind: string; label: string; count: number }[];
  actions: StageAction[];
};

const REF_LABEL: Record<string, string> = {
  characters: "人物",
  props: "道具",
  threads: "伏笔",
  beats: "细节拍",
};

function previewOf(text: string): string {
  return String(text || "")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/[*_>`]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 64);
}

function countHeadings(text: string): number {
  const matches = String(text || "").match(/^#{2,4}\s+\S+/gm);
  if (matches && matches.length) return matches.length;
  const bullets = String(text || "").match(/^[-*]\s+\S+/gm);
  return bullets ? bullets.length : 0;
}

type Source = {
  novel?: Novel | null;
  chapter?: Chapter | null;
  record?: Record<string, unknown> | null;
};

function sourceOf(stage: PipelineStage, src: Source): Record<string, unknown> | null {
  if (stage.scope === "teardown") return src.record || null;
  if (stage.scope === "chapter") return (src.chapter as unknown as Record<string, unknown>) || null;
  return (src.novel as unknown as Record<string, unknown>) || null;
}

function fieldText(stage: PipelineStage, src: Source): string {
  const field = String(stage.field || "");
  if (!field) return "";
  if (field === "threads") return (src.novel?.threads || []).length ? "threads" : "";
  return String(sourceOf(stage, src)?.[field] || "");
}

function isFilled(stage: PipelineStage, src: Source): boolean {
  const field = String(stage.field || "");
  if (field === "threads") return (src.novel?.threads || []).length > 0;
  return Boolean(fieldText(stage, src).trim());
}

function refCount(src: Source, chapter: Chapter | null | undefined, kind: string): number {
  if (kind === "threads") return (src.novel?.threads || []).length;
  if (kind === "characters") return countHeadings(String(src.novel?.characters || "")) || (String(src.novel?.characters || "").trim() ? 1 : 0);
  if (kind === "props") return countHeadings(String(src.novel?.props || "")) || (String(src.novel?.props || "").trim() ? 1 : 0);
  if (kind === "beats") return countHeadings(String(chapter?.beats || "")) || (String(chapter?.beats || "").trim() ? 1 : 0);
  return 0;
}

export function buildStageFlow(opts: {
  novel?: Novel | null;
  chapter?: Chapter | null;
  record?: Record<string, unknown> | null;
  line?: string;
  activeStageId?: string;
  failedStageId?: string;
  skipped?: Iterable<string>;
  filled?: Record<string, boolean>;
}): StageCardModel[] {
  const src: Source = { novel: opts.novel || null, chapter: opts.chapter || null, record: opts.record || null };
  const line = opts.line || "writing";
  const skipped = new Set(opts.skipped || []);
  const rows = STAGES.filter((stage) => stage.line === line);

  const filledById = new Map<string, boolean>();
  for (const stage of rows) {
    const override = opts.filled && Object.prototype.hasOwnProperty.call(opts.filled, stage.id) ? opts.filled[stage.id] : undefined;
    filledById.set(stage.id, override === undefined ? isFilled(stage, src) : Boolean(override));
  }

  return rows.map((stage, order) => {
    const filled = filledById.get(stage.id) || false;
    let status: StageStatus = "todo";
    if (opts.activeStageId && opts.activeStageId === stage.id) status = "active";
    else if (opts.failedStageId && opts.failedStageId === stage.id) status = "failed";
    else if (filled) status = "done";
    else if (skipped.has(stage.id)) status = "skipped";

    const text = fieldText(stage, src);
    const preview =
      stage.field === "threads"
        ? `${(src.novel?.threads || []).length} 条伏笔`
        : previewOf(text);
    const produced = filled ? [{ label: stage.field || stage.label, preview: preview || "已生成" }] : [];

    const deps = (stage.deps || []).map((depId) => {
      const dep = STAGES.find((row) => row.id === depId);
      return { id: depId, label: dep?.label || depId, satisfied: filledById.get(depId) || false };
    });

    const refs = (stage.refs || [])
      .map((kind) => ({ kind, label: REF_LABEL[kind] || kind, count: refCount(src, src.chapter, kind) }))
      .filter((row) => row.count > 0);

    let actions: StageAction[] = [];
    if (status === "active") actions = [];
    else if (status === "done") actions = ["view", "rerun", ...(stage.editable ? (["edit"] as StageAction[]) : [])];
    else actions = ["run", ...(stage.editable ? (["edit"] as StageAction[]) : []), "skip"];

    return { stage, order, status, filled, produced, deps, refs, actions };
  });
}
