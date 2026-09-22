import { PIPELINE, pipeSkillId } from "../../domain/pipeline";
import { defaultCraft } from "../../domain/craft";
import type { Novel } from "../../domain/types";

export function formatElapsed(ms: number) {
  const s = Math.max(1, Math.round(ms / 1000));
  if (s < 60) return `${s} 秒`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r ? `${m} 分 ${r} 秒` : `${m} 分钟`;
}

import type { TabId } from "./studio-tabs";

export { TABS, RAIL_EXTRAS, type TabId } from "./studio-tabs";

export type AssetField = "characters" | "world" | "props";
export type DeskId = "write" | "board" | "cast" | "threads" | "lore";

export type UndoSnap = { target: string; chapterId: string; value: string };

export const AUTO_PIPE_EXTRA =
  "你在自动开书流水线中。只交本步要求的那一栏成品，不要向作者提问，不要预写下一步。专名、时间线、知情范围与已有资料逐字一致。";

export function pipeSlotFilled(novel: Novel, chapter: { beats?: string; content?: string }, id: FillSlot | "content") {
  const raw = id === "beats" ? chapter.beats : id === "content" ? chapter.content : String(novel[id] || "");
  const text = String(raw || "").trim();
  if (/\[object Object\]/.test(text)) return false;
  if (id === "beats") return parseBeatChapters(text).length > 0 || (text.length >= 80 && !looksLikeChapterProse(text));
  return id === "content" ? text.length > 0 : text.length >= 20 && !looksLikeChapterProse(text);
}

export function findNextPipe(novel: Novel, chapter: { beats?: string; content?: string }, done?: Set<string>) {
  return (
    PIPELINE.find((item) => {
      if (done?.has(pipeSkillId(item.id))) return false;
      return !pipeSlotFilled(novel, chapter, item.id);
    }) || null
  );
}

export function wordCount(text: string) {
  return Array.from(String(text || "").replace(/\s+/g, "")).length;
}

export function novelHasProse(novel: Novel) {
  if ((novel.chapters || []).some((c) => String(c.content || "").trim())) return true;
  return (novel.history || []).some((row) => {
    const id = String(row.skillId || "");
    if (id !== "chapter-prose" && id !== "continue") return false;
    return Array.from(String(row.output || "").replace(/\s+/g, "")).length >= 80;
  });
}

export function chapterHeading(chapter: { index: number; title?: string }) {
  const name = stripChapterPrefix(chapter.title);
  return name ? `第${chapter.index}章 ${name}` : `第${chapter.index}章`;
}

export function stripChapterPrefix(title?: string) {
  let text = String(title || "").trim();
  const only = /^第\s*[零一二三四五六七八九十百千两０-９\d]+\s*章$/;
  const lead = /^第\s*[零一二三四五六七八九十百千两０-９\d]+\s*章(?:\s*[·•、.:：\-—]\s*|\s+)/;
  for (let i = 0; i < 4 && text; i += 1) {
    if (only.test(text)) return "";
    const next = text.replace(lead, "").trim();
    if (next === text) break;
    text = next;
  }
  return text;
}

export function cnToInt(raw: string): number {
  const s = String(raw || "")
    .replace(/\s+/g, "")
    .replace(/[０-９]/g, (ch) => String(ch.charCodeAt(0) - 0xff10));
  if (!s) return 0;
  if (/^\d+$/.test(s)) return Number(s);
  const d: Record<string, number> = {
    零: 0,
    〇: 0,
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
  };
  if (s === "十") return 10;
  if (s.startsWith("十")) return 10 + (d[s.slice(1)] || 0);
  const hundred = s.match(/^([一二三四五六七八九两])?百([零〇一二三四五六七八九两十]*)$/);
  if (hundred) {
    const h = d[hundred[1] || "一"] || 1;
    return h * 100 + (hundred[2] ? cnToInt(hundred[2]) : 0);
  }
  const ten = s.match(/^([一二三四五六七八九两])十([一二三四五六七八九])?$/);
  if (ten) return (d[ten[1]] || 0) * 10 + (d[ten[2]] || 0);
  if (s.length === 1 && d[s] != null) return d[s];
  return 0;
}

export function parseEmotionVersions(text: string) {
  const found: { id: string; label: string; body: string }[] = [];
  const re = /版本([ABC])[：:]([^\n]*)\n([\s\S]*?)(?=版本[ABC][：:]|$)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    found.push({
      id: match[1],
      label: match[2].trim() || `版本${match[1]}`,
      body: match[3].trim(),
    });
  }
  return found;
}

