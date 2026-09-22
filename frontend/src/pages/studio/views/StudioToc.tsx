import type { StudioAct, StudioDoc, StudioUiState } from "../view-types";
import { chapterHeading, wordCount } from "../studio-utils";

type Props = {
  doc: StudioDoc;
  ui: StudioUiState;
  act: StudioAct;
};

export default function StudioToc({ doc, ui, act }: Props) {
  const { novel, chapter } = doc;
  if (!novel || !chapter) return null;
  return (
    <aside className={`ep ${ui.mobile === "toc" ? "show" : ""}`}>
      <div className="ep-head">
        <span>目录</span>
        <button className="btn-mint" onClick={act.addChapter}>
          + 新章
        </button>
      </div>
      {novel.chapters.map((c) => (
        <button
          key={c.id}
          className={`ep-item ${c.id === chapter.id ? "on" : ""}`}
          draggable
          onDragStart={() => ui.setDragId(c.id)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => {
            if (ui.dragId) doc.moveChapter(ui.dragId, c.id);
            ui.setDragId("");
          }}
          onClick={() => {
            doc.setChapterId(c.id);
            ui.setTab("content");
            if (!c.content) ui.setReading(false);
            ui.setDesk("write");
            ui.setMobile("paper");
          }}
        >
          <div className="dots">●●</div>
          <b>{chapterHeading(c)}</b>
          <small>
            {wordCount(c.content)
              ? `${wordCount(c.content)} 字`
              : String(c.beats || "").trim()
                ? "有细纲"
                : "待写"}
          </small>
          <span
            className="ep-del"
            onClick={(e) => {
              e.stopPropagation();
              act.removeChapter(c.id);
            }}
          >
            删
          </span>
        </button>
      ))}
    </aside>
  );
}
