import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { api, generate } from "../../../data/api";
import { useAppState } from "../../../app-state";
import { PIPE_SKILL_IDS, STAGES, WRITING_GROUPS, expectJobChars, expectJobMs, panelOfStage, pipeSkillId, pipeSkillSlot, stageOf } from "../../../domain/pipeline";
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
import {
  AUTO_PIPE_EXTRA,
  RAIL_EXTRAS,
  SWATCH,
  TABS,
  chapterHeading,
  ensureChapterAt,
  expandChaptersFromBeats,
  fieldSnapshot,
  findNextPipe,
  formatElapsed,
  joinPropBody,
  looksLikeChapterProse,
  matchNamePrefix,
  maxBeatIndex,
  namesFromNovel,
  normalizeNovel,
  novelHasProse,
  parseBeatChapters,
  parseCards,
  parseEmotionVersions,
  parsePropBody,
  pipeSlotFilled,
  shortcutK,
  stripChapterPrefix,
  toParagraphs,
  upsertSection,
  wordCount,
  type AssetField,
  type DeskId,
  type FillSlot,
  type StudioUi,
  type TabId,
} from "../studio-utils";
import type { ReactNode } from "react";
import type { StudioAct, StudioAssets, StudioDoc, StudioScan, StudioUiState } from "../view-types";
import type { StudioDerived } from "../derive";

type Props = {
  doc: StudioDoc;
  ui: StudioUiState;
  scan: StudioScan;
  assets: StudioAssets;
  act: StudioAct;
  d: StudioDerived;
  pipeControls: () => ReactNode;
};

