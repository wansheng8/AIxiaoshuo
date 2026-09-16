import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { api, ConflictError, generate } from "../api";
import { useAppState } from "../app-state";
import type { AigcReport, CraftFlags, HistoryItem, ImitateSample, Novel, ScanIssue, Skill, ThreadItem, Voice } from "../types";
import CommandPalette, { type PaletteItem } from "../CommandPalette";
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
  newImitateSample,
  EMOTION_STYLES,
  MOODS,
  POVS,
  STYLES,
  THREAD_STATUS,
  defaultCraft,
  mergeThreads,
  newThread,
  parseThreads,
  clipToWordMax,
} from "../craft";
import { inferEmotion } from "../emotion";
import ReviewReport from "../ReviewReport";
import { PromptPreview } from "../PromptPreview";
import { parseReviewVerdict } from "../review";
import Meter, { LoadingMeter, waitPercent } from "../Meter";
import { beginJob, finishJob, getJob, jobLabel, patchJob, setJobStop, stopJob, useJob } from "../jobs";

function formatElapsed(ms: number) {
  const s = Math.max(1, Math.round(ms / 1000));
  if (s < 60) return `${s} 秒`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r ? `${m} 分 ${r} 秒` : `${m} 分钟`;
}

const STEPS = [
  { id: "kickoff", label: "开书策划", tab: "brief", skillId: "kickoff" },
  { id: "world", label: "设定手册", tab: "world", skillId: "world" },
  { id: "outline", label: "全书大纲", tab: "outline", skillId: "outline" },
  { id: "assets", label: "人物资产", tab: "characters", skillId: "characters" },
  { id: "prose", label: "本章正文", tab: "content", skillId: "chapter-prose" },
] as const;

const TABS = [
  { id: "brief", label: "立项" },
  { id: "characters", label: "人物" },
  { id: "world", label: "场景" },
  { id: "props", label: "道具" },
  { id: "outline", label: "大纲" },
  { id: "beats", label: "细纲" },
  { id: "content", label: "正文" },
] as const;

type TabId = (typeof TABS)[number]["id"];
type AssetField = "characters" | "world" | "props";
type DeskId = "write" | "board" | "cast" | "threads" | "lore";

const DESKS: { id: DeskId; label: string }[] = [
  { id: "write", label: "正文" },
  { id: "board", label: "大纲板" },
  { id: "cast", label: "人物" },
  { id: "threads", label: "伏笔" },
  { id: "lore", label: "设定" },
];

const PIPELINE: {
  id: FillSlot | "content";
  label: string;
  desk: DeskId;
  tab: TabId;
  action: string;
  hint: string;
}[] = [
  { id: "brief", label: "立项", desk: "lore", tab: "brief", action: "写立项", hint: "先钉卖点、冲突和禁区" },
  { id: "characters", label: "人物", desk: "cast", tab: "characters", action: "补人物", hint: "声口定了，后文才站得住" },
  { id: "world", label: "场景", desk: "lore", tab: "world", action: "补场景", hint: "规则和地点写成可演戏的条目" },
  { id: "outline", label: "大纲", desk: "lore", tab: "outline", action: "写大纲", hint: "全书骨架：主线、卷纲、节拍" },
  { id: "beats", label: "细纲", desk: "lore", tab: "beats", action: "写细纲", hint: "本章场面、冲突和章末钩子" },
  { id: "content", label: "正文", desk: "write", tab: "content", action: "写本章", hint: "按细纲写完整一章" },
  { id: "props", label: "道具", desk: "lore", tab: "props", action: "抽道具", hint: "从已写正文或细纲抽出能推动情节的物件" },
];

type UndoSnap = { target: string; chapterId: string; value: string };

const PIPE_SKILL_IDS = new Set(["kickoff", "characters", "world", "outline", "chapter-beats", "chapter-prose", "props"]);

const AUTO_PIPE_EXTRA =
  "你在自动开书流水线中。只交本步要求的那一栏成品，不要向作者提问，不要预写下一步。专名、时间线、知情范围与已有资料逐字一致。";

function pipeSlotFilled(novel: Novel, chapter: { beats?: string; content?: string }, id: FillSlot | "content") {
  const raw = id === "beats" ? chapter.beats : id === "content" ? chapter.content : String(novel[id] || "");
  const text = String(raw || "").trim();
  if (/\[object Object\]/.test(text)) return false;
  if (id === "beats") return parseBeatChapters(text).length > 0 || (text.length >= 80 && !looksLikeChapterProse(text));
  return id === "content" ? text.length > 0 : text.length >= 20 && !looksLikeChapterProse(text);
}

function pipeSkillId(id: FillSlot | "content") {
  if (id === "brief") return "kickoff";
  if (id === "beats") return "chapter-beats";
  if (id === "content") return "chapter-prose";
  return id;
}

function pipeSkillSlot(skillId: string): FillSlot | "content" | "" {
  if (skillId === "kickoff") return "brief";
  if (skillId === "chapter-beats") return "beats";
  if (skillId === "chapter-prose") return "content";
  if (skillId === "characters" || skillId === "world" || skillId === "outline" || skillId === "props") return skillId;
  return "";
}

function findNextPipe(novel: Novel, chapter: { beats?: string; content?: string }, done?: Set<string>) {
  return (
    PIPELINE.find((item) => {
      if (done?.has(pipeSkillId(item.id))) return false;
      return !pipeSlotFilled(novel, chapter, item.id);
    }) || null
  );
}

function wordCount(text: string) {
  return Array.from(String(text || "").replace(/\s+/g, "")).length;
}

function novelHasProse(novel: Novel) {
  if ((novel.chapters || []).some((c) => String(c.content || "").trim())) return true;
  return (novel.history || []).some((row) => {
    const id = String(row.skillId || "");
    if (id !== "chapter-prose" && id !== "continue") return false;
    return Array.from(String(row.output || "").replace(/\s+/g, "")).length >= 80;
  });
}

function expectJobChars(id: string, wordsMax: number) {
  if (id === "content" || id === "chapter-prose") return wordsMax;
  if (id === "continue") return Math.min(900, Math.max(400, Math.round(wordsMax * 0.35)));
  if (id === "review") return 1100;
  if (id === "beats" || id === "chapter-beats") return 1400;
  if (id === "outline") return 900;
  if (id === "characters") return 1100;
  if (id === "world") return 800;
  if (id === "brief" || id === "kickoff") return 700;
  if (id === "threads") return 600;
  if (id === "polish") return 500;
  if (id === "suggest") return 500;
  if (id === "props") return 600;
  return 800;
}

function expectJobMs(id: string) {
  if (id === "chapter-prose" || id === "content" || id === "continue") return 50000;
  if (id === "review") return 45000;
  if (id === "chapter-beats" || id === "beats") return 40000;
  return 28000;
}

function chapterHeading(chapter: { index: number; title?: string }) {
  const name = stripChapterPrefix(chapter.title);
  return name ? `第${chapter.index}章 ${name}` : `第${chapter.index}章`;
}

