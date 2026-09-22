import { default as CommandPalette, type PaletteItem } from "../../../components/CommandPalette";
import { PromptPreview } from "../../../components/PromptPreview";
import { chapterHeading, novelHasProse, wordCount } from "../studio-utils";
import type { StudioAct, StudioAssets, StudioDoc, StudioScan, StudioUiState } from "../view-types";
import type { StudioDerived } from "../derive";

type Files = {
  exportMd: () => void;
  archiveBook: () => Promise<void>;
  duplicateBook: () => Promise<void>;
};

type Props = {
  doc: StudioDoc;
  ui: StudioUiState;
  scan: StudioScan;
  assets: StudioAssets;
  act: StudioAct;
  d: StudioDerived;
  zen: boolean;
  setZen: (value: boolean) => void;
  files: Files;
};

export default function StudioModals({ doc, ui, scan, assets, act, d, zen, setZen, files }: Props) {
  const novel = doc.novel;
  const histFor = assets.histFor;
  if (!novel) return null;
  const { skills, undoStack, setStatus, save } = doc;
  const { openDesk, fillSlot, runNextPipe, startAutoPipe, stopWriting, undoLast, runSkill, autoPipe, busy } = act;
  const { setSideKind, setReportOpen, setLogsOpen, scanNow } = scan;
  const { split, setSplit } = ui;

  const paletteItems: PaletteItem[] = [
    { id: "zen", group: "界面", label: zen ? "退出专注" : "进入专注", hint: "Ctrl+.", run: () => {
      if (!zen && busy) stopWriting();
      setZen(!zen);
    } },
    { id: "save", group: "文件", label: "保存工程", hint: "Ctrl+S", run: () => { save().catch((err) => setStatus((err as Error).message)); } },
    { id: "export", group: "文件", label: "导出正文 Markdown", run: files.exportMd },
    { id: "archive", group: "文件", label: "归档本书", run: () => { files.archiveBook().catch((err) => setStatus((err as Error).message)); } },
    { id: "duplicate", group: "文件", label: "复制本书", run: () => { files.duplicateBook().catch((err) => setStatus((err as Error).message)); } },
    { id: "desk-write", group: "桌面", label: "正文", run: () => openDesk("write") },
    { id: "desk-board", group: "桌面", label: "大纲板", run: () => openDesk("board") },
    { id: "desk-cast", group: "桌面", label: "人物", run: () => openDesk("cast") },
    { id: "desk-threads", group: "桌面", label: "伏笔", run: () => openDesk("threads") },
    { id: "desk-lore", group: "桌面", label: "设定", run: () => openDesk("lore", "brief") },
    { id: "split", group: "界面", label: split ? "收起分屏" : "分屏细纲", run: () => setSplit((v) => !v) },
    { id: "fill-brief", group: "补全", label: "补全立项", run: () => fillSlot("brief") },
    { id: "fill-world", group: "补全", label: "补全场景", run: () => fillSlot("world") },
    { id: "fill-props", group: "补全", label: novelHasProse(novel) ? "从正文抽取道具" : "补全道具", run: () => fillSlot("props") },
    { id: "fill-outline", group: "补全", label: "补全大纲", run: () => fillSlot("outline") },
    { id: "fill-beats", group: "补全", label: d.beatCatalog > 0 ? "续写细纲" : "补全细纲", run: () => fillSlot("beats") },
    { id: "fill-cast", group: "补全", label: "补全人物", run: () => fillSlot("characters") },
    {
      id: "pipe-next",
      group: "向导",
      label: d.nextPipe ? `下一步：${d.nextPipe.action}` : "开书步骤已齐",
      hint: d.nextPipe?.hint,
      run: () => {
        if (d.nextPipe) runNextPipe();
      },
    },
    {
      id: "pipe-auto",
      group: "向导",
      label: autoPipe ? "停止自动开书" : d.autoPipeLabel,
      hint: "从缺的步骤连跑到本章正文，停写会停在当前步",
      run: () => {
        if (autoPipe) stopWriting();
        else startAutoPipe();
      },
    },
    {
      id: "undo-gen",
      group: "向导",
      label: "撤销本轮生成",
      hint: undoStack.length ? `可回退 ${undoStack.length} 步` : "还没有可撤的生成",
      run: () => undoLast(),
    },
    {
      id: "scan",
      group: "校对",
      label: "校对本章",
      hint: d.visibleIssues.length ? `${d.visibleIssues.length} 处` : "本地扫描",
      run: () => {
        setSideKind("scan");
        setReportOpen(true);
        scanNow().catch((err) => setStatus((err as Error).message));
      },
    },
    {
      id: "logs",
      group: "记录",
      label: "生成记录",
      hint: (() => {
        const logs = novel.logs || [];
        const fail = logs.filter((l) => l.status === "error").length;
        return fail ? `${fail} 项失败` : logs.length ? `${logs.length} 条` : "暂无记录";
      })(),
      run: () => setLogsOpen(true),
    },
    ...novel.chapters.map((c) => ({
      id: `ch-${c.id}`,
      group: "章节",
      label: chapterHeading(c),
      hint: `${wordCount(c.content) || 0} 字`,
      run: () => openDesk("write", "content", c.id),
    })),
    ...d.openThreads.map((row) => ({
      id: `th-${row.id}`,
      group: "未收伏笔",
      label: row.name,
      hint: row.plant || row.payoff,
      run: () => openDesk("threads"),
    })),
    ...skills.map((s) => ({
      id: `sk-${s.id}`,
      group: "写法",
      label: s.name,
      hint: s.scene,
      run: () => runSkill(s),
    })),
  ];

  return (
    <>
      <input
        ref={assets.uploadRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          assets.onUpload(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {histFor && (
        <div className="modal-back" onClick={() => assets.setHistFor(null)}>
          <div className="modal hist-modal" onClick={(e) => e.stopPropagation()}>
            <h3>
              {histFor.title} · 历史生成
            </h3>
            {(novel.history || []).filter(
              (h) => h.target === histFor.field && (!h.focusName || h.focusName === histFor.title)
            ).length === 0 && <p className="muted">还没有这条资产的历史记录。</p>}
            <div className="hist-list">
              {(novel.history || [])
                .filter((h) => h.target === histFor.field && (!h.focusName || h.focusName === histFor.title))
                .map((h) => (
                  <button key={h.id} className="hist-item" onClick={() => assets.restoreHistory(h)}>
                    <b>{h.skillName || h.skillId}</b>
                    <small>{new Date(h.createdAt).toLocaleString()}</small>
                    <p>{h.output.slice(0, 180)}</p>
                  </button>
                ))}
            </div>
            <button className="btn-ghost" onClick={() => assets.setHistFor(null)}>
              关闭
            </button>
          </div>
        </div>
      )}
      {scan.logsOpen && (
        <div className="modal-back" onClick={() => scan.setLogsOpen(false)}>
          <div className="modal hist-modal" onClick={(e) => e.stopPropagation()}>
            <h3>生成记录</h3>
            {(novel.logs || []).length === 0 && <p className="muted">还没有生成记录。</p>}
            <div className="hist-list">
              {(novel.logs || []).map((l) => (
                <article className={`log-item ${l.status}`} key={l.id}>
                  <div className="log-top">
                    <b>{l.skillName || l.skillId}</b>
                    <span className={`log-status ${l.status}`}>
                      {l.status === "error"
                        ? "失败"
                        : l.status === "stopped"
                          ? "已停止"
                          : l.status === "incomplete"
                            ? "中断"
                            : "成功"}
                    </span>
                  </div>
                  <small>
                    {new Date(l.endedAt || l.startedAt).toLocaleString("zh-CN")} · {l.outputChars} 字
                    {l.focusName ? ` · ${l.focusName}` : ""}
                  </small>
                  {l.error ? <p className="log-error">{l.error}</p> : null}
                </article>
              ))}
            </div>
            <button className="btn-ghost" onClick={() => scan.setLogsOpen(false)}>
              关闭
            </button>
          </div>
        </div>
      )}
      <CommandPalette
        open={ui.paletteOpen}
        query={ui.paletteQuery}
        onQuery={ui.setPaletteQuery}
        onClose={() => ui.setPaletteOpen(false)}
        items={paletteItems}
      />
      {zen && (
        <>
          {(act.autoPipe || act.busy) && (
            <div className="zen-meter" role="progressbar" aria-valuenow={d.pipePercent} aria-valuemin={0} aria-valuemax={100}>
              <span>{d.pipeMeterLabel}</span>
              <i style={{ width: `${d.pipePercent}%` }} />
            </div>
          )}
          {act.busy ? (
            <button className="zen-stop" type="button" onClick={act.stopWriting}>
              {act.autoPipe ? "停在这步" : "停止生成"}
            </button>
          ) : null}
          <button className="zen-exit" type="button" onClick={() => setZen(false)}>
            退出专注 Esc
          </button>
        </>
      )}
      <PromptPreview
        open={ui.previewOpen}
        onClose={() => ui.setPreviewOpen(false)}
        skillId={ui.previewSkillId}
        skillName={doc.skills.find((s) => s.id === ui.previewSkillId)?.name}
        projectId={novel?.id}
        chapterId={doc.chapter?.id || doc.chapterId}
        extra={ui.extra}
        include={ui.ctx}
      />
    </>
  );
}
