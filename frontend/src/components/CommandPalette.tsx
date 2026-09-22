import { useEffect, useMemo, useState } from "react";

export type PaletteItem = {
  id: string;
  group: string;
  label: string;
  hint?: string;
  run: () => void;
};

export default function CommandPalette({
  open,
  query,
  onQuery,
  onClose,
  items,
}: {
  open: boolean;
  query: string;
  onQuery: (q: string) => void;
  onClose: () => void;
  items: PaletteItem[];
}) {
  const [cursor, setCursor] = useState(0);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items.slice(0, 24);
    return items.filter((item) => `${item.group}${item.label}${item.hint || ""}`.toLowerCase().includes(q)).slice(0, 24);
  }, [items, query]);

  useEffect(() => {
    setCursor(0);
  }, [query, open]);

  useEffect(() => {
    setCursor((n) => Math.min(Math.max(0, n), Math.max(0, filtered.length - 1)));
  }, [filtered]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setCursor((n) => Math.min(Math.max(0, filtered.length - 1), n + 1));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setCursor((n) => Math.max(0, n - 1));
      }
      if (e.key === "Enter") {
        e.preventDefault();
        filtered[cursor]?.run();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, filtered, cursor, onClose]);

  if (!open) return null;
  return (
    <div className="palette-back" onClick={onClose}>
      <div className="palette" onClick={(e) => e.stopPropagation()}>
        <input
          autoFocus
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="跳转章节、跑 Skill、切桌面、找未收伏笔"
        />
        <div className="palette-list">
          {filtered.length === 0 && <p className="muted">没有匹配项</p>}
          {filtered.map((item, i) => (
            <button
              key={item.id}
              className={`palette-item ${i === cursor ? "on" : ""}`}
              onMouseEnter={() => setCursor(i)}
              onClick={() => {
                item.run();
                onClose();
              }}
            >
              <small>{item.group}</small>
              <b>{item.label}</b>
              {item.hint && <span>{item.hint}</span>}
            </button>
          ))}
        </div>
        <p className="palette-foot">Enter 执行 · Esc 关闭 · Ctrl+K 呼出</p>
      </div>
    </div>
  );
}
