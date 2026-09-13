import { useEffect, useState } from "react";

export type JobSnap = {
  running: boolean;
  kind: "" | "teardown" | "studio";
  targetId: string;
  href: string;
  title: string;
  step: string;
  tabId: string;
  stepIndex: number;
  stepTotal: number;
  percent: number;
  chars: number;
  draft: string;
  error: string;
  startedAt: number;
};

const idle: JobSnap = {
  running: false,
  kind: "",
  targetId: "",
  href: "",
  title: "",
  step: "",
  tabId: "",
  stepIndex: 0,
  stepTotal: 0,
  percent: 0,
  chars: 0,
  draft: "",
  error: "",
  startedAt: 0,
};

let snap: JobSnap = { ...idle };
let abort: AbortController | null = null;
let stopExtra: (() => void) | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const fn of listeners) fn();
}

export function getJob(): JobSnap {
  return snap;
}

export function subscribeJob(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function useJob() {
  const [state, setState] = useState(snap);
  useEffect(() => {
    setState(getJob());
    return subscribeJob(() => setState(getJob()));
  }, []);
  return state;
}

export function patchJob(p: Partial<JobSnap>) {
  snap = { ...snap, ...p };
  emit();
}

export function beginJob(p: Partial<JobSnap>) {
  abort?.abort();
  stopExtra = null;
  abort = new AbortController();
  snap = { ...idle, running: true, startedAt: Date.now(), ...p };
  emit();
  return abort.signal;
}

export function jobController() {
  return abort;
}

export function setJobStop(fn: (() => void) | null) {
  stopExtra = fn;
}

export function stopJob() {
  stopExtra?.();
  abort?.abort();
}

export function finishJob(error?: string) {
  snap = {
    ...snap,
    running: false,
    error: error || "",
    percent: error ? snap.percent : 100,
    draft: error ? snap.draft : "",
  };
  abort = null;
  stopExtra = null;
  emit();
}

export function jobDisplayPercent(job: JobSnap, waitPct: number) {
  if (!job.running) return job.percent;
  const total = Math.max(job.stepTotal, 1);
  const done = Math.max(job.stepIndex - 1, 0);
  return Math.round(Math.min(99, (done / total) * 100 + (Math.max(0, waitPct) / 100) * (100 / total)));
}

export function jobLabel(job: JobSnap) {
  if (!job.running && !job.step) return "";
  const head = job.stepTotal ? `${Math.min(job.stepIndex, job.stepTotal)}/${job.stepTotal} ` : "";
  const tail = job.chars ? ` · ${job.chars} 字` : "";
  return `${head}${job.step || "生成中"}${tail}`;
}
