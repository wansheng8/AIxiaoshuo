const { textMetrics, HARD_BANS, OVERVIEW_WORDS } = require("./genre");

function clamp01(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function mean(list) {
  if (!list.length) return 0;
  return list.reduce((a, b) => a + b, 0) / list.length;
}

function stdev(list) {
  if (list.length < 2) return 0;
  const m = mean(list);
  const v = list.reduce((s, n) => s + (n - m) * (n - m), 0) / list.length;
  return Math.sqrt(v);
}

function cv(list) {
  const m = mean(list);
  if (m <= 0) return 0;
  return stdev(list) / m;
}

function chars(text) {
  return Array.from(String(text || "").replace(/\s+/g, "")).length;
}

function splitSentences(text) {
  return String(text || "")
    .split(/(?<=[。！？\n])/)
    .map((row) => row.trim())
    .filter((row) => chars(row) >= 4);
}

const ESSAY_MARKERS = [
  "值得注意的是",
  "不可否认",
  "综上所述",
  "总而言之",
  "与此同时",
  "当前主流",
  "主要基于",
  "两大技术路线",
  "在实际检测中",
  "形成成熟应用方案",
  "关键步骤",
  "多维度特征",
  "从某种意义上",
  "不难看出",
  "这意味着",
  "至关重要",
  "在这个过程中",
  "具有重要意义",
  "得到了广泛应用",
  "进行对比训练",
  "准确率可达",
];

const WEB_TELLS = [
  "空气仿佛凝固",
  "倒吸一口凉气",
  "令人窒息",
  "目光深邃",
  "嘴角微微上扬",
  "缓缓开口",
  "突然意识到",
  "心中暗想",
  "眼神复杂",
  "深吸一口气",
  "微微颔首",
  "一抹苦笑",
  "不由得",
  "下意识地",
  "带着一种",
  "在这一刻",
  "眼睛眯了一下",
  "眯了眯眼",
  "眯起眼",
  "勾了勾嘴角",
  "我正问你",
  "你要是不来",
];

function countHits(text, needle) {
  if (!needle) return 0;
  let n = 0;
  let from = 0;
  while (from < text.length) {
    const at = text.indexOf(needle, from);
    if (at < 0) break;
    n += 1;
    from = at + needle.length;
  }
  return n;
}

function ttrScore(text) {
  const runes = Array.from(String(text || "").replace(/\s+/g, ""));
  if (runes.length < 80) return 0;
  const grams = [];
  for (let i = 0; i < runes.length - 1; i += 1) grams.push(runes[i] + runes[i + 1]);
  const ratio = new Set(grams).size / grams.length;
  return clamp01((0.6 - ratio) / 0.28);
}

function sentFlatScore(sents) {
  const lens = sents.map(chars);
  if (lens.length < 6) return 0;
  return clamp01((0.42 - cv(lens)) / 0.3);
}

// 句长锯齿：连续3句接近 + 标准差偏小
function burstScore(metrics, nChars) {
  if (nChars < 200 || metrics.sentences < 6) return 0;
  const flat = metrics.flatRun >= 4 ? 0.9 : metrics.flatRun === 3 ? 0.55 : 0;
  const tiny = clamp01((12 - metrics.std) / 12);
  return clamp01(Math.max(flat, tiny));
}

// 口语骨架词缺失
function oralScore(metrics, nChars) {
  if (nChars < 300) return 0;
  return clamp01((5 - metrics.oralPer500) / 5);
}

// 人类瑕疵缺失（自我修正 / 时间模糊 / 信息遗漏语气）
function flawScore(metrics, nChars) {
  if (nChars < 500) return 0;
  return clamp01((3 - metrics.flawPer1000) / 3);
}

// 硬禁词（文艺通感 / 命运腔）
function hardBanScore(metrics) {
  return clamp01(metrics.hardBans.length / 3);
}

// 总结句 / 后置总结副词（那一眼很快、压得很低、每个字都落得实）
function summaryScore(metrics, nChars) {
  if (nChars < 300) return 0;
  return clamp01(metrics.summaryPer1000 / 3);
}

// 把潜台词说破（我还以为你嫌弃我、觉得说出来更难看）
function subtextScore(metrics, nChars) {
  if (nChars < 300) return 0;
  return clamp01(metrics.subtextPer1000 / 2.5);
}

// AI 对比句式（不是A，也不是B，是C；不再是X，是Y）
function contrastScore(metrics, nChars) {
  if (nChars < 300) return 0;
  return clamp01(metrics.contrastPer1000 / 1.5);
}

function parallelScore(text) {
  let n = 0;
  const heads = (text.match(/^[一二三四五六七八九十]+、/gm) || []).length;
  if (heads >= 2) n += 0.4;
  const numbered = (text.match(/^\s*\d+[\.、．]/gm) || []).length;
  if (numbered >= 3) n += 0.28;
  const chain = (text.match(/首先|其次|再次|最后|综上/g) || []).length;
  if (chain >= 2) n += 0.18;
  if ((text.match(/领域/g) || []).length >= 3) n += 0.14;
  return clamp01(n);
}

function markerScore(text, nChars) {
  let hits = 0;
  for (const mark of ESSAY_MARKERS) hits += countHits(text, mark);
  for (const mark of WEB_TELLS) hits += countHits(text, mark);
  for (const mark of OVERVIEW_WORDS) hits += countHits(text, mark);
  hits += (text.match(/以[^。]{2,18}为例/g) || []).length;
  const perK = (hits / Math.max(nChars, 1)) * 1000;
  return clamp01(perK / 6);
}

function precisionScore(text) {
  const pct = (text.match(/\d+(?:\.\d+)?%\s*(?:以上|以下)?/g) || []).length;
  const share = (text.match(/占比达?\s*\d+/g) || []).length;
  return clamp01((pct + share * 1.2) / 4);
}

function deScore(sents) {
  if (!sents.length) return 0;
  let bad = 0;
  for (const row of sents) {
    const de = (row.match(/的/g) || []).length;
    const n = chars(row) || 1;
    if (de >= 4 || de / n > 0.08) bad += 1;
  }
  return clamp01(bad / sents.length / 0.5);
}

// 对白偏少 / 对白过长 / 对白太规整
function dialogueScore(metrics, text, nChars) {
  if (nChars < 500) return 0;
  const quotes = (text.match(/[“「]/g) || []).length;
  if (quotes === 0 && nChars >= 800) return 0.9;
  let score = 0;
  const expect = nChars / 420;
  if (quotes / expect < 0.25) score = Math.max(score, 0.55);
  if (metrics.dialogueCount >= 3 && metrics.dialogueAvgLen > 12) score = Math.max(score, 0.6);
  if (metrics.dialogueCount >= 3 && !metrics.dialogueIrregular) score = Math.max(score, 0.4);
  if (metrics.dialogueCount >= 2 && metrics.dialoguePer300 < 2) score = Math.max(score, 0.35);
  return clamp01(score);
}

function skeletonKey(sent) {
  return String(sent || "")
    .replace(/[“「][^”」]{0,80}[”」]/g, "Q")
    .replace(/[0-9０-９一二三四五六七八九十百千万]+/g, "D")
    .replace(/[\u4e00-\u9fff]{2,}/g, (word) => {
      if (/^(的|了|着|过|在|是|和|与|但|而|并|把|被|让|从|对|向|给|到|就|才|也|都|还|又|或)$/.test(word)) return word;
      return "N";
    })
    .replace(/N{2,}/g, "N")
    .slice(0, 28);
}

function skeletonScore(sents) {
  if (sents.length < 6) return 0;
  const bag = {};
  for (const row of sents) {
    const key = skeletonKey(row);
    if (key.length < 4) continue;
    bag[key] = (bag[key] || 0) + 1;
  }
  const max = Object.values(bag).reduce((acc, n) => (n > acc ? n : acc), 0);
  return clamp01((max - 2) / Math.max(sents.length * 0.22, 3));
}

function hardBanWords(text) {
  return HARD_BANS.filter((word) => text.includes(word));
}

function detectAigc(text) {
  const source = String(text || "");
  const nChars = chars(source);
  if (nChars < 80) {
    return { rate: 0, level: "low", chars: nChars, reasons: [] };
  }
  const sents = splitSentences(source);
  const metrics = textMetrics(source);
  const hardHits = hardBanWords(source);
  const oralPer500 = metrics.oralPer500;

  const dims = [
    { id: "parallel", label: "结构排比", score: parallelScore(source), note: "一二三列点、首先其次最后" },
    { id: "markers", label: "套话密度", score: markerScore(source, nChars), note: "综上所述、值得注意的是、以某某为例" },
    { id: "hardBan", label: "文艺禁词", score: hardBanScore(metrics), note: hardHits.length ? `命中：${hardHits.join("、")}` : "命运齿轮、时光低语、仿佛、月光" },
    { id: "burst", label: "句长过匀", score: burstScore(metrics, nChars), note: "连续3句长度接近，标准差小于12" },
    { id: "oral", label: "口语偏少", score: oralScore(metrics, nChars), note: `每500字口语骨架词 ${oralPer500} 个，目标 ≥ 5` },
    { id: "skeleton", label: "句式重复", score: skeletonScore(sents), note: "多句同一骨架" },
    { id: "talk", label: "对白问题", score: dialogueScore(metrics, source, nChars), note: "对白偏少、均长超过12字或太规整" },
    { id: "flaw", label: "过于干净", score: flawScore(metrics, nChars), note: "缺自我修正、时间模糊、信息遗漏" },
    { id: "summary", label: "总结句", score: summaryScore(metrics, nChars), note: "动作后补形容词总结，如「那一眼很快」「压得很低」" },
    { id: "subtext", label: "说破潜台词", score: subtextScore(metrics, nChars), note: "把心理直说出来，如「我还以为你嫌弃我」" },
    { id: "contrast", label: "对比句式", score: contrastScore(metrics, nChars), note: "不是A，也不是B，是C；不再是X，是Y" },
    { id: "sentFlat", label: "用词节奏", score: sentFlatScore(sents), note: "句子长短几乎一样" },
    { id: "ttr", label: "用词偏贫", score: ttrScore(source), note: "二字搭配重复偏高" },
    { id: "de", label: "的字偏多", score: deScore(sents), note: "一句里堆了好几个「的」" },
    { id: "precision", label: "假精确数字", score: precisionScore(source), note: "85%、占比达37% 这类报告腔" },
  ];
  const weights = {
    parallel: 0.12,
    markers: 0.10,
    hardBan: 0.07,
    burst: 0.10,
    oral: 0.09,
    skeleton: 0.07,
    talk: 0.06,
    flaw: 0.06,
    summary: 0.06,
    subtext: 0.06,
    contrast: 0.05,
    sentFlat: 0.04,
    ttr: 0.04,
    de: 0.04,
    precision: 0.04,
  };
  let mixed = dims.reduce((sum, row) => sum + row.score * (weights[row.id] || 0), 0);
  const humanBonus =
    clamp01(metrics.gesturePer1000 / 6) * 0.05 + clamp01(metrics.exactPer1000 / 4) * 0.04;
  mixed = clamp01(mixed - humanBonus);
  const by = Object.fromEntries(dims.map((row) => [row.id, row.score]));
  const report = (by.parallel || 0) * 0.4 + (by.markers || 0) * 0.4 + (by.precision || 0) * 0.2;
  if (report >= 0.55) mixed = Math.max(mixed, 0.52 + report * 0.42);
  if ((by.markers || 0) >= 0.75) mixed = Math.max(mixed, 0.38 + (by.markers || 0) * 0.4);
  if ((by.hardBan || 0) >= 0.6) mixed = Math.max(mixed, 0.4 + (by.hardBan || 0) * 0.4);
  const rate = Math.round(clamp01(mixed) * 100);
  const level = rate >= 70 ? "high" : rate >= 40 ? "mid" : "low";
  const reasons = dims
    .filter((row) => row.score >= 0.35)
    .sort((a, b) => b.score - a.score)
    .map((row) => ({
      id: row.id,
      label: row.label,
      score: Math.round(row.score * 100),
      note: row.note,
    }));
  return { rate, level, chars: nChars, reasons };
}

module.exports = { detectAigc };
