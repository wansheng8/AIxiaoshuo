const fs = require("fs");
const path = require("path");
const { ROOT, uid, now } = require("./store");
const { listSkills } = require("./skills");
const { atomicWriteJson } = require("./fileio");
const { migrate, stamp: schemaStamp } = require("./schema");

const VOICE_FILE = path.join(ROOT, "data", "voice.json");
const MAX_SAMPLES = 60;
const MIN_SAMPLE_CHARS = 500;
const MAX_SAMPLE_CHARS = 100000;
const SAMPLE_PROMPT_CHARS = 20000;
const TOTAL_PROMPT_CHARS = 100000;
const EXCERPT_PER_CHARS = 1200;
const EXCERPT_TOTAL_CHARS = 3600;
const EXCERPT_PICK = 5;
const NOVEL_MIN_CHAPTER = 120;
const NOVEL_CHAPTERS = 30;

const VOICE_SKILLS = new Set([
  "kickoff",
  "world",
  "characters",
  "outline",
  "chapter-beats",
  "chapter-prose",
  "continue",
  "polish",
  "props",
]);

const EMPTY = {
  enabled: true,
  samples: [],
  body: "",
  summary: "",
  revisions: [],
  builtAt: "",
  updatedAt: "",
};

function countChars(text) {
  return Array.from(String(text || "").replace(/\s+/g, "")).length;
}

function clipText(text, max) {
  const value = String(text || "").trim();
  if (value.length <= max) return value;
  return `${value.slice(0, max)}\n…（已截断）`;
}

function clipSpread(text, max) {
  const raw = String(text || "").trim();
  if (!raw || raw.length <= max || countChars(raw) <= max) return raw;
  const head = raw.slice(0, Math.floor(max * 0.5));
  const midStart = Math.max(0, Math.floor(raw.length / 2 - (max * 0.125)));
  const mid = raw.slice(midStart, midStart + Math.floor(max * 0.25));
  const tail = raw.slice(-Math.floor(max * 0.25));
  return `${head}\n…（略去中段）…\n${mid}\n…（略去中段）…\n${tail}`;
}

function spreadPick(list, count) {
  const src = Array.isArray(list) ? list : [];
  const n = Math.min(Math.max(1, count), src.length);
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const idx = n === 1 ? 0 : Math.round((i * (src.length - 1)) / (n - 1));
    out.push(src[idx]);
  }
  return out;
}

function normalizeSample(row) {
  const text = String(row?.text || "").trim();
  if (!text) return null;
  const clipped = countChars(text) > MAX_SAMPLE_CHARS ? Array.from(text).slice(0, MAX_SAMPLE_CHARS).join("") : text;
  return {
    id: String(row.id || uid("vs")),
    title: String(row.title || "未命名样本").trim().slice(0, 60),
    text: clipped,
    chars: countChars(clipped),
    createdAt: row.createdAt || now(),
  };
}

function normalizeVoice(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  return {
    enabled: src.enabled !== false,
    samples: (Array.isArray(src.samples) ? src.samples : [])
      .map(normalizeSample)
      .filter(Boolean)
      .slice(0, MAX_SAMPLES),
    body: String(src.body || ""),
    summary: String(src.summary || ""),
    revisions: (Array.isArray(src.revisions) ? src.revisions : []).slice(-20),
    builtAt: src.builtAt || (src.body ? src.updatedAt || "" : ""),
    updatedAt: src.updatedAt || "",
  };
}

function getVoice() {
  try {
    if (!fs.existsSync(VOICE_FILE)) return { ...EMPTY };
    const { doc } = migrate("voice", JSON.parse(fs.readFileSync(VOICE_FILE, "utf8")));
    return normalizeVoice(doc);
  } catch {
    return { ...EMPTY };
  }
}

function saveVoice(patch) {
  const current = getVoice();
  const next = normalizeVoice({ ...current, ...(patch || {}) });
  const stamp = now();
  if (patch && Object.prototype.hasOwnProperty.call(patch, "body")) next.builtAt = stamp;
  next.updatedAt = stamp;
  atomicWriteJson(VOICE_FILE, schemaStamp("voice", next), { backup: true, keep: 10 });
  return next;
}

function sampleRoom(count) {
  return Math.max(400, Math.min(SAMPLE_PROMPT_CHARS, Math.floor(TOTAL_PROMPT_CHARS / Math.max(1, count))));
}

function promptChars(samples) {
  const list = samples || [];
  const per = sampleRoom(list.length);
  let total = 0;
  for (const sample of list) {
    total += Math.min(countChars(sample.text), per);
    if (total >= TOTAL_PROMPT_CHARS) return TOTAL_PROMPT_CHARS;
  }
  return total;
}

