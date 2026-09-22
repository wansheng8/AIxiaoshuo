import { useEffect } from "react";
import type { MutableRefObject } from "react";
import { api } from "../../data/api";
import { getJob, stopJob } from "../../data/jobs";
import { STORAGE_KEYS, readJson, readText, writeJson, writeText } from "../../data/storage";
import { STAGES, panelOfStage } from "../../domain/pipeline";
import { chapterHeading, normalizeNovel, wordCount, type StudioUi } from "./studio-utils";
import type { useAppState } from "../../app-state";
import type { StudioAct, StudioAssets, StudioDoc, StudioJob, StudioScan, StudioUiState } from "./view-types";

type AppState = Pick<ReturnType<typeof useAppState>, "setInfo" | "setConfigured" | "setCounts" | "setFileActions" | "zen" | "setZen">;

type Args = {
  id?: string;
  doc: StudioDoc;
  ui: StudioUiState;
  scan: StudioScan;
  assets: StudioAssets;
  act: StudioAct;
  job: StudioJob;
  files: {
    exportMd: () => void;
    archiveBook: () => Promise<void>;
    duplicateBook: () => Promise<void>;
    purgeBook: () => Promise<void>;
  };
  app: AppState;
  paperRef: MutableRefObject<HTMLTextAreaElement | null>;
  readerShellRef: MutableRefObject<HTMLDivElement | null>;
  pendingSel: MutableRefObject<{ start: number; end: number } | null>;
};

