import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { api, generate } from "../../data/api";
import {
  PIPELINE,
  PIPE_SKILL_IDS,
  STAGES,
  WRITING_GROUPS,
  expectJobChars,
  expectJobMs,
  panelOfStage,
  pipeSkillId,
  pipeSkillSlot,
  stageOf,
} from "../../domain/pipeline";
import { buildStageFlow, type StageCardModel } from "../../domain/stage-flow";
import type { HistoryItem, Novel, Skill, ThreadItem, Voice } from "../../domain/types";
import {
  CLEAN_COPY_EXTRA,
  PERFORM_EXTRA,
  IMITATE_EXTRA,
  clipToWordMax,
  mergeThreads,
  newThread,
  parseThreads,
} from "../../domain/craft";
import { inferEmotion } from "../../domain/emotion";
import { parseReviewVerdict } from "../../domain/review";
import {
  beginJob,
  finishJob,
  getJob,
  jobLabel,
  patchJob,
  setJobStop,
  stopJob,
} from "../../data/jobs";
import { STORAGE_KEYS, readJson, writeJson } from "../../data/storage";
import useStudioUi from "./useStudioUi";
import useStudioDocument from "./useStudioDocument";
import useStudioScan from "./useStudioScan";
import useStudioAssets from "./useStudioAssets";
import {
  AUTO_PIPE_EXTRA,
  chapterHeading,
  ensureChapterAt,
  expandChaptersFromBeats,
  findNextPipe,
  formatElapsed,
  looksLikeChapterProse,
  maxBeatIndex,
  novelHasProse,
  parseBeatChapters,
  pipeSlotFilled,
  upsertSection,
  wordCount,
  type AssetField,
  type DeskId,
  type FillSlot,
  type TabId,
} from "./studio-utils";

type PipelineDeps = {
  document: ReturnType<typeof useStudioDocument>;
  ui: ReturnType<typeof useStudioUi>;
  scan: ReturnType<typeof useStudioScan>;
  assets: ReturnType<typeof useStudioAssets>;
  id?: string;
  search: string;
  nav: (to: string, opts?: { replace?: boolean }) => void;
  selRef: { current: { start: number; end: number } };
  pendingSel: { current: { start: number; end: number } | null };
  paperRef: { current: HTMLTextAreaElement | null };
};