const VOICE_ORDER = [
  "kickoff",
  "world",
  "characters",
  "outline",
  "chapter-beats",
  "chapter-prose",
  "continue",
  "polish",
  "props",
];

function voiceTargets() {
  const map = new Map(listSkills().map((skill) => [skill.id, skill]));
  return VOICE_ORDER.filter((id) => VOICE_SKILLS.has(id))
    .map((id) => map.get(id))
    .filter((skill) => skill && skill.enabled !== false)
    .map((skill) => skill.name);
}

function publicVoice(voice) {
  const src = voice || getVoice();
  const stale = src.samples.some((sample) => !src.builtAt || sample.createdAt > src.builtAt);
  return {
    enabled: src.enabled,
    summary: src.summary,
    body: src.body,
    updatedAt: src.updatedAt,
    builtAt: src.builtAt,
    stale,
    revisions: src.revisions,
    limit: MAX_SAMPLES,
    minChars: MIN_SAMPLE_CHARS,
    promptChars: promptChars(src.samples),
    promptBudget: TOTAL_PROMPT_CHARS,
    targets: voiceTargets(),
    samples: src.samples.map((sample) => ({
      id: sample.id,
      title: sample.title,
      chars: sample.chars,
      createdAt: sample.createdAt,
      excerpt: sample.text,
    })),
  };
}

function addSamples(input) {
  const current = getVoice();
  const incoming = Array.isArray(input?.samples) ? input.samples : [input];
  const added = [];
  for (const row of incoming) {
    const text = String(row?.text || "").trim();
    if (!text) continue;
    if (countChars(text) < MIN_SAMPLE_CHARS) {
      const error = new Error(`样本太短，至少 ${MIN_SAMPLE_CHARS} 字`);
      error.status = 400;
      throw error;
    }
    added.push(normalizeSample(row));
  }
  if (!added.length) {
    const error = new Error("没有可用的样本");
    error.status = 400;
    throw error;
  }
  const room = MAX_SAMPLES - current.samples.length;
  if (room <= 0) {
    const error = new Error(`最多收 ${MAX_SAMPLES} 篇样本，先删一篇`);
    error.status = 400;
    throw error;
  }
  if (added.length > room) {
    const error = new Error(`最多收 ${MAX_SAMPLES} 篇样本，当前还能加 ${room} 篇，请减少后再提交`);
    error.status = 400;
    throw error;
  }
  const next = [...current.samples, ...added];
  return saveVoice({ samples: next });
}

function removeSample(id) {
  const current = getVoice();
  const key = String(id || "");
  const next = current.samples.filter((sample) => sample.id !== key);
  return saveVoice({ samples: next });
}

function clearSamples() {
  return saveVoice({ samples: [] });
}

const CN_DIGITS = { 零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
const CN_UNITS = { 十: 10, 百: 100, 千: 1000, 万: 10000 };

function cnToInt(raw) {
  const digits = String(raw || "").replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 65248));
  if (/^\d+$/.test(digits)) return parseInt(digits, 10);
  let total = 0;
  let section = 0;
  let num = 0;
  for (const ch of digits) {
    if (ch in CN_DIGITS) {
      num = CN_DIGITS[ch];
    } else if (ch in CN_UNITS) {
      const unit = CN_UNITS[ch];
      if (unit === 10000) {
        section = (section + num) * unit;
        total += section;
        section = 0;
        num = 0;
      } else {
        section += (num || 1) * unit;
        num = 0;
      }
    }
  }
  return total + section + num;
}

function parseChapters(text) {
  const lines = String(text || "").split(/\r?\n/);
  const marks = [];
  lines.forEach((line, i) => {
    const t = line.trim();
    if (!t || t.length > 50) return;
    let m = t.match(/^第\s*([0-9０-９]+|[零〇一二两三四五六七八九十百千万]+)\s*[章节回]/);
    if (!m) m = t.match(/^chapter\s+([0-9]+)/i);
    if (!m) return;
    const index = cnToInt(m[1]);
    if (!index) return;
    marks.push({ index, title: t.slice(0, 60), line: i });
  });
  const chapters = [];
  for (let k = 0; k < marks.length; k += 1) {
    const start = marks[k].line;
    const end = k + 1 < marks.length ? marks[k + 1].line : lines.length;
    chapters.push({
      index: marks[k].index,
      title: marks[k].title,
      body: lines.slice(start + 1, end).join("\n").trim(),
    });
  }
  return chapters;
}

