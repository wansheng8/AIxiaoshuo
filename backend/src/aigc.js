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

// 机制说明句：旁白跳出来讲设定/原理，而不是让读者从场面里看出来
const MECH_TELLS = [
  "也就是说",
  "换句话说",
  "换言之",
  "说白了",
  "原因很简单",
  "究其原因",
  "之所以",
  "本质上是",
  "从本质上",
  "原理是",
  "运行机制",
  "核心机制",
  "换算下来",
  "折算下来",
  "可以理解为",
  "具体来说",
  "关键在于",
  "按照设定",
  "第一次感觉",
  "第一次意识到",
  "这才明白",
  "他明白了",
  "她明白了",
  "这意味着",
];

// 机械伏笔：旁白预告后文，把「将来会有用」直接说破
const FORESHADOW_TELLS = [
  "殊不知",
  "多年以后",
  "日后",
  "终有一天",
  "冥冥之中",
  "埋下伏笔",
  "命运的种子",
  "而这只是开始",
  "而这，只是开始",
  "这一次的",
  "将会成为",
  "注定会",
  "他此刻还不知道",
  "她此刻还不知道",
  "此时的他不知道",
];

// 全知视角滑移：锁定的视角人物之外，旁白钻进别人脑子
const POV_TELLS = [
  "他不知道的是",
  "她不知道的是",
  "他们不知道的是",
  "却不知道",
  "并不知道",
  "浑然不觉",
  "全然不知",
  "在旁人眼里",
  "所有人都不知道",
  "谁也没想到",
];

// 爽点因果过拟合：结果后面补一段「正因为……才……」的解释
const CAUSAL_TELLS = [
  /正因为[^。！？\n]{1,24}[，,][^。！？\n]{0,24}(?:才|所以|便|就|终于)/g,
  /正是因为[^。！？\n]{1,24}[，,]/g,
  /这一切(?:都)?是因为/g,
  /也正因如此/g,
  /这(?:也)?(?:正)?是[^。！？\n]{1,20}的原因/g,
  /(?:因此|于是|所以)[^。！？\n]{0,6}(?:他|她|我|众人|所有人)(?:才|便|就|终于|立刻|马上)/g,
  /(?:这|那)(?:一下|一击|一句|一声|一次)[^。！？\n]{0,10}(?:彻底|直接|当场)(?:改变|扭转|奠定|决定)/g,
  /就在[^。！？\n]{0,20}(?:瞬间|瞬时|刹那|一瞬)[^。！？\n]{0,10}[，,]/g,
  /(?:像|如同|仿佛)一(?:根|条|道|把|扇)?(?:引线|开关|钥匙|信号|起点)/g,
  /(?:第一次|头一回)(?:感觉|意识到|明白|察觉)[^。！？\n]{0,20}(?:像|就是|正是|原来)/g,
];

// 信息倾倒：定义 / 分级 / 顿号罗列设定，一段塞太多新设定
const EXPO_TELLS = [
  "所谓",
  "指的是",
  "统称为",
  "划分为",
  "分别是",
  "从低到高",
  "由低到高",
  "共分为",
  "共分",
  "即分为",
];
const EXPO_DENSE = [/(?:[^。！？\n、]{2,}、){3,}[^。！？\n、]{2,}/g];

// 对白说明化：用对白交代背景 / 摆资历，而不是人物在争利益
const DIALOGUE_EXPO_TELLS = [
  "十年了",
  "当年",
  "从小",
  "一直以来",
  "从今往后",
  "记住",
  "我告诉你",
  "你要知道",
  "废物就是废物",
];

// 动作道具功能化：无后果动作 + 关键道具主动「露」出来当钩子
const PROP_TELLS = [
  /(?:指缝|口袋|袖口|怀里|衣角|门缝|缝隙|角落|袖中|怀中|领口)(?:里|中|间)?(?:露出|掉出|滑出|探出|透出|藏着|躺着)/g,
  /(?:搓|捏|攥|捻|揉)(?:了)?(?:三|两|一|几)?下[^。！？\n]{0,10}(?:发烫|发白|发红|出汗|发抖|发麻)/g,
  /手指(?:关节)?(?:因为用力)?(?:发白|泛白)/g,
];

// 情绪直陈：把羞耻 / 愤怒 / 心疼直接报出来，而不是演出来
const EMOTION_TELLS = [
  "第一次感觉",
  "第一次意识到",
  "感到一阵",
  "感到一股",
  "心中一",
  "心里一阵",
  "心中升起",
  "涌上心头",
  "说不出的",
  "莫名的",
  "说不清",
];