export default function useStudioPipeline(deps: PipelineDeps) {
  const { id, search, nav, selRef, pendingSel, paperRef } = deps;
  const {
    novel,
    setNovel,
    novelRef,
    skills,
    setSkills,
    chapterId,
    setChapterId,
    chapter,
    undoStack,
    setUndoStack,
    undoStackRef,
    status,
    setStatus,
    loadError,
    setLoadError,
    dirty,
    setDirty,
    dirtyRef,
    conflictRef,
    idRef,
    saveRef,
    save,
    syncSavedRev,
    patchNovel,
    patchCraft,
    patchLexicon,
    patchChapterById,
    updateChapter,
    patchThread,
    applyToken,
    pushUndo,
  } = deps.document;
  const {
    tab,
    setTab,
    reading,
    setReading,
    readerSize,
    setReaderSize,
    nightRead,
    setNightRead,
    mobile,
    setMobile,
    extra,
    setExtra,
    railCollapsed,
    setRailCollapsed,
    railFoldedGroups,
    setRailFoldedGroups,
    focusOpenFor,
    setFocusOpenFor,
    focusDraft,
    setFocusDraft,
    previewOpen,
    setPreviewOpen,
    previewSkillId,
    setPreviewSkillId,
    desk,
    setDesk,
    split,
    setSplit,
    paletteOpen,
    setPaletteOpen,
    paletteQuery,
    setPaletteQuery,
    selText,
    setSelText,
    dragId,
    setDragId,
    keepDraft,
    setKeepDraft,
    mapFrom,
    setMapFrom,
    mapTo,
    setMapTo,
    ctx,
    setCtx,
    nameHint,
    setNameHint,
  } = deps.ui;
  const {
    sideText,
    setSideText,
    sideKind,
    setSideKind,
    reportOpen,
    setReportOpen,
    logsOpen,
    setLogsOpen,
    issues,
    setIssues,
    aigc,
    setAigc,
    voiceInfo,
    setVoiceInfo,
    nouns,
    setNouns,
    ignored,
    setIgnored,
    scanNow,
    jumpIssue,
    applyIssue,
    locateOriginal,
    replaceOriginal,
    applyPolish,
    applyEmotion,
  } = deps.scan;
  const {
    allSkills,
    setAllSkills,
    folds,
    setFolds,
    imitBusy,
    setImitBusy,
    imitRows,
    setImitRows,
    histFor,
    setHistFor,
    uploadRef,
    uploadTarget,
    patchImitateSample,
    addImitateSample,
    removeImitateSample,
    analyzeImitateSample,
    mergeImitate,
    compareImitate,
    writeCard,
    removeCard,
    addCard,
    restoreHistory,
    pickUpload,
    onUpload,
    foldOpen,
    toggleFold,
  } = deps.assets;

  const currentSkill = (idName: string) => skills.find((s) => s.id === idName);
  const nextPipe = novel ? findNextPipe(novel, chapter || {}) : null;

  const [busy, setBusy] = useState(false);

  const [autoPipe, setAutoPipe] = useState(false);
  const [paused, setPaused] = useState(false);
  const [failed, setFailed] = useState<{ slot: FillSlot | "content"; label: string; auto: boolean } | null>(null);
  const [runningSlot, setRunningSlot] = useState<FillSlot | "content" | "">("");
  const [skippedStages, setSkippedStages] = useState<string[]>([]);
  const [selectedStageId, setSelectedStageId] = useState("");
  const [streamChars, setStreamChars] = useState(0);
  const [pipeClock, setPipeClock] = useState(0);
  const [workName, setWorkName] = useState("");
  const [workId, setWorkId] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const autoPipeRef = useRef(false);
  const pausedRef = useRef(false);
  const skipRef = useRef(false);
  const stoppedRef = useRef(false);
  const autoOnceRef = useRef(false);
  const autoPipeDoneRef = useRef<Set<string>>(new Set());
  const continueAutoPipeRef = useRef<() => void>(() => undefined);

  const lastElapsedRef = useRef(0);
  const pipeStartRef = useRef(0);

  const busyRef = useRef(false);

  busyRef.current = busy;

  useEffect(() => {
    if (!novel || !skills.length) return;
    if (new URLSearchParams(search).get("auto") !== "1") return;
    if (autoOnceRef.current) return;
    autoOnceRef.current = true;
    nav(`/studio/${novel.id}`, { replace: true });
    autoPipeRef.current = true;
    setAutoPipe(true);
    stoppedRef.current = false;
    pipeStartRef.current = Date.now();
    setPipeClock(0);
    setStatus("自动开书：从缺的步骤写到第一章");
    const timer = window.setTimeout(() => continueAutoPipeRef.current(), 240);
    return () => window.clearTimeout(timer);
  }, [novel, skills, search, nav]);

  useEffect(() => {
    if (!busy) return;
    if (!pipeStartRef.current) pipeStartRef.current = Date.now();
    const tick = () => setPipeClock(Date.now() - pipeStartRef.current);
    tick();
    const timer = window.setInterval(tick, 400);
    return () => window.clearInterval(timer);
  }, [busy]);

  useEffect(() => {
    if (!autoPipe || busy) return;
    const current = novelRef.current;
    if (!current) return;
    const ch = current.chapters.find((row) => row.id === chapterId) || current.chapters[0];
    if (!ch) return;
    if (findNextPipe(current, ch)) return;
    autoPipeRef.current = false;
    setAutoPipe(false);
    if (pipeStartRef.current) setPipeClock(Date.now() - pipeStartRef.current);
  }, [autoPipe, busy, novel, chapterId]);

  useEffect(() => {
    if (busy) return;
    const current = novelRef.current;
    if (!current) return;
    const next = expandChaptersFromBeats(current);
    if (!next) return;
    patchNovel(next);
  }, [busy, novel?.id]);

  function openDesk(next: DeskId, tabId?: TabId, cid?: string) {
    setDesk(next);
    if (cid) {
      setChapterId(cid);
      setTab("content");
      const ch = novelRef.current?.chapters.find((row) => row.id === cid);
      if (!ch?.content) setReading(false);
    }
    if (tabId) setTab(tabId);
    if (next === "write") setTab("content");
    if (next === "cast") setTab("characters");
    if (next === "lore" && !tabId && (tab === "content" || tab === "characters")) setTab("brief");
  }

  function skillsForDesk() {
    const byDesk: Record<DeskId, string[]> = {
      write: ["chapter-prose", "continue", "review", "polish", "suggest"],
      board: ["outline", "chapter-beats"],
      cast: ["characters"],
      threads: ["threads"],
      lore: ["kickoff", "world", "outline", "chapter-beats", "props"],
    };
    const ids = new Set(byDesk[desk] || []);
    const core = skills.filter((s) => ids.has(s.id));
    const custom = skills.filter((s) => s.source === "custom");
    const rest = allSkills ? skills.filter((s) => !ids.has(s.id) && s.source !== "custom") : [];
    const seen = new Set<string>();
    return [...core, ...custom, ...rest].filter((s) => {
      if (seen.has(s.id)) return false;
      seen.add(s.id);
      return true;
    });
  }

  function undoLast() {
    const current = novelRef.current;
    const last = undoStackRef.current[undoStackRef.current.length - 1];
    if (!current || !last) return;
    autoPipeRef.current = false;
    setAutoPipe(false);
    stoppedRef.current = true;
    abortRef.current?.abort();
    abortRef.current = null;
    if (last.target === "beats" || last.target === "content") {
      patchNovel({
        ...current,
        chapters: current.chapters.map((c) => (c.id === last.chapterId ? { ...c, [last.target]: last.value } : c)),
      });
    } else {
      patchNovel({ ...current, [last.target]: last.value });
    }
    const next = undoStackRef.current.slice(0, -1);
    undoStackRef.current = next;
    setUndoStack(next);
    setBusy(false);
    setStatus("已撤销本轮生成");
  }

  function stopWriting() {
    autoPipeRef.current = false;
    pausedRef.current = false;
    skipRef.current = false;
    setAutoPipe(false);
    setPaused(false);
    stoppedRef.current = true;
    abortRef.current?.abort();
    autoPipeDoneRef.current = new Set();
    finishJob("已停止");
  }

  async function cleanCopyPass(startLen: number) {
    const current = novelRef.current;
    const cid = chapter?.id || chapterId;
    const ch = current?.chapters.find((row) => row.id === cid);
    if (!current || !ch) return false;
    setStatus("正在自动去AI味…");
    try {
      const result = await api.proof(current.id, {
        chapterId: ch.id,
        text: ch.content,
        lexicon: current.lexicon,
      });
      let body = result.text || ch.content;
      if (body !== ch.content) {
        patchChapterById(cid, { content: body, wordCount: wordCount(body) });
      }
      const polishSkill = skills.find((row) => row.id === "polish");
      const chunkStart = Math.min(Math.max(startLen, 0), body.length);
      const chunk = body.slice(chunkStart);
      if (polishSkill && Array.from(chunk.replace(/\s+/g, "")).length >= 40 && !stoppedRef.current) {
        const controller = new AbortController();
        abortRef.current = controller;
        let acc = "";
        await generate(
          {
            projectId: current.id,
            skillId: polishSkill.id,
            chapterId: cid,
            extra: CLEAN_COPY_EXTRA,
            selection: chunk,
            include: ctx,
            mode: "replace",
          },
          {
            signal: controller.signal,
            onToken: (text) => {
              if (!controller.signal.aborted) acc += text;
            },
            onDone: () => undefined,
            onSaved: (info) => syncSavedRev(info.rev),
            onError: (message) => setStatus(message),
          }
        );
        if (!controller.signal.aborted && acc.trim()) {
          const nextBody = body.slice(0, chunkStart) + acc.trim();
          patchChapterById(cid, { content: nextBody, wordCount: wordCount(nextBody) });
          body = nextBody;
          setDirty(true);
        }
      }
      const scanned = await api.scan(current.id, { chapterId: cid, text: body, lexicon: current.lexicon });
      setIssues(scanned.issues || []);
      setNouns(scanned.nouns || []);
      setAigc(scanned.aigc || null);
      setStatus("已自动去AI味");
      return !stoppedRef.current;
    } catch (err) {
      setStatus((err as Error).message);
      return false;
    }
  }

  function enforceChapterWordMax() {
    const current = novelRef.current;
    const cid = chapter?.id || chapterId;
    const ch = current?.chapters.find((row) => row.id === cid);
    const max = Number(current?.craft?.wordsMax) || 3800;
    if (!current || !ch) return;
    const clipped = clipToWordMax(ch.content || "", max);
    if (clipped === (ch.content || "")) return;
    patchChapterById(cid, { content: clipped, wordCount: wordCount(clipped) });
    setStatus(`已按上限收在 ${wordCount(clipped)} 字`);
  }

  async function runSkill(
    skill: Skill,
    opts?: {
      focusName?: string;
      extraOverride?: string;
      selectionOverride?: string;
      autoApply?: boolean;
      sideKind?: "edit" | "focus" | "threads" | "emotion" | "advice" | "";
      include?: typeof ctx;
      skipCleanup?: boolean;
      chapterIdOverride?: string;
    }
  ) {
    if (!novel || !chapter) return;
    const blocking = getJob();
    if (blocking.running && !(blocking.kind === "studio" && blocking.targetId === novel.id)) {
      setStatus("后台还有任务在跑，结束后再写");
      return;
    }
    const liveChapterId = opts?.chapterIdOverride || chapter.id;
    if (!opts?.autoApply && !opts?.skipCleanup) abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setBusy(true);
    setStatus(`正在执行「${skill.name}」`);
    const slotNow = pipeSkillSlot(skill.id);
    const liveJob = getJob();
    if (!(liveJob.running && liveJob.kind === "studio" && liveJob.targetId === novel.id)) {
      beginJob({
        kind: "studio",
        targetId: novel.id,
        href: `/studio/${novel.id}`,
        title: novel.title,
        step: skill.name,
        tabId: slotNow || "",
        stepIndex: Math.max(1, PIPELINE.findIndex((item) => item.id === (slotNow || "brief")) + 1),
        stepTotal: PIPELINE.length,
      });
    } else {
      patchJob({
        step: skill.name,
        tabId: slotNow || liveJob.tabId,
        stepIndex: Math.max(1, PIPELINE.findIndex((item) => item.id === (slotNow || liveJob.tabId)) + 1),
      });
    }
    setJobStop(() => {
      autoPipeRef.current = false;
      setAutoPipe(false);
      stoppedRef.current = true;
      abortRef.current?.abort();
    });
    setSideText("");
    const startedAt = Date.now();
    const applyRange = { ...selRef.current };
    const slot = pipeSkillSlot(skill.id) as FillSlot | "content" | "";
    if (slot && !opts?.autoApply && !opts?.skipCleanup) {
      setRunningSlot(slot);
      setStreamChars(0);
    }
    const undoTarget = opts?.autoApply ? "content" : skill.target;
    pushUndo(undoTarget, liveChapterId);
    if (dirty) {
      try {
        await save();
      } catch (err) {
        setBusy(false);
        setRunningSlot("");
        setStatus(`保存失败，已中止：${(err as Error).message}`);
        if (abortRef.current === controller) finishJob("保存失败，已中止");
        return;
      }
    }
    const tabMap: Record<string, TabId> = {
      brief: "brief",
      world: "world",
      characters: "characters",
      outline: "outline",
      props: "props",
      beats: "beats",
      content: "content",
    };
    if (tabMap[skill.target]) setTab(tabMap[skill.target]);
    if (!opts?.autoApply && !opts?.focusName && !opts?.skipCleanup) {
      if (skill.target === "characters") openDesk("cast");
      else if (skill.target === "brief" || skill.target === "world" || skill.target === "outline" || skill.target === "props" || skill.target === "beats") {
        openDesk("lore", tabMap[skill.target]);
      }
    }
    const selection = (() => {
      const el = paperRef.current;
      if (!el || el.selectionStart === el.selectionEnd) return "";
      return el.value.slice(el.selectionStart, el.selectionEnd);
    })();
    const cursorPrefix = paperRef.current
      ? paperRef.current.value.slice(0, paperRef.current.selectionStart)
      : chapter.content;
    const target = skill.target;
    const replaceEmpty = ["brief", "world", "characters", "outline", "props", "beats", "content"].includes(target);
    let first = true;
    let acc = "";
    const modeFor = () => {
      return stageOf(skill).mode === "append" ? ("append" as const) : ("replace" as const);
    };
    const startLen = modeFor() === "append" ? (chapter.content || "").length : 0;
    if (opts?.autoApply) setSideKind("");
    else if (opts?.sideKind) setSideKind(opts.sideKind);
    else if (target === "polish") setSideKind("edit");
    else if (target === "threads") setSideKind("threads");
    else if (target === "review" || skill.id === "suggest") setSideKind(skill.id === "suggest" ? "advice" : "focus");
    else setSideKind(opts?.focusName ? "focus" : "");
    if (!opts?.autoApply && (target === "review" || target === "polish" || target === "threads" || opts?.sideKind || opts?.focusName)) {
      setReportOpen(true);
    }

    let chain = false;
    let autoCleaned = false;
    try {
      await generate(
        {
          projectId: novel.id,
          skillId: skill.id,
          chapterId: liveChapterId,
          extra: [extra, opts?.extraOverride].filter(Boolean).join("\n"),
          selection: opts?.selectionOverride ?? selection,
          cursorPrefix: skill.id === "continue" ? cursorPrefix : "",
          include: opts?.include || ctx,
          focusName: opts?.focusName,
          mode: modeFor(),
        },
        {
          signal: controller.signal,
          onSaved: (info) => syncSavedRev(info.rev),
          onToken: (text) => {
            if (controller.signal.aborted) return;
            acc += text;
            if (!opts?.autoApply) {
              const chars = wordCount(acc);
              setStreamChars(chars);
              patchJob({ chars });
            }
            if (opts?.autoApply) return;
            if (target === "review" || target === "polish" || target === "threads") {
              setSideText((prev) => prev + text);
              return;
            }
            if (opts?.focusName) {
              setSideText((prev) => prev + text);
              return;
            }
            const isFirst = first;
            first = false;
            const mode = isFirst && replaceEmpty && modeFor() === "replace" ? "replace" : "append";
            const chunk =
              isFirst && mode === "append" && target === "content" && chapter.content ? `\n${text}` : text;
            applyToken(target, chunk, mode, liveChapterId);
          },
          onDone: (info) => {
            if (controller.signal.aborted) return;
            setStatus(
              info.incomplete
                ? `生成中断，已保留 ${info.chars} 字，可继续续写`
                : info.stopped
                  ? "已停止，记得保存"
                  : `完成 ${info.chars} 字`,
            );
            setNovel((prev) => {
              if (!prev) return prev;
              let next = prev;
              if (opts?.focusName && acc && ["characters", "world", "props"].includes(target)) {
                const field = target as AssetField;
                next = { ...prev, [field]: upsertSection(prev[field] || "", opts.focusName!, acc) };
              }
              if (target === "threads" && acc) {
                next = { ...next, threads: mergeThreads(next.threads, parseThreads(acc)) };
              }
              if (target === "review" && acc) {
                const isAdvice = skill.id === "suggest" || stageOf(skill).field === "advice";
                next = {
                  ...next,
                  chapters: next.chapters.map((c) =>
                    c.id !== liveChapterId
                      ? c
                      : isAdvice
                        ? { ...c, advice: acc }
                        : {
                            ...c,
                            reviewReport: acc,
                            reviewVerdict: parseReviewVerdict(acc),
                            reviewAt: new Date().toISOString(),
                          }
                  ),
                };
              }
              if (opts?.autoApply && acc) {
                const range = applyRange;
                next = {
                  ...next,
                  chapters: next.chapters.map((c) => {
                    if (c.id !== liveChapterId) return c;
                    const text = c.content || "";
                    const body = text.slice(0, range.start) + acc + text.slice(range.end);
                    return { ...c, content: body, wordCount: wordCount(body) };
                  }),
                };
              }
              const item: HistoryItem = {
                id: `hs_${Date.now().toString(36)}`,
                skillId: skill.id,
                skillName: skill.name,
                target,
                focusName: opts?.focusName || "",
                output: acc,
                createdAt: new Date().toISOString(),
              };
              const withHist = { ...next, history: [item, ...(next.history || [])].slice(0, 30) };
              novelRef.current = withHist;
              return withHist;
            });
            if (acc.trim()) setDirty(true);
            if (opts?.autoApply) {
              setSideText("");
              setSelText("");
            }
            if (
              (target === "content" || opts?.autoApply) &&
              (opts?.skipCleanup || novelRef.current?.craft?.cleanCopy === false)
            ) {
              window.setTimeout(() => {
                const latest = novelRef.current;
                const ch = latest?.chapters.find((row) => row.id === liveChapterId);
                if (ch?.content) scanNow(ch.content).catch(() => undefined);
              }, 80);
            }
          },
          onError: (message) => setStatus(message),
        }
      );
      if (
        !controller.signal.aborted &&
        skill.id === "chapter-prose" &&
        modeFor() === "replace" &&
        !opts?.autoApply
      ) {
        enforceChapterWordMax();
      }
      if (
        !controller.signal.aborted &&
        target === "content" &&
        !opts?.skipCleanup &&
        novelRef.current?.craft?.cleanCopy !== false
      ) {
        autoCleaned = await cleanCopyPass(startLen);
        abortRef.current = controller;
      }
      if (!stoppedRef.current && (skill.id === "chapter-beats" || target === "beats") && !opts?.autoApply) {
        absorbBeats(true);
      }
      if (
        autoPipeRef.current &&
        !stoppedRef.current &&
        PIPE_SKILL_IDS.has(skill.id) &&
        !opts?.skipCleanup &&
        !opts?.autoApply
      ) {
        autoPipeDoneRef.current.add(skill.id);
        chain = true;
      }
    } catch (err) {
      const aborted = (err as Error).name === "AbortError";
      const wasAuto = autoPipeRef.current;
      if (!skipRef.current && !opts?.skipCleanup && !opts?.autoApply) {
        autoPipeRef.current = false;
        pausedRef.current = false;
        setAutoPipe(false);
        setPaused(false);
      }
      if (aborted) {
        if (abortRef.current === controller && !skipRef.current) setStatus("已停止");
      } else {
        if (["brief", "world", "characters", "outline", "props", "beats", "content"].includes(undoTarget)) undoLast();
        setStatus((err as Error).message);
        const slot = pipeSkillSlot(skill.id) as FillSlot | "content" | "";
        if (slot && PIPE_SKILL_IDS.has(skill.id) && !opts?.skipCleanup && !opts?.autoApply) {
          setFailed({ slot, label: PIPELINE.find((item) => item.id === slot)?.label || slot, auto: wasAuto });
        }
      }
    } finally {
      skipRef.current = false;
      if (abortRef.current === controller && !chain) {
        setBusy(false);
        setRunningSlot("");
        setWorkName("");
        setWorkId("");
        if (!autoPipeRef.current) finishJob();
      }
    }
    if (
      !controller.signal.aborted &&
      !opts?.skipCleanup &&
      !opts?.autoApply &&
      skill.id === "chapter-prose"
    ) {
      const latest = novelRef.current?.chapters.find((row) => row.id === liveChapterId);
      const words = latest ? wordCount(latest.content || "") : 0;
      setStatus(`本章写完 ${words} 字${autoCleaned ? "，已自动去AI味" : ""} · 用时 ${formatElapsed(Date.now() - startedAt)}`);
    }
    if (chain) window.setTimeout(() => continueAutoPipeRef.current(), 280);
  }

  function addChapter() {
    if (!novel) return;
    const nextId = `ch_${Date.now().toString(36)}`;
    const nextIndex = novel.chapters.reduce((max, ch) => Math.max(max, Number(ch.index) || 0), 0) + 1;
    patchNovel({
      ...novel,
      chapters: [
        ...novel.chapters,
        {
          id: nextId,
          index: nextIndex,
          title: "",
          beats: "",
          content: "",
          wordCount: 0,
          updatedAt: new Date().toISOString(),
        },
      ],
    });
    setChapterId(nextId);
    setDesk("write");
    setTab("content");
    setReading(false);
    setMobile("paper");
  }

  function removeChapter(cid: string) {
    if (!novel) return;
    if (novel.chapters.length <= 1) {
      setStatus("至少保留一章");
      return;
    }
    const target = novel.chapters.find((c) => c.id === cid);
    if (target && (String(target.content || "").trim() || String(target.beats || "").trim())) {
      if (!window.confirm(`删除「${chapterHeading(target)}」？正文和细纲都会消失。`)) return;
    }
    const chapters = novel.chapters.filter((c) => c.id !== cid).map((c, i) => ({ ...c, index: i + 1 }));
    patchNovel({ ...novel, chapters });
    if (chapterId === cid) setChapterId(chapters[0].id);
  }

  function absorbBeats(quiet?: boolean) {
    const current = novelRef.current;
    if (!current) return null;
    const next = expandChaptersFromBeats(current);
    if (!next) {
      if (!quiet) {
        const hasHead = current.chapters.some((c) => parseBeatChapters(c.beats).length);
        setStatus(hasHead ? "目录已按细纲补齐" : "细纲里没有识别到「第N章」标题");
      }
      return current;
    }
    patchNovel(next);
    if (!quiet) setStatus(`目录已补齐 ${next.chapters.length} 章`);
    return next;
  }

  function turnChapter(dir: 1 | -1) {
    const current = novelRef.current;
    if (!current) return;
    let list = current.chapters;
    if (dir > 0) {
      const expanded = expandChaptersFromBeats(current);
      if (expanded) {
        patchNovel(expanded);
        list = expanded.chapters;
      }
    }
    const pos = list.findIndex((c) => c.id === (chapter?.id || chapterId));
    const target = list[pos + dir];
    if (!target) return;
    setChapterId(target.id);
    setTab("content");
    setReading(true);
    setDesk("write");
  }

  function fillSlot(slot: FillSlot) {
    if (!novel || !chapter) return;
    const skillId =
      slot === "brief"
        ? "kickoff"
        : slot === "world"
          ? "world"
          : slot === "outline"
            ? "outline"
            : slot === "characters"
              ? "characters"
              : slot === "props"
                ? "props"
                : "chapter-beats";
    const label =
      slot === "brief"
        ? "立项"
        : slot === "world"
          ? "场景"
          : slot === "outline"
            ? "大纲"
            : slot === "characters"
              ? "人物"
              : slot === "props"
                ? "道具"
                : "细纲";
    const skill = currentSkill(skillId);
    if (!skill) {
      setStatus(`「${label}」写法未加载`);
      return false;
    }
    const startWork = async () => {
      let hostId = chapter.id;
      const existing = slot === "beats" ? chapter.beats : String(novel[slot] || "");
      const poisoned = looksLikeChapterProse(existing);
      let extraFill = "";
      if (slot === "beats") {
        const live = novelRef.current || novel;
        const maxIdx = maxBeatIndex(live);
        if (maxIdx > 0) {
          const start = maxIdx + 1;
          const end = start + 7;
          extraFill = `全书已有第1章到第${maxIdx}章细纲。只新写 8 章，标题从「### 第${start}章 章名」连续编到「### 第${end}章 章名」。禁止重写第1章到第${maxIdx}章，禁止从第1章重新编号。每章用条目写目标、冲突、出场、场面、转折、钩子。只输出细纲，禁止写成带对话的小说正文。`;
          const prepared = ensureChapterAt(live, start);
          hostId = prepared.chapterId;
          if (prepared.novel !== live) {
            novelRef.current = prepared.novel;
            patchNovel(prepared.novel);
          }
          if (hostId !== chapterId) setChapterId(hostId);
          setStatus(`续写细纲：第${start}章到第${end}章`);
          try {
            await save();
          } catch (err) {
            setStatus((err as Error).message);
            return;
          }
        } else {
          extraFill = String(existing || "").trim() && !poisoned
            ? `已有细纲草稿，保留原意和专名，只补空缺场面。每一章标题必须写成「### 第N章 章名」，从已有编号接着编。只输出细纲条目，禁止写成小说正文。`
            : `根据立项、人物、场景、大纲生成分章细纲。默认 8 章。每一章标题必须独占一行，严格写成「### 第N章 章名」，从第1章连续编号。章名不要书名号。每章用条目写目标、冲突、出场、场面、转折、钩子。只输出细纲，禁止写成带对话的小说正文。`;
        }
      } else if (slot === "props") {
        const live = novelRef.current || novel;
        const hasProse = novelHasProse(live);
        const hasBeats = (live.chapters || []).some((c) => String(c.beats || "").trim());
        extraFill = hasProse
          ? String(existing || "").trim() && !poisoned
            ? `已有道具卡。对照已写正文：保留原名，补上正文里新出场、能推动情节的物件，更新谁拿着、用途、代价。只输出道具卡片，禁止抄正文。`
            : `从已写正文抽取 3 到 5 件关键道具。优先已经出场、被争夺、被隐藏或付过代价的物件。物件名与正文逐字一致。每卡必须含谁拿着、用途、代价。只输出道具卡片，禁止抄正文。`
          : hasBeats
            ? `正文还空着。从细纲场面表里已经点名、被拿着、被藏着或付过代价的物件抽出 3 到 5 张卡。物件名与细纲逐字一致。每卡必须含谁拿着、用途、代价。只输出道具卡片。`
            : `正文还空着。按立项雪花三灾列出 3 到 5 件开书就必须出场的物件。每卡必须含谁拿着、用途、代价。只输出道具卡片。`;
      } else {
        extraFill = String(existing || "").trim() && !poisoned
          ? `已有「${label}」草稿，保留原意和专名，只补空缺的动机、关系、规则、场面和物件。只输出这一栏设定。禁止写小说正文，禁止写对话场面，禁止用「第N章」开写故事。`
          : `根据已有立项、人物、场景、道具、细纲生成完整的「${label}」。人名地名沿用已有专名。正文只作参考，禁止把正文抄进这一栏，禁止写对话场面，禁止用「第N章」当故事开头。`;
      }
      if (slot === "characters") openDesk("cast");
      else openDesk("lore", slot === "beats" ? "beats" : slot);
      runSkill(skill, {
        extraOverride: [extraFill, autoPipeRef.current ? AUTO_PIPE_EXTRA : ""].filter(Boolean).join("\n"),
        include: { brief: true, world: true, characters: true, outline: true, prev: true, beats: true, props: true },
        chapterIdOverride: slot === "beats" ? hostId : undefined,
      });
    };
    startWork();
    return true;
  }

  function runNextPipe() {
    if (!nextPipe) return false;
    if (nextPipe.id === "content") {
      const skill = currentSkill("chapter-prose");
      if (!skill) {
        setStatus("「写本章」写法未加载");
        return false;
      }
      openDesk("write", "content");
      runSkill(
        skill,
        autoPipeRef.current
          ? {
              extraOverride: `${AUTO_PIPE_EXTRA}\n只用当前章节对应的那一节细纲，写完整一章。后续章的细纲不要写进本章。主场写够来回，过场压缩，钩子停在动作临界点。六层带入：前300字异常+处境+方向，金手指兑现一次可见效果，配角一个生活痕迹。篇幅按核心设定字数区间，写到上限必须停笔。`,
            }
          : undefined
      );
      return true;
    }
    return fillSlot(nextPipe.id);
  }

  function continueAutoPipe() {
    if (!autoPipeRef.current) {
      setBusy(false);
      return;
    }
    if (pausedRef.current) {
      setBusy(false);
      setRunningSlot("");
      finishJob();
      setStatus("自动开书已暂停，点「继续」接着往下写");
      return;
    }
    const current = novelRef.current;
    const cid = chapter?.id || chapterId;
    const ch = current?.chapters.find((row) => row.id === cid) || current?.chapters[0];
    if (!current || !ch) {
      autoPipeRef.current = false;
      setAutoPipe(false);
      setBusy(false);
      return;
    }
    let snapshot = current;
    let live = ch;
    if (String(ch.beats || "").trim() && parseBeatChapters(ch.beats).length) {
      snapshot = absorbBeats() || current;
      live = snapshot.chapters.find((row) => row.id === ch.id) || snapshot.chapters[0] || ch;
    }
    const next = findNextPipe(snapshot, live, autoPipeDoneRef.current);
    if (!next) {
      autoPipeRef.current = false;
      setAutoPipe(false);
      setBusy(false);
      setRunningSlot("");
      setWorkName("");
      setWorkId("");
      finishJob();
      if (pipeStartRef.current) setPipeClock(Date.now() - pipeStartRef.current);
      const kept = undoStackRef.current.slice(-1);
      undoStackRef.current = kept;
      setUndoStack(kept);
      setStatus(
        lastElapsedRef.current
          ? `本章写完 · 用时 ${formatElapsed(lastElapsedRef.current)}`
          : "本章写完，可以改或开下一章"
      );
      return;
    }
    setStatus(`自动开书：${next.action}`);
    const started = next.id === "content" ? (() => {
      const skill = currentSkill("chapter-prose");
      if (!skill) {
        setStatus("「写本章」写法未加载");
        return false;
      }
      openDesk("write", "content");
      runSkill(skill, {
        extraOverride: `${AUTO_PIPE_EXTRA}\n只用当前章节对应的那一节细纲，写完整一章。后续章的细纲不要写进本章。主场写够来回，过场压缩，钩子停在动作临界点。六层带入：前300字异常+处境+方向，金手指兑现一次可见效果，配角一个生活痕迹。篇幅按核心设定字数区间，写到上限必须停笔。`,
      });
      return true;
    })() : fillSlot(next.id);
    if (!started) {
      autoPipeRef.current = false;
      setAutoPipe(false);
      setBusy(false);
    }
  }

  function startAutoPipe() {
    if (!chapter) return;
    autoPipeRef.current = true;
    pausedRef.current = false;
    setPaused(false);
    setFailed(null);
    autoPipeDoneRef.current = new Set();
    setAutoPipe(true);
    stoppedRef.current = false;
    pipeStartRef.current = Date.now();
    setPipeClock(0);
    setStreamChars(0);
    setStatus(chapter.index > 1 ? "自动开书：写到本章正文" : "自动开书：写到第一章为止");
    continueAutoPipe();
  }

  function pauseAutoPipe() {
    if (!autoPipeRef.current) return;
    pausedRef.current = true;
    setPaused(true);
    setStatus("本步写完后暂停，点「继续」接着写");
  }

  function resumeAutoPipe() {
    if (!autoPipeRef.current) {
      startAutoPipe();
      return;
    }
    pausedRef.current = false;
    setPaused(false);
    setFailed(null);
    stoppedRef.current = false;
    setStatus("自动开书继续");
    continueAutoPipe();
  }

  function skipStep() {
    const slot = runningSlot;
    if (!slot) return;
    autoPipeDoneRef.current.add(pipeSkillId(slot));
    skipRef.current = true;
    stoppedRef.current = false;
    setStatus(`已跳过「${PIPELINE.find((item) => item.id === slot)?.label || slot}」，继续下一步`);
    abortRef.current?.abort();
    setBusy(false);
    setRunningSlot("");
    window.setTimeout(() => continueAutoPipeRef.current(), 260);
  }

  function rerunStep(slot: FillSlot | "content", keepAuto = false) {
    if (busy) return;
    setFailed(null);
    pausedRef.current = false;
    setPaused(false);
    if (keepAuto) {
      autoPipeRef.current = true;
      setAutoPipe(true);
      stoppedRef.current = false;
    } else {
      autoPipeRef.current = false;
      setAutoPipe(false);
    }
    if (slot === "content") {
      const skill = currentSkill("chapter-prose");
      if (!skill) {
        setStatus("「写本章」写法未加载");
        return;
      }
      openDesk("write", "content");
      runSkill(skill, {
        extraOverride: `${AUTO_PIPE_EXTRA}\n只用当前章节对应的那一节细纲，写完整一章。后续章的细纲不要写进本章。主场写够来回，过场压缩，钩子停在动作临界点。篇幅按核心设定字数区间，写到上限必须停笔。`,
      });
      return;
    }
    fillSlot(slot);
  }

  function retryFailed() {
    if (!failed) return;
    const { slot, auto } = failed;
    rerunStep(slot, auto);
  }

  function stageSkipKey(stage: StageCardModel["stage"]) {
    const novelId = id || "";
    return stage.scope === "chapter" && chapterId ? STORAGE_KEYS.skipChapter(novelId, chapterId) : STORAGE_KEYS.skipNovel(novelId);
  }

  function clearStageSkip(stage: StageCardModel["stage"]) {
    setSkippedStages((prev) => prev.filter((item) => item !== stage.id));
    const key = stageSkipKey(stage);
    const cur = readJson<unknown>(key, []);
    const list = Array.isArray(cur) ? (cur as string[]) : [];
    if (list.includes(stage.id)) writeJson(key, list.filter((item) => item !== stage.id));
  }

  continueAutoPipeRef.current = continueAutoPipe;

  function runSel(kind: "polish" | "expand" | "shrink" | "proof" | "deai" | "feel" | "perform" | "imitate" | "continue" | "review") {
    if (!novel || !chapter) return;
    const polish = currentSkill("polish");
    const cont = currentSkill("continue");
    const review = currentSkill("review");
    const fromRef =
      selRef.current.end > selRef.current.start
        ? chapter.content.slice(selRef.current.start, selRef.current.end)
        : "";
    const text = selText || fromRef;
    if (!text && ["polish", "expand", "shrink", "proof", "deai", "feel", "perform", "imitate"].includes(kind)) return;
    if (kind === "polish" && polish) {
      runSkill(polish, { selectionOverride: text, extraOverride: "润色选中段落，只输出润色后的正文。", autoApply: true });
    }
    if (kind === "expand" && polish) {
      runSkill(polish, { selectionOverride: text, extraOverride: "扩写选中段落，加感官和潜台词，情节事实保持，只输出扩写后的正文。", autoApply: true });
    }
    if (kind === "shrink" && polish) {
      runSkill(polish, { selectionOverride: text, extraOverride: "压缩选中段落，删解释和重复，情节事实保持，只输出压缩后的正文。", autoApply: true });
    }
    if (kind === "proof" && polish) {
      runSkill(polish, {
        selectionOverride: text,
        extraOverride: "只改正错别字、同音别字、人名前后不一和标点。句式、节奏、情节一律不动。只输出改正后的正文。",
        autoApply: true,
      });
    }
    if (kind === "deai" && polish) {
      runSkill(polish, {
        selectionOverride: text,
        extraOverride: CLEAN_COPY_EXTRA,
        autoApply: true,
      });
    }
    if (kind === "perform" && polish) {
      runSkill(polish, {
        selectionOverride: text,
        extraOverride: PERFORM_EXTRA,
        autoApply: true,
      });
    }
    if (kind === "imitate" && polish) {
      runSkill(polish, {
        selectionOverride: text,
        extraOverride: IMITATE_EXTRA,
        autoApply: true,
      });
    }
    if (kind === "feel" && polish) {
      const style = novel.craft?.emotionStyle || "综合";
      const felt = inferEmotion(text);
      const feelMood = chapter.mood || felt?.mood || "";
      const feelHint = felt
        ? `这段落在「${felt.mood}」，按这个温度落地。`
        : feelMood
          ? `若这段发空，可往「${feelMood}」靠一点。`
          : "贴着这段已有的情绪温度。";
      runSkill(polish, {
        selectionOverride: text,
        extraOverride: `对选中段落做情感落地改写。保持原意和情节，不增新情节。把概括性情绪换成具体动作、感官、环境或对话停顿。对话里用半截话、气口、改口带情绪，第一次问专名写成「什么……某某？」。${feelHint}表达偏${style}。不要写「他感到」「心情复杂」，不要写强度数字。字数与原文相差不超过 20%。\n输出三个版本，严格使用下面标题：\n版本A：动作化\n正文\n版本B：环境化\n正文\n版本C：对话化\n正文\n不要解释。`,
        sideKind: "emotion",
      });
    }
    if (kind === "continue" && cont) runSkill(cont);
    if (kind === "review" && review) runSkill(review);
  }
  busyRef.current = busy;
  continueAutoPipeRef.current = continueAutoPipe;

  return {
    busy,
    setBusy,
    autoPipe,
    setAutoPipe,
    paused,
    setPaused,
    failed,
    setFailed,
    runningSlot,
    setRunningSlot,
    skippedStages,
    setSkippedStages,
    selectedStageId,
    setSelectedStageId,
    streamChars,
    setStreamChars,
    pipeClock,
    setPipeClock,
    workName,
    setWorkName,
    workId,
    setWorkId,
    abortRef,
    autoPipeRef,
    pausedRef,
    skipRef,
    stoppedRef,
    autoOnceRef,
    autoPipeDoneRef,
    continueAutoPipeRef,
    lastElapsedRef,
    pipeStartRef,
    busyRef,
    openDesk,
    skillsForDesk,
    undoLast,
    stopWriting,
    cleanCopyPass,
    enforceChapterWordMax,
    runSkill,
    addChapter,
    removeChapter,
    absorbBeats,
    turnChapter,
    fillSlot,
    runNextPipe,
    continueAutoPipe,
    startAutoPipe,
    pauseAutoPipe,
    resumeAutoPipe,
    skipStep,
    rerunStep,
    retryFailed,
    stageSkipKey,
    clearStageSkip,
    runSel,
  };
}
