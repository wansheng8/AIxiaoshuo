import { useCallback, useRef, useState } from "react";
import { api } from "./api";
import type { ModelProbe } from "./types";

export type ProbeTarget = {
  providerId: string;
  model: string;
  baseUrl?: string;
  protocol?: string;
  apiKey?: string;
};

export type ProbePatch = (providerId: string, model: string, probe: ModelProbe) => void;

function keyOf(item: ProbeTarget) {
  return `${item.providerId}:${item.model}`;
}

export function useProbe(onResult: ProbePatch) {
  const [active, setActive] = useState<Record<string, boolean>>({});
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const stoppedRef = useRef(false);

  const mark = useCallback((key: string, on: boolean) => {
    setActive((prev) => {
      if (on) return { ...prev, [key]: true };
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const exec = useCallback(
    async (item: ProbeTarget): Promise<ModelProbe> => {
      const key = keyOf(item);
      mark(key, true);
      try {
        const r = await api.probeModel({
          baseUrl: item.baseUrl,
          apiKey: item.apiKey || undefined,
          protocol: item.protocol,
          model: item.model,
          providerId: item.providerId.startsWith("tmp_") ? undefined : item.providerId,
        });
        const probe: ModelProbe = {
          ok: Boolean(r.ok),
          ms: Math.max(0, Math.round(Number(r.ms) || 0)),
          reason: r.reason || "",
          at: r.at || new Date().toISOString(),
          stale: false,
        };
        onResult(item.providerId, item.model, probe);
        return probe;
      } catch (err) {
        const probe: ModelProbe = {
          ok: false,
          ms: 0,
          reason: (err as Error).message || "探测失败",
          at: new Date().toISOString(),
          stale: false,
        };
        onResult(item.providerId, item.model, probe);
        return probe;
      } finally {
        mark(key, false);
      }
    },
    [mark, onResult]
  );

  const probeOne = useCallback((item: ProbeTarget) => exec(item), [exec]);

  const probeMany = useCallback(
    async (items: ProbeTarget[], concurrency = 2) => {
      const list = items.filter((item) => item.model);
      if (!list.length) return;
      stoppedRef.current = false;
      let done = 0;
      setProgress({ done, total: list.length });
      const queue = [...list];
      const worker = async () => {
        while (queue.length && !stoppedRef.current) {
          const item = queue.shift() as ProbeTarget;
          await exec(item);
          done += 1;
          setProgress({ done, total: list.length });
        }
      };
      const lanes = Math.max(1, Math.min(concurrency, list.length));
      await Promise.all(Array.from({ length: lanes }, () => worker()));
      setProgress(null);
    },
    [exec]
  );

  const stop = useCallback(() => {
    stoppedRef.current = true;
  }, []);

  return { active, progress, probeOne, probeMany, stop };
}
