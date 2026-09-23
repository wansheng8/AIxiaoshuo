import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { api, generate } from "../../../data/api";
import { useAppState } from "../../../app-state";
import { PIPELINE, PIPE_SKILL_IDS, STAGES, WRITING_GROUPS, expectJobChars, expectJobMs, panelOfStage, pipeSkillId, pipeSkillSlot, stageOf } from "../../../domain/pipeline";
import { StageCard } from "../../../components/StageFlow";
import StageRail from "../../../components/StageRail";
import { buildStageFlow, type StageAction, type StageCardModel } from "../../../domain/stage-flow";
import type { HistoryItem, Novel, Skill, ThreadItem, Voice } from "../../../domain/types";
import CommandPalette, { type PaletteItem } from "../../../components/CommandPalette";
import {
  CRAFT_TOGGLES,
  DENSITIES,
  WORD_PRESETS,
  FLOW_OPTIONS,
  PLATFORM_OPTIONS,
  CLEAN_COPY_EXTRA,
  PERFORM_EXTRA,
  IMITATE_DIMENSIONS,
  IMITATE_EXTRA,
  EMOTION_STYLES,
  MOODS,
  POVS,
  STYLES,
  THREAD_STATUS,
  mergeThreads,
  newThread,
  parseThreads,
  clipToWordMax,
} from "../../../domain/craft";
import { inferEmotion } from "../../../domain/emotion";
import ReviewReport from "../../../components/ReviewReport";
import { PromptPreview } from "../../../components/PromptPreview";
import { parseReviewVerdict } from "../../../domain/review";
import Meter, { LoadingMeter, waitPercent } from "../../../components/Meter";
import { beginJob, finishJob, getJob, jobLabel, patchJob, setJobStop, stopJob, useJob } from "../../../data/jobs";
import { STORAGE_KEYS, readJson, readText, removeKey, writeJson, writeText } from "../../../data/storage";
import IssueList from "../../../components/ui/IssueList";
import AigcCard, { aigcLevelText } from "../../../components/ui/AigcCard";
import InsFold from "../../../components/ui/InsFold";
import ConfigBanner from "../../../components/ui/ConfigBanner";
import AssetCard from "./AssetCard";
import {
  AUTO_PIPE_EXTRA,
  RAIL_EXTRAS,
  TABS,
  chapterHeading,
  ensureChapterAt,
  expandChaptersFromBeats,
  fieldSnapshot,
  findNextPipe,
  formatElapsed,
  looksLikeChapterProse,
  matchNamePrefix,
  maxBeatIndex,
  namesFromNovel,
  normalizeNovel,
  novelHasProse,
  parseBeatChapters,
  parseCards,
  parseEmotionVersions,
  pipeSlotFilled,
  shortcutK,
  stripChapterPrefix,
  toParagraphs,
  upsertSection,
  wordCount,
  type DeskId,
  type FillSlot,
  type StudioUi,
  type TabId,
} from "../studio-utils";
import type { ReactNode } from "react";
import type { StudioAct, StudioAssets, StudioDoc, StudioJob, StudioScan, StudioUiState } from "../view-types";
import type { StudioDerived } from "../derive";
import type { CanvasAct } from "../canvas-act";

