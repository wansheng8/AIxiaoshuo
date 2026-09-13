const { countWords, clipToWordMax } = require("./context");
const { parseThreads, mergeThreads } = require("./craft");
const { proofText } = require("./quality");
const { parseReviewVerdict } = require("./review");

const { parseBeatChapters, mergeBeatChapters } = require("./beats");

function upsertSection(md, title, output) {
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

function stripChapterHead(text) {
  const stripped = String(text || "")
    .replace(/^\uFEFF/, "")
    .replace(/^(?:#{1,6}\s*)?(第[零一二三四五六七八九十百\d]+章[^\n]*\n+)+/u, "")
    .trim();
  return stripped;
}

function cleanProse(text, lexicon) {
  return proofText(stripChapterHead(text), lexicon);
}

function applyGenerated(novel, { skill, chapterId, output, mode, focusName }) {
  if (!output) return novel;
  const target = skill.target;
  const next = { ...novel, chapters: (novel.chapters || []).map((c) => ({ ...c })) };

  if (["brief", "world", "characters", "outline", "props"].includes(target)) {
    if (focusName) next[target] = upsertSection(next[target], focusName, output);
    else if (mode === "append") next[target] = [next[target], output].filter(Boolean).join("\n\n");
    else next[target] = output;
    return next;
  }
  if (target === "threads") {
    const incoming = parseThreads(output);
    next.threads = incoming.length ? mergeThreads(next.threads, incoming) : next.threads;
    return next;
  }

  const chapter = next.chapters.find((c) => c.id === chapterId) || next.chapters[0];
  if (!chapter) return next;
  if (target === "beats") {
    const parsed = parseBeatChapters(output);
    if (parsed.length) {
      const merged = mergeBeatChapters(next, parsed);
      return merged;
    }
    const keepOwn = parseBeatChapters(chapter.beats).length === 1 && String(chapter.beats || "").trim();
    if (keepOwn && mode !== "append") return next;
    chapter.beats = mode === "append" ? [chapter.beats, output].filter(Boolean).join("\n\n") : output;
  }
  if (target === "content") {
    const prefix = mode === "append" && chapter.content ? "\n" : "";
    const body = novel.craft?.cleanCopy === false ? stripChapterHead(output) : cleanProse(output, novel.lexicon);
    let nextBody = mode === "append" ? `${chapter.content || ""}${prefix}${body}` : body;
    if (skill.id === "chapter-prose" && mode !== "append") {
      const max = Number(novel.craft?.wordsMax) || 3800;
      nextBody = clipToWordMax(nextBody, max);
    }
    chapter.content = nextBody;
    chapter.wordCount = countWords(chapter.content);
    chapter.updatedAt = new Date().toISOString();
  }
  if (target === "review") {
    chapter.reviewReport = output;
    chapter.reviewVerdict = parseReviewVerdict(output);
    chapter.reviewAt = new Date().toISOString();
  }
  return next;
}

function mergeSavedChapters(stored, incoming) {
  const olds = (Array.isArray(stored) ? stored : []).filter((row) => row && typeof row === "object");
  const next = (Array.isArray(incoming) ? incoming : olds).filter((ch) => ch && typeof ch === "object");
  const map = new Map(olds.map((row) => [row.id, row]));
  return next.map((ch, index) => {
    const old = map.get(ch.id);
    const incomingContent = String(ch.content ?? "");
    const storedContent = String(old?.content ?? "");
    const inAt = Date.parse(ch.updatedAt || 0) || 0;
    const oldAt = Date.parse(old?.updatedAt || 0) || 0;
    let content = incomingContent;
    if (old && storedContent.trim()) {
      if (!incomingContent.trim() && oldAt >= inAt) content = storedContent;
      else if (storedContent.length > incomingContent.length + 80 && oldAt > inAt) content = storedContent;
    }
    return {
      ...(old || {}),
      ...ch,
      content,
      beats: ch.beats != null ? ch.beats : old?.beats || "",
      index: Number(ch.index) > 0 ? Number(ch.index) : Number(old?.index) || index + 1,
    };
  });
}

module.exports = { applyGenerated, upsertSection, cleanProse, mergeSavedChapters };