export function useStudioPage({ id, doc, ui, scan, assets, act, job, files, app, paperRef, readerShellRef, pendingSel }: Args) {
  const {
    novel,
    chapter,
    chapterId,
    setNovel,
    setChapterId,
    setSkills,
    setDirty,
    setLoadError,
    setUndoStack,
    setStatus,
    save,
    saveRef,
    idRef,
    dirtyRef,
    conflictRef,
    dirty,
    undoStackRef,
  } = doc;
  const {
    setExtra,
    setSplit,
    setReading,
    setDesk,
    setTab,
    setPaletteOpen,
    setPaletteQuery,
    setSelText,
    desk,
    tab,
    reading,
    split,
    extra,
    paletteOpen,
  } = ui;
  const { setVoiceInfo, setSideText, setSideKind, setIssues, setIgnored } = scan;
  const { setHistFor } = assets;
  const {
    abortRef,
    autoPipeRef,
    autoOnceRef,
    stoppedRef,
    busyRef,
    busy,
    setAutoPipe,
    setBusy,
    setRunningSlot,
    setWorkName,
    setSkippedStages,
    setSelectedStageId,
    selectedStageId,
    undoLast,
  } = act;
  const { setInfo, setConfigured, setCounts, setFileActions, zen, setZen } = app;

  async function load() {
    if (!id) return;
    const [n, s, st] = await Promise.all([api.project(id), api.skills(), api.settings()]);
    api.voice().then((v) => {
      if (idRef.current === n.id) setVoiceInfo(v);
    }).catch(() => undefined);
    if (idRef.current !== n.id) return;
    conflictRef.current = false;
    setNovel(normalizeNovel(n));
    setSkills(s.filter((x) => x.enabled && !/^(teardown-|tdcraft_)/.test(x.id)));
    setConfigured(st.configured);
    const savedCh = readText(STORAGE_KEYS.chapter(n.id));
    const preferred =
      (n.chapters || []).find((c) => c.id === savedCh) ||
      (n.chapters || []).find((c) => c.content) ||
      n.chapters?.[0];
    setChapterId(preferred?.id || "");
    setDirty(false);
    writeText(STORAGE_KEYS.last, `/studio/${n.id}`);
    const fail = (n.logs || []).filter((l) => l.status === "error").length;
    const done = (n.logs || []).filter((l) => l.status === "success").length;
    setCounts(fail, done);
    const savedUi = readJson<StudioUi>(STORAGE_KEYS.ui(n.id), {});
    if (typeof savedUi.extra === "string") setExtra(savedUi.extra);
    else setExtra("");
    if (typeof savedUi.split === "boolean") setSplit(savedUi.split);
    if (typeof savedUi.reading === "boolean") setReading(savedUi.reading);
    if (savedUi.desk) setDesk(savedUi.desk);
    if (savedUi.tab) setTab(savedUi.tab);
    if (!savedUi.desk && (n.chapters || []).some((c) => c.content)) {
      setTab("content");
      setReading(true);
      setDesk("write");
    } else if (!savedUi.desk && n.brief) {
      setTab("brief");
      setDesk("lore");
    } else if (!savedUi.desk && n.characters) {
      setTab("characters");
      setDesk("cast");
    }
  }

  useEffect(() => {
    const live = getJob();
    const keep = live.running && live.kind === "studio" && live.targetId === id;
    if (!keep) {
      if (live.running && live.kind === "studio" && live.targetId && live.targetId !== id) stopJob();
      abortRef.current?.abort();
      abortRef.current = null;
      autoPipeRef.current = false;
      autoOnceRef.current = false;
      setAutoPipe(false);
      setBusy(false);
      setStatus("");
      setRunningSlot("");
      setWorkName("");
    }
    setNovel(null);
    setChapterId("");
    setDirty(false);
    setSideText("");
    setSideKind("");
    setHistFor(null);
    setLoadError("");
    load().catch((err) => setLoadError((err as Error).message || "加载失败"));
    setZen(false);
    setPaletteOpen(false);
    setSelText("");
    setIssues([]);
    setIgnored([]);
    setUndoStack([]);
    return () => {
      const current = getJob();
      if (current.running && current.kind === "studio" && current.targetId === id) return;
      abortRef.current?.abort();
    };
  }, [id]);

  useEffect(() => {
    if (!(job.running && job.kind === "studio" && job.targetId === id) || busy || dirty) return;
    const tick = () => {
      if (dirtyRef.current) return;
      api.project(id).then((n) => {
        if (idRef.current !== n.id) return;
        setNovel(normalizeNovel(n));
      }).catch(() => undefined);
    };
    const timer = window.setInterval(tick, 2500);
    return () => window.clearInterval(timer);
  }, [job.running, job.kind, job.targetId, id, busy, dirty]);

  useEffect(() => {
    if (id && chapterId) writeText(STORAGE_KEYS.chapter(id), chapterId);
    readerShellRef.current?.scrollTo?.({ top: 0 });
    document.querySelector(".ep .ep-item.on")?.scrollIntoView?.({ block: "nearest" });
  }, [id, chapterId]);

  useEffect(() => {
    if (!id) {
      setSkippedStages([]);
      return;
    }
    const read = (key: string): string[] => {
      const value = readJson<unknown>(key, []);
      return Array.isArray(value) ? (value as string[]) : [];
    };
    const novelSkips = read(STORAGE_KEYS.skipNovel(id));
    const chapterSkips = chapterId ? read(STORAGE_KEYS.skipChapter(id, chapterId)) : [];
    setSkippedStages([...new Set([...novelSkips, ...chapterSkips])]);
  }, [id, chapterId]);

  useEffect(() => {
    const selected = STAGES.find((stage) => stage.id === selectedStageId);
    if (selected) {
      const panel = panelOfStage(selected);
      if (panel.desk === desk && (!panel.tab || panel.tab === tab)) return;
    }
    const nextId =
      STAGES.find((stage) => stage.line === "writing" && stage.ui?.desk === desk && stage.ui?.tab === tab)?.id ||
      STAGES.find((stage) => stage.line === "writing" && stage.ui?.desk === desk)?.id ||
      (desk === "threads" ? "threads" : desk === "board" ? "outline" : "");
    if (nextId) setSelectedStageId(nextId);
  }, [desk, tab, selectedStageId]);

  useEffect(() => {
    if (!id || !novel) return;
    writeJson(STORAGE_KEYS.ui(id), { desk, tab, reading, split, extra });
  }, [id, novel?.id, desk, tab, reading, split, extra]);

  useEffect(() => {
    if (reading || !pendingSel.current) return;
    const range = pendingSel.current;
    const timer = window.setTimeout(() => {
      const el = paperRef.current;
      if (!el) return;
      pendingSel.current = null;
      el.focus();
      el.setSelectionRange(range.start, range.end);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [reading, desk, tab]);

  useEffect(() => {
    if (!novel || !chapter) return;
    setInfo({
      title: novel.title,
      subtitle: novel.logline,
      chapter: chapterHeading(chapter),
      saved: !dirty,
      genre: novel.genre,
      words: novel.chapters.reduce((sum, c) => sum + wordCount(c.content), 0),
    });
  }, [novel, chapter, dirty, setInfo]);

  useEffect(() => {
    if (!dirty || busy) return;
    const timer = window.setTimeout(() => {
      saveRef.current().catch((err) => setStatus((err as Error).message));
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [dirty, busy, novel]);

  useEffect(() => {
    function onLeave(e: BeforeUnloadEvent) {
      if (!dirty) return;
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [dirty]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
        setPaletteQuery("");
      }
      if (meta && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveRef.current().catch(() => undefined);
      }
      if (meta && (e.key === "." || e.key === "、")) {
        e.preventDefault();
        setZen((v) => {
          if (!v && busyRef.current) {
            autoPipeRef.current = false;
            setAutoPipe(false);
            stoppedRef.current = true;
            abortRef.current?.abort();
          }
          return !v;
        });
      }
      if (meta && e.key.toLowerCase() === "z" && !e.shiftKey) {
        const el = e.target as HTMLElement | null;
        const typing = Boolean(el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable));
        if (busyRef.current || (!typing && undoStackRef.current.length)) {
          e.preventDefault();
          undoLast();
        }
      }
      if (e.key === "Escape") {
        if (paletteOpen) setPaletteOpen(false);
        else if (zen) setZen(false);
        else setSelText("");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [paletteOpen, zen, setZen]);

  useEffect(() => {
    setFileActions({
      save: () => save().catch((err) => setStatus((err as Error).message)),
      exportMd: files.exportMd,
      archive: () => files.archiveBook().catch((err) => setStatus((err as Error).message)),
      duplicate: () => files.duplicateBook().catch((err) => setStatus((err as Error).message)),
      purge: () => files.purgeBook().catch((err) => setStatus((err as Error).message)),
    });
    return () => setFileActions({});
  }, [setFileActions]);

  return { load };
}
