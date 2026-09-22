import { useEffect, useState, type MutableRefObject } from "react";
import { api } from "../../data/api";
import type { AigcReport, Chapter, Novel, ScanIssue, Voice } from "../../domain/types";
import { aigcLevelText } from "../../components/ui/AigcCard";

type ScanDeps = {
  novelId?: string;
  novelRef: MutableRefObject<Novel | null>;
  chapterId: string;
  chapter?: Chapter;
  setStatus: (text: string) => void;
  updateChapter: (partial: Partial<Chapter>) => void;
  pushUndo: (target: string, chapterId?: string) => void;
  ui: {
    setDesk: (desk: "write" | "board" | "cast" | "threads" | "lore") => void;
    setTab: (tab: "brief" | "characters" | "world" | "props" | "outline" | "beats" | "content") => void;
    setMobile: (view: "toc" | "rail" | "paper" | "skill") => void;
    setReading: (reading: boolean) => void;
    setSelText: (text: string) => void;
    selText: string;
  };
  selRef: MutableRefObject<{ start: number; end: number }>;
  pendingSel: MutableRefObject<{ start: number; end: number } | null>;
  paperRef: MutableRefObject<HTMLTextAreaElement | null>;
};

export default function useStudioScan(deps: ScanDeps) {
  const { novelId, novelRef, chapterId, chapter, setStatus, updateChapter, pushUndo, ui, selRef, pendingSel, paperRef } = deps;
  const [sideText, setSideText] = useState("");
  const [sideKind, setSideKind] = useState<"" | "edit" | "focus" | "threads" | "emotion" | "scan" | "advice">("");
  const [reportOpen, setReportOpen] = useState(false);
  const [logsOpen, setLogsOpen] = useState(false);
  const [issues, setIssues] = useState<ScanIssue[]>([]);
  const [aigc, setAigc] = useState<AigcReport | null>(null);
  const [voiceInfo, setVoiceInfo] = useState<Voice | null>(null);
  const [nouns, setNouns] = useState<string[]>([]);
  const [ignored, setIgnored] = useState<string[]>([]);

  useEffect(() => {
    setIgnored([]);
    setIssues([]);
    setAigc(null);
    const n = novelRef.current;
    const ch = n?.chapters.find((row) => row.id === chapterId);
    if (ch?.reviewReport) {
      setSideText(ch.reviewReport);
      setSideKind("focus");
    } else if (ch?.advice) {
      setSideText(ch.advice);
      setSideKind("advice");
    } else {
      setSideText("");
      setSideKind((kind) => (kind === "focus" || kind === "advice" ? "" : kind));
    }
    if (!n || !ch?.content) return;
    api
      .scan(n.id, { chapterId: ch.id, text: ch.content, lexicon: n.lexicon })
      .then((result) => {
        setIssues(result.issues || []);
        setNouns(result.nouns || []);
        setAigc(result.aigc || null);
      })
      .catch(() => undefined);
  }, [chapterId, novelId, novelRef]);

  async function scanNow(text?: string) {
    if (!novelId || !chapter) return [];
    try {
      const result = await api.scan(novelId, {
        chapterId: chapter.id,
        text: text ?? chapter.content,
        lexicon: novelRef.current?.lexicon,
      });
      setIssues(result.issues || []);
      setNouns(result.nouns || []);
      const hits = result.issues || [];
      setAigc(result.aigc || null);
      const rate = result.aigc ? `，AI率 ${result.aigc.rate}（${aigcLevelText(result.aigc.level)}）` : "";
      setStatus(hits.length ? `校对标出 ${hits.length} 处${rate}` : `校对完成${rate || "：未见错字、专名写错或概括情绪"}`);
      return hits;
    } catch (err) {
      setStatus((err as Error).message);
      return [];
    }
  }

  function jumpIssue(issue: ScanIssue) {
    ui.setDesk("write");
    ui.setTab("content");
    ui.setMobile("paper");
    ui.setReading(false);
    selRef.current = { start: issue.start, end: issue.end };
    ui.setSelText((chapter?.content || "").slice(issue.start, issue.end));
    pendingSel.current = { start: issue.start, end: issue.end };
    const el = paperRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(issue.start, issue.end);
  }

  function applyIssue(issue: ScanIssue) {
    if (!chapter || (issue.kind !== "typo" && issue.kind !== "name" && issue.kind !== "ai")) return;
    const next = chapter.content.slice(0, issue.start) + issue.suggest + chapter.content.slice(issue.end);
    updateChapter({ content: next });
    scanNow(next).catch((err) => setStatus((err as Error).message));
  }

  function locateOriginal(original: string) {
    if (!chapter || !original) return;
    const start = chapter.content.indexOf(original);
    if (start < 0) {
      setStatus("在正文里没找到这处文字，可能已经被改过");
      return;
    }
    ui.setDesk("write");
    ui.setTab("content");
    ui.setMobile("paper");
    ui.setReading(false);
    selRef.current = { start, end: start + original.length };
    ui.setSelText(original);
    pendingSel.current = { start, end: start + original.length };
    const el = paperRef.current;
    if (el) {
      el.focus();
      el.setSelectionRange(start, start + original.length);
    }
  }

  function replaceOriginal(original: string, replacement: string) {
    if (!chapter || !original) return;
    const start = chapter.content.indexOf(original);
    if (start < 0) {
      setStatus("在正文里没找到这处文字，可能已经被改过");
      return;
    }
    pushUndo("content", chapter.id);
    const next = chapter.content.slice(0, start) + replacement + chapter.content.slice(start + original.length);
    updateChapter({ content: next });
    scanNow(next).catch((err) => setStatus((err as Error).message));
    setStatus(replacement ? "已替换审稿指出的这处" : "已删除审稿指出的这句");
  }

  function applyPolish() {
    if (!chapter || !sideText) return;
    const { start, end } = selRef.current;
    if (end > start) {
      updateChapter({
        content: chapter.content.slice(0, start) + sideText + chapter.content.slice(end),
      });
    } else {
      updateChapter({ content: chapter.content + (chapter.content ? "\n" : "") + sideText });
    }
    setStatus("已写入正文");
  }

  function applyEmotion(body: string) {
    if (!chapter || !body) return;
    const { start, end } = selRef.current;
    const next =
      end > start
        ? chapter.content.slice(0, start) + body + chapter.content.slice(end)
        : chapter.content + (chapter.content ? "\n" : "") + body;
    updateChapter({ content: next });
    setStatus("已写入情感改写");
    scanNow(next).catch((err) => setStatus((err as Error).message));
  }

  return {
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
  };
}