export function upsertSection(md: string, title: string, output: string) {
  const text = String(md || "").trim();
  const block = String(output || "").trim();
  if (!title) return block || text;
  const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`^#{2,3}\\s*${escaped}[^\\n]*\\n[\\s\\S]*?(?=^#{2,3}\\s|$)`, "m");
  if (text && re.test(text)) {
    return text.replace(re, block.endsWith("\n") ? block : `${block}\n\n`).trim();
  }
  return [text, block].filter(Boolean).join("\n\n");
}

export function cardsToMd(cards: { title: string; role: string; body: string }[]) {
  return cards.map((c) => `### ${c.title}${c.role ? `（${c.role}）` : ""}\n${c.body}`.trim()).join("\n\n");
}

export function normalizeNovel(n: Novel): Novel {
  return {
    ...n,
    world: /\[object Object\]/.test(String(n.world || "")) ? "" : n.world,
    characters: /\[object Object\]/.test(String(n.characters || "")) ? "" : n.characters,
    props: n.props || "",
    media: n.media || {},
    history: n.history || [],
    logs: n.logs || [],
    style: n.style || "",
    theme: n.theme || "",
    pov: n.pov || "第三人称有限",
    threads: Array.isArray(n.threads) ? n.threads : [],
    craft: { ...defaultCraft(), ...(n.craft || {}) },
    lexicon: {
      keep: Array.isArray(n.lexicon?.keep) ? n.lexicon.keep : [],
      map: Array.isArray(n.lexicon?.map) ? n.lexicon.map : [],
    },
    chapters: [...(n.chapters || [])].sort((a, b) => (Number(a.index) || 0) - (Number(b.index) || 0)),
  };
}

