import { useMemo, useRef, useState } from "react";
import { api, ConflictError } from "../../data/api";
import { defaultCraft, newThread } from "../../domain/craft";
import type { CraftFlags, Novel, Skill, ThreadItem } from "../../domain/types";
import { fieldSnapshot, parseBeatChapters, wordCount, type UndoSnap } from "./studio-utils";

export default function useStudioDocument(id: string | undefined) {
  const [novel, setNovel] = useState<Novel | null>(null);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [chapterId, setChapterId] = useState("");
  const [undoStack, setUndoStack] = useState<UndoSnap[]>([]);
  const [status, setStatus] = useState("");
  const [loadError, setLoadError] = useState("");
  const [dirty, setDirty] = useState(false);

  const novelRef = useRef<Novel | null>(null);
  const dirtyRef = useRef(false);
  const conflictRef = useRef(false);
  const idRef = useRef(id);
  const saveRef = useRef<() => Promise<void>>(async () => undefined);
  const undoStackRef = useRef<UndoSnap[]>([]);

  novelRef.current = novel;
  dirtyRef.current = dirty;
  idRef.current = id;
  undoStackRef.current = undoStack;

  const chapter = useMemo(
    () => novel?.chapters.find((c) => c.id === chapterId) || novel?.chapters[0],
    [novel, chapterId]
  );

  function patchNovel(next: Novel) {
    novelRef.current = next;
    setNovel(next);
    setDirty(true);
  }

  function patchCraft(partial: Partial<CraftFlags>) {
    if (!novel) return;
    patchNovel({ ...novel, craft: { ...defaultCraft(), ...novel.craft, ...partial } });
  }

  function patchLexicon(partial: Partial<NonNullable<Novel["lexicon"]>>) {
    if (!novel) return;
    const current = novel.lexicon || { keep: [], map: [] };
    patchNovel({ ...novel, lexicon: { keep: current.keep, map: current.map, ...partial } });
  }

  function patchChapterById(cid: string, partial: Partial<NonNullable<typeof chapter>>) {    if (!novel) return;
    patchNovel({
      ...novel,
      chapters: novel.chapters.map((row) => (row.id === cid ? { ...row, ...partial } : row)),
    });
  }

  function updateChapter(partial: Partial<NonNullable<typeof chapter>>) {
    if (!novel || !chapter) return;
    patchNovel({
      ...novel,
      chapters: novel.chapters.map((c) => (c.id === chapter.id ? { ...c, ...partial } : c)),
    });
  }

  function patchThread(tid: string, partial: Partial<ThreadItem>) {
    if (!novel) return;
    patchNovel({
      ...novel,
      threads: (novel.threads || []).map((row) => (row.id === tid ? { ...row, ...partial } : row)),
    });
  }

  function addThreadRow() {
    if (!novel) return;
    patchNovel({ ...novel, threads: [...(novel.threads || []), newThread()] });
  }

  function removeThreadRow(tid: string) {
    if (!novel) return;
    patchNovel({ ...novel, threads: (novel.threads || []).filter((row) => row.id !== tid) });
  }

  function moveChapter(fromId: string, toId: string) {
    if (!novel || fromId === toId) return;
    const list = [...novel.chapters];
    const from = list.findIndex((c) => c.id === fromId);
    const to = list.findIndex((c) => c.id === toId);
    if (from < 0 || to < 0) return;
    const [item] = list.splice(from, 1);
    list.splice(to, 0, item);
    patchNovel({ ...novel, chapters: list.map((c, i) => ({ ...c, index: i + 1 })) });
  }

  function applyToken(target: string, text: string, mode: "replace" | "append", targetChapterId?: string) {
    setNovel((prev) => {
      if (!prev) return prev;
      if (target === "brief" || target === "world" || target === "characters" || target === "outline" || target === "props") {
        const current = prev[target] || "";
        const next = { ...prev, [target]: mode === "replace" ? text : current + text };
        novelRef.current = next;
        return next;
      }
      if (target === "beats" || target === "content") {
        const cid = targetChapterId || chapter?.id || chapterId;
        const has = prev.chapters.some((c) => c.id === cid);
        const chapters = has
          ? prev.chapters
          : [
              ...prev.chapters,
              {
                id: cid,
                index: prev.chapters.length + 1,
                title: "",
                beats: "",
                content: "",
                wordCount: 0,
                updatedAt: new Date().toISOString(),
              },
            ];
        const next = {
          ...prev,
          chapters: chapters.map((c) => {
            if (c.id !== cid) return c;
            if (target === "beats") {
              const current = c.beats || "";
              if (mode === "replace") {
                const keep = parseBeatChapters(current);
                const incoming = parseBeatChapters(text);
                const keepOwn = keep.length === 1 && keep[0].index === c.index && String(current).trim();
                const otherBatch = incoming.length > 0 && incoming.every((item) => item.index !== c.index);
                if (keepOwn && otherBatch) return c;
              }
              return { ...c, beats: mode === "replace" ? text : current + text };
            }
            const current = c.content || "";
            const body = mode === "replace" ? text : current + text;
            return { ...c, content: body, wordCount: wordCount(body), updatedAt: new Date().toISOString() };
          }),
        };
        novelRef.current = next;
        return next;
      }
      return prev;
    });
    setDirty(true);
  }

  function pushUndo(target: string, targetChapterId?: string) {
    const current = novelRef.current;
    const cid = targetChapterId || chapter?.id || chapterId;
    if (!current || !cid) return;
    if (!["brief", "world", "characters", "outline", "props", "beats", "content"].includes(target)) return;
    const next = [...undoStackRef.current, { target, chapterId: cid, value: fieldSnapshot(current, cid, target) }].slice(-5);
    undoStackRef.current = next;
    setUndoStack(next);
  }

  async function save() {
    const current = novelRef.current;
    if (!current || current.id !== idRef.current) return;
    if (conflictRef.current) return;
    const { logs: _logs, history: _history, ...rest } = current;
    try {
      const saved = await api.saveProject(current.id, { ...rest, rev: current.rev });
      setNovel((prev) => {
        if (!prev || prev.id !== saved.id) return prev;
        const next = { ...prev, rev: saved.rev, updatedAt: saved.updatedAt };
        novelRef.current = next;
        return next;
      });
      setDirty(false);
      setStatus("已保存");
    } catch (err) {
      if (err instanceof ConflictError) {
        conflictRef.current = true;
        setStatus(err.message);
        return;
      }
      throw err;
    }
  }
  saveRef.current = save;

  function syncSavedRev(rev: number) {
    if (!rev) return;
    setNovel((prev) => {
      if (!prev) return prev;
      const next = { ...prev, rev };
      novelRef.current = next;
      return next;
    });
  }

  return {
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
    addThreadRow,
    removeThreadRow,
    moveChapter,
    applyToken,
    pushUndo,
  };
}
