import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../data/api";
import type { Teardown, TeardownChapter } from "../domain/types";
import { useAppState } from "../app-state";
import Meter, { formatWait, useWaitMeter } from "../components/Meter";
import { jobDisplayPercent, jobLabel, stopJob, useJob } from "../data/jobs";
import { STORAGE_KEYS, readJson, readText, writeJson, writeText } from "../data/storage";
import {
  TEAR_TABS,
  attachTeardown,
  pauseTeardown,
  resumeTeardown,
  runTeardownCraft,
  runTeardownPipe,
  runTeardownTab,
  skipTeardown,
  skillFilled,
  type TearTabId,
} from "../data/teardown-run";
import { STAGES } from "../domain/pipeline";
import StageFlow from "../components/StageFlow";
import { buildStageFlow, type StageAction, type StageCardModel } from "../domain/stage-flow";

function splitCards(text: string) {
  const raw = String(text || "").trim();
  if (!raw) return [];
  return raw
    .split(/^###\s+/m)
    .filter(Boolean)
    .map((chunk, index) => {
      const nl = chunk.indexOf("\n");
      return {
        id: String(index),
        title: (nl >= 0 ? chunk.slice(0, nl) : chunk).trim(),
        body: (nl >= 0 ? chunk.slice(nl + 1) : "").trim(),
      };
    });
}

export default function TeardownDesk() {
  const { id } = useParams();
  const nav = useNavigate();
  const { setInfo } = useAppState();
  const [row, setRow] = useState<Teardown | null>(null);
  const [tab, setTab] = useState<TearTabId>("beats");
  const [reading, setReading] = useState<TeardownChapter | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const job = useJob();
  const busy = job.running;
  const mine = job.kind === "teardown" && job.targetId === id;
  const wait = useWaitMeter(busy && mine, 40000, job.step);
  const [scopeDraft, setScopeDraft] = useState(30);
  const [recipesOpen, setRecipesOpen] = useState(false);
  const [tearPaused, setTearPaused] = useState(false);
  const [tearSkipped, setTearSkipped] = useState<string[]>([]);

  useEffect(() => {
    if (!busy) setTearPaused(false);
  }, [busy]);

  async function reload() {
    if (!id) return null;
    const next = await api.teardown(id);
    setRow(next);
    setScopeDraft(next.scopeEnd);
    writeText(STORAGE_KEYS.lastTeardown, `/teardown/${next.id}`);
    return next;
  }

  useEffect(() => {
    reload().catch((err) => setError(err.message));
    }, [id]);

  useEffect(() => {
    if (!id) return;
    const saved = readText(STORAGE_KEYS.teardownTab(id));
    if (saved) setTab(saved as TearTabId);
  }, [id]);

  useEffect(() => {
    if (id && tab) writeText(STORAGE_KEYS.teardownTab(id), tab);
  }, [id, tab]);

  useEffect(() => {
    if (!id) {
      setTearSkipped([]);
      return;
    }
    const saved = readJson<unknown>(STORAGE_KEYS.teardownSkip(id), []);
    setTearSkipped(Array.isArray(saved) ? (saved as string[]) : []);
  }, [id]);

  useEffect(() => {
    return attachTeardown({
      onRow: (next) => {
        setRow(next);
        setScopeDraft(next.scopeEnd);
      },
      onDraft: setDraft,
    });
  }, []);

  useEffect(() => {
    if (mine && job.tabId) {
      setTab(job.tabId as TearTabId);
      setReading(null);
    }
  }, [mine, job.tabId]);

  useEffect(() => {
    if (mine && job.error) setError(job.error);
  }, [mine, job.error]);

  async function openChapter(ch: TeardownChapter) {
    if (!id) return;
    if (ch.content) {
      setReading(ch);
      return;
    }
    try {
      const full = await api.teardownChapter(id, ch.id);
      setReading(full);
    } catch (err) {
      setError(err instanceof Error ? err.message : "章节读取失败");
    }
  }

  useEffect(() => {
    if (!row) return;
    setInfo({
      title: row.title,
      subtitle: "拆书",
      chapter: reading ? `第${reading.index}章` : TEAR_TABS.find((item) => item.id === tab)?.label || "",
      saved: true,
      genre: "拆书",
      words: (row.chapters || []).reduce((sum, ch) => sum + (ch.wordCount || 0), 0),
      novelId: "",
      chapterId: "",
    });
  }, [row, tab, reading, setInfo]);

  const currentTab = TEAR_TABS.find((item) => item.id === tab) || TEAR_TABS[0];
  const tearFilled = useMemo(() => {
    const out: Record<string, boolean> = {};
    if (!row) return out;
    for (const stage of STAGES.filter((item) => item.line === "teardown" && item.builtin)) {
      out[stage.id] =
        stage.id === "td-craft"
          ? Boolean(String(row.recipes || "").trim())
          : skillFilled(row, stage.builtin as string);
    }
    return out;
  }, [row]);
  const activeStageId = mine && job.tabId
    ? STAGES.find((item) => item.line === "teardown" && item.tab === job.tabId)?.id || ""
    : "";
  const tearCards = useMemo(
    () =>
      buildStageFlow({
        line: "teardown",
        record: row as unknown as Record<string, unknown>,
        activeStageId,
        skipped: tearSkipped,
        filled: tearFilled,
      }),
    [row, activeStageId, tearSkipped, tearFilled]
  );
  const cards = useMemo(() => {
    if (!row) return [];
    if (currentTab.id === "beats") {
      const scoped = row.chapters.filter((ch) => ch.index <= (row.scopeEnd || ch.index));
      return scoped.map((ch) => ({
        id: ch.id,
        title: `第${ch.index}章 ${ch.title}`,
        body: ch.beat || "尚未拆本章",
      }));
    }
    if (currentTab.id === "fine") {
      return String(row.outlineFine || "")
        .split(/\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#"))
        .map((line, index) => ({
          id: String(index),
          title: line.split(/[｜|]/)[0] || `场面 ${index + 1}`,
          body: line,
        }));
    }
    return splitCards(String((row as unknown as Record<string, unknown>)[currentTab.field] || ""));
  }, [row, currentTab]);

  function runPipe() {
    if (!row) return;
    setError("");
    setDraft("");
    resumeTeardown();
    setTearPaused(false);
    runTeardownPipe(row).catch((err) => setError(err instanceof Error ? err.message : "拆书中断"));
  }

  function runTab() {
    if (!row) return;
    setError("");
    setDraft("");
    setReading(null);
    resumeTeardown();
    setTearPaused(false);
    runTeardownTab(row, currentTab.id).catch((err) => setError(err instanceof Error ? err.message : "拆书中断"));
  }

  function runCraft() {
    if (!row) return;
    setError("");
    setDraft("");
    resumeTeardown();
    setTearPaused(false);
    runTeardownCraft(row).catch((err) => setError(err instanceof Error ? err.message : "提炼失败"));
  }

  function writeTearSkip(next: string[]) {
    if (!id) return;
    setTearSkipped(next);
    writeJson(STORAGE_KEYS.teardownSkip(id), next);
  }

  function onTeardownAction(action: StageAction, card: StageCardModel) {
    if (!row) return;
    const stage = card.stage;
    if (action === "skip") {
      writeTearSkip(tearSkipped.includes(stage.id) ? tearSkipped : [...tearSkipped, stage.id]);
      return;
    }
    if (action === "edit" || action === "view") {
      if (stage.tab) {
        setTab(stage.tab);
        setReading(null);
      } else if (stage.id === "td-craft" && row.recipes) {
        setRecipesOpen(true);
      }
      return;
    }
    if (busy) return;
    writeTearSkip(tearSkipped.filter((item) => item !== stage.id));
    if (stage.id === "td-craft") {
      runCraft();
      return;
    }
    if (!stage.tab) return;
    setError("");
    setDraft("");
    setReading(null);
    setTab(stage.tab);
    resumeTeardown();
    setTearPaused(false);
    runTeardownTab(row, stage.tab).catch((err) => setError(err instanceof Error ? err.message : "拆书中断"));
  }

  async function saveScope(scopeEnd: number) {
    if (!row) return;
    const next = await api.saveTeardown(row.id, { scopeEnd });
    setRow(next);
    setScopeDraft(next.scopeEnd);
  }

  const readingIndex = row && reading ? row.chapters.findIndex((c) => c.id === reading.id) : -1;
  const prevCh = row && readingIndex > 0 ? row.chapters[readingIndex - 1] : null;
  const nextCh = row && readingIndex >= 0 && readingIndex < row.chapters.length - 1 ? row.chapters[readingIndex + 1] : null;

  useEffect(() => {
    if (!reading) return;
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "Escape") setReading(null);
      if (e.key === "ArrowLeft" && prevCh) openChapter(prevCh);
      if (e.key === "ArrowRight" && nextCh) openChapter(nextCh);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [reading, prevCh, nextCh]);

  useEffect(() => {
    document.querySelector(".tear-chapters button.on")?.scrollIntoView?.({ block: "nearest" });
  }, [reading?.id]);

  if (!row) {
    return <div className="banner">{error || "加载拆书工程…"}</div>;
  }

  return (
    <div className="tear-desk">
      <aside className="tear-side">
        <div className="tear-side-head">
          <b>{row.title}</b>
          <span className="muted">
            共 {row.chapterCount} 章，本次拆前 {row.scopeEnd} 章
          </span>
          {row.chapterCount > 30 && <span className="muted">默认只拆前 30 章，改数字后可追加。</span>}
          <label>
            拆到第
            <input
              type="number"
              min={1}
              max={row.chapterCount}
              value={scopeDraft}
              onChange={(e) => setScopeDraft(Number(e.target.value))}
              onBlur={() => saveScope(scopeDraft).catch((err) => setError(err.message))}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  (e.target as HTMLInputElement).blur();
                }
              }}
            />
            章
          </label>
        </div>
        {row.skillId && <p className="muted">技法已写入开书策划、章节正文等内置说明书。打开资产页即可看到「对标技法」一节，之后所有稿都按这个写。</p>}
        {row.recipes ? (
          <button className="btn-ghost" type="button" onClick={() => setRecipesOpen(true)}>
            查看对标技法
          </button>
        ) : null}
        <div className="tear-chapters">
          {row.chapters.map((ch) => (
            <button
              key={ch.id}
              type="button"
              className={reading?.id === ch.id ? "on" : ""}
              onClick={() => {
                openChapter(ch);
              }}
            >
              <em>第{ch.index}章</em>
              <span>{ch.title || "未题"}</span>
              <small>
                {ch.wordCount} 字{ch.beat ? " · 已拆" : ""}
              </small>
            </button>
          ))}
        </div>
        <button className="btn-ghost" type="button" onClick={() => nav("/teardown")}>
          拆书列表
        </button>
      </aside>

      <section className="tear-main">
        <StageFlow cards={tearCards} busy={busy} activeStageId={activeStageId} onAction={onTeardownAction} />
        <div className="tear-bar">
          <button className="btn-mint" type="button" disabled={busy || TEAR_TABS.every((item) => skillFilled(row, item.skillId))} onClick={() => runPipe()}>
            {busy
              ? mine
                ? job.step || "拆书中"
                : "后台进行中"
              : TEAR_TABS.every((item) => skillFilled(row, item.skillId))
                ? "全部拆完"
                : TEAR_TABS.some((item) => skillFilled(row, item.skillId))
                  ? "继续拆书"
                  : "开始拆书"}
          </button>
          <button className="btn" type="button" disabled={busy} onClick={() => runTab()}>
            {skillFilled(row, currentTab.skillId) ? "重跑本栏" : "只拆本栏"}
          </button>
          <button className="btn" type="button" disabled={busy || !row.beats} onClick={() => runCraft()}>
            提炼技法
          </button>
          {busy && mine && (
            <>
              {tearPaused ? (
                <button
                  className="btn-mint"
                  type="button"
                  onClick={() => {
                    resumeTeardown();
                    setTearPaused(false);
                  }}
                >
                  继续
                </button>
              ) : (
                <button
                  className="btn"
                  type="button"
                  onClick={() => {
                    pauseTeardown();
                    setTearPaused(true);
                  }}
                >
                  本步后暂停
                </button>
              )}
              <button className="btn" type="button" onClick={() => skipTeardown()}>
                跳过这步
              </button>
            </>
          )}
          {busy && (
            <button className="btn-danger" type="button" onClick={() => stopJob()}>
              停止
            </button>
          )}
          {busy && (
            <Meter
              percent={jobDisplayPercent(job, wait.percent)}
              label={`${jobLabel(job)}${wait.elapsed ? ` · ${formatWait(wait.elapsed)}` : ""}`}
              running
              compact
            />
          )}
        </div>
        {error && <p className="banner">{error}</p>}
        {reading ? (
          <article className="tear-read">
            <header>
              <h2>
                第{reading.index}章 {reading.title}
              </h2>
              <div className="tear-read-nav">
                <button type="button" disabled={!prevCh} onClick={() => prevCh && openChapter(prevCh)}>
                  上一章
                </button>
                <button type="button" disabled={!nextCh} onClick={() => nextCh && openChapter(nextCh)}>
                  下一章
                </button>
                <button className="btn-ghost" type="button" onClick={() => setReading(null)}>
                  回到拆解
                </button>
              </div>
            </header>
            <pre>{reading.content}</pre>
          </article>
        ) : (
          <div className="tear-cards">
            {mine && (job.draft || draft) && <pre className="tear-stream">{job.draft || draft}</pre>}
            {cards.length === 0 && !busy && (
              <div className="empty-cta">
                <p className="muted">这一栏还空着。</p>
                <button className="btn-mint" type="button" onClick={() => runTab()}>
                  只拆本栏
                </button>
              </div>
            )}
            {cards.map((card) => (
              <article key={card.id} className="tear-card">
                <h3>{card.title}</h3>
                <pre>{card.body}</pre>
              </article>
            ))}
          </div>
        )}
      </section>
      {recipesOpen && row.recipes ? (
        <div className="modal-back" onClick={() => setRecipesOpen(false)}>
          <div className="modal hist-modal" onClick={(e) => e.stopPropagation()}>
            <h3>对标技法</h3>
            <p className="muted">这份拆书提炼出的写法。已写入对应的内置说明书「对标技法」一节，制作台按它写稿。</p>
            <pre className="side-result">{row.recipes}</pre>
            <button className="btn-ghost" type="button" onClick={() => setRecipesOpen(false)}>
              关闭
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