function quotedSpans(text) {
  const spans = [];
  const re = /[「『“"][^」』”"]{0,400}[」』”"]/g;
  let match;
  while ((match = re.exec(text))) spans.push([match.index, match.index + match[0].length]);
  return spans;
}

function inSpans(index, spans) {
  return spans.some(([from, to]) => index >= from && index < to);
}

function findStringHits(text, words, dim, reason, suggest) {
  const out = [];
  for (const word of words) {
    let from = 0;
    while (from < text.length) {
      const at = text.indexOf(word, from);
      if (at < 0) break;
      out.push({ dim, start: at, end: at + word.length, reason, suggest });
      from = at + word.length;
    }
  }
  return out;
}

function findRegexHits(text, list, dim, reason, suggest) {
  const out = [];
  for (const re of list) {
    const global = re.global ? re : new RegExp(re.source, `${re.flags}g`);
    global.lastIndex = 0;
    let match;
    while ((match = global.exec(text))) {
      if (!match[0]) {
        global.lastIndex += 1;
        continue;
      }
      out.push({ dim, start: match.index, end: match.index + match[0].length, reason, suggest });
      if (global.lastIndex === match.index) global.lastIndex += 1;
    }
  }
  return out;
}

// 对白说明化：命中的是引号里的台词，单独扫，不能当对白区跳过
function dialogueExpoHits(text) {
  const out = [];
  for (const [from, to] of quotedSpans(text)) {
    const seg = text.slice(from, to);
    for (const hit of findStringHits(seg, DIALOGUE_EXPO_TELLS, "dialogueExpo", "对白说明化", "对白带利益或恐惧，或改成绕话、半截话")) {
      out.push({ ...hit, start: hit.start + from, end: hit.end + from });
    }
  }
  return out;
}

function dedupeHits(list) {
  const sorted = list.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start));
  const kept = [];
  for (const hit of sorted) {
    if (kept.some((row) => hit.start >= row.start && hit.end <= row.end)) continue;
    kept.push(hit);
  }
  return kept;
}

// 叙事级 AI 味命中（带字符位置）；旁白区与对白说明化都收，其余不扫对白
function aigcNarrativeHits(text) {
  const source = String(text || "");
  const spans = quotedSpans(source);
  const nonDialogue = [
    ...findStringHits(source, MECH_TELLS, "mech", "机制说明句", "设定拆进动作、代价或对白，别在旁白讲原理"),
    ...findStringHits(source, FORESHADOW_TELLS, "foreshadow", "机械伏笔", "伏笔只留物件或半句话，删掉旁白预告"),
    ...findStringHits(source, POV_TELLS, "pov", "视角滑移", "锁回本章视角人物，删掉写别人心里怎么想"),
    ...findRegexHits(source, CAUSAL_TELLS, "causal", "爽点因果过拟合", "结果先落地，别补「正因为……才……」的解释"),
    ...findStringHits(source, EXPO_TELLS, "infoDump", "信息倾倒", "一次只引入一个设定，别用顿号罗列设定词"),
    ...findRegexHits(source, EXPO_DENSE, "infoDump", "信息倾倒", "一次只引入一个设定，别用顿号罗列设定词"),
    ...findRegexHits(source, PROP_TELLS, "propTell", "动作道具功能化", "动作要带阻碍或后果，道具不当钩子"),
    ...findStringHits(source, EMOTION_TELLS, "emotionTell", "情绪直陈", "用身体反应、停顿和选择演出来，别直说情绪"),
  ].filter((hit) => !inSpans(hit.start, spans));
  return dedupeHits([...nonDialogue, ...dialogueExpoHits(source)]);
}

function densityScore(list, nChars, perKTarget, minChars = 300) {
  if (nChars < minChars) return 0;
  return clamp01((list.length / Math.max(nChars, 1) * 1000) / perKTarget);
}

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

// 相邻句长落差：人类句长忽长忽短，AI 落差小
function roughScore(sents) {
  const lens = sents.map(chars);
  if (lens.length < 6) return 0;
  let delta = 0;
  for (let i = 1; i < lens.length; i += 1) delta += Math.abs(lens[i] - lens[i - 1]);
  const rc = delta / (lens.length - 1) / (mean(lens) || 1);
  return clamp01((0.62 - rc) / 0.4);
}

// 段长过匀：AI 爱把每段修成差不多长
function paraUniformScore(text) {
  const paras = String(text || "")
    .split(/\n+/)
    .map((row) => row.trim())
    .filter((row) => chars(row) >= 10);
  if (paras.length < 5) return 0;
  const lens = paras.map(chars);
  const m = mean(lens);
  const c = m > 0 ? stdev(lens) / m : 0;
  return clamp01((0.6 - c) / 0.42);
}

// 短句成串：连续 4 句以上都在 12 字内，节奏像节拍器
function staccatoScore(sents) {
  const lens = sents.map(chars);
  let best = 0;
  let run = 0;
  for (const n of lens) {
    if (n <= 12) {
      run += 1;
      best = Math.max(best, run);
    } else {
      run = 0;
    }
  }
  if (best >= 6) return 0.85;
  if (best === 5) return 0.6;
  if (best === 4) return 0.4;
  return 0;
}

