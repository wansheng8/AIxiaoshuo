import type { ModelProbe } from "./types";

export type ProbeState = "ok" | "fail" | "stale" | "idle";

export function probeState(probe?: ModelProbe): ProbeState {
  if (!probe) return "idle";
  if (probe.stale) return "stale";
  return probe.ok ? "ok" : "fail";
}

export function probeLabel(probe?: ModelProbe) {
  if (!probe || probe.stale) return "未测";
  if (!probe.ok) return "不可用";
  return probe.ms ? `${probe.ms} ms` : "可用";
}

export default function ProbeBadge({ probe, hint }: { probe?: ModelProbe; hint?: string }) {
  const state = probeState(probe);
  const label = probeLabel(probe);
  const title = hint || (state === "fail" && probe?.reason ? probe.reason : state === "ok" ? "最近一次探测可用" : "尚未探测或已过期，建议重测");
  return (
    <span className={`probe ${state}`} title={title}>
      <i />
      <em>{label}</em>
    </span>
  );
}
