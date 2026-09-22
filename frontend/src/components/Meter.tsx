import { useEffect, useRef, useState } from "react";

export function waitPercent(elapsedMs: number, expectMs = 20000) {
  const t = Math.max(0, elapsedMs) / Math.max(expectMs, 4000);
  return Math.round(Math.min(92, (1 - Math.exp(-t * 1.55)) * 92));
}

export function formatWait(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} 秒`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r ? `${m} 分 ${r} 秒` : `${m} 分钟`;
}

export function useWaitMeter(running: boolean, expectMs = 20000, resetKey = "") {
  const [elapsed, setElapsed] = useState(0);
  const start = useRef(0);
  useEffect(() => {
    if (!running) {
      start.current = 0;
      setElapsed(0);
      return;
    }
    start.current = Date.now();
    const tick = () => setElapsed(Date.now() - start.current);
    tick();
    const timer = window.setInterval(tick, 200);
    return () => window.clearInterval(timer);
  }, [running, expectMs, resetKey]);
  return {
    elapsed,
    percent: running ? waitPercent(elapsed, expectMs) : 0,
  };
}

export default function Meter(props: {
  percent: number;
  label: string;
  running?: boolean;
  compact?: boolean;
}) {
  const pct = Math.max(0, Math.min(100, props.percent));
  return (
    <div
      className={`pipe-meter ${props.running ? "run" : ""} ${props.compact ? "compact" : ""}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-label={props.label}
    >
      <div className="pipe-meter-kicker">
        <b>{pct}%</b>
        <span>{props.label}</span>
      </div>
      <div className="pipe-meter-track">
        <i className="pipe-meter-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function LoadingMeter({ label }: { label: string }) {
  const { percent, elapsed } = useWaitMeter(true, 9000);
  return <Meter percent={percent} label={`${label}${elapsed ? ` · ${formatWait(elapsed)}` : ""}`} running />;
}