export function parseBeatChapters(md: string) {
  const blocks = String(md || "")
    .split(/(?=^#{2,3}\s*第)/m)
    .map((block) => block.trim())
    .filter(Boolean);
  const found: { index: number; title: string; beats: string }[] = [];
  blocks.forEach((block, i) => {
    const head = block.match(
      /^#{2,3}\s*第\s*([零一二三四五六七八九十百千两０-９\d]+)\s*章\s*[·•、.:：\-—]*\s*([^\n]*)/
    );
    if (!head) return;
    found.push({
      index: cnToInt(head[1]) || i + 1,
      title: stripChapterPrefix((head[2] || "").replace(/[《》「」"]/g, "").trim()),
      beats: block,
    });
  });
  return found;
}

export function catalogBeats(novel: Novel) {
  const map = new Map<number, { index: number; title: string; beats: string }>();
  for (const row of novel.chapters) {
    const parsed = parseBeatChapters(row.beats);
    if (parsed.length) {
      for (const item of parsed) {
        if (!item.index) continue;
        const prev = map.get(item.index);
        if (!prev) {
          map.set(item.index, item);
          continue;
        }
        if (row.index === item.index && parsed.length === 1) map.set(item.index, item);
      }
      continue;
    }
    if (String(row.beats || "").trim() && row.index > 0 && !map.has(row.index)) {
      map.set(row.index, { index: row.index, title: row.title || "", beats: row.beats });
    }
  }
  return [...map.values()].sort((a, b) => a.index - b.index);
}

export function maxBeatIndex(novel: Novel) {
  return catalogBeats(novel).reduce((max, item) => Math.max(max, item.index), 0);
}

export function retitleBeat(beats: string, index: number, title: string) {
  const name = String(title || "").trim();
  const head = `### 第${index}章${name ? ` ${name}` : ""}`;
  const text = String(beats || "");
  if (/^#{2,3}\s*第/.test(text)) {
    return text.replace(/^#{2,3}\s*第\s*[零一二三四五六七八九十百千两０-９\d]+\s*章[^\n]*/, head);
  }
  return `${head}\n${text}`.trim();
}

export function shiftMisnumberedBundles(novel: Novel) {
  const owned = novel.chapters.reduce((max, ch) => {
    const parsed = parseBeatChapters(ch.beats);
    if (parsed.length === 1 && parsed[0].index > 0) return Math.max(max, parsed[0].index);
    if (!parsed.length && String(ch.beats || "").trim() && ch.index > 0) return Math.max(max, ch.index);
    return max;
  }, 0);
  if (owned <= 0) return novel;
  let changed = false;
  const chapters = novel.chapters.map((ch) => {
    const parsed = parseBeatChapters(ch.beats);
    if (parsed.length < 2) return ch;
    const maxIn = Math.max(...parsed.map((item) => item.index));
    if (maxIn > owned) return ch;
    const minIn = Math.min(...parsed.map((item) => item.index));
    const offset = owned + 1 - minIn;
    changed = true;
    const first = parsed[0];
    return {
      ...ch,
      index: first.index + offset,
      title: ch.title || first.title,
      beats: parsed.map((item) => retitleBeat(item.beats, item.index + offset, item.title)).join("\n\n"),
    };
  });
  return changed ? { ...novel, chapters } : novel;
}

export function ensureChapterAt(novel: Novel, index: number) {
  const exist = novel.chapters.find((c) => c.index === index);
  if (exist) return { novel, chapterId: exist.id };
  const row = {
    id: `ch_${Date.now().toString(36)}_${index}`,
    index,
    title: "",
    beats: "",
    content: "",
    wordCount: 0,
    updatedAt: new Date().toISOString(),
  };
  const chapters = [...novel.chapters, row].sort((a, b) => (Number(a.index) || 0) - (Number(b.index) || 0));
  return { novel: { ...novel, chapters }, chapterId: row.id };
}

export function expandChaptersFromBeats(novel: Novel): Novel | null {
  if (!novel.chapters.length) return null;
  const source = shiftMisnumberedBundles(novel);
  const parsed = catalogBeats(source);
  if (parsed.length < 2) return null;
  const hasBundle = source.chapters.some((c) => parseBeatChapters(c.beats).length > 1);
  const needsSync = parsed.some((item) => {
    const row = source.chapters.find((c) => c.index === item.index);
    if (!row) return true;
    if (!row.title && item.title) return true;
    const beats = String(row.beats || "").trim();
    return !beats && String(item.beats || "").trim();
  });
  if (!needsSync && !hasBundle && parsed.length <= source.chapters.length) return null;
  const used = new Set<string>();
  const chapters = parsed.map((item) => {
    const exist = source.chapters.find((c) => !used.has(c.id) && c.index === item.index);
    if (exist) {
      used.add(exist.id);
      const bundle = parseBeatChapters(exist.beats).length > 1;
      const empty = !String(exist.beats || "").trim();
      return {
        ...exist,
        title: exist.title || item.title,
        beats: empty || bundle ? item.beats : exist.beats,
        index: item.index,
      };
    }
    return {
      id: `ch_${Date.now().toString(36)}_${item.index}`,
      index: item.index,
      title: item.title,
      beats: item.beats,
      content: "",
      wordCount: 0,
      updatedAt: new Date().toISOString(),
    };
  });
  source.chapters.forEach((c) => {
    if (used.has(c.id)) return;
    const bundle = parseBeatChapters(c.beats);
    if (bundle.length > 1) {
      const own = bundle.find((item) => item.index === c.index);
      if (own) {
        used.add(c.id);
        chapters.push({ ...c, title: c.title || own.title, beats: own.beats });
        return;
      }
      if (String(c.content || "").trim()) {
        used.add(c.id);
        chapters.push({ ...c, beats: "" });
      }
      return;
    }
    if (String(c.content || "").trim() || String(c.beats || "").trim()) chapters.push(c);
  });
  chapters.sort((a, b) => (Number(a.index) || 0) - (Number(b.index) || 0));
  return { ...novel, chapters };
}

export function parseCards(md: string) {
  const parts = String(md || "")
    .split(/(?=^#{2,3}\s)/m)
    .map((s) => s.trim())
    .filter(Boolean);
  if (!parts.length && md.trim()) {
    return [{ title: "未分节", role: "", body: md.trim() }];
  }
  return parts.map((block) => {
    const line = block.split("\n")[0] || "";
    const m = line.match(/^#{2,3}\s*([^\n（(]+)[（(]?([^)）\n]*)/);
    return {
      title: (m?.[1] || "未命名").trim(),
      role: (m?.[2] || "").replace(/[）)]/g, "").trim(),
      body: block.replace(/^[^\n]*\n/, "").trim(),
    };
  });
}

export function parsePropBody(body: string) {
  const promptSplit = String(body || "").split(/提示词[:：]/);
  let desc = (promptSplit[0] || "").replace(/^描述[:：]\s*/m, "").trim();
  const prompt = (promptSplit[1] || "").trim();
  const take = (label: string) => {
    const re = new RegExp(`${label}[:：]\\s*([^\\n]*)`);
    const m = desc.match(re);
    if (!m) return "";
    desc = desc.replace(re, "").trim();
    return m[1].trim();
  };
  const holder = take("谁拿着");
  const use = take("用途");
  const cost = take("代价");
  desc = desc.replace(/\n{3,}/g, "\n\n").trim();
  return { desc, prompt, holder, use, cost };
}

export function joinPropBody(meta: { desc: string; prompt: string; holder: string; use: string; cost: string }) {
  const lines = [`描述：\n${meta.desc}`.trim()];
  if (meta.holder) lines.push(`谁拿着：${meta.holder}`);
  if (meta.use) lines.push(`用途：${meta.use}`);
  if (meta.cost) lines.push(`代价：${meta.cost}`);
  lines.push(`提示词：\n${meta.prompt}`.trim());
  return lines.join("\n");
}

export type FillSlot = "brief" | "world" | "outline" | "characters" | "props" | "beats";

export function namesFromNovel(novel: Novel) {
  return Array.from(
    new Set(
      [
        ...parseCards(novel.characters || "").map((c) => c.title),
        ...parseCards(novel.world || "").map((c) => c.title),
        ...parseCards(novel.props || "").map((c) => c.title),
        ...(novel.threads || []).map((t) => t.name),
        ...(novel.lexicon?.keep || []),
      ]
        .map((n) => String(n || "").trim())
        .filter((n) => n.length >= 2)
    )
  );
}

export function matchNamePrefix(text: string, caret: number, names: string[]) {
  const before = text.slice(0, caret);
  const hit = before.match(/[\u4e00-\u9fffA-Za-z]{1,8}$/);
  if (!hit) return null;
  const prefix = hit[0];
  const items = names.filter((n) => n !== prefix && n.startsWith(prefix)).slice(0, 6);
  if (!items.length) return null;
  return { start: caret - prefix.length, end: caret, items };
}

export function looksLikeChapterProse(text: string) {
  const t = String(text || "").trim();
  if (!t) return false;
  if (/下面是完整的第/.test(t)) return true;
  if (/^#{2,3}\s*第/.test(t) && /^[-*]\s/m.test(t)) return false;
  if ((t.match(/^#{2,3}\s*第/gm) || []).length >= 2) return false;
  if (/^(?:#{1,3}\s*)?第[零一二三四五六七八九十百\d]+章/.test(t) && /[“「]/.test(t)) return true;
  const dialogue = (t.match(/[“「]/g) || []).length;
  const headings = (t.match(/^#{2,3}\s/gm) || []).length;
  return t.length > 800 && dialogue >= 8 && headings < 4;
}

export function fieldSnapshot(novel: Novel, chapterId: string, target: string) {
  const chapter = novel.chapters.find((c) => c.id === chapterId);
  if (target === "beats") return chapter?.beats || "";
  if (target === "content") return chapter?.content || "";
  if (target === "brief" || target === "world" || target === "characters" || target === "outline" || target === "props") {
    return novel[target] || "";
  }
  return "";
}

export function toParagraphs(raw: string, title = "") {
  let text = String(raw || "").replace(/\r\n/g, "\n").trim();
  text = text.replace(/^#{1,3}\s+[^\n]+\n+/, "");
  text = text.replace(/^第[零一二三四五六七八九十百\d]+章[^\n]*\n+/, "");
  if (title) {
    const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    text = text.replace(new RegExp(`^${escaped}\\s*\\n+`), "");
  }
  return text
    .split(/\n+/)
    .map((line) => line.replace(/^#{1,3}\s+/, "").trim())
    .filter((line) => line && !/^第[零一二三四五六七八九十百\d]+章/.test(line));
}

export const SWATCH = ["#7a8b9a", "#c9b8a6", "#8a3a3a", "#d8d4cc"];

export type StudioUi = {
  desk?: DeskId;
  tab?: TabId;
  reading?: boolean;
  split?: boolean;
  extra?: string;
};

export function shortcutK() {
  if (typeof navigator === "undefined") return "Ctrl+K";
  return /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? "⌘K" : "Ctrl+K";
}
