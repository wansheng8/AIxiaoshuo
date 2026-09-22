import type { ReactNode } from "react";

export default function InsFold({
  title,
  open,
  onToggle,
  hint,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className={`ins-block ${open ? "" : "is-fold"}`}>
      <button type="button" className="ins-fold-h" onClick={onToggle}>
        <h4>{title}</h4>
        <span>{open ? "收起" : hint || "展开"}</span>
      </button>
      {open ? children : null}
    </div>
  );
}
