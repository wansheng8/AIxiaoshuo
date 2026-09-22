import type { NavigateFunction } from "react-router-dom";
import { api } from "../../data/api";
import { STORAGE_KEYS, removeKey } from "../../data/storage";
import { chapterHeading } from "./studio-utils";
import type { StudioDoc } from "./view-types";

type Args = {
  doc: StudioDoc;
  nav: NavigateFunction;
};

export function createStudioFiles({ doc, nav }: Args) {
  const { novelRef, setStatus } = doc;

  function exportMd() {
    const n = novelRef.current;
    if (!n) return;
    const threads = (n.threads || [])
      .map(
        (t) =>
          `- ${t.name}［${t.status === "paid" ? "已兑" : t.status === "dropped" ? "搁置" : "未收"}］埋设：${t.plant || "未填"}｜回收：${t.payoff || "未定"}`
      )
      .join("\n");
    const written = n.chapters.filter((c) => String(c.content || "").trim());
    const bodyParts = written.length
      ? written.map((c) => `## ${chapterHeading(c)}\n\n${c.content || ""}`)
      : n.chapters.map((c) => `## ${chapterHeading(c)}\n\n${c.content || ""}`);
    const parts = [
      `# ${n.title}`,
      n.logline,
      n.genre && `类型：${n.genre}`,
      n.brief && `## 立项\n\n${n.brief}`,
      n.world && `## 世界观\n\n${n.world}`,
      n.characters && `## 人物\n\n${n.characters}`,
      n.outline && `## 大纲\n\n${n.outline}`,
      n.props && `## 关键道具\n\n${n.props}`,
      threads && `## 伏笔\n\n${threads}`,
      ...bodyParts,
    ].filter(Boolean);
    const blob = new Blob([parts.join("\n\n")], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${n.title || "墨枢"}.md`;
    a.click();
    URL.revokeObjectURL(url);
    setStatus("已导出 Markdown");
  }

  async function archiveBook() {
    const n = novelRef.current;
    if (!n) return;
    if (!window.confirm(`归档「${n.title}」？本书会从案上列表移入归档。`)) return;
    await api.archiveProject(n.id);
    removeKey(STORAGE_KEYS.last);
    nav("/");
  }

  async function duplicateBook() {
    const n = novelRef.current;
    if (!n) return;
    const copy = await api.duplicateProject(n.id);
    nav(`/studio/${copy.id}`);
  }

  async function purgeBook() {
    const n = novelRef.current;
    if (!n) return;
    if (!window.confirm(`彻底删除「${n.title}」？正文和设定都会消失，无法找回。`)) return;
    await api.purgeProject(n.id);
    removeKey(STORAGE_KEYS.last);
    nav("/");
  }

  return { exportMd, archiveBook, duplicateBook, purgeBook };
}
