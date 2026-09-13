function cnToInt(raw) {
  const s = String(raw || "")
    .replace(/\s+/g, "")
    .replace(/[０-９]/g, (ch) => String(ch.charCodeAt(0) - 0xff10));
  if (!s) return 0;
  if (/^\d+$/.test(s)) return Number(s);
  const d = {
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

function stripChapterPrefix(name) {
  return String(name || "")
    .replace(/^第\s*[零一二三四五六七八九十百千两０-９\d]+\s*章(?:\s*[·•、.:：\-—]\s*|\s+)?/, "")
    .trim();
}

function parseBeatChapters(md) {
  const blocks = String(md || "")
    .split(/(?=^#{2,3}\s*第)/m)
    .map((block) => block.trim())
    .filter(Boolean);
  const found = [];
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

function catalogBeats(novel) {
  const map = new Map();
  for (const row of novel.chapters || []) {
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

function maxBeatIndex(novel) {
  return catalogBeats(novel).reduce((max, item) => Math.max(max, item.index), 0);
}

function emptyChapter(index, item) {
  return {
    id: `ch_${Date.now().toString(36)}_${index}`,
    index,
    title: (item && item.title) || "",
    beats: (item && item.beats) || "",
    content: "",
    wordCount: 0,
    updatedAt: new Date().toISOString(),
  };
}

function retitleBeat(beats, index, title) {
  const name = String(title || "").trim();
  const head = `### 第${index}章${name ? ` ${name}` : ""}`;
  const text = String(beats || "");
  if (/^#{2,3}\s*第/.test(text)) {
    return text.replace(/^#{2,3}\s*第\s*[零一二三四五六七八九十百千两０-９\d]+\s*章[^\n]*/, head);
  }
  return `${head}\n${text}`.trim();
}

function remapIncomingBeats(novel, items) {
  const incoming = (items || []).filter((item) => item && item.index > 0);
  if (!incoming.length) return incoming;
  const maxIdx = maxBeatIndex(novel);
  if (maxIdx <= 0) return incoming;
  const minIn = Math.min(...incoming.map((item) => item.index));
  const maxIn = Math.max(...incoming.map((item) => item.index));
  if (maxIn > maxIdx) return incoming;
  const offset = maxIdx + 1 - minIn;
  return incoming.map((item) => {
    const index = item.index + offset;
    return {
      ...item,
      index,
      beats: retitleBeat(item.beats, index, item.title),
    };
  });
}

function mergeBeatChapters(novel, items) {
  const incoming = remapIncomingBeats(novel, items);
  if (!incoming.length) return novel;
  const next = { ...novel, chapters: (novel.chapters || []).map((c) => ({ ...c })) };
  const used = new Set();
  for (const item of incoming) {
    let ch = next.chapters.find((c) => !used.has(c.id) && c.index === item.index);
    if (!ch) {
      ch = emptyChapter(item.index, item);
      next.chapters.push(ch);
      used.add(ch.id);
      continue;
    }
    used.add(ch.id);
    const parsed = parseBeatChapters(ch.beats);
    const bundle = parsed.length > 1;
    const empty = !String(ch.beats || "").trim();
    if (empty || bundle) ch.beats = item.beats;
    if (!ch.title && item.title) ch.title = item.title;
  }
  next.chapters.forEach((ch) => {
    if (used.has(ch.id)) return;
    const parsed = parseBeatChapters(ch.beats);
    if (parsed.length > 1) {
      const own = parsed.find((item) => item.index === ch.index);
      ch.beats = own ? own.beats : String(ch.content || "").trim() ? "" : ch.beats;
      if (own && !ch.title) ch.title = own.title;
    }
  });
  next.chapters = next.chapters
    .filter((ch) => used.has(ch.id) || String(ch.content || "").trim() || String(ch.beats || "").trim())
    .sort((a, b) => (Number(a.index) || 0) - (Number(b.index) || 0));
  return next;
}

module.exports = {
  parseBeatChapters,
  catalogBeats,
  maxBeatIndex,
  mergeBeatChapters,
};
