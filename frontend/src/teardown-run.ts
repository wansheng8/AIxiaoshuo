import { api, generateTeardown } from "./api";
import { beginJob, finishJob, getJob, patchJob } from "./jobs";
import type { Teardown } from "./types";

export const TEAR_TABS = [
  { id: "beats", skillId: "teardown-beats", label: "章节章纲", field: "beats" as const },
  { id: "cast", skillId: "teardown-cast", label: "角色档案", field: "cast" as const },
  { id: "golden", skillId: "teardown-golden", label: "黄金三章", field: "golden" as const },
  { id: "events", skillId: "teardown-events", label: "事件线", field: "events" as const },
  { id: "outline", skillId: "teardown-outline", label: "整体大纲", field: "outline" as const },
  { id: "detail", skillId: "teardown-detail", label: "详细大纲", field: "outlineDetail" as const },
  { id: "fine", skillId: "teardown-fine", label: "精细大纲", field: "outlineFine" as const },
  { id: "imitate", skillId: "teardown-imitate", label: "仿写骨架", field: "imitate" as const },
] as const;

export type TearTabId = (typeof TEAR_TABS)[number]["id"];

const PIPE = TEAR_TABS.map((tab) => tab.skillId);

type TearStep = {
  skillId: string;
  fromIndex?: number;
  label: string;
  tabId: string;
};

type TearHooks = {
  onRow?: (row: Teardown) => void;
  onDraft?: (text: string) => void;
};

let hooks: TearHooks = {};
let paused = false;
let skipCurrent = false;
let activeController: AbortController | null = null;
let resumeResolve: (() => void) | null = null;

export function pauseTeardown() {
  paused = true;
}

export function resumeTeardown() {
  paused = false;
  resumeResolve?.();
  resumeResolve = null;
}

export function skipTeardown() {
  skipCurrent = true;
  activeController?.abort();
}

export function teardownPaused() {
  return paused;
}

function gate(signal: AbortSignal) {
  if (!paused) return Promise.resolve();
  return new Promise<void>((resolve) => {
    resumeResolve = resolve;
    signal.addEventListener("abort", () => resolve(), { once: true });
  });
}

function abortError() {
  const err = new Error("已停止");
  err.name = "AbortError";
  return err;
}

export function attachTeardown(next: TearHooks) {
  hooks = next;
  return () => {
    if (hooks === next) hooks = {};
  };
}

export function scopeEndOf(row: Teardown) {
  return row.scopeEnd || Math.min(30, (row.chapters || []).length);
}

export function skillFilled(row: Teardown, skillId: string) {
  if (skillId === "teardown-beats") {
    const end = scopeEndOf(row);
    const scoped = (row.chapters || []).filter((ch) => ch.index <= end);
    return scoped.length > 0 && scoped.every((ch) => String(ch.beat || "").trim());
  }
  const tab = TEAR_TABS.find((item) => item.skillId === skillId);
  if (!tab) return false;
  return Boolean(String(row[tab.field] || "").trim());
}

function beatsBatchFilled(row: Teardown, from: number, end: number) {
  const last = Math.min(from + 7, end);
  const batch = (row.chapters || []).filter((ch) => ch.index >= from && ch.index <= last);
  return batch.length > 0 && batch.every((ch) => String(ch.beat || "").trim());
}

function stopped(err: unknown) {
  if (!err) return false;
  if (err instanceof DOMException && err.name === "AbortError") return true;
  return err instanceof Error && /已停止|aborted a request/i.test(err.message);
}

function planPipe(row: Teardown): TearStep[] {
  const end = scopeEndOf(row);
  const steps: TearStep[] = [];
  for (const tab of TEAR_TABS) {
    if (tab.skillId === "teardown-beats") {
      for (let from = 1; from <= end; from += 8) {
        if (beatsBatchFilled(row, from, end)) continue;
        steps.push({
          skillId: tab.skillId,
          fromIndex: from,
          label: `章纲 ${from}-${Math.min(from + 7, end)}`,
          tabId: tab.id,
        });
      }
    } else if (tab.skillId === "teardown-fine") {
      if (skillFilled(row, tab.skillId)) continue;
      for (let from = 1; from <= end; from += 8) {
        steps.push({
          skillId: tab.skillId,
          fromIndex: from,
          label: `精细大纲 ${from}-${Math.min(from + 7, end)}`,
          tabId: tab.id,
        });
      }
    } else if (!skillFilled(row, tab.skillId)) {
      steps.push({ skillId: tab.skillId, label: tab.label, tabId: tab.id });
    }
  }
  if (!row.skillId) steps.push({ skillId: "teardown-craft", label: "提炼技法", tabId: "" });
  return steps;
}