// 句长锯齿：连续3句接近 + 标准差偏小 + 相邻落差小 + 段长过匀 + 短句成串
function burstScore(metrics, nChars, sents, text) {
  if (nChars < 200 || metrics.sentences < 6) return 0;
  const flat = metrics.flatRun >= 4 ? 0.9 : metrics.flatRun === 3 ? 0.55 : 0;
  const tiny = clamp01((12 - metrics.std) / 12);
  const rough = roughScore(sents) * 0.95;
  const para = paraUniformScore(text) * 0.8;
  const staccato = staccatoScore(sents);
  return clamp01(Math.max(flat, tiny, rough, para, staccato));
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
  const nar = aigcNarrativeHits(source);
  const narBy = { mech: [], foreshadow: [], causal: [], pov: [], infoDump: [], dialogueExpo: [], propTell: [], emotionTell: [] };
  for (const hit of nar) narBy[hit.dim].push(hit);
  const narNote = (list, tail) => (list.length ? `命中 ${list.length} 处，${tail}` : tail);

  const dims = [
    { id: "parallel", label: "结构排比", score: parallelScore(source), note: "一二三列点、首先其次最后" },
    { id: "markers", label: "套话密度", score: markerScore(source, nChars), note: "综上所述、值得注意的是、以某某为例" },
    { id: "hardBan", label: "文艺禁词", score: hardBanScore(metrics), note: hardHits.length ? `命中：${hardHits.join("、")}` : "命运齿轮、时光低语、仿佛、月光" },
    { id: "burst", label: "句长过匀", score: burstScore(metrics, nChars, sents, source), note: "连续3句接近、相邻句长落差小或段长过匀" },
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
    { id: "mech", label: "机制说明句", count: narBy.mech.length, score: densityScore(narBy.mech, nChars, 3), note: narNote(narBy.mech, "旁白跳出来讲设定原理") },
    { id: "foreshadow", label: "机械伏笔", count: narBy.foreshadow.length, score: densityScore(narBy.foreshadow, nChars, 2.5), note: narNote(narBy.foreshadow, "旁白预告后文，把将来会有用说破") },
    { id: "causal", label: "因果过拟合", count: narBy.causal.length, score: densityScore(narBy.causal, nChars, 3), note: narNote(narBy.causal, "爽点后补「正因为……才……」的解释") },
    { id: "pov", label: "视角滑移", count: narBy.pov.length, score: densityScore(narBy.pov, nChars, 3), note: narNote(narBy.pov, "旁白钻进非视角人物的脑子") },
    { id: "infoDump", label: "信息倾倒", count: narBy.infoDump.length, score: densityScore(narBy.infoDump, nChars, 2.5), note: narNote(narBy.infoDump, "定义腔、分数罗列或顿号堆设定词") },
    { id: "dialogueExpo", label: "对白说明化", count: narBy.dialogueExpo.length, score: densityScore(narBy.dialogueExpo, nChars, 2), note: narNote(narBy.dialogueExpo, "用对白交代背景或摆资历，不争利益") },
    { id: "propTell", label: "动作道具功能化", count: narBy.propTell.length, score: densityScore(narBy.propTell, nChars, 2), note: narNote(narBy.propTell, "无后果动作，或关键道具主动露出来当钩子") },
    { id: "emotionTell", label: "情绪直陈", count: narBy.emotionTell.length, score: densityScore(narBy.emotionTell, nChars, 3), note: narNote(narBy.emotionTell, "把羞耻、愤怒、心疼直接报出来") },
  ];
  const weights = {
    parallel: 0.09,
    markers: 0.07,
    hardBan: 0.06,
    burst: 0.12,
    oral: 0.07,
    skeleton: 0.04,
    talk: 0.04,
    flaw: 0.04,
    summary: 0.04,
    subtext: 0.04,
    contrast: 0.02,
    sentFlat: 0.03,
    ttr: 0.03,
    de: 0.03,
    precision: 0.03,
    mech: 0.04,
    foreshadow: 0.03,
    causal: 0.03,
    pov: 0.03,
    infoDump: 0.03,
    dialogueExpo: 0.03,
    propTell: 0.03,
    emotionTell: 0.03,
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
  if ((by.mech || 0) >= 0.6) mixed = Math.max(mixed, 0.38 + (by.mech || 0) * 0.36);
  if ((by.foreshadow || 0) >= 0.6) mixed = Math.max(mixed, 0.34 + (by.foreshadow || 0) * 0.34);
  if ((by.infoDump || 0) >= 0.6) mixed = Math.max(mixed, 0.34 + (by.infoDump || 0) * 0.32);
  if ((by.dialogueExpo || 0) >= 0.6) mixed = Math.max(mixed, 0.32 + (by.dialogueExpo || 0) * 0.3);
  const rate = Math.round(clamp01(mixed) * 100);
  const level = rate >= 70 ? "high" : rate >= 40 ? "mid" : "low";
  const reasons = dims
    .filter((row) => row.score >= 0.35)
    .sort((a, b) => b.score - a.score)
    .map((row) => {
      const item = {
        id: row.id,
        label: row.label,
        score: Math.round(row.score * 100),
        note: row.note,
      };
      if (row.count) item.count = row.count;
      return item;
    });
  return { rate, level, chars: nChars, reasons };
}

module.exports = { detectAigc, aigcNarrativeHits };