function addNovel(input) {
  const title = String(input?.title || "").trim();
  const text = String(input?.text || "");
  const from = Math.max(1, Number(input?.from) || 1);
  const to = Math.max(from, Number(input?.to) || NOVEL_CHAPTERS);
  const current = getVoice();
  const room = MAX_SAMPLES - current.samples.length;
  if (room <= 0) {
    const error = new Error(`最多收 ${MAX_SAMPLES} 篇样本，先删几篇再导入`);
    error.status = 400;
    throw error;
  }
  const chapters = parseChapters(text);
  if (chapters.length < 2) {
    const piece = clipSpread(text.trim(), MAX_SAMPLE_CHARS);
    if (countChars(piece) < MIN_SAMPLE_CHARS) {
      const error = new Error("没解析出足够的正文，换一本，或把章节范围调大试试");
      error.status = 400;
      throw error;
    }
    const sample = normalizeSample({ title: title || "整本", text: piece });
    const next = saveVoice({ samples: [...current.samples, sample] });
    return { voice: publicVoice(next), total: chapters.length, used: 1, chars: sample.chars };
  }
  let picked = chapters.filter((ch) => ch.index >= from && ch.index <= to);
  if (!picked.length) picked = chapters.slice(0, Math.max(1, to - from + 1));
  const samples = [];
  let totalChars = 0;
  for (const ch of picked) {
    if (samples.length >= room) break;
    const piece = String(ch.body || "").trim();
    if (countChars(piece) < NOVEL_MIN_CHAPTER) continue;
    const label = `${title || "小说"} · ${ch.title}`.slice(0, 60);
    const sample = normalizeSample({ title: label, text: piece });
    samples.push(sample);
    totalChars += sample.chars;
  }
  if (!samples.length) {
    const error = new Error("没解析出足够的章节正文，换一本，或把章节范围调大试试");
    error.status = 400;
    throw error;
  }
  const next = saveVoice({ samples: [...current.samples, ...samples] });
  return { voice: publicVoice(next), total: chapters.length, used: samples.length, chars: totalChars };
}

function exportVoice() {
  const voice = getVoice();
  return {
    version: 1,
    exportedAt: now(),
    enabled: voice.enabled,
    body: String(voice.body || ""),
    samples: voice.samples.map((sample) => ({ title: sample.title, text: sample.text })),
  };
}

function importVoice(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const patch = {};
  const current = getVoice();
  if (Object.prototype.hasOwnProperty.call(src, "body")) {
    patch.body = String(src.body || "");
  }
  if (typeof src.enabled === "boolean") {
    patch.enabled = src.enabled;
  }
  if (Array.isArray(src.samples) && src.samples.length) {
    const existing = new Set(current.samples.map((sample) => sample.text));
    const merged = [...current.samples];
    for (const row of src.samples) {
      const text = String(row?.text || "").trim();
      if (!text || existing.has(text)) continue;
      if (countChars(text) < MIN_SAMPLE_CHARS) continue;
      if (merged.length >= MAX_SAMPLES) break;
      existing.add(text);
      merged.push(normalizeSample({ title: row.title, text }));
    }
    patch.samples = merged;
  }
  if (!Object.keys(patch).length) {
    const error = new Error("没有可导入的内容");
    error.status = 400;
    throw error;
  }
  return saveVoice(patch);
}

function clearVoiceBody() {
  return saveVoice({ body: "" });
}

function voiceAuthorMessages(samples) {
  const list = Array.isArray(samples) ? samples : [];
  const per = sampleRoom(list.length);
  let budget = TOTAL_PROMPT_CHARS;
  const parts = [];
  list.forEach((sample, index) => {
    if (budget <= 0) return;
    const room = Math.max(0, Math.min(per, budget));
    const piece = clipSpread(sample.text, room);
    budget -= countChars(piece);
    parts.push(`【样本${index + 1}：${sample.title}】\n${piece}`);
  });
  return [
    {
      role: "system",
      content: `你是「余香」文风建模器。作者会给你几篇他自己写的原文。你的任务是从原文里逆向出这位作者独有的写作习惯，写成一份可执行的个人文风说明书（写作风格 Skill），供后续 AI 代笔时当底味。

只输出 Markdown 正文，不要代码围栏，不要解释，不要「以下是」。必须包含四节，标题逐字如下：

## 角色与读者
用两三句写清：作者是谁、写给谁看、口吻像什么。要能指导落笔，不写抽象人设。

## 风格要点
三到五条作者最稳定的写法。每条都必须带一正一反两个短例：正例从作者原文里摘（可轻微压缩，必须保留原词和断句），反例是按 AI 平均腔调改坏的版本。只写能从原文看出来的偏好，原文没体现的不要编。

## 禁止清单
这位作者不会用的写法。逐条写清禁什么、换成什么或直接删。只列有原文依据的，不要套通用去 AI 清单。

## 参考资料
术语习惯、标点习惯、常用口头词、句长区间、称呼方式等可对照的细节。

萃取时盯住这些可测维度：句长（长句多还是短句成簇）、段长、标点（逗号密度、破折号、省略号）、口头禅与高频词、人称与称呼、比喻密度与比喻来源、对白占比、叙事距离、开头和结尾的习惯。用作者原话当证据。原文怎么用，就照实写成偏好，不要拿通用去 AI 标准去否定作者本人的习惯。全文简体中文。`,
    },
    { role: "user", content: `作者的原文如下：\n\n${parts.join("\n\n")}` },
  ];
}

