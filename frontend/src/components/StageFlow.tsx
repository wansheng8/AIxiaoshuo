import { useEffect, useRef } from "react";
import type { StageAction, StageCardModel, StageStatus } from "../domain/stage-flow";

export const STATUS_LABEL: Record<StageStatus, string> = {
  todo: "未开始",
  active: "进行中",
  done: "已完成",
  failed: "失败",
  skipped: "已跳过",
};

export const ACTION_LABEL: Record<StageAction, string> = {
  run: "开始",
  rerun: "重跑",
  skip: "跳过",
  edit: "编辑",
  view: "查看",
};

export function StageCard({
  card,
  busy,
  onAction,
  compact,
  innerRef,
}: {
  card: StageCardModel;
  busy?: boolean;
  onAction: (action: StageAction, card: StageCardModel) => void;
  compact?: boolean;
  innerRef?: (node: HTMLLIElement | null) => void;
}) {
  return (
    <li ref={innerRef} className={`stage-card ${card.status} ${compact ? "compact" : ""}`}>
      <header className="stage-card-head">
        <span className="stage-card-n">{card.order + 1}</span>
        <b className="stage-card-title">{card.stage.label}</b>
        <em className="stage-card-status">{STATUS_LABEL[card.status]}</em>
      </header>
      {card.produced.length > 0 && (
        <p className="stage-card-out">{card.produced[0].preview || "已生成"}</p>
      )}
      {card.deps.length > 0 && (
        <div className="stage-card-deps">
          {card.deps.map((dep) => (
            <span key={dep.id} className={`chip ${dep.satisfied ? "ok" : ""}`}>
              依赖·{dep.label}
            </span>
          ))}
        </div>
      )}
      {card.refs.length > 0 && (
        <div className="stage-card-refs">
          {card.refs.map((ref) => (
            <span key={ref.kind} className="chip">
              {ref.label} {ref.count}
            </span>
          ))}
        </div>
      )}
      {card.actions.length > 0 && (
        <footer className="stage-card-actions">
          {card.actions.map((action) => (
            <button
              key={action}
              type="button"
              className={action === "run" || action === "rerun" ? "mini" : "mini ghost"}
              disabled={busy && (action === "run" || action === "rerun")}
              onClick={() => onAction(action, card)}
            >
              {ACTION_LABEL[action]}
            </button>
          ))}
        </footer>
      )}
    </li>
  );
}

export default function StageFlow({
  cards,
  busy,
  activeStageId,
  onAction,
}: {
  cards: StageCardModel[];
  busy?: boolean;
  activeStageId?: string;
  onAction: (action: StageAction, card: StageCardModel) => void;
}) {
  const activeRef = useRef<HTMLLIElement | null>(null);

  useEffect(() => {
    if (!activeStageId || !activeRef.current) return;
    activeRef.current.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }, [activeStageId]);

  return (
    <ol className="stage-flow">
      {cards.map((card) => (
        <StageCard
          key={card.stage.id}
          card={card}
          busy={busy}
          onAction={onAction}
          innerRef={card.status === "active" ? (node) => { activeRef.current = node; } : undefined}
        />
      ))}
    </ol>
  );
}