export default function StudioInspector({ doc, ui, scan, assets, act, d, pipeControls }: Props) {
  const { novel, chapter } = doc;
  if (!novel || !chapter) return null;

  return (
    <>
          <aside className={`inspector ${ui.mobile === "skill" ? "show" : ""}`}>
            <div className="ins-h">
              <b>创作契约</b>
              <span className={`ins-doc.status ${doc.dirty ? "" : "ok"}`}>{doc.status || (doc.dirty ? "未保存" : "已保存")}</span>
              <button className="btn-ghost" onClick={() => doc.save().catch((e) => doc.setStatus(e.message))}>
                保存
              </button>
            </div>
            <div className="ins-block">
              <h4>开书进度</h4>
              <Meter percent={d.pipePercent} label={d.pipeMeterLabel} running={act.busy} />
              <p className="muted">
                {d.nextPipe
                  ? act.autoPipe
                    ? `自动开书进行中：第 ${d.nextPipeIndex + 1} 步 ${d.nextPipe.label}。写完会接着下一步，直到抽出道具。`
                    : `第 ${d.nextPipeIndex + 1} 步 ${d.nextPipe.label}。${d.nextPipe.hint}`
                  : "立项到道具都齐了，可以续写、审稿或开下一章。"}
              </p>
              <div className="pipe-cta">
                {pipeControls()}
                {!act.busy && d.nextPipe && doc.undoStack.length > 0 && (
                  <button className="btn" onClick={act.undoLast}>
                    撤销本轮
                  </button>
                )}
              </div>
            </div>
            <div className="ins-block ui.extra-block">
              <h4>这一章还想交代</h4>
              <textarea value={ui.extra} onChange={(e) => ui.setExtra(e.target.value)} placeholder="这一章重点写什么，或禁止写什么" />
              <div className="row-actions preview-row">
                <select value={ui.previewSkillId} onChange={(e) => ui.setPreviewSkillId(e.target.value)}>
                  {doc.skills
                    .filter((s) => s.enabled)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                </select>
                <button className="btn-ghost" disabled={act.busy} onClick={() => ui.setPreviewOpen(true)}>
                  预览将注入的提示词
                </button>
              </div>
            </div>
            <InsFold
              title="分层记忆"
              open={assets.foldOpen("memory")}
              onToggle={() => assets.toggleFold("memory")}
              hint="勾选注入"
            >
              <p className="muted">写正文只带立项核、本章人物、细纲和上章结尾，并关掉深度思考。上面勾着的大纲、世界观、道具不会灌进正文请求。</p>
              {(
                [
                  ["brief", "立项说明"],
                  ["outline", "全书大纲"],
                  ["world", "世界观 / 场景"],
                  ["characters", "人物库"],
                  ["beats", "本章细纲"],
                  ["prev", "上章结尾"],
                  ["props", "关键道具"],
                ] as const
              ).map(([key, label]) => (
                <label className="check" key={key}>
                  <input
                    type="checkbox"
                    checked={ui.ctx[key]}
                    onChange={(e) => ui.setCtx({ ...ui.ctx, [key]: e.target.checked })}
                  />
                  {label}
                </label>
              ))}
            </InsFold>
  
            {scan.nouns.length > 0 && (
              <div className="ins-block">
                <h4>本章专名</h4>
                <p className="muted">从人物、场景、道具、伏笔和章名抽出，用来核对写错的名字。</p>
                <div className="noun-chips">
                  {scan.nouns.map((name) => (
                    <button
                      className="craft-chip on"
                      type="button"
                      key={name}
                      onClick={() => {
                        const keep = novel.lexicon?.keep || [];
                        if (!keep.includes(name)) doc.patchLexicon({ keep: [...keep, name] });
                        doc.setStatus(`已收入词库：${name}`);
                      }}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              </div>
            )}
  
            <InsFold
              title="类型与平台"
              open={assets.foldOpen("genre")}
              onToggle={() => assets.toggleFold("genre")}
              hint={`${FLOW_OPTIONS.find((x) => x.id === (novel.craft?.flow || ""))?.label || "不指定"} · ${PLATFORM_OPTIONS.find((x) => x.id === (novel.craft?.platform || ""))?.label || "通用"}`}
            >
              <h4>类型引擎</h4>
              <div className="craft-row">
                {FLOW_OPTIONS.map((item) => (
                  <button
                    key={item.id || "none"}
                    type="button"
                    title={item.hint}
                    className={`craft-chip ${(novel.craft?.flow || "") === item.id ? "on" : ""}`}
                    onClick={() => doc.patchCraft({ flow: item.id })}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <h4>投放平台</h4>
              <div className="craft-row">
                {PLATFORM_OPTIONS.map((item) => (
                  <button
                    key={item.id || "none"}
                    type="button"
                    title={item.hint}
                    className={`craft-chip ${(novel.craft?.platform || "") === item.id ? "on" : ""}`}
                    onClick={() => doc.patchCraft({ platform: item.id })}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <label className="field" style={{ marginTop: 10 }}>
                <span>金手指规则（选填）</span>
                <textarea
                  rows={3}
                  value={novel.craft?.goldenFinger || ""}
                  placeholder="名称、触发条件、奖励范围、冷却、限制、成长曲线、提示音格式。例：签到系统，每日一次，冷却24小时，提示音【叮，……】。"
                  onChange={(e) => doc.patchCraft({ goldenFinger: e.target.value.slice(0, 1200) })}
                />
              </label>
              <label className="field">
                <span>本章必写爽点（选填）</span>
                <textarea
                  rows={2}
                  value={novel.craft?.requiredBeats || ""}
                  placeholder="例：当众鉴宝打脸、亲戚变脸、明星侧目。写章时必须落到对白、动作或数字。"
                  onChange={(e) => doc.patchCraft({ requiredBeats: e.target.value.slice(0, 400) })}
                />
              </label>
              <p className="muted">选了平台且篇幅仍是默认 2200–3800 时，会自动套用平台字数区间；手动改过篇幅以手动为准。</p>
            </InsFold>
  
            <InsFold
              title="仿写骨架"
              open={assets.foldOpen("imitate")}
              onToggle={() => assets.toggleFold("imitate")}
              hint={`${(novel.craft?.imitateLib || []).length} 篇范文 · ${novel.craft?.imitateOn ? "已启用" : "未启用"}`}
            >
              <div className="craft-row">
                <button
                  type="button"
                  className={`craft-chip ${novel.craft?.imitateOn ? "on" : ""}`}
                  onClick={() => doc.patchCraft({ imitateOn: !novel.craft?.imitateOn })}
                >
                  {novel.craft?.imitateOn ? "仿写已启用" : "启用仿写骨架"}
                </button>
                <button type="button" className="btn" onClick={assets.addImitateSample}>
                  加一篇范文
                </button>
                <button type="button" className="btn" onClick={assets.mergeImitate}>
                  合并通用骨架
                </button>
                <button type="button" className="btn" onClick={assets.compareImitate}>
                  对照本章
                </button>
              </div>
              <p className="muted">
                找 3—5 篇同类型、同平台、过检测的范文，各摘 2000—3000 字。本地拆结构、用词与人味锚点，合并成通用骨架；写章时严格按骨架走，不抄词句。
              </p>
              {(novel.craft?.imitateLib || []).map((row) => (
                <div key={row.id} className="imit-card">
                  <div className="craft-row">
                    <input
                      value={row.title}
                      placeholder="范文标题"
                      onChange={(e) => assets.patchImitateSample(row.id, { title: e.target.value.slice(0, 60) })}
                    />
                    <input
                      value={row.platform}
                      placeholder="平台"
                      onChange={(e) => assets.patchImitateSample(row.id, { platform: e.target.value.slice(0, 20) })}
                    />
                    <input
                      value={row.genre}
                      placeholder="类型"
                      onChange={(e) => assets.patchImitateSample(row.id, { genre: e.target.value.slice(0, 20) })}
                    />
                    <input
                      value={row.style}
                      placeholder="风格"
                      onChange={(e) => assets.patchImitateSample(row.id, { style: e.target.value.slice(0, 20) })}
                    />
                    <input
                      value={row.check}
                      placeholder="朱雀结果"
                      onChange={(e) => assets.patchImitateSample(row.id, { check: e.target.value.slice(0, 40) })}
                    />
                    <button type="button" className="btn-ghost" onClick={() => assets.removeImitateSample(row.id)}>
                      删
                    </button>
                  </div>
                  <textarea
                    rows={4}
                    value={row.excerpt}
                    placeholder="粘贴范文摘录 2000—3000 字"
                    onChange={(e) => assets.patchImitateSample(row.id, { excerpt: e.target.value.slice(0, 6000) })}
                  />
                  <div className="craft-row">
                    <button
                      type="button"
                      className="btn"
                      disabled={assets.imitBusy === row.id}
                      onClick={() => assets.analyzeImitateSample(row.id)}
                    >
                      {assets.imitBusy === row.id ? "拆解中…" : "本地拆解"}
                    </button>
                    {row.dims ? <span className="muted">已拆解</span> : null}
                  </div>
                  {row.report ? <pre className="imit-report">{row.report}</pre> : null}
                </div>
              ))}
              <label className="field">
                <span>通用骨架（写章时按此比例）</span>
                <textarea
                  rows={6}
                  value={novel.craft?.imitate || ""}
                  placeholder="点「合并通用骨架」自动生成，或手填。例：平均句长 12 字；短句 55%…"
                  onChange={(e) => doc.patchCraft({ imitate: e.target.value.slice(0, 4000) })}
                />
              </label>
              <label className="field">
                <span>仿写补充（选填）</span>
                <textarea
                  rows={2}
                  value={novel.craft?.imitateNotes || ""}
                  placeholder="例：对白后必须跟动作；不写比喻。"
                  onChange={(e) => doc.patchCraft({ imitateNotes: e.target.value.slice(0, 600) })}
                />
              </label>
              {assets.imitRows.length ? (
                <table className="imit-table">
                  <thead>
                    <tr>
                      <th>维度</th>
                      <th>范文</th>
                      <th>我的稿</th>
                      <th>差异</th>
                    </tr>
                  </thead>
                  <tbody>
                    {assets.imitRows.map((row) => (
                      <tr key={row.key} className={row.diff > 20 ? "bad" : ""}>
                        <td>{row.label}</td>
                        <td>{row.want}</td>
                        <td>{row.got}</td>
                        <td>{row.diff}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
              <p className="muted">
                启用后，写章、改稿、立项都会带上这份骨架。写完点「对照本章」，差异超 20% 的维度回改；也可选中段落点「照骨架改」。
              </p>
            </InsFold>
  
            <InsFold
              title="文风篇幅"
              open={assets.foldOpen("voice")}
              onToggle={() => assets.toggleFold("voice")}
              hint={`${novel.style || "跟立项"} · ${novel.craft?.wordsMin ?? 2200}–${novel.craft?.wordsMax ?? 3800} 字`}
            >
              <h4>文风</h4>
              <select
                value={novel.style || ""}
                onChange={(e) => doc.patchNovel({ ...novel, style: e.target.value })}
              >
                <option value="">跟立项调性</option>
                {STYLES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
                {novel.style && !STYLES.includes(novel.style) && (
                  <option value={novel.style}>{novel.style}</option>
                )}
              </select>
              <input
                value={novel.style || ""}
                onChange={(e) => doc.patchNovel({ ...novel, style: e.target.value })}
                placeholder="自填文风"
              />
  
            <div className="ins-block">
              <h4>视角</h4>
              <select value={novel.pov || "第三人称有限"} onChange={(e) => doc.patchNovel({ ...novel, pov: e.target.value })}>
                {POVS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
                {novel.pov && !POVS.includes(novel.pov) && (
                  <option value={novel.pov}>{novel.pov}</option>
                )}
              </select>
              <input
                value={novel.pov || ""}
                onChange={(e) => doc.patchNovel({ ...novel, pov: e.target.value })}
                placeholder="自填视角"
              />
            </div>
  
            <div className="ins-block">
              <h4>主题</h4>
              <input
                value={novel.theme || ""}
                onChange={(e) => doc.patchNovel({ ...novel, theme: e.target.value })}
                placeholder="这本书在问什么"
              />
            </div>
  
            <div className="ins-block">
              <h4>信息密度</h4>
              <div className="craft-row">
                {DENSITIES.map((item) => (
                  <button
                    key={item}
                    className={`craft-chip ${(novel.craft?.density || "中") === item ? "on" : ""}`}
                    onClick={() => doc.patchCraft({ density: item })}
                    type="button"
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
            <div className="ins-block">
              <h4>本章篇幅</h4>
              <p className="muted">
                {(() => {
                  const wc = wordCount(chapter.content);
                  const min = novel.craft?.wordsMin ?? 2200;
                  const max = novel.craft?.wordsMax ?? 3800;
                  const tail = wc > max ? `，已超 ${wc - max} 字，写完会截到 ${max}` : wc && wc < min ? `，还差 ${min - wc} 字` : "";
                  return `写完整一章按 ${min}–${max} 字收束，超出会截到上限。续写单场不受上限。当前 ${wc} 字${tail}。`;
                })()}
              </p>
              {wordCount(chapter.content) > (novel.craft?.wordsMax ?? 3800) ? (
                <button className="btn" type="button" onClick={act.enforceChapterWordMax}>
                  现在收到 {novel.craft?.wordsMax ?? 3800} 字
                </button>
              ) : null}
              <div className="craft-row">
                {WORD_PRESETS.map((item) => (
                  <button
                    key={item.label}
                    className={`craft-chip ${novel.craft?.wordsMin === item.min && novel.craft?.wordsMax === item.max ? "on" : ""}`}
                    onClick={() => doc.patchCraft({ wordsMin: item.min, wordsMax: item.max })}
                    type="button"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <div className="word-range">
                <input
                  type="number"
                  min={800}
                  max={8000}
                  value={novel.craft?.wordsMin ?? 2200}
                  onChange={(e) => {
                    const min = Math.max(800, Math.min(8000, Number(e.target.value) || 800));
                    const max = Math.max(min, novel.craft?.wordsMax ?? 3800);
                    doc.patchCraft({ wordsMin: min, wordsMax: max });
                  }}
                />
                <span>至</span>
                <input
                  type="number"
                  min={800}
                  max={12000}
                  value={novel.craft?.wordsMax ?? 3800}
                  onChange={(e) => {
                    const min = novel.craft?.wordsMin ?? 2200;
                    const max = Math.max(min, Math.min(12000, Number(e.target.value) || min));
                    doc.patchCraft({ wordsMax: max });
                  }}
                />
                <span>字</span>
              </div>
            </div>
  
            <div className="ins-block">
              <h4>语言滑杆</h4>
              <label className="slider">
                <span>通俗</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={novel.craft?.tone ?? 45}
                  onChange={(e) => doc.patchCraft({ tone: Number(e.target.value) })}
                />
                <span>文学</span>
              </label>
              <label className="slider">
                <span>舒缓</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={novel.craft?.pace ?? 55}
                  onChange={(e) => doc.patchCraft({ pace: Number(e.target.value) })}
                />
                <span>紧张</span>
              </label>
              <label className="slider">
                <span>描写</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={novel.craft?.talk ?? 50}
                  onChange={(e) => doc.patchCraft({ talk: Number(e.target.value) })}
                />
                <span>对话</span>
              </label>
            </div>
            </InsFold>
  
            <InsFold
              title="情感"
              open={assets.foldOpen("emotion", Boolean(chapter.mood))}
              onToggle={() => assets.toggleFold("emotion", Boolean(chapter.mood))}
              hint={chapter.mood || "跟正文"}
            >
              <p className="muted">{d.emotionHint}</p>
              <p className="ins-kicker">本章</p>
              <div className="craft-row">
                <button
                  type="button"
                  className={`craft-chip ${chapter.mood ? "" : "on"}`}
                  onClick={() => doc.patchChapterById(chapter.id, { mood: "" })}
                >
                  跟正文
                </button>
                {MOODS.map((item) => (
                  <button
                    key={`ch-${item}`}
                    type="button"
                    className={`craft-chip ${chapter.mood === item ? "on" : ""}`}
                    onClick={() => doc.patchChapterById(chapter.id, { mood: chapter.mood === item ? "" : item })}
                  >
                    {item}
                  </button>
                ))}
              </div>
              {chapter.mood ? (
                <>
                  <label className="slider">
                    <span>起</span>
                    <input
                      type="range"
                      min={1}
                      max={10}
                      value={chapter.emotionStart ?? 4}
                      onChange={(e) => doc.patchChapterById(chapter.id, { emotionStart: Number(e.target.value) })}
                    />
                    <span>{chapter.emotionStart ?? 4}</span>
                  </label>
                  <label className="slider">
                    <span>收</span>
                    <input
                      type="range"
                      min={1}
                      max={10}
                      value={chapter.emotionEnd ?? 6}
                      onChange={(e) => doc.patchChapterById(chapter.id, { emotionEnd: Number(e.target.value) })}
                    />
                    <span>{chapter.emotionEnd ?? 6}</span>
                  </label>
                </>
              ) : null}
              <p className="ins-kicker">新章默认</p>
              <div className="craft-row">
                {MOODS.map((item) => (
                  <button
                    key={item}
                    type="button"
                    className={`craft-chip ${(novel.craft?.mood || "") === item ? "on" : ""}`}
                    onClick={() => doc.patchCraft({ mood: novel.craft?.mood === item ? "" : item })}
                  >
                    {item}
                  </button>
                ))}
              </div>
              <div className="craft-row">
                {EMOTION_STYLES.map((item) => (
                  <button
                    key={item}
                    type="button"
                    className={`craft-chip ${(novel.craft?.emotionStyle || "综合") === item ? "on" : ""}`}
                    onClick={() => doc.patchCraft({ emotionStyle: item })}
                  >
                    {item}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className={`craft-chip ${novel.craft?.showDontTell !== false ? "on" : ""}`}
                onClick={() => doc.patchCraft({ showDontTell: novel.craft?.showDontTell === false })}
              >
                只准演
              </button>
              <label className="field" style={{ marginTop: 10 }}>
                <span>语气样本（选填）</span>
                <textarea
                  rows={3}
                  value={novel.craft?.voiceSample || ""}
                  placeholder="贴一段你觉得活的叙述。写章时会模仿句长、口头禅和脏话密度。"
                  onChange={(e) => doc.patchCraft({ voiceSample: e.target.value.slice(0, 800) })}
                />
              </label>
            </InsFold>
  
            <div className="ins-block">
              <h4>本章写法</h4>
              <div className="craft-row">
                {CRAFT_TOGGLES.map((item) => (
                  <button
                    key={item.key}
                    className={`craft-chip ${novel.craft?.[item.key] ? "on" : ""}`}
                    onClick={() => doc.patchCraft({ [item.key]: !novel.craft?.[item.key] })}
                    type="button"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
  
            {d.openThreads.length > 0 && (
              <div className="ins-block">
                <h4>未收伏笔</h4>
                <p className="muted">{d.openThreads.length} 条还没收回。</p>
                <button className="btn" type="button" onClick={() => act.openDesk("threads")}>
                  打开伏笔台
                </button>
              </div>
            )}
  
            <InsFold
              title="词库"
              open={assets.foldOpen("lexicon")}
              onToggle={() => assets.toggleFold("lexicon")}
              hint={`${(novel.lexicon?.keep || []).length} 词`}
            >
              <div className="ins-h" style={{ padding: 0 }}>
                <button
                  className="btn-ghost"
                  type="button"
                  onClick={() => {
                    const text = (novel.lexicon?.keep || []).join("、");
                    if (!text) {
                      doc.setStatus("词库还是空的");
                      return;
                    }
                    const copy = navigator.clipboard?.writeText(text);
                    if (!copy) {
                      doc.setStatus("复制失败");
                      return;
                    }
                    copy.then(
                      () => doc.setStatus("词库已复制"),
                      () => doc.setStatus("复制失败")
                    );
                  }}
                >
                  复制
                </button>
              </div>
              <p className="muted">始终正确的词不会被标错。映射只作建议，不自动替换。</p>
              <div className="lex-row">
                <input value={ui.keepDraft} onChange={(e) => ui.setKeepDraft(e.target.value)} placeholder="夜无痕" />
                <button
                  className="btn-ghost"
                  type="button"
                  onClick={() => {
                    const word = ui.keepDraft.trim();
                    if (!word) return;
                    const keep = novel.lexicon?.keep || [];
                    if (!keep.includes(word)) doc.patchLexicon({ keep: [...keep, word] });
                    ui.setKeepDraft("");
                  }}
                >
                  保留
                </button>
              </div>
              <div className="craft-row">
                {(novel.lexicon?.keep || []).map((word) => (
                  <button
                    key={word}
                    type="button"
                    className="craft-chip on"
                    onClick={() => doc.patchLexicon({ keep: (novel.lexicon?.keep || []).filter((item) => item !== word) })}
                  >
                    {word} ×
                  </button>
                ))}
              </div>
              <div className="lex-row map">
                <input value={ui.mapFrom} onChange={(e) => ui.setMapFrom(e.target.value)} placeholder="错词" />
                <input value={ui.mapTo} onChange={(e) => ui.setMapTo(e.target.value)} placeholder="正词" />
                <button
                  className="btn-ghost"
                  type="button"
                  onClick={() => {
                    if (!ui.mapFrom.trim() || !ui.mapTo.trim()) return;
                    doc.patchLexicon({
                      map: [...(novel.lexicon?.map || []), { from: ui.mapFrom.trim(), to: ui.mapTo.trim() }],
                    });
                    ui.setMapFrom("");
                    ui.setMapTo("");
                  }}
                >
                  映射
                </button>
              </div>
              {(novel.lexicon?.map || []).map((row, index) => (
                <button
                  key={`${row.from}-${index}`}
                  type="button"
                  className="issue-line typo"
                  onClick={() =>
                    doc.patchLexicon({ map: (novel.lexicon?.map || []).filter((_, i) => i !== index) })
                  }
                >
                  {row.from} → {row.to}
                </button>
              ))}
            </InsFold>
  
            {d.visibleIssues.length > 0 && (
              <div className="ins-block">
                <h4>本章标记</h4>
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
  
            <InsFold
              title="写法"
              open={assets.foldOpen("doc.skills", true)}
              onToggle={() => assets.toggleFold("doc.skills", true)}
              hint={`${act.skillsForDesk().length} 份`}
            >
              {act.skillsForDesk().map((skill) => (
                <button
                  key={skill.id}
                  className="skill-mini"
                  disabled={act.busy}
                  onClick={() => act.runSkill(skill)}
                >
                  <b>{skill.name}</b>
                  <span className="muted">{skill.scene}</span>
                </button>
              ))}
              {doc.skills.length > act.skillsForDesk().length && (
                <button className="btn-ghost" type="button" onClick={() => assets.setAllSkills((v) => !v)}>
                  {assets.allSkills ? "只看本台" : "显示全部"}
                </button>
              )}
            </InsFold>
  
            {act.busy && (
              <>
              <Meter percent={d.pipePercent} label={d.pipeMeterLabel} running compact />
              <button className="btn-danger" onClick={act.stopWriting}>
                {act.autoPipe ? "停在这步" : "停止生成"}
              </button>
              </>
            )}
            {scan.sideText && (
              <div className="ins-block">
                <h4>
                  {scan.sideKind === "edit"
                    ? "润色"
                    : scan.sideKind === "threads"
                      ? "伏笔账本"
                      : scan.sideKind === "focus"
                        ? "审稿 / 建议"
                        : scan.sideKind === "emotion"
                          ? "情感改写"
                          : scan.sideKind === "scan"
                            ? "校对"
                            : "本轮生成"}
                </h4>
                {scan.sideKind === "emotion" && d.emotionVersions.length >= 2 && !act.busy ? (
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
                  ) : (
                    <div className="side-result">{scan.sideText}</div>
                  ))}
                {scan.sideKind === "edit" && (
                  <button className="btn" onClick={scan.applyPolish}>
                    写入正文
                  </button>
                )}
              </div>
            )}
            <p className="muted">{doc.status}</p>
            <Link className="muted" to="/">
              返回首页
            </Link>
          </aside>
    </>
  );
}