function ActCluster({
  label,
  tone,
  first,
  children,
}: {
  label: string;
  tone?: "gen" | "check" | "tool";
  first?: boolean;
  children: ReactNode;
}) {
  return (
    <span
      className={`act-cluster${tone ? ` tone-${tone}` : ""}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        flexWrap: "wrap",
        ...(first ? {} : { paddingLeft: 10, marginLeft: 2, borderLeft: "1px solid var(--line)" }),
      }}
    >
      <span style={{ fontSize: 11, color: "var(--muted)", letterSpacing: "0.08em" }}>{label}</span>
      {children}
    </span>
  );
}

type Props = {
  doc: StudioDoc;
  ui: StudioUiState;
  scan: StudioScan;
  assets: StudioAssets;
  act: StudioAct;
  d: StudioDerived;
  job: StudioJob;
  zen: boolean;
  setZen: (value: boolean) => void;
  canvas: CanvasAct;
  paperRef: { current: HTMLTextAreaElement | null };
  readerShellRef: { current: HTMLDivElement | null };
};

export default function StudioCanvas({
  doc,
  ui,
  scan,
  assets,
  act,
  d,
  job,
  zen,
  setZen,
  canvas,
  paperRef,
  readerShellRef,
}: Props) {
  const { onStageAction, toggleFocusEdit, saveFocusEdit, pipeControls, captureNameHint, applyNameHint, captureSel } = canvas;
  const { novel, chapter } = doc;
  if (!novel || !chapter) return null;
  const voiceChip = !scan.voiceInfo?.body?.trim()
    ? { tone: "off", text: "未设底味" }
    : !scan.voiceInfo.enabled
      ? { tone: "off", text: "底味已停用" }
      : scan.voiceInfo.stale
        ? { tone: "warn", text: "底味待重做" }
        : { tone: "ok", text: "底味已生效" };


  return (
    <>
          <section className={`stage ${ui.mobile === "paper" ? "show" : ""}`}>
            <ConfigBanner />
              <div className="pipe-wrap">
                {d.activeCard ? (
                  <ol className="stage-focus">
                    <StageCard card={d.activeCard} busy={d.liveBusy} onAction={onStageAction} />
                    {d.canFocusEdit ? (
                      <li className="stage-focus-edit">
                        <button type="button" className="mini ghost" onClick={toggleFocusEdit}>
                          {d.focusOpen ? "收起产出" : "展开产出"}
                        </button>
                        {d.focusOpen ? (
                          <>
                            <textarea
                              className="focus-edit"
                              value={ui.focusDraft}
                              spellCheck={false}
                              onChange={(event) => ui.setFocusDraft(event.target.value)}
                            />
                            <div className="focus-edit-actions">
                              <button
                                type="button"
                                className="mini"
                                disabled={ui.focusDraft === d.focusText}
                                onClick={saveFocusEdit}
                              >
                                保存
                              </button>
                              <button
                                type="button"
                                className="mini ghost"
                                disabled={ui.focusDraft === d.focusText}
                                onClick={() => ui.setFocusDraft(d.focusText)}
                              >
                                还原
                              </button>
                              <span className="muted focus-edit-meta">{ui.focusDraft.length} 字</span>
                            </div>
                          </>
                        ) : null}
                      </li>
                    ) : null}
                  </ol>
                ) : null}
                {d.nextPipe ? (
                  <div className="pipe-wrap-actions">{pipeControls()}</div>
                ) : (
                  <span className="pipe-done-label">{act.autoPipe ? "本章正文写完" : "本章可写可改"}</span>
                )}
                {d.nextPipe && !d.liveBusy ? (
                  <p className="pipe-hint muted">下一步：{d.nextPipe.label} · {d.nextPipe.hint}</p>
                ) : null}
                <button
                  type="button"
                  className="btn-ghost rail-toggle"
                  title={ui.drawerRail ? "收起阶段轨" : "展开阶段轨"}
                  onClick={() => ui.setDrawerRail((value) => !value)}
                >
                  {ui.drawerRail ? "收起阶段" : "展开阶段"}
                </button>
                {d.liveBusy && (
                  <Meter
                    percent={!act.busy ? job.percent || d.pipePercent : d.pipePercent}
                    label={!act.busy ? jobLabel(job) : d.pipeMeterLabel}
                    running
                  />
                )}
              </div>
            <div className="stage-bar">
              <div className="actions">
                {ui.desk === "write" && (
                  <>
                    <ActCluster label="生成" tone="gen" first>
                      <Link className={`voice-chip ${voiceChip.tone}`} to="/voice" title="去文风页管理底味">
                        {voiceChip.text}
                      </Link>
                      <button className="btn-mint" disabled={act.busy} onClick={() => d.currentSkill("chapter-prose") && act.runSkill(d.currentSkill("chapter-prose")!)}>
                        写本章
                      </button>
                      <button className="btn" disabled={act.busy} onClick={() => d.currentSkill("continue") && act.runSkill(d.currentSkill("continue")!)}>
                        续写
                      </button>
                    </ActCluster>
                    <ActCluster label="检查" tone="check">
                      <button
                        className="btn"
                        disabled={act.busy}
                        onClick={() => {
                          const skill = d.currentSkill("review");
                          if (!skill) {
                            doc.setStatus("审稿写法未加载，去资产页看是否停用");
                            scan.setReportOpen(true);
                            return;
                          }
                          if (!String(chapter.content || "").trim()) {
                            doc.setStatus("本章还是空白，先写一段再审");
                            scan.setReportOpen(true);
                            return;
                          }
                          act.runSkill(skill);
                        }}
                      >
                        审稿{chapter?.reviewVerdict ? ` · ${chapter.reviewVerdict}` : ""}
                      </button>
                      <button
                        className="btn"
                        disabled={act.busy}
                        onClick={() => {
                          const skill = d.currentSkill("suggest");
                          if (!skill) {
                            doc.setStatus("「卡壳建议」写法未加载，去资产页看是否停用");
                            scan.setReportOpen(true);
                            return;
                          }
                          if (String(chapter?.advice || "").trim()) {
                            scan.setSideText(chapter.advice || "");
                            scan.setSideKind("advice");
                            scan.setReportOpen(true);
                            return;
                          }
                          act.runSkill(skill);
                        }}
                      >
                        卡壳建议
                      </button>
                      <button
                        className="btn"
                        disabled={act.busy}
                        onClick={() => {
                          scan.setSideKind("scan");
                          scan.setReportOpen(true);
                          scan.scanNow().catch((err) => doc.setStatus(err.message));
                        }}
                      >
                        校对{scan.aigc ? ` · AI率 ${scan.aigc.rate}` : d.visibleIssues.length ? ` ${d.visibleIssues.length}` : ""}
                      </button>
                      {novel.logs?.some((l) => l.status === "error") && (
                        <button className="btn-danger" onClick={() => scan.setLogsOpen(true)}>
                          生成记录 · {novel.logs.filter((l) => l.status === "error").length} 失败
                        </button>
                      )}
                    </ActCluster>
                  </>
                )}
                {ui.desk === "cast" && (
                  <ActCluster label="人物" first>
                    <button className="btn-mint" onClick={() => assets.addCard("characters")}>
                      + 人物
                    </button>
                    <button className="btn" disabled={act.busy} onClick={() => act.fillSlot("characters")}>
                      补全
                    </button>
                  </ActCluster>
                )}
                {ui.desk === "threads" && (
                  <ActCluster label="伏笔" first>
                    <button className="btn-ghost" onClick={doc.addThreadRow}>
                      新线
                    </button>
                    <button className="btn" disabled={act.busy} onClick={() => d.currentSkill("threads") && act.runSkill(d.currentSkill("threads")!)}>
                      整理账本
                    </button>
                  </ActCluster>
                )}
                {ui.desk === "lore" && (
                  <ActCluster label="设定" first>
                    {(ui.tab === "world" || ui.tab === "props") && (
                      <button className="btn-mint" onClick={() => assets.addCard(ui.tab === "world" ? "world" : "props")}>
                        + 添加
                      </button>
                    )}
                    {(ui.tab === "brief" || ui.tab === "world" || ui.tab === "props" || ui.tab === "outline" || ui.tab === "beats") && (
                      <button
                        className="btn"
                        disabled={act.busy}
                        onClick={() => act.fillSlot(ui.tab === "beats" ? "beats" : ui.tab === "world" ? "world" : ui.tab === "props" ? "props" : ui.tab === "outline" ? "outline" : "brief")}
                      >
                        {ui.tab === "beats" && d.beatCatalog > 0 ? "续写细纲" : ui.tab === "props" && novelHasProse(novel) ? "从正文抽取" : "补全"}
                      </button>
                    )}
                  </ActCluster>
                )}
                <ActCluster label="工具" tone="tool">
                  {ui.desk === "write" && (
                    <button className={`wide-only ${ui.split ? "btn on" : "btn"}`} onClick={() => ui.setSplit((v) => !v)}>
                      分屏
                    </button>
                  )}
                  {ui.desk !== "board" && ui.desk !== "threads" && (
                    <button className={`wide-only ${ui.drawerIns ? "btn on" : "btn"}`} onClick={() => ui.setDrawerIns((v) => !v)}>
                      检查器
                    </button>
                  )}
                  {doc.undoStack.length > 0 && (
                    <button className="btn" onClick={act.undoLast}>
                      撤销本轮
                    </button>
                  )}
                  <button className="btn-ghost" onClick={() => { ui.setPaletteOpen(true); ui.setPaletteQuery(""); }}>
                    {shortcutK()}
                  </button>
                  <button
                    className={zen ? "btn-mint" : "btn-ghost"}
                    onClick={() => {
                      if (!zen && act.busy) act.stopWriting();
                      setZen(!zen);
                    }}
                  >
                    {zen ? "退出专注" : "专注"}
                  </button>
                </ActCluster>
              </div>
            </div>
  
            {ui.desk === "write" && scan.reportOpen && (
              <section className="stage-report">
                <div className="stage-report-h">
                  <b>
                    {scan.sideKind === "edit"
                      ? "润色"
                      : scan.sideKind === "threads"
                        ? "伏笔账本"
                        : scan.sideKind === "emotion"
                          ? "情感改写"
                          : scan.sideKind === "scan"
                            ? "校对"
                            : scan.sideKind === "advice"
                              ? "卡壳建议"
                              : "章节审稿"}
                  </b>
                  {scan.sideKind === "focus" && chapter?.reviewAt && (
                    <span className="muted">{new Date(chapter.reviewAt).toLocaleString("zh-CN")}</span>
                  )}
                  <button type="button" className="btn-ghost" onClick={() => scan.setReportOpen(false)}>
                    收起
                  </button>
                </div>
                {scan.sideKind === "scan" && (
                  <p className="muted">本地扫描错字、专名、套话，并给出 AI率。接受只改对应词，阅读页不画线。</p>
                )}
                {scan.sideKind === "scan" && (
                  <AigcCard report={scan.aigc} onDeai={() => act.runSel("deai")} issueCount={d.visibleIssues.length} />
                )}
                {act.busy && scan.sideKind !== "scan" && (
                  <Meter percent={d.pipePercent} label={d.pipeMeterLabel} running />
                )}
                {act.busy && !scan.sideText && scan.sideKind !== "scan" && <p className="muted">{doc.status || "正在审稿…"}</p>}
                {scan.sideKind !== "scan" && scan.sideText &&
                  (scan.sideKind === "emotion" && d.emotionVersions.length >= 2 && !act.busy ? (
                    d.emotionVersions.map((version) => (
                      <article className="emo-card" key={version.id}>
                        <b>
                          版本{version.id} · {version.label}
                        </b>
                        <p>{version.body}</p>
                        <button className="btn" type="button" onClick={() => scan.applyEmotion(version.body)}>
                          写入选区
                        </button>
                      </article>
                    ))
                  ) : (
                    scan.sideKind === "focus" && !act.busy ? (
                      <ReviewReport
                        text={scan.sideText}
                        chapterText={chapter?.content || ""}
                        onLocate={scan.locateOriginal}
                        onReplace={scan.replaceOriginal}
                      />
                    ) : scan.sideKind === "advice" && !act.busy ? (
                      <div className="advice-edit">
                        <textarea
                          className="advice-text"
                          value={scan.sideText}
                          spellCheck={false}
                          placeholder="暂无建议，点「重新生成」让写法基于梗概和正文给几个破局方向。"
                          onChange={(event) => scan.setSideText(event.target.value)}
                        />
                        <div className="advice-actions">
                          <button
                            className="btn"
                            type="button"
                            disabled={!scan.sideText.trim() || scan.sideText === (chapter?.advice || "")}
                            onClick={() => chapter && doc.patchChapterById(chapter.id, { advice: scan.sideText })}
                          >
                            保存建议
                          </button>
                          <button
                            className="btn-ghost"
                            type="button"
                            onClick={() => {
                              const skill = d.currentSkill("suggest");
                              if (skill) act.runSkill(skill);
                              else doc.setStatus("「卡壳建议」写法未加载");
                            }}
                          >
                            重新生成
                          </button>
                        </div>
                      </div>
                    ) : (
                      <pre className="side-result">{scan.sideText}</pre>
                    )))}
                {scan.sideKind === "edit" && scan.sideText && !act.busy && (
                  <button className="btn" onClick={scan.applyPolish}>
                    写入正文
                  </button>
                )}
                {d.visibleIssues.length > 0 && (
                  <div className="report-scan issues">
                    <IssueList
                      issues={d.visibleIssues}
                      onJump={scan.jumpIssue}
                      onApply={scan.applyIssue}
                      onFeel={(issue) => {
                        scan.jumpIssue(issue);
                        act.runSel("feel");
                      }}
                      onIgnore={(id) => scan.setIgnored((list) => [...list, id])}
                    />
                  </div>
                )}
                {!act.busy && (scan.sideKind === "scan" || !scan.sideText) && d.visibleIssues.length === 0 && (
                  <p className="muted">{doc.status || (scan.aigc ? `AI率 ${scan.aigc.rate}（${aigcLevelText(scan.aigc.level)}）` : "本章未见明显错字、专名写错或概括情绪")}</p>
                )}
              </section>
            )}
  
            {ui.desk === "lore" && (
              <div className="tabs lore-tabs">
                {TABS.filter((t) => t.id !== "content" && t.id !== "characters").map((t) => (
                  <button key={t.id} className={ui.tab === t.id ? "on" : ""} onClick={() => ui.setTab(t.id)}>
                    {t.label}
                    {t.id === "world" ? `(${d.worldCards.length})` : ""}
                    {t.id === "props" ? `(${d.propCards.length})` : ""}
                  </button>
                ))}
              </div>
            )}
  
            {ui.desk === "board" && (
              <div className="board">
                {novel.chapters.map((c) => {
                  const words = wordCount(c.content) || c.wordCount || 0;
                  const mark = words === 0 ? "空白" : words < 800 ? "草稿" : "已写";
                  const land = inferEmotion(c.content);
                  return (
                    <article
                      key={c.id}
                      className={`board-card ${c.id === chapter.id ? "on" : ""}`}
                      draggable
                      onDragStart={() => ui.setDragId(c.id)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => {
                        if (ui.dragId) doc.moveChapter(ui.dragId, c.id);
                        ui.setDragId("");
                      }}
                      onClick={() => act.openDesk("write", "content", c.id)}
                    >
                      <small>
                        {mark} · {words} 字{land ? ` · ${land.mood}` : c.mood ? ` · ${c.mood}` : ""}
                      </small>
                      <b>{chapterHeading(c)}</b>
                      <p>{(c.beats || c.content || "还没写").replace(/\s+/g, " ").slice(0, 80)}</p>
                      <div
                        className="board-emo"
                        onClick={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                      >
                        <select
                          value={c.mood || ""}
                          onChange={(e) => doc.patchChapterById(c.id, { mood: e.target.value })}
                        >
                          <option value="">跟正文</option>
                          {MOODS.map((item) => (
                            <option key={item} value={item}>
                              {item}
                            </option>
                          ))}
                        </select>
                        {c.mood ? (
                          <>
                            <label>
                              起
                              <input
                                type="range"
                                min={1}
                                max={10}
                                value={c.emotionStart ?? 4}
                                onChange={(e) => doc.patchChapterById(c.id, { emotionStart: Number(e.target.value) })}
                              />
                            </label>
                            <label>
                              收
                              <input
                                type="range"
                                min={1}
                                max={10}
                                value={c.emotionEnd ?? 6}
                                onChange={(e) => doc.patchChapterById(c.id, { emotionEnd: Number(e.target.value) })}
                              />
                            </label>
                            <i
                              className="emo-spark"
                              style={{
                                background: `linear-gradient(90deg, rgba(94,230,195,${(c.emotionStart ?? 4) / 12}), rgba(224,180,92,${(c.emotionEnd ?? 6) / 12}))`,
                              }}
                            />
                          </>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
  
            {ui.desk === "threads" && (
              <div className="thread-stage">
                <p className="muted">未收 {d.openThreads.length} 条。</p>
                {(novel.threads || []).map((row) => (
                  <div className={`thread-row ${row.status}`} key={row.id}>
                    <input value={row.name} onChange={(e) => doc.patchThread(row.id, { name: e.target.value })} placeholder="伏笔名" />
                    <input value={row.plant} onChange={(e) => doc.patchThread(row.id, { plant: e.target.value })} placeholder="埋设" />
                    <input value={row.payoff} onChange={(e) => doc.patchThread(row.id, { payoff: e.target.value })} placeholder="回收" />
                    <select value={row.status} onChange={(e) => doc.patchThread(row.id, { status: e.target.value as ThreadItem["status"] })}>
                      {THREAD_STATUS.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                    <button className="btn-ghost" type="button" onClick={() => doc.removeThreadRow(row.id)}>
                      删
                    </button>
                  </div>
                ))}
                {!(novel.threads || []).length && <p className="muted">账本还空着。</p>}
              </div>
            )}
  
            {ui.desk === "cast" && (
              <>
                {d.charCards.length === 0 && (
                  <div className="empty-cta">
                    <p className="muted">还没有人物。点「补全」生成小传，或手动添加。</p>
                    <button className="btn-mint" type="button" disabled={act.busy} onClick={() => act.fillSlot("characters")}>
                      补人物
                    </button>
                  </div>
                )}
                {d.charCards.map((c, i) => (
                  <AssetCard key={`characters-${i}`} doc={doc} assets={assets} act={act} d={d} field="characters" card={c} index={i} />
                ))}
              </>
            )}
            {ui.desk === "lore" && ui.tab === "world" && (
              <>
                {d.worldCards.length === 0 && (
                  <div className="empty-cta">
                    <p className="muted">还没有场景。点「补全」写成可演戏的条目。</p>
                    <button className="btn-mint" type="button" disabled={act.busy} onClick={() => act.fillSlot("world")}>
                      补场景
                    </button>
                  </div>
                )}
                {d.worldCards.map((c, i) => (
                  <AssetCard key={`world-${i}`} doc={doc} assets={assets} act={act} d={d} field="world" card={c} index={i} />
                ))}
              </>
            )}
            {ui.desk === "lore" && ui.tab === "props" && (
              <>
                {d.propCards.length === 0 && (
                  <div className="empty-cta">
                    <p className="muted">
                      {novelHasProse(novel)
                        ? "还没有道具。点「从正文抽取」，会从已写章节里收物件卡。"
                        : d.beatCatalog > 0
                          ? "还没有道具。正文还空，可从细纲场面表先列物件，或写完正文再抽。"
                          : "还没有道具。按立项三灾先列物件，或写完正文再抽。"}
                    </p>
                    <button className="btn-mint" type="button" disabled={act.busy} onClick={() => act.fillSlot("props")}>
                      {novelHasProse(novel) ? "从正文抽取" : "列道具"}
                    </button>
                  </div>
                )}
                {d.propCards.map((c, i) => (
                  <AssetCard key={`props-${i}`} doc={doc} assets={assets} act={act} d={d} field="props" card={c} index={i} />
                ))}
              </>
            )}
            {ui.desk === "lore" && ui.tab === "outline" && (
              <div className="hint-wrap">
                <textarea
                  className="ms"
                  value={novel.outline}
                  onChange={(e) => {
                    doc.patchNovel({ ...novel, outline: e.target.value });
                    captureNameHint("outline", e.target);
                  }}
                  onSelect={(e) => captureNameHint("outline", e.currentTarget)}
                  onBlur={() => window.setTimeout(() => ui.setNameHint((cur) => (cur?.field === "outline" ? null : cur)), 120)}
                  placeholder="全书大纲"
                />
                {ui.nameHint?.field === "outline" && (
                  <div className="name-hints">
                    {ui.nameHint.items.map((name) => (
                      <button type="button" key={name} onMouseDown={(e) => { e.preventDefault(); applyNameHint(name); }}>
                        {name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {ui.desk === "lore" && ui.tab === "brief" && (
              <div className="hint-wrap">
                <textarea
                  className="ms"
                  value={novel.brief}
                  onChange={(e) => {
                    doc.patchNovel({ ...novel, brief: e.target.value });
                    captureNameHint("brief", e.target);
                  }}
                  onSelect={(e) => captureNameHint("brief", e.currentTarget)}
                  onBlur={() => window.setTimeout(() => ui.setNameHint((cur) => (cur?.field === "brief" ? null : cur)), 120)}
                  placeholder="立项说明"
                />
                {ui.nameHint?.field === "brief" && (
                  <div className="name-hints">
                    {ui.nameHint.items.map((name) => (
                      <button type="button" key={name} onMouseDown={(e) => { e.preventDefault(); applyNameHint(name); }}>
                        {name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {ui.desk === "lore" && ui.tab === "beats" && (
              <>
                <div className="hint-wrap">
                  <textarea
                    className="ms"
                    value={chapter.beats || ""}
                    onChange={(e) => {
                      doc.updateChapter({ beats: e.target.value });
                      captureNameHint("beats", e.target);
                    }}
                    onSelect={(e) => captureNameHint("beats", e.currentTarget)}
                    onBlur={() => window.setTimeout(() => ui.setNameHint((cur) => (cur?.field === "beats" ? null : cur)), 120)}
                    placeholder="本章细纲，可用 ### 第N章 拆目录"
                  />
                  {ui.nameHint?.field === "beats" && (
                    <div className="name-hints">
                      {ui.nameHint.items.map((name) => (
                        <button type="button" key={name} onMouseDown={(e) => { e.preventDefault(); applyNameHint(name); }}>
                          {name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {(chapter.beats || "").includes("###") && (
                  <button className="btn" style={{ marginTop: 8 }} onClick={() => { act.absorbBeats(); }}>
                    按细纲拆入目录
                  </button>
                )}
              </>
            )}
            {ui.desk === "write" && (
              <div className={`write-ui.split ${ui.split ? "on" : ""}`}>
                <div ref={readerShellRef} className={`reader-shell ${ui.nightRead ? "night" : ""}`}>
                  <div className="reader-bar">
                    <div className="reader-modes">
                      <button className={ui.reading ? "on" : ""} onClick={() => ui.setReading(true)}>
                        阅读
                      </button>
                      <button className={!ui.reading ? "on" : ""} onClick={() => ui.setReading(false)}>
                        编辑
                      </button>
                    </div>
                    {!ui.reading && ui.selText && (
                      <div className="sel-bar" onMouseDown={(e) => e.preventDefault()}>
                        <button disabled={act.busy} onClick={() => act.runSel("polish")}>润色</button>
                        <button disabled={act.busy} onClick={() => act.runSel("expand")}>扩写</button>
                        <button disabled={act.busy} onClick={() => act.runSel("shrink")}>缩写</button>
                        <button disabled={act.busy} onClick={() => act.runSel("proof")}>改错字</button>
                        <button disabled={act.busy} onClick={() => act.runSel("deai")}>去AI味</button>
                        <button disabled={act.busy} onClick={() => act.runSel("perform")}>演出来</button>
                        {novel.craft?.imitateOn && novel.craft?.imitateDims ? (
                          <button disabled={act.busy} onClick={() => act.runSel("imitate")}>照骨架改</button>
                        ) : null}
                        <button disabled={act.busy} onClick={() => act.runSel("feel")}>情感</button>
                        <button disabled={act.busy} onClick={() => act.runSel("continue")}>续写</button>
                        <button disabled={act.busy} onClick={() => act.runSel("review")}>审稿</button>
                      </div>
                    )}
                    {!ui.reading && novel.craft?.cleanCopy !== false && !ui.selText && (
                      <span className="clean-auto-hint">写完自动去AI味</span>
                    )}
                    <div className="reader-tools">
                      <button disabled={!d.prevChapter} onClick={() => d.prevChapter && doc.setChapterId(d.prevChapter.id)}>
                        上一章
                      </button>
                      <button disabled={!d.canNext} onClick={() => act.turnChapter(1)}>
                        下一章
                      </button>
                      <button onClick={() => ui.setReaderSize((n) => Math.max(15, n - 1))}>A-</button>
                      <button onClick={() => ui.setReaderSize((n) => Math.min(24, n + 1))}>A+</button>
                      <button onClick={() => ui.setNightRead((v) => !v)}>{ui.nightRead ? "日间" : "夜间"}</button>
                      <span className="reader-count">{wordCount(chapter.content)} 字</span>
                      <button
                        disabled={act.busy}
                        onClick={() => {
                          ui.setReading(false);
                          d.currentSkill("continue") && act.runSkill(d.currentSkill("continue")!);
                        }}
                      >
                        续写
                      </button>
                    </div>
                  </div>
                  {ui.reading ? (
                    <article className="reader-paper" style={{ fontSize: ui.readerSize }}>
                      <h1>
                        {chapterHeading(chapter)}
                      </h1>
                      {toParagraphs(chapter.content, chapter.title).length === 0 ? (
                        <p className="reader-empty">本章还是空白。切到编辑，或在右侧运行「章节正文」。</p>
                      ) : (
                        toParagraphs(chapter.content, chapter.title).map((p, i) => <p key={i}>{p}</p>)
                      )}
                      <div className="reader-turn">
                        <button type="button" disabled={!d.prevChapter} onClick={() => d.prevChapter && doc.setChapterId(d.prevChapter.id)}>
                          {d.prevChapter ? `上一章 ${chapterHeading(d.prevChapter)}` : "已是第一章"}
                        </button>
                        <button type="button" disabled={!d.canNext} onClick={() => act.turnChapter(1)}>
                          {d.nextChapter ? `下一章 ${chapterHeading(d.nextChapter)}` : d.canNext ? "下一章" : "已是最后一章"}
                        </button>
                      </div>
                    </article>
                  ) : (
                    <article className="reader-paper reader-edit-page" style={{ fontSize: ui.readerSize }}>
                      <input
                        className="reader-title-input"
                        value={stripChapterPrefix(chapter.title)}
                        placeholder={chapterHeading(chapter)}
                        onChange={(e) => doc.updateChapter({ title: stripChapterPrefix(e.target.value) })}
                      />
                      <textarea
                        ref={paperRef}
                        className="ms reader-edit"
                        value={chapter.content}
                        placeholder="从这里写下第一句，或运行「章节正文」。"
                        onChange={(e) => doc.updateChapter({ content: e.target.value })}
                        onSelect={captureSel}
                        onKeyUp={captureSel}
                        onMouseUp={captureSel}
                      />
                    </article>
                  )}
                </div>
                {ui.split && (
                  <aside className="write-side">
                    <h4>本章细纲</h4>
                    <textarea value={chapter.beats || ""} onChange={(e) => doc.updateChapter({ beats: e.target.value })} placeholder="这一章要办成什么" />
                    <h4>未收伏笔</h4>
                    {d.openThreads.length === 0 && <p className="muted">没有未收的线。</p>}
                    {d.openThreads.map((row) => (
                      <p key={row.id} className="side-thread">
                        <b>{row.name}</b>
                        <span>{row.plant || row.payoff}</span>
                      </p>
                    ))}
                  </aside>
                )}
              </div>
            )}
          </section>
    </>
  );
}
