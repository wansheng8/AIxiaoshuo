import { useState } from "react";
import type { StageGroup } from "../domain/pipeline";
import { stagesOfGroup } from "../domain/pipeline";
import { STATUS_LABEL } from "./StageFlow";
import type { StageAction, StageCardModel } from "../domain/stage-flow";

export type StageRailExtra = { id: string; label: string; groupId: string };

export type StageRailProgress = { stageId: string; percent: number };

export default function StageRail({
  groups,
  cards,
  activeStageId,
  busy,
  progress,
  collapsedGroups = [],
  extras = [],
  onSelect,
  onExtra,
  onToggleGroup,
}: {
  groups: StageGroup[];
  cards: StageCardModel[];
  activeStageId?: string;
  busy?: boolean;
  progress?: StageRailProgress | null;
  collapsedGroups?: string[];
  extras?: StageRailExtra[];
  onSelect: (card: StageCardModel) => void;
  onExtra?: (id: string) => void;
  onToggleGroup?: (groupId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const byId = new Map(cards.map((card) => [card.stage.id, card]));
  const collapsed = new Set(collapsedGroups);
  const keyword = query.trim().toLowerCase();
  const searching = keyword.length > 0;

  const sections = groups
    .map((group) => {
      const stages = stagesOfGroup(group).filter(
        (stage) => !searching || stage.label.toLowerCase().includes(keyword),
      );
      const groupExtras = extras.filter(
        (extra) => extra.groupId === group.id && (!searching || extra.label.toLowerCase().includes(keyword)),
      );
      return { group, stages, extras: groupExtras };
    })
    .filter((section) => section.stages.length > 0 || section.extras.length > 0);

  return (
    <nav className="stage-rail" aria-label="阶段轨">
      <div className="stage-rail-search">
        <input
          value={query}
          placeholder="筛选阶段"
          onChange={(event) => setQuery(event.target.value)}
          aria-label="筛选阶段"
        />
        {query ? (
          <button type="button" className="stage-rail-clear" onClick={() => setQuery("")} aria-label="清空筛选">
            ×
          </button>
        ) : null}
      </div>
      {sections.map(({ group, stages, extras: groupExtras }) => {
        const total = stagesOfGroup(group).length;
        const done = stagesOfGroup(group).filter((stage) => byId.get(stage.id)?.status === "done").length;
        const isCollapsed = collapsed.has(group.id) && !searching;
        return (
          <section className={`stage-rail-group ${isCollapsed ? "collapsed" : ""}`} key={group.id}>
            <button
              type="button"
              className="stage-rail-title"
              aria-expanded={!isCollapsed}
              onClick={() => onToggleGroup?.(group.id)}
            >
              <span className="stage-rail-caret" aria-hidden>
                {isCollapsed ? "▸" : "▾"}
              </span>
              <span className="stage-rail-title-text">{group.label}</span>
              <span className="stage-rail-count">
                {done}/{total}
              </span>
            </button>
            {!isCollapsed && (
              <ul className="stage-rail-list">
                {stages.map((stage) => {
                  const card = byId.get(stage.id);
                  const status = card?.status || "todo";
                  const active = activeStageId === stage.id;
                  const running = Boolean(progress && progress.stageId === stage.id);
                  return (
                    <li key={stage.id}>
                      <button
                        type="button"
                        className={`stage-rail-item ${status} ${active ? "on" : ""} ${running ? "running" : ""}`}
                        disabled={busy && active}
                        onClick={() => card && onSelect(card)}
                        title={`${stage.label} · ${STATUS_LABEL[status]}${running ? ` · ${Math.round(progress!.percent)}%` : ""}`}
                      >
                        <span className={`stage-rail-dot ${status}`} aria-hidden />
                        <span className="stage-rail-name">{stage.label}</span>
                        {running ? (
                          <span className="stage-rail-bar" aria-hidden>
                            <i style={{ width: `${Math.max(4, Math.min(100, Math.round(progress!.percent)))}%` }} />
                          </span>
                        ) : (
                          <em className="stage-rail-state">{STATUS_LABEL[status]}</em>
                        )}
                      </button>
                    </li>
                  );
                })}
                {groupExtras.map((extra) => (
                  <li key={extra.id}>
                    <button type="button" className="stage-rail-item extra" onClick={() => onExtra?.(extra.id)}>
                      <span className="stage-rail-dot extra" aria-hidden />
                      <span className="stage-rail-name">{extra.label}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
      {searching && sections.length === 0 ? <p className="stage-rail-empty">没有匹配的阶段</p> : null}
    </nav>
  );
}

export type { StageAction, StageCardModel };