function voiceReviseMessages(before, after, currentBody) {
  return [
    {
      role: "system",
      content: `你是「余香」文风迭代器。作者会给你两段：AI 代笔的原文，以及作者亲手改过的版本。你要从两者的差异里找出作者的口味规律，再把规律合并进现有的文风说明书。

只输出更新后的完整 Markdown 说明书正文，不要代码围栏，不要解释，不要逐行 diff。保留原有四节：## 角色与读者 / ## 风格要点 / ## 禁止清单 / ## 参考资料。
在风格要点和禁止清单里补充这次新发现的规则。每条新规则必须能指出它在哪处改动里体现：改了什么词、为什么、规律是什么。宁可少写几条具体的，也不要写「更自然」「更有节奏」这种空话。已有规则不要删，除非被这次改动推翻。全文简体中文。`,
    },
    {
      role: "user",
      content: `现有文风说明书：\n\n${currentBody || "（空）"}\n\n---\n\nAI 原文：\n${clipText(before, 6000)}\n\n---\n\n作者改后的版本：\n${clipText(after, 6000)}`,
    },
  ];
}

function parseVoiceDraft(text) {
  const body = String(text || "")
    .replace(/^```[a-z]*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim();
  if (!body) {
    const error = new Error("模型没有返回文风说明书");
    error.status = 502;
    throw error;
  }
  return body;
}

function voiceExcerptBlock() {
  const voice = getVoice();
  const samples = voice.samples || [];
  let budget = EXCERPT_TOTAL_CHARS;
  const parts = [];
  spreadPick(samples, EXCERPT_PICK).forEach((sample, index) => {
    if (budget <= 400) return;
    const room = Math.max(0, Math.min(EXCERPT_PER_CHARS, budget));
    const piece = clipSpread(sample.text, room);
    if (!piece.trim()) return;
    budget -= countChars(piece);
    parts.push(`【临摹样本 ${index + 1}｜${sample.title}】\n${piece}`);
  });
  if (!parts.length) return "";
  return `## 作者原文（临摹用，最重要）
下面是作者本人写的段落。写稿时贴着这些段落的语感、句长、标点密度、用词和断句走。只借写法，不要复述它们的内容，也不要把它们改写成剧情。

${parts.join("\n\n")}`;
}

function voiceBlock() {
  const voice = getVoice();
  if (!voice.enabled) return "";
  const body = String(voice.body || "").trim();
  if (!body) return "";
  const excerpts = voiceExcerptBlock();
  return `# 个人文风·作者底味（最高优先，压过一切通用文风规则）
这份文风来自作者本人的文字，是作者独有的写法。它优先于本提示词里所有关于文风、标点、段落长度、比喻、用词、节奏、去AI味的通用规则：通用规则和它冲突的地方，一律作废，只按这份来。平台只保留最低阅读格式（中文全角标点，系统输出用【】）。

落笔前先在心里过一遍这几条：
- 句式、句长、标点密度照作者，不套平台平均腔。
- 作者用明喻（像／仿佛／宛如／好似／如同／似的）就用，不因通用禁令删掉。
- 段落怎么切、口头词、称呼、人称，照作者。
- 说明书里的结构、剧情、篇幅、输出格式要求照做；凡涉及「怎么下笔」的文风要求，都让位于这份底味。
- 写完默读一遍：像不像作者亲手写的？读出 AI 平均腔就按下面的原文重写，直到像为止。

## 文风说明书
${body}

${excerpts}`.trim();
}

function isVoiceActive() {
  const voice = getVoice();
  return Boolean(voice.enabled && String(voice.body || "").trim());
}

function voicePreviewMessages(prompt) {
  const ask = String(prompt || "").trim() || "随便写一段一百来字的叙事，让我看看你的文风。";
  return [
    {
      role: "system",
      content: `你在替作者试笔。严格遵守下面这份个人文风说明书，写一小段简体中文，直接给正文，不要标题，不要解释，不要复述说明书。\n\n${voiceBlock()}`,
    },
    { role: "user", content: ask },
  ];
}

module.exports = {
  VOICE_SKILLS,
  getVoice,
  saveVoice,
  publicVoice,
  addSamples,
  removeSample,
  clearSamples,
  parseChapters,
  addNovel,
  exportVoice,
  importVoice,
  clearVoiceBody,
  voiceAuthorMessages,
  voiceReviseMessages,
  parseVoiceDraft,
  voiceBlock,
  voicePreviewMessages,
  isVoiceActive,
  countChars,
};