function stripChapterPrefix(title?: string) {
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

function cnToInt(raw: string): number {
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

function parseEmotionVersions(text: string) {
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

function issueKindLabel(kind: ScanIssue["kind"]) {
  if (kind === "name") return "专名";
  if (kind === "emotion") return "情感";
  if (kind === "ai") return "套话";
  return "错字";
}

function IssueList({
  issues,
  onJump,
  onApply,
  onFeel,
  onIgnore,
}: {
  issues: ScanIssue[];
  onJump: (issue: ScanIssue) => void;
  onApply: (issue: ScanIssue) => void;
  onFeel: (issue: ScanIssue) => void;
  onIgnore: (id: string) => void;
}) {
  return (
    <>
      {issues.map((issue) => (
        <div key={issue.id} className={`issue-line ${issue.kind}`}>
          <button type="button" onClick={() => onJump(issue)}>
            {issueKindLabel(issue.kind)} · {issue.original} → {issue.suggest}
          </button>
          {issue.kind === "emotion" ? (
            <button type="button" className="btn-ghost" onClick={() => onFeel(issue)}>
              增强
            </button>
          ) : (
            <button type="button" className="btn-ghost" onClick={() => onApply(issue)}>
              接受
            </button>
          )}
          <button type="button" className="btn-ghost" onClick={() => onIgnore(issue.id)}>
            忽略
          </button>
        </div>
      ))}
    </>
  );
}

function aigcLevelText(level: AigcReport["level"]) {
  if (level === "high") return "偏AI";
  if (level === "mid") return "有套话";
  return "人味够";
}

function AigcCard({
  report,
  onDeai,
  issueCount = 0,
}: {
  report: AigcReport | null;
  onDeai?: () => void;
  issueCount?: number;
}) {
  if (!report || report.chars < 80) return null;
  return (
    <div className={`aigc-card ${report.level}`}>
      <div className="aigc-head">
        <b>AI率 {report.rate}</b>
        <span>{aigcLevelText(report.level)}</span>
      </div>
      <div className="aigc-track">
        <i style={{ width: `${Math.max(0, Math.min(100, report.rate))}%` }} />
      </div>
      {report.reasons.slice(0, 4).map((row) => (
        <p className="aigc-reason" key={row.id}>
          {row.label} · {row.note}
        </p>
      ))}
      <p className="aigc-scope">
        只测 AI 套话与句式，不代表没有错字、专名或标点问题
        {issueCount > 0 ? `；另有 ${issueCount} 条校对待看` : ""}
      </p>
      {report.level !== "low" && onDeai ? (
        <button type="button" className="btn" onClick={onDeai}>
          去AI味
        </button>
      ) : null}
    </div>
  );
}

function upsertSection(md: string, title: string, output: string) {
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

function cardsToMd(cards: { title: string; role: string; body: string }[]) {
  return cards.map((c) => `### ${c.title}${c.role ? `（${c.role}）` : ""}\n${c.body}`.trim()).join("\n\n");
}

function normalizeNovel(n: Novel): Novel {
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

function parseBeatChapters(md: string) {
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

function catalogBeats(novel: Novel) {
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

function maxBeatIndex(novel: Novel) {
  return catalogBeats(novel).reduce((max, item) => Math.max(max, item.index), 0);
}

function retitleBeat(beats: string, index: number, title: string) {
  const name = String(title || "").trim();
  const head = `### 第${index}章${name ? ` ${name}` : ""}`;
  const text = String(beats || "");
  if (/^#{2,3}\s*第/.test(text)) {
    return text.replace(/^#{2,3}\s*第\s*[零一二三四五六七八九十百千两０-９\d]+\s*章[^\n]*/, head);
  }
  return `${head}\n${text}`.trim();
}

function shiftMisnumberedBundles(novel: Novel) {
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

function ensureChapterAt(novel: Novel, index: number) {
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

function expandChaptersFromBeats(novel: Novel): Novel | null {
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

function parseCards(md: string) {
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

function parsePropBody(body: string) {
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

function joinPropBody(meta: { desc: string; prompt: string; holder: string; use: string; cost: string }) {
  const lines = [`描述：\n${meta.desc}`.trim()];
  if (meta.holder) lines.push(`谁拿着：${meta.holder}`);
  if (meta.use) lines.push(`用途：${meta.use}`);
  if (meta.cost) lines.push(`代价：${meta.cost}`);
  lines.push(`提示词：\n${meta.prompt}`.trim());
  return lines.join("\n");
}

type FillSlot = "brief" | "world" | "outline" | "characters" | "props" | "beats";

function namesFromNovel(novel: Novel) {
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

function matchNamePrefix(text: string, caret: number, names: string[]) {
  const before = text.slice(0, caret);
  const hit = before.match(/[\u4e00-\u9fffA-Za-z]{1,8}$/);
  if (!hit) return null;
  const prefix = hit[0];
  const items = names.filter((n) => n !== prefix && n.startsWith(prefix)).slice(0, 6);
  if (!items.length) return null;
  return { start: caret - prefix.length, end: caret, items };
}

function looksLikeChapterProse(text: string) {
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

function fieldSnapshot(novel: Novel, chapterId: string, target: string) {
  const chapter = novel.chapters.find((c) => c.id === chapterId);
  if (target === "beats") return chapter?.beats || "";
  if (target === "content") return chapter?.content || "";
  if (target === "brief" || target === "world" || target === "characters" || target === "outline" || target === "props") {
    return novel[target] || "";
  }
  return "";
}

function toParagraphs(raw: string, title = "") {
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

const SWATCH = ["#7a8b9a", "#c9b8a6", "#8a3a3a", "#d8d4cc"];

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

type StudioUi = {
  desk?: DeskId;
  tab?: TabId;
  reading?: boolean;
  split?: boolean;
  extra?: string;
};

function shortcutK() {
  if (typeof navigator === "undefined") return "Ctrl+K";
  return /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? "⌘K" : "Ctrl+K";
}

function InsFold({
  title,
  open,
  onToggle,
  hint,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className={`ins-block ${open ? "" : "is-fold"}`}>
      <button type="button" className="ins-fold-h" onClick={onToggle}>
        <h4>{title}</h4>
        <span>{open ? "收起" : hint || "展开"}</span>
      </button>
      {open ? children : null}
    </div>
  );
}

export default function Studio() {
  const { id } = useParams();
  const nav = useNavigate();
  const loc = useLocation();
  const { setInfo, setConfigured, setCounts, setFileActions, zen, setZen } = useAppState();
  const [novel, setNovel] = useState<Novel | null>(null);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [chapterId, setChapterId] = useState("");
  const [tab, setTab] = useState<TabId>("brief");
  const [step, setStep] = useState(0);
  const [reading, setReading] = useState(true);
  const [readerSize, setReaderSize] = useState(() => {
    const n = Number(localStorage.getItem("moshu.readerSize"));
    return n >= 15 && n <= 24 ? n : 18;
  });
  const [nightRead, setNightRead] = useState(() => localStorage.getItem("moshu.nightRead") === "1");
  const [mobile, setMobile] = useState<"toc" | "paper" | "skill">("paper");
  const [extra, setExtra] = useState("");
  const [allSkills, setAllSkills] = useState(false);
  const [folds, setFolds] = useState<Record<string, boolean>>(() => readJson("moshu.folds", {}));
  const [nameHint, setNameHint] = useState<{
    field: "beats" | "brief" | "outline";
    start: number;
    end: number;
    items: string[];
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const job = useJob();
  const [autoPipe, setAutoPipe] = useState(false);
  const [paused, setPaused] = useState(false);
  const [failed, setFailed] = useState<{ slot: FillSlot | "content"; label: string; auto: boolean } | null>(null);
  const [runningSlot, setRunningSlot] = useState<FillSlot | "content" | "">("");
  const [streamChars, setStreamChars] = useState(0);
  const [pipeClock, setPipeClock] = useState(0);
  const [workName, setWorkName] = useState("");
  const [workId, setWorkId] = useState("");
  const [undoStack, setUndoStack] = useState<UndoSnap[]>([]);
  const [status, setStatus] = useState("");
  const [loadError, setLoadError] = useState("");
  const [sideText, setSideText] = useState("");
  const [sideKind, setSideKind] = useState<"edit" | "focus" | "threads" | "emotion" | "scan" | "">("");
  const [reportOpen, setReportOpen] = useState(false);
  const [logsOpen, setLogsOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [imitBusy, setImitBusy] = useState("");
  const [imitRows, setImitRows] = useState<{ key: string; label: string; want: number; got: number; diff: number }[]>([]);
  const [ctx, setCtx] = useState({
    brief: true,
    world: true,
    characters: true,
    outline: true,
    prev: true,
    beats: true,
    props: true,
  });
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewSkillId, setPreviewSkillId] = useState("chapter-prose");
  const [histFor, setHistFor] = useState<{ field: AssetField; title: string } | null>(null);
  const [desk, setDesk] = useState<DeskId>("write");
  const [split, setSplit] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState("");
  const [selText, setSelText] = useState("");
  const [dragId, setDragId] = useState("");
  const [issues, setIssues] = useState<ScanIssue[]>([]);
  const [aigc, setAigc] = useState<AigcReport | null>(null);
  const [voiceInfo, setVoiceInfo] = useState<Voice | null>(null);
  const [nouns, setNouns] = useState<string[]>([]);
  const [ignored, setIgnored] = useState<string[]>([]);
  const [keepDraft, setKeepDraft] = useState("");
  const [mapFrom, setMapFrom] = useState("");
  const [mapTo, setMapTo] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const saveRef = useRef<() => Promise<void>>(async () => undefined);
  const autoPipeRef = useRef(false);
  const pausedRef = useRef(false);
  const skipRef = useRef(false);
  const stoppedRef = useRef(false);
  const autoOnceRef = useRef(false);
  const autoPipeDoneRef = useRef<Set<string>>(new Set());
  const continueAutoPipeRef = useRef<() => void>(() => undefined);
  const undoStackRef = useRef<UndoSnap[]>([]);
  const lastElapsedRef = useRef(0);
  const pipeStartRef = useRef(0);
  const paperRef = useRef<HTMLTextAreaElement | null>(null);
  const readerShellRef = useRef<HTMLDivElement | null>(null);
  const selRef = useRef({ start: 0, end: 0 });
  const pendingSel = useRef<{ start: number; end: number } | null>(null);
  const novelRef = useRef<Novel | null>(null);
  const busyRef = useRef(false);
  const dirtyRef = useRef(false);
  const conflictRef = useRef(false);
  const idRef = useRef(id);
  const uploadRef = useRef<HTMLInputElement | null>(null);
  const uploadTarget = useRef<{ field: AssetField; title: string } | null>(null);
  novelRef.current = novel;
  busyRef.current = busy;
  dirtyRef.current = dirty;
  idRef.current = id;
  undoStackRef.current = undoStack;

  const chapter = useMemo(
    () => novel?.chapters.find((c) => c.id === chapterId) || novel?.chapters[0],
    [novel, chapterId]
  );

  const voiceChip = !voiceInfo?.body?.trim()
    ? { tone: "off", text: "未设底味" }
    : !voiceInfo.enabled
      ? { tone: "off", text: "底味已停用" }
      : voiceInfo.stale
        ? { tone: "warn", text: "底味待重做" }
        : { tone: "ok", text: "底味已生效" };

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
    const savedCh = localStorage.getItem(`moshu.ch.${n.id}`);
    const preferred =
      (n.chapters || []).find((c) => c.id === savedCh) ||
      (n.chapters || []).find((c) => c.content) ||
      n.chapters?.[0];
    setChapterId(preferred?.id || "");
    setDirty(false);
    localStorage.setItem("moshu.last", `/studio/${n.id}`);
    const fail = (n.logs || []).filter((l) => l.status === "error").length;
    const done = (n.logs || []).filter((l) => l.status === "success").length;
    setCounts(fail, done);
    const ui = readJson<StudioUi>(`moshu.ui.${n.id}`, {});
    if (typeof ui.extra === "string") setExtra(ui.extra);
    else setExtra("");
    if (typeof ui.split === "boolean") setSplit(ui.split);
    if (typeof ui.reading === "boolean") setReading(ui.reading);
    if (ui.desk) setDesk(ui.desk);
    if (ui.tab) setTab(ui.tab);
    if (ui.desk === "write") setStep(4);
    if (!ui.desk && (n.chapters || []).some((c) => c.content)) {
      setTab("content");
      setStep(4);
      setReading(true);
      setDesk("write");
    } else if (!ui.desk && n.brief) {
      setTab("brief");
      setStep(0);
      setDesk("lore");
    } else if (!ui.desk && n.characters) {
      setTab("characters");
      setStep(3);
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
      const job = getJob();
      if (job.running && job.kind === "studio" && job.targetId === id) return;
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
    setIgnored([]);
    setIssues([]);
    setAigc(null);
    const n = novelRef.current;
    const ch = n?.chapters.find((row) => row.id === chapterId);
    if (ch?.reviewReport) {
      setSideText(ch.reviewReport);
      setSideKind("focus");
    } else {
      setSideText("");
      setSideKind((kind) => (kind === "focus" ? "" : kind));
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
  }, [chapterId, novel?.id]);

  useEffect(() => {
    if (id && chapterId) localStorage.setItem(`moshu.ch.${id}`, chapterId);
    readerShellRef.current?.scrollTo({ top: 0 });
    document.querySelector(".ep .ep-item.on")?.scrollIntoView({ block: "nearest" });
  }, [id, chapterId]);

  useEffect(() => {
    localStorage.setItem("moshu.readerSize", String(readerSize));
  }, [readerSize]);

  useEffect(() => {
    localStorage.setItem("moshu.nightRead", nightRead ? "1" : "0");
  }, [nightRead]);

  useEffect(() => {
    if (!id || !novel) return;
    localStorage.setItem(`moshu.ui.${id}`, JSON.stringify({ desk, tab, reading, split, extra }));
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
    if (!novel || !skills.length) return;
    if (new URLSearchParams(loc.search).get("auto") !== "1") return;
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
  }, [novel, skills, loc.search, nav]);

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

  function exportMd() {
    const n = novelRef.current;
    if (!n) return;
    const threads = (n.threads || [])
      .map(
        (t) =>
          `- ${t.name}［${t.status === "paid" ? "已兑" : t.status === "dropped" ? "搁置" : "未收"}］埋设：${t.plant || "未填"}｜回收：${t.payoff || "未定"}`
      )
      .join("\n");
    const written = n.chapters.filter((c) => String(c.content || "").trim());
    const bodyParts = written.length
      ? written.map((c) => `## ${chapterHeading(c)}\n\n${c.content || ""}`)
      : n.chapters.map((c) => `## ${chapterHeading(c)}\n\n${c.content || ""}`);
    const parts = [
      `# ${n.title}`,
      n.logline,
      n.genre && `类型：${n.genre}`,
      n.brief && `## 立项\n\n${n.brief}`,
      n.world && `## 世界观\n\n${n.world}`,
      n.characters && `## 人物\n\n${n.characters}`,
      n.outline && `## 大纲\n\n${n.outline}`,
      n.props && `## 关键道具\n\n${n.props}`,
      threads && `## 伏笔\n\n${threads}`,
      ...bodyParts,
    ].filter(Boolean);
    const blob = new Blob([parts.join("\n\n")], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${n.title || "墨枢"}.md`;
    a.click();
    URL.revokeObjectURL(url);
    setStatus("已导出 Markdown");
  }

  async function archiveBook() {
    const n = novelRef.current;
    if (!n) return;
    if (!window.confirm(`归档「${n.title}」？本书会从案上列表移入归档。`)) return;
    await api.archiveProject(n.id);
    localStorage.removeItem("moshu.last");
    nav("/");
  }

  async function duplicateBook() {
    const n = novelRef.current;
    if (!n) return;
    const copy = await api.duplicateProject(n.id);
    nav(`/studio/${copy.id}`);
  }

  async function purgeBook() {
    const n = novelRef.current;
    if (!n) return;
    if (!window.confirm(`彻底删除「${n.title}」？正文和设定都会消失，无法找回。`)) return;
    await api.purgeProject(n.id);
    localStorage.removeItem("moshu.last");
    nav("/");
  }

  useEffect(() => {
    setFileActions({
      save: () => save().catch((err) => setStatus((err as Error).message)),
      exportMd,
      archive: () => archiveBook().catch((err) => setStatus((err as Error).message)),
      duplicate: () => duplicateBook().catch((err) => setStatus((err as Error).message)),
      purge: () => purgeBook().catch((err) => setStatus((err as Error).message)),
    });
    return () => setFileActions({});
  }, [setFileActions]);

  function patchNovel(next: Novel) {
    novelRef.current = next;
    setNovel(next);
    setDirty(true);
  }

  function patchCraft(partial: Partial<CraftFlags>) {
    if (!novel) return;
    patchNovel({ ...novel, craft: { ...defaultCraft(), ...novel.craft, ...partial } });
  }

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

  function patchLexicon(partial: Partial<NonNullable<Novel["lexicon"]>>) {    if (!novel) return;
    const current = novel.lexicon || { keep: [], map: [] };
    patchNovel({ ...novel, lexicon: { keep: current.keep, map: current.map, ...partial } });
  }

  function patchChapterById(cid: string, partial: Partial<NonNullable<typeof chapter>>) {
    if (!novel) return;
    patchNovel({
      ...novel,
      chapters: novel.chapters.map((row) => (row.id === cid ? { ...row, ...partial } : row)),
    });
  }

  async function scanNow(text?: string) {
    if (!novel || !chapter) return [];
    try {
      const result = await api.scan(novel.id, {
        chapterId: chapter.id,
        text: text ?? chapter.content,
        lexicon: novel.lexicon,
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
    setDesk("write");
    setTab("content");
    setMobile("paper");
    setReading(false);
    selRef.current = { start: issue.start, end: issue.end };
    setSelText((chapter?.content || "").slice(issue.start, issue.end));
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
    setDesk("write");
    setTab("content");
    setMobile("paper");
    setReading(false);
    selRef.current = { start, end: start + original.length };
    setSelText(original);
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

  function foldOpen(key: string, fallback = false) {
    return key in folds ? Boolean(folds[key]) : fallback;
  }

  function toggleFold(key: string, fallback = false) {
    setFolds((cur) => {
      const next = { ...cur, [key]: !(key in cur ? cur[key] : fallback) };
      localStorage.setItem("moshu.folds", JSON.stringify(next));
      return next;
    });
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

  function captureSel() {
    const el = paperRef.current;
    if (!el || el.selectionStart === el.selectionEnd) return;
    selRef.current = { start: el.selectionStart, end: el.selectionEnd };
    setSelText(el.value.slice(el.selectionStart, el.selectionEnd));
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

  function updateChapter(partial: Partial<NonNullable<typeof chapter>>) {
    if (!novel || !chapter) return;
    patchNovel({
      ...novel,
      chapters: novel.chapters.map((c) => (c.id === chapter.id ? { ...c, ...partial } : c)),
    });
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
      sideKind?: "edit" | "focus" | "threads" | "emotion" | "";
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
    const slot = pipeSkillSlot(skill.id);
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
    const stepIdx = STEPS.findIndex((s) => s.skillId === skill.id);
    if (stepIdx >= 0) setStep(stepIdx);

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
      if (skill.id === "continue") return "append" as const;
      return "replace" as const;
    };
    const startLen = modeFor() === "append" ? (chapter.content || "").length : 0;
    if (opts?.autoApply) setSideKind("");
    else if (opts?.sideKind) setSideKind(opts.sideKind);
    else if (target === "polish") setSideKind("edit");
    else if (target === "threads") setSideKind("threads");
    else if (target === "review" || skill.id === "suggest") setSideKind("focus");
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
                next = {
                  ...next,
                  chapters: next.chapters.map((c) =>
                    c.id !== liveChapterId
                      ? c
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
        const slot = pipeSkillSlot(skill.id);
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

  if (!novel || !chapter) {
    return (
      <div className="page loading-page">
        <div className="ink-pulse" />
        <p>{loadError || status || "正在摊开稿纸…"}</p>
        {!loadError ? <LoadingMeter label="正在摊开稿纸" /> : null}
        {loadError ? (
          <div className="row-actions">
            <button
              className="btn"
              type="button"
              onClick={() => {
                setLoadError("");
                setStatus("");
                load().catch((err) => setLoadError((err as Error).message || "加载失败"));
              }}
            >
              重试
            </button>
            <Link className="btn-ghost" to="/">
              返回首页
            </Link>
          </div>
        ) : null}
      </div>
    );
  }

  const charCards = parseCards(novel.characters);
  const worldCards = parseCards(novel.world);
  const propCards = parseCards(novel.props || "");
  const currentSkill = (idName: string) => skills.find((s) => s.id === idName);
  const openThreads = (novel.threads || []).filter((row) => row.status === "open");
  const visibleIssues = issues.filter((row) => !ignored.includes(row.id));
  const emotionVersions = sideKind === "emotion" ? parseEmotionVersions(sideText) : [];
  const chapterPos = novel.chapters.findIndex((row) => row.id === chapter.id);
  const nameBank = namesFromNovel(novel);
  const prevChapter = chapterPos > 0 ? novel.chapters[chapterPos - 1] : null;
  const nextChapter = chapterPos >= 0 && chapterPos < novel.chapters.length - 1 ? novel.chapters[chapterPos + 1] : null;
  const beatCatalog = maxBeatIndex(novel);
  const canNext = Boolean(nextChapter) || beatCatalog > chapter.index;
  const landing = inferEmotion(chapter.content);
  const prevLanding = inferEmotion(prevChapter?.content);
  const emotionHint = (() => {
    const bits: string[] = [];
    if (chapter.mood) bits.push(`本章定调「${chapter.mood}」`);
    if (landing) bits.push(`正文落点认成「${landing.mood}」`);
    if (prevLanding) bits.push(`上一章落在「${prevLanding.mood}」`);
    if (bits.length) return `${bits.join("。")}。写下一章时从落点接着长。`;
    if (wordCount(chapter.content) >= 800) return "本章已写完，生成跟正文走。";
    if (novel.craft?.mood) return `本章未写完，写本章时会带上默认基调「${novel.craft.mood}」。`;
    return "默认跟正文走。有上一章时，从上一章结尾的情绪接着长。";
  })();

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

  const pipeDone = Object.fromEntries(
    PIPELINE.map((item) => [item.id, pipeSlotFilled(novel, chapter, item.id)])
  ) as Record<(typeof PIPELINE)[number]["id"], boolean>;
  const liveBusy = busy || (job.running && job.kind === "studio" && job.targetId === id);
  const liveSlot = runningSlot || (liveBusy ? job.tabId : "");
  const nextPipe = findNextPipe(novel, chapter);
  const nextPipeIndex = nextPipe ? PIPELINE.findIndex((item) => item.id === nextPipe.id) : PIPELINE.length;
  const autoPipeLabel = chapter.index > 1 ? "自动写本章" : "自动写到第一章";
  const wordsMaxNow = Number(novel.craft?.wordsMax) || 3800;
  const activeSlot = runningSlot;
  const expectChars = expectJobChars(workId || activeSlot, wordsMaxNow);
  const filledSteps = PIPELINE.filter((item) => item.id !== activeSlot && pipeDone[item.id]).length;
  const byChars = streamChars / Math.max(expectChars, 1);
  const byTime = waitPercent(pipeClock, expectJobMs(workId || activeSlot)) / 100;
  const jobInner = busy ? Math.min(0.92, Math.max(byChars, byTime * 0.5, 0.06)) : nextPipe ? 0 : 1;
  const inPipeJob = Boolean(autoPipe || (busy && activeSlot));
  const pipePercent = inPipeJob
    ? Math.round(Math.min(100, ((filledSteps + jobInner) / PIPELINE.length) * 100))
    : busy
      ? Math.round(jobInner * 100)
      : !nextPipe
        ? 100
        : Math.round((nextPipeIndex / PIPELINE.length) * 100);
  const activeAction = (activeSlot && PIPELINE.find((item) => item.id === activeSlot)?.action) || nextPipe?.action || "";
  const pipeJobLabel = workName || activeAction || "生成";
  const jobTail = `${streamChars ? ` · ${streamChars} 字` : busy ? " · 生成中" : ""}${
    pipeClock ? ` · ${formatElapsed(pipeClock)}` : ""
  }`;
  const pipeMeterLabel = busy
    ? autoPipe
      ? `${Math.min(filledSteps + (activeSlot ? 1 : 0), PIPELINE.length)}/${PIPELINE.length} ${pipeJobLabel}${jobTail}`
      : `${pipeJobLabel}${jobTail}`
    : !nextPipe
      ? autoPipe
        ? "本章正文写完"
        : "立项到道具都齐了"
      : `第 ${nextPipeIndex + 1}/${PIPELINE.length} 步 ${nextPipe.label}`;

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

  function pipeControls() {
    if (failed) {
      return (
        <>
          <button className="btn-mint" type="button" onClick={retryFailed}>
            重试「{failed.label}」
          </button>
          <button className="btn-danger" type="button" onClick={stopWriting}>
            停在这步
          </button>
        </>
      );
    }
    if (autoPipe && paused) {
      return (
        <>
          <button className="btn-mint" type="button" onClick={resumeAutoPipe}>
            继续自动开书
          </button>
          <button className="btn-danger" type="button" onClick={stopWriting}>
            停在这步
          </button>
        </>
      );
    }
    if (autoPipe && busy && runningSlot) {
      return (
        <>
          <button className="btn" type="button" onClick={pauseAutoPipe}>
            本步后暂停
          </button>
          <button className="btn" type="button" onClick={skipStep}>
            跳过这步
          </button>
          <button className="btn-danger" type="button" onClick={stopWriting}>
            停在这步
          </button>
        </>
      );
    }
    if (busy) {
      return (
        <button className="btn-danger" type="button" onClick={stopWriting}>
          停在这步
        </button>
      );
    }
    if (!nextPipe) return null;
    return (
      <>
        <button className="btn-mint" type="button" onClick={runNextPipe}>
          {nextPipe.action}
        </button>
        <button className="btn" type="button" onClick={startAutoPipe}>
          {autoPipeLabel}
        </button>
      </>
    );
  }

  continueAutoPipeRef.current = continueAutoPipe;

  function captureNameHint(field: "beats" | "brief" | "outline", el: HTMLTextAreaElement) {
    const hit = matchNamePrefix(el.value, el.selectionStart, nameBank);
    if (!hit) {
      setNameHint(null);
      return;
    }
    setNameHint({ field, start: hit.start, end: hit.end, items: hit.items });
  }

  function applyNameHint(name: string) {
    if (!nameHint) return;
    if (!novel || !chapter) return;
    const { field, start, end } = nameHint;
    const splice = (text: string) => text.slice(0, start) + name + text.slice(end);
    if (field === "brief") patchNovel({ ...novel, brief: splice(novel.brief || "") });
    else if (field === "outline") patchNovel({ ...novel, outline: splice(novel.outline || "") });
    else updateChapter({ beats: splice(chapter.beats || "") });
    setNameHint(null);
  }

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

  const paletteItems: PaletteItem[] = [
    { id: "zen", group: "界面", label: zen ? "退出专注" : "进入专注", hint: "Ctrl+.", run: () => {
      if (!zen && busy) stopWriting();
      setZen(!zen);
    } },
    { id: "save", group: "文件", label: "保存工程", hint: "Ctrl+S", run: () => { save().catch((err) => setStatus((err as Error).message)); } },
    { id: "export", group: "文件", label: "导出正文 Markdown", run: exportMd },
    { id: "archive", group: "文件", label: "归档本书", run: () => { archiveBook().catch((err) => setStatus((err as Error).message)); } },
    { id: "duplicate", group: "文件", label: "复制本书", run: () => { duplicateBook().catch((err) => setStatus((err as Error).message)); } },
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
    { id: "fill-beats", group: "补全", label: beatCatalog > 0 ? "续写细纲" : "补全细纲", run: () => fillSlot("beats") },
    { id: "fill-cast", group: "补全", label: "补全人物", run: () => fillSlot("characters") },
    {
      id: "pipe-next",
      group: "向导",
      label: nextPipe ? `下一步：${nextPipe.action}` : "开书步骤已齐",
      hint: nextPipe?.hint,
      run: () => {
        if (nextPipe) runNextPipe();
      },
    },
    {
      id: "pipe-auto",
      group: "向导",
      label: autoPipe ? "停止自动开书" : autoPipeLabel,
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
      hint: visibleIssues.length ? `${visibleIssues.length} 处` : "本地扫描",
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
    ...openThreads.map((row) => ({
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

  function assetCard(
    field: AssetField,
    card: { title: string; role: string; body: string },
    index: number
  ) {
    if (!novel) return null;
    const propMeta = field === "props" ? parsePropBody(card.body) : null;
    const [desc, prompt] = propMeta
      ? [propMeta.desc, propMeta.prompt]
      : (() => {
      const hit = card.body.split(/提示词[:：]/);
      if (hit.length > 1) return [hit[0].replace(/^描述[:：]\s*/m, "").trim(), hit[1].trim()];
      return [card.body, card.body];
    })();
    const portrait = novel.media?.[`${field}:${card.title}`];
    const colorKey = `${field}:${card.title}#color`;
    const avatarColor = novel.media?.[colorKey] || "";
    const setAvatarColor = (c: string) => {
      const media = { ...(novel.media || {}) };
      if (avatarColor === c) delete media[colorKey];
      else media[colorKey] = c;
      patchNovel({ ...novel, media });
    };
    const skillId = field === "world" ? "world" : field === "props" ? "props" : "characters";
    const writeBody = (next: { desc?: string; prompt?: string; holder?: string; use?: string; cost?: string }) => {
      if (propMeta) {
        writeCard(field, index, {
          ...card,
          body: joinPropBody({
            desc: next.desc ?? propMeta.desc,
            prompt: next.prompt ?? propMeta.prompt,
            holder: next.holder ?? propMeta.holder,
            use: next.use ?? propMeta.use,
            cost: next.cost ?? propMeta.cost,
          }),
        });
        return;
      }
      writeCard(field, index, {
        ...card,
        body: `描述：\n${next.desc ?? desc}\n\n提示词：\n${next.prompt ?? prompt}`,
      });
    };
    return (
      <article className={`asset ${field === "props" ? "prop" : ""}`} key={`${field}-${index}`}>
        <div className="asset-top">
          <div className="avatar" style={!portrait && avatarColor ? { background: avatarColor } : undefined}>
            {portrait ? <img src={portrait} alt="" /> : <span>{card.title.slice(0, 1)}</span>}
            {field !== "props" && (
            <div className="swatches">
              {SWATCH.map((c) => (
                <button
                  key={c}
                  type="button"
                  className={avatarColor === c ? "on" : ""}
                  style={{ background: c }}
                  title={avatarColor === c ? "取消头像底色" : "设为头像底色"}
                  onClick={() => setAvatarColor(c)}
                />
              ))}
            </div>
            )}
          </div>
          <div className="asset-fields">
            <div className="duo">
              <input
                value={card.title}
                onChange={(e) => writeCard(field, index, { ...card, title: e.target.value })}
              />
              <input
                value={card.role || (field === "characters" ? "角色" : field === "props" ? "物件" : "场景")}
                onChange={(e) => writeCard(field, index, { ...card, role: e.target.value })}
              />
            </div>
            <input
              value={card.role}
              placeholder={field === "characters" ? "主角 / 配角" : field === "world" ? "场景类型" : "信物 / 武器 / 载具"}
              onChange={(e) => writeCard(field, index, { ...card, role: e.target.value })}
            />
            {propMeta ? (
              <div className="trio">
                <input
                  value={propMeta.holder}
                  placeholder="谁拿着"
                  onChange={(e) => writeBody({ holder: e.target.value })}
                />
                <input
                  value={propMeta.use}
                  placeholder="用途"
                  onChange={(e) => writeBody({ use: e.target.value })}
                />
                <input
                  value={propMeta.cost}
                  placeholder="代价"
                  onChange={(e) => writeBody({ cost: e.target.value })}
                />
              </div>
            ) : null}
            <div className="duo">
              <label className="field">
                <span>描述</span>
                <textarea
                  value={desc}
                  onChange={(e) =>
                    writeBody({ desc: e.target.value })
                  }
                />
              </label>
              <label className="field prompt-box">
                <span>提示词</span>
                <span className="ai-tag">AI 生成</span>
                <textarea
                  value={prompt}
                  onChange={(e) =>
                    writeBody({ prompt: e.target.value })
                  }
                />
              </label>
            </div>
          </div>
        </div>
        <div className="asset-foot">
          <button className="btn-danger" onClick={() => removeCard(field, index)}>
            删除
          </button>
          <button className="btn-ghost" onClick={() => pickUpload(field, card.title)}>
            本地上传
          </button>
          <button className="btn-ghost" onClick={() => setHistFor({ field, title: card.title })}>
            历史生成
          </button>
          <button
            className="btn-ghost"
            disabled={busy}
            onClick={() => currentSkill(skillId) && runSkill(currentSkill(skillId)!, { focusName: card.title })}
          >
            从设定生成描述
          </button>
          <button
            className="btn"
            disabled={busy}
            onClick={() => currentSkill(skillId) && runSkill(currentSkill(skillId)!, { focusName: card.title })}
          >
            重新生成
          </button>
          <span className="ok">{card.body ? "已生成" : "待生成"}</span>
        </div>
      </article>
    );
  }

  return (
    <div className="studio-root">
      <div className="mobile-tabs">
        {[
          ["toc", "目录"],
          ["paper", "主台"],
          ["skill", "检查器"],
        ].map(([key, label]) => (
          <button key={key} className={mobile === key ? "on" : ""} onClick={() => setMobile(key as typeof mobile)}>
            {label}
          </button>
        ))}
      </div>
      <div className={`workspace ${zen ? "zen" : ""} ${desk === "board" || desk === "threads" ? "wide" : ""}`}>
        <aside className={`ep ${mobile === "toc" ? "show" : ""}`}>
          <div className="ep-head">
            <span>目录</span>
            <button className="btn-mint" onClick={addChapter}>
              + 新章
            </button>
          </div>
          {novel.chapters.map((c) => (
            <button
              key={c.id}
              className={`ep-item ${c.id === chapter.id ? "on" : ""}`}
              draggable
              onDragStart={() => setDragId(c.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragId) moveChapter(dragId, c.id);
                setDragId("");
              }}
              onClick={() => {
                setChapterId(c.id);
                setTab("content");
                setStep(4);
                if (!c.content) setReading(false);
                setDesk("write");
                setMobile("paper");
              }}
            >
              <div className="dots">●●</div>
              <b>
                {chapterHeading(c)}
              </b>
              <small>
                {wordCount(c.content)
                  ? `${wordCount(c.content)} 字`
                  : String(c.beats || "").trim()
                    ? "有细纲"
                    : "待写"}
              </small>
              <span
                className="ep-del"
                onClick={(e) => {
                  e.stopPropagation();
                  removeChapter(c.id);
                }}
              >
                删
              </span>
            </button>
          ))}
        </aside>

        <section className={`stage ${mobile === "paper" ? "show" : ""}`}>
          <ConfigBanner />
            <div className="pipe-wrap">
              <div className="pipe">
                {PIPELINE.map((item, i) => (
                  <span className="pipe-item" key={item.id}>
                    {i > 0 && <i className={`pipe-line ${pipeDone[PIPELINE[i - 1].id] ? "on" : ""}`} />}
                    <button
                      type="button"
                      className={`pipe-step ${pipeDone[item.id] ? "done" : ""} ${liveSlot === item.id ? "run" : nextPipe?.id === item.id ? "on" : ""}`}
                      onClick={() => openDesk(item.desk, item.tab)}
                      title={item.hint}
                    >
                      <span className="n">{i + 1}</span>
                      {item.label}
                      {skills.find((s) => s.id === pipeSkillId(item.id) && s.upgraded) ? <em>对标</em> : null}
                    </button>
                  </span>
                ))}
              </div>
              {nextPipe ? (
                <div className="pipe-wrap-actions">{pipeControls()}</div>
              ) : (
                <span className="pipe-done-label">{autoPipe ? "本章正文写完" : "本章可写可改"}</span>
              )}
              <Meter
                percent={liveBusy && !busy ? job.percent || pipePercent : pipePercent}
                label={liveBusy && !busy ? jobLabel(job) : pipeMeterLabel}
                running={liveBusy}
              />
            </div>
          <div className="stage-bar">
            <div className="tabs desk-tabs">
              {DESKS.map((d) => (
                <button
                  key={d.id}
                  className={desk === d.id ? "on" : ""}
                  onClick={() => openDesk(d.id, d.id === "lore" ? "brief" : d.id === "cast" ? "characters" : undefined)}
                >
                  {d.label}
                  {d.id === "threads" && openThreads.length ? `(${openThreads.length})` : ""}
                  {d.id === "cast" && charCards.length ? `(${charCards.length})` : ""}
                </button>
              ))}
            </div>
            <div className="actions">
              {desk === "write" && (
                <>
                  <Link className={`voice-chip ${voiceChip.tone}`} to="/voice" title="去文风页管理底味">
                    {voiceChip.text}
                  </Link>
                  <button className="btn-mint" disabled={busy} onClick={() => currentSkill("chapter-prose") && runSkill(currentSkill("chapter-prose")!)}>
                    写本章
                  </button>
                  <button className="btn" disabled={busy} onClick={() => currentSkill("continue") && runSkill(currentSkill("continue")!)}>
                    续写
                  </button>
                  <button
                    className="btn"
                    disabled={busy}
                    onClick={() => {
                      const skill = currentSkill("review");
                      if (!skill) {
                        setStatus("审稿写法未加载，去资产页看是否停用");
                        setReportOpen(true);
                        return;
                      }
                      if (!String(chapter.content || "").trim()) {
                        setStatus("本章还是空白，先写一段再审");
                        setReportOpen(true);
                        return;
                      }
                      runSkill(skill);
                    }}
                  >
                    审稿{chapter?.reviewVerdict ? ` · ${chapter.reviewVerdict}` : ""}
                  </button>
                  <button
                    className="btn"
                    disabled={busy}
                    onClick={() => {
                      setSideKind("scan");
                      setReportOpen(true);
                      scanNow().catch((err) => setStatus(err.message));
                    }}
                  >
                    校对{aigc ? ` · AI率 ${aigc.rate}` : visibleIssues.length ? ` ${visibleIssues.length}` : ""}
                  </button>
                  {novel.logs?.some((l) => l.status === "error") && (
                    <button className="btn-danger" onClick={() => setLogsOpen(true)}>
                      生成记录 · {novel.logs.filter((l) => l.status === "error").length} 失败
                    </button>
                  )}
                  <button className={`wide-only ${split ? "btn on" : "btn"}`} onClick={() => setSplit((v) => !v)}>
                    分屏
                  </button>
                </>
              )}
              {desk === "cast" && (
                <>
                  <button className="btn-mint" onClick={() => addCard("characters")}>
                    + 人物
                  </button>
                  <button className="btn" disabled={busy} onClick={() => fillSlot("characters")}>
                    补全
                  </button>
                </>
              )}
              {desk === "threads" && (
                <>
                  <button className="btn-ghost" onClick={addThreadRow}>
                    新线
                  </button>
                  <button className="btn" disabled={busy} onClick={() => currentSkill("threads") && runSkill(currentSkill("threads")!)}>
                    整理账本
                  </button>
                </>
              )}
              {desk === "lore" && (tab === "world" || tab === "props") && (
                <button className="btn-mint" onClick={() => addCard(tab === "world" ? "world" : "props")}>
                  + 添加
                </button>
              )}
              {desk === "lore" && (tab === "brief" || tab === "world" || tab === "props" || tab === "outline" || tab === "beats") && (
                <button
                  className="btn"
                  disabled={busy}
                  onClick={() => fillSlot(tab === "beats" ? "beats" : tab === "world" ? "world" : tab === "props" ? "props" : tab === "outline" ? "outline" : "brief")}
                >
                  {tab === "beats" && beatCatalog > 0 ? "续写细纲" : tab === "props" && novelHasProse(novel) ? "从正文抽取" : "补全"}
                </button>
              )}
              {undoStack.length > 0 && (
                <button className="btn" onClick={undoLast}>
                  撤销本轮
                </button>
              )}
              <button className="btn-ghost" onClick={() => { setPaletteOpen(true); setPaletteQuery(""); }}>
                {shortcutK()}
              </button>
              <button
                className={zen ? "btn-mint" : "btn-ghost"}
                onClick={() => {
                  if (!zen && busy) stopWriting();
                  setZen(!zen);
                }}
              >
                {zen ? "退出专注" : "专注"}
              </button>
            </div>
          </div>

          {desk === "write" && reportOpen && (
            <section className="stage-report">
              <div className="stage-report-h">
                <b>
                  {sideKind === "edit"
                    ? "润色"
                    : sideKind === "threads"
                      ? "伏笔账本"
                      : sideKind === "emotion"
                        ? "情感改写"
                        : sideKind === "scan"
                          ? "校对"
                          : "章节审稿"}
                </b>
                {sideKind === "focus" && chapter?.reviewAt && (
                  <span className="muted">{new Date(chapter.reviewAt).toLocaleString("zh-CN")}</span>
                )}
                <button type="button" className="btn-ghost" onClick={() => setReportOpen(false)}>
                  收起
                </button>
              </div>
              {sideKind === "scan" && (
                <p className="muted">本地扫描错字、专名、套话，并给出 AI率。接受只改对应词，阅读页不画线。</p>
              )}
              {sideKind === "scan" && (
                <AigcCard report={aigc} onDeai={() => runSel("deai")} issueCount={visibleIssues.length} />
              )}
              {busy && sideKind !== "scan" && (
                <Meter percent={pipePercent} label={pipeMeterLabel} running />
              )}
              {busy && !sideText && sideKind !== "scan" && <p className="muted">{status || "正在审稿…"}</p>}
              {sideKind !== "scan" && sideText &&
                (sideKind === "emotion" && emotionVersions.length >= 2 && !busy ? (
                  emotionVersions.map((version) => (
                    <article className="emo-card" key={version.id}>
                      <b>
                        版本{version.id} · {version.label}
                      </b>
                      <p>{version.body}</p>
                      <button className="btn" type="button" onClick={() => applyEmotion(version.body)}>
                        写入选区
                      </button>
                    </article>
                  ))
                ) : (
                  sideKind === "focus" && !busy ? (
                    <ReviewReport
                      text={sideText}
                      chapterText={chapter?.content || ""}
                      onLocate={locateOriginal}
                      onReplace={replaceOriginal}
                    />
                  ) : (
                    <pre className="side-result">{sideText}</pre>
                  )))}
              {sideKind === "edit" && sideText && !busy && (
                <button className="btn" onClick={applyPolish}>
                  写入正文
                </button>
              )}
              {visibleIssues.length > 0 && (
                <div className="report-issues">
                  <IssueList
                    issues={visibleIssues}
                    onJump={jumpIssue}
                    onApply={applyIssue}
                    onFeel={(issue) => {
                      jumpIssue(issue);
                      runSel("feel");
                    }}
                    onIgnore={(id) => setIgnored((list) => [...list, id])}
                  />
                </div>
              )}
              {!busy && (sideKind === "scan" || !sideText) && visibleIssues.length === 0 && (
                <p className="muted">{status || (aigc ? `AI率 ${aigc.rate}（${aigcLevelText(aigc.level)}）` : "本章未见明显错字、专名写错或概括情绪")}</p>
              )}
            </section>
          )}

          {desk === "lore" && (
            <div className="tabs lore-tabs">
              {TABS.filter((t) => t.id !== "content" && t.id !== "characters").map((t) => (
                <button key={t.id} className={tab === t.id ? "on" : ""} onClick={() => setTab(t.id)}>
                  {t.label}
                  {t.id === "world" ? `(${worldCards.length})` : ""}
                  {t.id === "props" ? `(${propCards.length})` : ""}
                </button>
              ))}
            </div>
          )}

          {desk === "board" && (
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
                    onDragStart={() => setDragId(c.id)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      if (dragId) moveChapter(dragId, c.id);
                      setDragId("");
                    }}
                    onClick={() => openDesk("write", "content", c.id)}
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
                        onChange={(e) => patchChapterById(c.id, { mood: e.target.value })}
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
                              onChange={(e) => patchChapterById(c.id, { emotionStart: Number(e.target.value) })}
                            />
                          </label>
                          <label>
                            收
                            <input
                              type="range"
                              min={1}
                              max={10}
                              value={c.emotionEnd ?? 6}
                              onChange={(e) => patchChapterById(c.id, { emotionEnd: Number(e.target.value) })}
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

          {desk === "threads" && (
            <div className="thread-stage">
              <p className="muted">未收 {openThreads.length} 条。</p>
              {(novel.threads || []).map((row) => (
                <div className={`thread-row ${row.status}`} key={row.id}>
                  <input value={row.name} onChange={(e) => patchThread(row.id, { name: e.target.value })} placeholder="伏笔名" />
                  <input value={row.plant} onChange={(e) => patchThread(row.id, { plant: e.target.value })} placeholder="埋设" />
                  <input value={row.payoff} onChange={(e) => patchThread(row.id, { payoff: e.target.value })} placeholder="回收" />
                  <select value={row.status} onChange={(e) => patchThread(row.id, { status: e.target.value as ThreadItem["status"] })}>
                    {THREAD_STATUS.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                  <button className="btn-ghost" type="button" onClick={() => removeThreadRow(row.id)}>
                    删
                  </button>
                </div>
              ))}
              {!(novel.threads || []).length && <p className="muted">账本还空着。</p>}
            </div>
          )}

          {desk === "cast" && (
            <>
              {charCards.length === 0 && (
                <div className="empty-cta">
                  <p className="muted">还没有人物。点「补全」生成小传，或手动添加。</p>
                  <button className="btn-mint" type="button" disabled={busy} onClick={() => fillSlot("characters")}>
                    补人物
                  </button>
                </div>
              )}
              {charCards.map((c, i) => assetCard("characters", c, i))}
            </>
          )}
          {desk === "lore" && tab === "world" && (
            <>
              {worldCards.length === 0 && (
                <div className="empty-cta">
                  <p className="muted">还没有场景。点「补全」写成可演戏的条目。</p>
                  <button className="btn-mint" type="button" disabled={busy} onClick={() => fillSlot("world")}>
                    补场景
                  </button>
                </div>
              )}
              {worldCards.map((c, i) => assetCard("world", c, i))}
            </>
          )}
          {desk === "lore" && tab === "props" && (
            <>
              {propCards.length === 0 && (
                <div className="empty-cta">
                  <p className="muted">
                    {novelHasProse(novel)
                      ? "还没有道具。点「从正文抽取」，会从已写章节里收物件卡。"
                      : beatCatalog > 0
                        ? "还没有道具。正文还空，可从细纲场面表先列物件，或写完正文再抽。"
                        : "还没有道具。按立项三灾先列物件，或写完正文再抽。"}
                  </p>
                  <button className="btn-mint" type="button" disabled={busy} onClick={() => fillSlot("props")}>
                    {novelHasProse(novel) ? "从正文抽取" : "列道具"}
                  </button>
                </div>
              )}
              {propCards.map((c, i) => assetCard("props", c, i))}
            </>
          )}
          {desk === "lore" && tab === "outline" && (
            <div className="hint-wrap">
              <textarea
                className="ms"
                value={novel.outline}
                onChange={(e) => {
                  patchNovel({ ...novel, outline: e.target.value });
                  captureNameHint("outline", e.target);
                }}
                onSelect={(e) => captureNameHint("outline", e.currentTarget)}
                onBlur={() => window.setTimeout(() => setNameHint((cur) => (cur?.field === "outline" ? null : cur)), 120)}
                placeholder="全书大纲"
              />
              {nameHint?.field === "outline" && (
                <div className="name-hints">
                  {nameHint.items.map((name) => (
                    <button type="button" key={name} onMouseDown={(e) => { e.preventDefault(); applyNameHint(name); }}>
                      {name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {desk === "lore" && tab === "brief" && (
            <div className="hint-wrap">
              <textarea
                className="ms"
                value={novel.brief}
                onChange={(e) => {
                  patchNovel({ ...novel, brief: e.target.value });
                  captureNameHint("brief", e.target);
                }}
                onSelect={(e) => captureNameHint("brief", e.currentTarget)}
                onBlur={() => window.setTimeout(() => setNameHint((cur) => (cur?.field === "brief" ? null : cur)), 120)}
                placeholder="立项说明"
              />
              {nameHint?.field === "brief" && (
                <div className="name-hints">
                  {nameHint.items.map((name) => (
                    <button type="button" key={name} onMouseDown={(e) => { e.preventDefault(); applyNameHint(name); }}>
                      {name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {desk === "lore" && tab === "beats" && (
            <>
              <div className="hint-wrap">
                <textarea
                  className="ms"
                  value={chapter.beats || ""}
                  onChange={(e) => {
                    updateChapter({ beats: e.target.value });
                    captureNameHint("beats", e.target);
                  }}
                  onSelect={(e) => captureNameHint("beats", e.currentTarget)}
                  onBlur={() => window.setTimeout(() => setNameHint((cur) => (cur?.field === "beats" ? null : cur)), 120)}
                  placeholder="本章细纲，可用 ### 第N章 拆目录"
                />
                {nameHint?.field === "beats" && (
                  <div className="name-hints">
                    {nameHint.items.map((name) => (
                      <button type="button" key={name} onMouseDown={(e) => { e.preventDefault(); applyNameHint(name); }}>
                        {name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {(chapter.beats || "").includes("###") && (
                <button className="btn" style={{ marginTop: 8 }} onClick={() => { absorbBeats(); }}>
                  按细纲拆入目录
                </button>
              )}
            </>
          )}
          {desk === "write" && (
            <div className={`write-split ${split ? "on" : ""}`}>
              <div ref={readerShellRef} className={`reader-shell ${nightRead ? "night" : ""}`}>
                <div className="reader-bar">
                  <div className="reader-modes">
                    <button className={reading ? "on" : ""} onClick={() => setReading(true)}>
                      阅读
                    </button>
                    <button className={!reading ? "on" : ""} onClick={() => setReading(false)}>
                      编辑
                    </button>
                  </div>
                  {!reading && selText && (
                    <div className="sel-bar" onMouseDown={(e) => e.preventDefault()}>
                      <button disabled={busy} onClick={() => runSel("polish")}>润色</button>
                      <button disabled={busy} onClick={() => runSel("expand")}>扩写</button>
                      <button disabled={busy} onClick={() => runSel("shrink")}>缩写</button>
                      <button disabled={busy} onClick={() => runSel("proof")}>改错字</button>
                      <button disabled={busy} onClick={() => runSel("deai")}>去AI味</button>
                      <button disabled={busy} onClick={() => runSel("perform")}>演出来</button>
                      {novel.craft?.imitateOn && novel.craft?.imitateDims ? (
                        <button disabled={busy} onClick={() => runSel("imitate")}>照骨架改</button>
                      ) : null}
                      <button disabled={busy} onClick={() => runSel("feel")}>情感</button>
                      <button disabled={busy} onClick={() => runSel("continue")}>续写</button>
                      <button disabled={busy} onClick={() => runSel("review")}>审稿</button>
                    </div>
                  )}
                  {!reading && novel.craft?.cleanCopy !== false && !selText && (
                    <span className="clean-auto-hint">写完自动去AI味</span>
                  )}
                  <div className="reader-tools">
                    <button disabled={!prevChapter} onClick={() => prevChapter && setChapterId(prevChapter.id)}>
                      上一章
                    </button>
                    <button disabled={!canNext} onClick={() => turnChapter(1)}>
                      下一章
                    </button>
                    <button onClick={() => setReaderSize((n) => Math.max(15, n - 1))}>A-</button>
                    <button onClick={() => setReaderSize((n) => Math.min(24, n + 1))}>A+</button>
                    <button onClick={() => setNightRead((v) => !v)}>{nightRead ? "日间" : "夜间"}</button>
                    <span className="reader-count">{wordCount(chapter.content)} 字</span>
                    <button
                      disabled={busy}
                      onClick={() => {
                        setReading(false);
                        currentSkill("continue") && runSkill(currentSkill("continue")!);
                      }}
                    >
                      续写
                    </button>
                  </div>
                </div>
                {reading ? (
                  <article className="reader-paper" style={{ fontSize: readerSize }}>
                    <h1>
                      {chapterHeading(chapter)}
                    </h1>
                    {toParagraphs(chapter.content, chapter.title).length === 0 ? (
                      <p className="reader-empty">本章还是空白。切到编辑，或在右侧运行「章节正文」。</p>
                    ) : (
                      toParagraphs(chapter.content, chapter.title).map((p, i) => <p key={i}>{p}</p>)
                    )}
                    <div className="reader-turn">
                      <button type="button" disabled={!prevChapter} onClick={() => prevChapter && setChapterId(prevChapter.id)}>
                        {prevChapter ? `上一章 ${chapterHeading(prevChapter)}` : "已是第一章"}
                      </button>
                      <button type="button" disabled={!canNext} onClick={() => turnChapter(1)}>
                        {nextChapter ? `下一章 ${chapterHeading(nextChapter)}` : canNext ? "下一章" : "已是最后一章"}
                      </button>
                    </div>
                  </article>
                ) : (
                  <>
                    <input
                      className="reader-title-input"
                      value={stripChapterPrefix(chapter.title)}
                      placeholder={chapterHeading(chapter)}
                      onChange={(e) => updateChapter({ title: stripChapterPrefix(e.target.value) })}
                    />
                    <textarea
                      ref={paperRef}
                      className="ms reader-edit"
                      value={chapter.content}
                      placeholder="从这里写下第一句，或运行「章节正文」。"
                      onChange={(e) => updateChapter({ content: e.target.value })}
                      onSelect={captureSel}
                      onKeyUp={captureSel}
                      onMouseUp={captureSel}
                    />
                  </>
                )}
              </div>
              {split && (
                <aside className="write-side">
                  <h4>本章细纲</h4>
                  <textarea value={chapter.beats || ""} onChange={(e) => updateChapter({ beats: e.target.value })} placeholder="这一章要办成什么" />
                  <h4>未收伏笔</h4>
                  {openThreads.length === 0 && <p className="muted">没有未收的线。</p>}
                  {openThreads.map((row) => (
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

        <aside className={`inspector ${mobile === "skill" ? "show" : ""}`}>
          <div className="ins-h">
            <b>创作契约</b>
            <span className={`ins-status ${dirty ? "" : "ok"}`}>{status || (dirty ? "未保存" : "已保存")}</span>
            <button className="btn-ghost" onClick={() => save().catch((e) => setStatus(e.message))}>
              保存
            </button>
          </div>
          <div className="ins-block">
            <h4>开书进度</h4>
            <Meter percent={pipePercent} label={pipeMeterLabel} running={busy} />
            <p className="muted">
              {nextPipe
                ? autoPipe
                  ? `自动开书进行中：第 ${nextPipeIndex + 1} 步 ${nextPipe.label}。写完会接着下一步，直到抽出道具。`
                  : `第 ${nextPipeIndex + 1} 步 ${nextPipe.label}。${nextPipe.hint}`
                : "立项到道具都齐了，可以续写、审稿或开下一章。"}
            </p>
            <div className="pipe-cta">
              {pipeControls()}
              {!busy && nextPipe && undoStack.length > 0 && (
                <button className="btn" onClick={undoLast}>
                  撤销本轮
                </button>
              )}
            </div>
            <div className="pipe-rerun">
              <span className="muted">单步重跑</span>
              {PIPELINE.map((item) => (
                <button
                  key={item.id}
                  className="mini"
                  disabled={busy}
                  onClick={() => rerunStep(item.id)}
                  title={`重跑${item.label}`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          <div className="ins-block extra-block">
            <h4>这一章还想交代</h4>
            <textarea value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="这一章重点写什么，或禁止写什么" />
            <div className="row-actions preview-row">
              <select value={previewSkillId} onChange={(e) => setPreviewSkillId(e.target.value)}>
                {skills
                  .filter((s) => s.enabled)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </select>
              <button className="btn-ghost" disabled={busy} onClick={() => setPreviewOpen(true)}>
                预览将注入的提示词
              </button>
            </div>
          </div>
          <InsFold
            title="分层记忆"
            open={foldOpen("memory")}
            onToggle={() => toggleFold("memory")}
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
                  checked={ctx[key]}
                  onChange={(e) => setCtx({ ...ctx, [key]: e.target.checked })}
                />
                {label}
              </label>
            ))}
          </InsFold>

          {nouns.length > 0 && (
            <div className="ins-block">
              <h4>本章专名</h4>
              <p className="muted">从人物、场景、道具、伏笔和章名抽出，用来核对写错的名字。</p>
              <div className="noun-chips">
                {nouns.map((name) => (
                  <button
                    className="craft-chip on"
                    type="button"
                    key={name}
                    onClick={() => {
                      const keep = novel.lexicon?.keep || [];
                      if (!keep.includes(name)) patchLexicon({ keep: [...keep, name] });
                      setStatus(`已收入词库：${name}`);
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
            open={foldOpen("genre")}
            onToggle={() => toggleFold("genre")}
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
                  onClick={() => patchCraft({ flow: item.id })}
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
                  onClick={() => patchCraft({ platform: item.id })}
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
                onChange={(e) => patchCraft({ goldenFinger: e.target.value.slice(0, 1200) })}
              />
            </label>
            <label className="field">
              <span>本章必写爽点（选填）</span>
              <textarea
                rows={2}
                value={novel.craft?.requiredBeats || ""}
                placeholder="例：当众鉴宝打脸、亲戚变脸、明星侧目。写章时必须落到对白、动作或数字。"
                onChange={(e) => patchCraft({ requiredBeats: e.target.value.slice(0, 400) })}
              />
            </label>
            <p className="muted">选了平台且篇幅仍是默认 2200–3800 时，会自动套用平台字数区间；手动改过篇幅以手动为准。</p>
          </InsFold>

          <InsFold
            title="仿写骨架"
            open={foldOpen("imitate")}
            onToggle={() => toggleFold("imitate")}
            hint={`${(novel.craft?.imitateLib || []).length} 篇范文 · ${novel.craft?.imitateOn ? "已启用" : "未启用"}`}
          >
            <div className="craft-row">
              <button
                type="button"
                className={`craft-chip ${novel.craft?.imitateOn ? "on" : ""}`}
                onClick={() => patchCraft({ imitateOn: !novel.craft?.imitateOn })}
              >
                {novel.craft?.imitateOn ? "仿写已启用" : "启用仿写骨架"}
              </button>
              <button type="button" className="btn" onClick={addImitateSample}>
                加一篇范文
              </button>
              <button type="button" className="btn" onClick={mergeImitate}>
                合并通用骨架
              </button>
              <button type="button" className="btn" onClick={compareImitate}>
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
                    onChange={(e) => patchImitateSample(row.id, { title: e.target.value.slice(0, 60) })}
                  />
                  <input
                    value={row.platform}
                    placeholder="平台"
                    onChange={(e) => patchImitateSample(row.id, { platform: e.target.value.slice(0, 20) })}
                  />
                  <input
                    value={row.genre}
                    placeholder="类型"
                    onChange={(e) => patchImitateSample(row.id, { genre: e.target.value.slice(0, 20) })}
                  />
                  <input
                    value={row.style}
                    placeholder="风格"
                    onChange={(e) => patchImitateSample(row.id, { style: e.target.value.slice(0, 20) })}
                  />
                  <input
                    value={row.check}
                    placeholder="朱雀结果"
                    onChange={(e) => patchImitateSample(row.id, { check: e.target.value.slice(0, 40) })}
                  />
                  <button type="button" className="btn-ghost" onClick={() => removeImitateSample(row.id)}>
                    删
                  </button>
                </div>
                <textarea
                  rows={4}
                  value={row.excerpt}
                  placeholder="粘贴范文摘录 2000—3000 字"
                  onChange={(e) => patchImitateSample(row.id, { excerpt: e.target.value.slice(0, 6000) })}
                />
                <div className="craft-row">
                  <button
                    type="button"
                    className="btn"
                    disabled={imitBusy === row.id}
                    onClick={() => analyzeImitateSample(row.id)}
                  >
                    {imitBusy === row.id ? "拆解中…" : "本地拆解"}
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
                onChange={(e) => patchCraft({ imitate: e.target.value.slice(0, 4000) })}
              />
            </label>
            <label className="field">
              <span>仿写补充（选填）</span>
              <textarea
                rows={2}
                value={novel.craft?.imitateNotes || ""}
                placeholder="例：对白后必须跟动作；不写比喻。"
                onChange={(e) => patchCraft({ imitateNotes: e.target.value.slice(0, 600) })}
              />
            </label>
            {imitRows.length ? (
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
                  {imitRows.map((row) => (
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
            open={foldOpen("voice")}
            onToggle={() => toggleFold("voice")}
            hint={`${novel.style || "跟立项"} · ${novel.craft?.wordsMin ?? 2200}–${novel.craft?.wordsMax ?? 3800} 字`}
          >
            <h4>文风</h4>
            <select
              value={novel.style || ""}
              onChange={(e) => patchNovel({ ...novel, style: e.target.value })}
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
              onChange={(e) => patchNovel({ ...novel, style: e.target.value })}
              placeholder="自填文风"
            />

          <div className="ins-block">
            <h4>视角</h4>
            <select value={novel.pov || "第三人称有限"} onChange={(e) => patchNovel({ ...novel, pov: e.target.value })}>
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
              onChange={(e) => patchNovel({ ...novel, pov: e.target.value })}
              placeholder="自填视角"
            />
          </div>

          <div className="ins-block">
            <h4>主题</h4>
            <input
              value={novel.theme || ""}
              onChange={(e) => patchNovel({ ...novel, theme: e.target.value })}
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
                  onClick={() => patchCraft({ density: item })}
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
              <button className="btn" type="button" onClick={enforceChapterWordMax}>
                现在收到 {novel.craft?.wordsMax ?? 3800} 字
              </button>
            ) : null}
            <div className="craft-row">
              {WORD_PRESETS.map((item) => (
                <button
                  key={item.label}
                  className={`craft-chip ${novel.craft?.wordsMin === item.min && novel.craft?.wordsMax === item.max ? "on" : ""}`}
                  onClick={() => patchCraft({ wordsMin: item.min, wordsMax: item.max })}
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
                  patchCraft({ wordsMin: min, wordsMax: max });
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
                  patchCraft({ wordsMax: max });
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
                onChange={(e) => patchCraft({ tone: Number(e.target.value) })}
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
                onChange={(e) => patchCraft({ pace: Number(e.target.value) })}
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
                onChange={(e) => patchCraft({ talk: Number(e.target.value) })}
              />
              <span>对话</span>
            </label>
          </div>
          </InsFold>

          <InsFold
            title="情感"
            open={foldOpen("emotion", Boolean(chapter.mood))}
            onToggle={() => toggleFold("emotion", Boolean(chapter.mood))}
            hint={chapter.mood || "跟正文"}
          >
            <p className="muted">{emotionHint}</p>
            <p className="ins-kicker">本章</p>
            <div className="craft-row">
              <button
                type="button"
                className={`craft-chip ${chapter.mood ? "" : "on"}`}
                onClick={() => patchChapterById(chapter.id, { mood: "" })}
              >
                跟正文
              </button>
              {MOODS.map((item) => (
                <button
                  key={`ch-${item}`}
                  type="button"
                  className={`craft-chip ${chapter.mood === item ? "on" : ""}`}
                  onClick={() => patchChapterById(chapter.id, { mood: chapter.mood === item ? "" : item })}
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
                    onChange={(e) => patchChapterById(chapter.id, { emotionStart: Number(e.target.value) })}
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
                    onChange={(e) => patchChapterById(chapter.id, { emotionEnd: Number(e.target.value) })}
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
                  onClick={() => patchCraft({ mood: novel.craft?.mood === item ? "" : item })}
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
                  onClick={() => patchCraft({ emotionStyle: item })}
                >
                  {item}
                </button>
              ))}
            </div>
            <button
              type="button"
              className={`craft-chip ${novel.craft?.showDontTell !== false ? "on" : ""}`}
              onClick={() => patchCraft({ showDontTell: novel.craft?.showDontTell === false })}
            >
              只准演
            </button>
            <label className="field" style={{ marginTop: 10 }}>
              <span>语气样本（选填）</span>
              <textarea
                rows={3}
                value={novel.craft?.voiceSample || ""}
                placeholder="贴一段你觉得活的叙述。写章时会模仿句长、口头禅和脏话密度。"
                onChange={(e) => patchCraft({ voiceSample: e.target.value.slice(0, 800) })}
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
                  onClick={() => patchCraft({ [item.key]: !novel.craft?.[item.key] })}
                  type="button"
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {openThreads.length > 0 && (
            <div className="ins-block">
              <h4>未收伏笔</h4>
              <p className="muted">{openThreads.length} 条还没收回。</p>
              <button className="btn" type="button" onClick={() => openDesk("threads")}>
                打开伏笔台
              </button>
            </div>
          )}

          <InsFold
            title="词库"
            open={foldOpen("lexicon")}
            onToggle={() => toggleFold("lexicon")}
            hint={`${(novel.lexicon?.keep || []).length} 词`}
          >
            <div className="ins-h" style={{ padding: 0 }}>
              <button
                className="btn-ghost"
                type="button"
                onClick={() => {
                  const text = (novel.lexicon?.keep || []).join("、");
                  if (!text) {
                    setStatus("词库还是空的");
                    return;
                  }
                  navigator.clipboard.writeText(text).then(
                    () => setStatus("词库已复制"),
                    () => setStatus("复制失败")
                  );
                }}
              >
                复制
              </button>
            </div>
            <p className="muted">始终正确的词不会被标错。映射只作建议，不自动替换。</p>
            <div className="lex-row">
              <input value={keepDraft} onChange={(e) => setKeepDraft(e.target.value)} placeholder="夜无痕" />
              <button
                className="btn-ghost"
                type="button"
                onClick={() => {
                  const word = keepDraft.trim();
                  if (!word) return;
                  const keep = novel.lexicon?.keep || [];
                  if (!keep.includes(word)) patchLexicon({ keep: [...keep, word] });
                  setKeepDraft("");
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
                  onClick={() => patchLexicon({ keep: (novel.lexicon?.keep || []).filter((item) => item !== word) })}
                >
                  {word} ×
                </button>
              ))}
            </div>
            <div className="lex-row map">
              <input value={mapFrom} onChange={(e) => setMapFrom(e.target.value)} placeholder="错词" />
              <input value={mapTo} onChange={(e) => setMapTo(e.target.value)} placeholder="正词" />
              <button
                className="btn-ghost"
                type="button"
                onClick={() => {
                  if (!mapFrom.trim() || !mapTo.trim()) return;
                  patchLexicon({
                    map: [...(novel.lexicon?.map || []), { from: mapFrom.trim(), to: mapTo.trim() }],
                  });
                  setMapFrom("");
                  setMapTo("");
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
                  patchLexicon({ map: (novel.lexicon?.map || []).filter((_, i) => i !== index) })
                }
              >
                {row.from} → {row.to}
              </button>
            ))}
          </InsFold>

          {visibleIssues.length > 0 && (
            <div className="ins-block">
              <h4>本章标记</h4>
              <IssueList
                issues={visibleIssues}
                onJump={jumpIssue}
                onApply={applyIssue}
                onFeel={(issue) => {
                  jumpIssue(issue);
                  runSel("feel");
                }}
                onIgnore={(id) => setIgnored((list) => [...list, id])}
              />
            </div>
          )}

          <InsFold
            title="写法"
            open={foldOpen("skills", true)}
            onToggle={() => toggleFold("skills", true)}
            hint={`${skillsForDesk().length} 份`}
          >
            {skillsForDesk().map((skill) => (
              <button
                key={skill.id}
                className="skill-mini"
                disabled={busy}
                onClick={() => runSkill(skill)}
              >
                <b>{skill.name}</b>
                <span className="muted">{skill.scene}</span>
              </button>
            ))}
            {skills.length > skillsForDesk().length && (
              <button className="btn-ghost" type="button" onClick={() => setAllSkills((v) => !v)}>
                {allSkills ? "只看本台" : "显示全部"}
              </button>
            )}
          </InsFold>

          {busy && (
            <>
            <Meter percent={pipePercent} label={pipeMeterLabel} running compact />
            <button className="btn-danger" onClick={stopWriting}>
              {autoPipe ? "停在这步" : "停止生成"}
            </button>
            </>
          )}
          {sideText && (
            <div className="ins-block">
              <h4>
                {sideKind === "edit"
                  ? "润色"
                  : sideKind === "threads"
                    ? "伏笔账本"
                    : sideKind === "focus"
                      ? "审稿 / 建议"
                      : sideKind === "emotion"
                        ? "情感改写"
                        : sideKind === "scan"
                          ? "校对"
                          : "本轮生成"}
              </h4>
              {sideKind === "emotion" && emotionVersions.length >= 2 && !busy ? (
                emotionVersions.map((version) => (
                  <article className="emo-card" key={version.id}>
                    <b>
                      版本{version.id} · {version.label}
                    </b>
                    <p>{version.body}</p>
                    <button className="btn" type="button" onClick={() => applyEmotion(version.body)}>
                      写入选区
                    </button>
                  </article>
                ))
              ) : (
                sideKind === "focus" && !busy ? (
                  <ReviewReport
                    text={sideText}
                    chapterText={chapter?.content || ""}
                    onLocate={locateOriginal}
                    onReplace={replaceOriginal}
                  />
                ) : (
                  <div className="side-result">{sideText}</div>
                ))}
              {sideKind === "edit" && (
                <button className="btn" onClick={applyPolish}>
                  写入正文
                </button>
              )}
            </div>
          )}
          <p className="muted">{status}</p>
          <Link className="muted" to="/">
            返回首页
          </Link>
        </aside>
      </div>
      <input
        ref={uploadRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          onUpload(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {histFor && (
        <div className="modal-back" onClick={() => setHistFor(null)}>
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
                  <button key={h.id} className="hist-item" onClick={() => restoreHistory(h)}>
                    <b>{h.skillName || h.skillId}</b>
                    <small>{new Date(h.createdAt).toLocaleString()}</small>
                    <p>{h.output.slice(0, 180)}</p>
                  </button>
                ))}
            </div>
            <button className="btn-ghost" onClick={() => setHistFor(null)}>
              关闭
            </button>
          </div>
        </div>
      )}
      {logsOpen && (
        <div className="modal-back" onClick={() => setLogsOpen(false)}>
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
            <button className="btn-ghost" onClick={() => setLogsOpen(false)}>
              关闭
            </button>
          </div>
        </div>
      )}
      <CommandPalette
        open={paletteOpen}
        query={paletteQuery}
        onQuery={setPaletteQuery}
        onClose={() => setPaletteOpen(false)}
        items={paletteItems}
      />
      {zen && (
        <>
          {(autoPipe || busy) && (
            <div className="zen-meter" role="progressbar" aria-valuenow={pipePercent} aria-valuemin={0} aria-valuemax={100}>
              <span>{pipeMeterLabel}</span>
              <i style={{ width: `${pipePercent}%` }} />
            </div>
          )}
          {busy ? (
            <button className="zen-stop" type="button" onClick={stopWriting}>
              {autoPipe ? "停在这步" : "停止生成"}
            </button>
          ) : null}
          <button className="zen-exit" type="button" onClick={() => setZen(false)}>
            退出专注 Esc
          </button>
        </>
      )}
      <PromptPreview
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        skillId={previewSkillId}
        skillName={skills.find((s) => s.id === previewSkillId)?.name}
        projectId={novel?.id}
        chapterId={chapter?.id || chapterId}
        extra={extra}
        include={ctx}
      />
    </div>
  );
}

function ConfigBanner() {
  const { configured } = useAppState();
  if (configured) return null;
  return (
    <div className="banner">
      还没有接入可用的供应商。请到 <Link to="/settings">设置</Link> 添加一家并启用。
    </div>
  );
}
