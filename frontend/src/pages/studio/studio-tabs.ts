import { STAGES } from "../../domain/pipeline";

const TAB_ORDER = ["brief", "characters", "world", "props", "outline", "beats", "content"] as const;

export type TabId = (typeof TAB_ORDER)[number];

export const TABS: { id: TabId; label: string }[] = TAB_ORDER.map((id) => {
  const stage = STAGES.find((row) => row.ui?.tab === id);
  if (!stage) throw new Error(`页签缺少对应阶段：${id}`);
  return { id, label: stage.label };
});

export const RAIL_EXTRAS = [{ id: "board", label: "大纲板", groupId: "outline" }];
