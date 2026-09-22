import { useRef, useState, type MutableRefObject } from "react";
import { api } from "../../data/api";
import { STORAGE_KEYS, readJson, writeJson } from "../../data/storage";
import { newImitateSample } from "../../domain/craft";
import type { Chapter, CraftFlags, HistoryItem, ImitateSample, Novel } from "../../domain/types";
import { cardsToMd, parseCards, upsertSection, type AssetField } from "./studio-utils";

type AssetsDeps = {
  novel: Novel | null;
  novelRef: MutableRefObject<Novel | null>;
  chapter?: Chapter;
  patchNovel: (next: Novel) => void;
  patchCraft: (partial: Partial<CraftFlags>) => void;
  setStatus: (text: string) => void;
};

export default function useStudioAssets(deps: AssetsDeps) {
  const { novel, novelRef, chapter, patchNovel, patchCraft, setStatus } = deps;
  const [allSkills, setAllSkills] = useState(false);
  const [folds, setFolds] = useState<Record<string, boolean>>(() => readJson(STORAGE_KEYS.folds, {}));
  const [imitBusy, setImitBusy] = useState("");
  const [imitRows, setImitRows] = useState<{ key: string; label: string; want: number; got: number; diff: number }[]>([]);
  const [histFor, setHistFor] = useState<{ field: AssetField; title: string } | null>(null);
  const uploadRef = useRef<HTMLInputElement | null>(null);
  const uploadTarget = useRef<{ field: AssetField; title: string } | null>(null);

  function patchImitateSample(id: string, partial: Partial<ImitateSample>) {
    if (!novel) return;
    const lib = (novel.craft?.imitateLib || []).map((row) => (row.id === id ? { ...row, ...partial } : row));
    patchCraft({ imitateLib: lib });
  }

  function addImitateSample() {
    if (!novel) return;
    patchCraft({ imitateLib: [...(novel.craft?.imitateLib || []), newImitateSample()] });
  }

  function removeImitateSample(id: string) {
    if (!novel) return;
    patchCraft({ imitateLib: (novel.craft?.imitateLib || []).filter((row) => row.id !== id) });
  }

  async function analyzeImitateSample(id: string) {
    const row = (novel?.craft?.imitateLib || []).find((item) => item.id === id);
    if (!row) return;
    if ((row.excerpt || "").replace(/\s+/g, "").length < 200) {
      setStatus("范文摘录至少 200 字");
      return;
    }
    setImitBusy(id);
    try {
      const result = await api.imitateAnalyze(row.excerpt);
      patchImitateSample(id, { dims: result.dims, report: result.report, skeleton: result.skeleton });
      setStatus(`已拆解：${row.title || "未命名范文"}`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "拆解失败");
    } finally {
      setImitBusy("");
    }
  }

  async function mergeImitate() {
    const lib = (novel?.craft?.imitateLib || []).filter((row) => row.dims);
    if (!lib.length) {
      setStatus("先拆解至少一篇范文");
      return;
    }
    try {
      const result = await api.imitateMerge(lib);
      patchCraft({ imitateDims: result.dims, imitate: result.skeleton });
      setStatus("已生成通用骨架");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "合并失败");
    }
  }

  async function compareImitate() {
    const dims = novel?.craft?.imitateDims || {};
    if (!Object.keys(dims).length) {
      setStatus("先合并骨架");
      return;
    }
    const text = chapter?.content || "";
    if (!text) {
      setStatus("本章还没有正文");
      return;
    }
    try {
      const result = await api.imitateCompare(dims, text);
      setImitRows(result.rows);
      const bad = result.rows.filter((row) => row.diff > 20).length;
      setStatus(bad ? `对照完成：${bad} 个维度差异超 20%` : "对照完成：全部维度在 20% 内");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "对照失败");
    }
  }

  function writeCard(field: AssetField, index: number, next: { title: string; role: string; body: string }) {
    if (!novel) return;
    const cards = parseCards(novel[field] || "");
    cards[index] = next;
    const md = cardsToMd(cards);
    patchNovel({ ...novel, [field]: md });
  }

  function removeCard(field: AssetField, index: number) {
    if (!novel) return;
    const cards = parseCards(novel[field] || "").filter((_, i) => i !== index);
    const md = cardsToMd(cards);
    patchNovel({ ...novel, [field]: md });
  }

  function addCard(field: AssetField) {
    if (!novel) return;
    const title = field === "characters" ? "新人物" : field === "world" ? "新场景" : "新道具";
    const chunk =
      field === "props"
        ? `\n\n### ${title}（物件）\n描述：\n\n谁拿着：\n用途：\n代价：\n\n提示词：\n`
        : `\n\n### ${title}（待定）\n描述：\n\n提示词：\n`;
    patchNovel({ ...novel, [field]: (novel[field] || "") + chunk });
  }

  function restoreHistory(item: HistoryItem) {
    if (!novel || !histFor) return;
    patchNovel({
      ...novel,
      [histFor.field]: upsertSection(novel[histFor.field] || "", histFor.title, item.output),
    });
    setHistFor(null);
    setStatus("已恢复历史生成");
  }

  function pickUpload(field: AssetField, title: string) {
    uploadTarget.current = { field, title };
    uploadRef.current?.click();
  }

  function onUpload(file?: File) {
    if (!file || !novel || !uploadTarget.current) return;
    if (file.size > 800000) {
      setStatus("图片请小于 800KB");
      return;
    }
    const reader = new FileReader();
    const key = `${uploadTarget.current.field}:${uploadTarget.current.title}`;
    reader.onload = () => {
      const current = novelRef.current;
      if (!current) return;
      patchNovel({
        ...current,
        media: { ...(current.media || {}), [key]: String(reader.result || "") },
      });
    };
    reader.readAsDataURL(file);
  }

  function foldOpen(key: string, fallback = false) {
    return key in folds ? Boolean(folds[key]) : fallback;
  }

  function toggleFold(key: string, fallback = false) {
    setFolds((cur) => {
      const next = { ...cur, [key]: !(key in cur ? cur[key] : fallback) };
      writeJson(STORAGE_KEYS.folds, next);
      return next;
    });
  }

  return {
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
  };
}