function planTab(row: Teardown, tabId: TearTabId): TearStep[] {
  const tab = TEAR_TABS.find((item) => item.id === tabId);
  if (!tab) return [];
  const end = scopeEndOf(row);
  const steps: TearStep[] = [];
  if (tab.skillId === "teardown-beats") {
    for (let from = 1; from <= end; from += 8) {
      steps.push({
        skillId: tab.skillId,
        fromIndex: from,
        label: `章纲 ${from}-${Math.min(from + 7, end)}`,
        tabId: tab.id,
      });
    }
  } else if (tab.skillId === "teardown-fine") {
    for (let from = 1; from <= end; from += 8) {
      steps.push({
        skillId: tab.skillId,
        fromIndex: from,
        label: `精细大纲 ${from}-${Math.min(from + 7, end)}`,
        tabId: tab.id,
      });
    }
  } else {
    steps.push({ skillId: tab.skillId, label: tab.label, tabId: tab.id });
  }
  const covers = (sid: string) => skillFilled(row, sid) || steps.some((step) => step.skillId === sid);
  if (!row.skillId && PIPE.every(covers)) {
    steps.push({ skillId: "teardown-craft", label: "提炼技法", tabId: "" });
  }
  return steps;
}

async function runOne(id: string, step: TearStep, signal: AbortSignal) {
  let halted = false;
  let stopped = false;
  let haltedReason = "";
  let draft = "";
  patchJob({ draft: "", chars: 0 });
  hooks.onDraft?.("");
  await generateTeardown(
    id,
    { skillId: step.skillId, fromIndex: step.fromIndex },
    {
      signal,
      onToken: (text) => {
        draft += text;
        const chars = Array.from(draft.replace(/\s+/g, "")).length;
        patchJob({ draft, chars });
        hooks.onDraft?.(draft);
      },
      onError: (message) => patchJob({ error: message }),
      onDone: (info) => {
        if (info.stopped) {
          halted = true;
          stopped = true;
        }
        if (info.incomplete) {
          halted = true;
          haltedReason = info.message || "生成中断，本轮结果不完整";
          patchJob({ error: haltedReason });
        }
      },
    }
  );
  if (halted) {
    if (stopped) {
      const err = new Error("已停止");
      err.name = "AbortError";
      throw err;
    }
    throw new Error(haltedReason || "生成中断");
  }
  if (signal.aborted) {
    const err = new Error("已停止");
    err.name = "AbortError";
    throw err;
  }
  const next = await api.teardown(id);
  hooks.onRow?.(next);
  return next;
}

async function runSteps(row: Teardown, steps: TearStep[], title: string) {
  if (!steps.length) {
    finishJob();
    return row;
  }
  const jobSignal = beginJob({
    kind: "teardown",
    targetId: row.id,
    href: `/teardown/${row.id}`,
    title,
    step: steps[0].label,
    tabId: steps[0].tabId,
    stepIndex: 1,
    stepTotal: steps.length,
    percent: 0,
  });
  paused = false;
  skipCurrent = false;
  let current = row;
  try {
    for (let i = 0; i < steps.length; i += 1) {
      const step = steps[i];
      await gate(jobSignal);
      if (jobSignal.aborted) throw abortError();
      const stepCtrl = new AbortController();
      activeController = stepCtrl;
      jobSignal.addEventListener("abort", () => stepCtrl.abort(), { once: true });
      patchJob({
        step: step.label,
        tabId: step.tabId,
        stepIndex: i + 1,
        stepTotal: steps.length,
        error: "",
      });
      try {
        current = await runOne(row.id, step, stepCtrl.signal);
      } catch (err) {
        if (skipCurrent && !jobSignal.aborted) {
          skipCurrent = false;
          patchJob({ draft: "", chars: 0 });
          hooks.onDraft?.("");
          continue;
        }
        throw err;
      } finally {
        if (activeController === stepCtrl) activeController = null;
      }
    }
    paused = false;
    finishJob();
    return current;
  } catch (err) {
    paused = false;
    const live = getJob();
    if (live.kind === "teardown" && live.targetId === row.id) {
      finishJob(stopped(err) ? "已停止" : err instanceof Error ? err.message : "拆书中断");
    }
    throw err;
  }
}

export async function runTeardownPipe(row: Teardown) {
  if (getJob().running) return row;
  return runSteps(row, planPipe(row), row.title);
}

export async function runTeardownTab(row: Teardown, tabId: TearTabId) {
  if (getJob().running) return row;
  return runSteps(row, planTab(row, tabId), row.title);
}

export async function runTeardownCraft(row: Teardown) {
  if (getJob().running) return row;
  return runSteps(row, [{ skillId: "teardown-craft", label: "提炼技法", tabId: "" }], row.title);
}
