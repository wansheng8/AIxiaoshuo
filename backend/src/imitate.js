const { textMetrics, ORAL_WORDS, BOILER_CONNECTORS, HARD_BANS, GESTURE_WORDS, EXACT_WORDS } = require("./genre");

const TAIL_WORDS = ["啊", "吧", "呢", "嘛", "呗", "咯", "喽", "哎", "啧", "嘿", "嗯", "哦", "呀", "喔", "哟", "嘞", "呐"];
const SIMILE_RE = /(?<![不没])(?:好像|像极了|仿佛|宛如|如同|犹如|活像|似的|像)/g;
const SIMILE_SNIP = /[^。！？\n]{0,6}(?<![不没])(?:好像|仿佛|像|宛如|如同|犹如|活像)[^。！？\n]{0,12}/g;
const REDUP = /([\u4e00-\u9fff])\1/g;
const BROKEN_TAIL = /(?:……|——)[”』"']?$/;

const ACTION_WORDS =
  /(走|跑|推|拉|抓|扔|抬|落|站|坐|蹲|扑|踢|打|敲|按|握|捏|挥|举|砸|撕|拽|拖|踩|跨|靠|转|低|点|摇|笑|吼|喊|骂|问|答|看|盯|瞥|皱眉|咬牙|攥|揣|摸|掏|递|接|躲|退|迈|冲|掐|捶|跺|仰|俯|侧|缩|绷|颤|抖|回头|扭头|起身|伸手|抽|甩|拦|抱|拍|戳)/;

const ACTION_STOP = new Set(
  "的了是在有和就人也中上大这我个们到说去过你对发成时可同工面后多小么想眼前手路边间里下外内子风声光色气水火天日年左右家的一不没很都还又把被给从对向与但而并且所以因为如果虽然然后可是只是".split("")
);

const PSYCH_HINT = /(心想|心里|暗想|念头|想起|回忆|觉得|知道|明白|意识到|以为|希望|害怕|担心)/;

function chars(text) {
  return Array.from(String(text || "").replace(/\s+/g, "")).length;
}

function round(n, d = 1) {
  const f = 10 ** d;
  return Math.round((Number(n) || 0) * f) / f;
}

function mean(list) {
  if (!list.length) return 0;
  return list.reduce((a, b) => a + b, 0) / list.length;
}

function splitSentences(text) {
  return String(text || "")
    .split(/(?<=[。！？…\n])/)
    .map((row) => row.trim())
    .filter((row) => chars(row) >= 2);
}

function paragraphs(text) {
  return String(text || "")
    .split(/\n{2,}/)
    .map((row) => row.trim())
    .filter(Boolean);
}

function pct(n, total) {
  return total ? Math.round((n / total) * 100) : 0;
}

function topWords(text, limit = 8) {
  const runs = String(text || "").match(/[\u4e00-\u9fff]+/g) || [];
  const bag = {};
  for (const run of runs) {
    for (let i = 0; i < run.length - 1; i += 1) {
      const bigram = run.slice(i, i + 2);
      if (ACTION_STOP.has(bigram[0]) || ACTION_STOP.has(bigram[1])) continue;
      bag[bigram] = (bag[bigram] || 0) + 1;
    }
  }
  return Object.entries(bag)
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([word, n]) => `${word}(${n})`);
}

function countTokens(text, list) {
  const source = String(text || "");
  return list.filter((word) => source.includes(word));
}

function countTail(text) {
  const source = String(text || "");
  let total = 0;
  for (const word of TAIL_WORDS) {
    const re = new RegExp(`${word}(?=[。””』\\s]|$)`, "g");
    total += (source.match(re) || []).length;
  }
  return total;
}

function countSimile(text) {
  return (String(text || "").match(SIMILE_RE) || []).length;
}

function simileExamples(text, limit = 3) {
  const hits = String(text || "").match(SIMILE_SNIP) || [];
  const seen = new Set();
  const out = [];
  for (const hit of hits) {
    const clean = hit.trim().replace(/^[，,。！？\s]+/, "");
    if (clean.length < 2 || seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean.slice(0, 20));
    if (out.length >= limit) break;
  }
  return out;
}

function countRedup(text) {
  return (String(text || "").match(REDUP) || []).length;
}

function guessOpening(text) {  const first = String(text || "").trim().slice(0, 40);
  if (/[“「]/.test(first)) return "对白切入";
  if (ACTION_WORDS.test(first)) return "动作切入";
  return "场景切入";
}

function guessHook(text) {
  const tail = String(text || "").trim();
  const last = tail.split(/\n+/).filter(Boolean).slice(-3).join("\n");
  if (/【[^】]*】/.test(last)) return "系统/信息钩子";
  if (/[“「]/.test(last)) return "对白钩子";
  if (/[？?]/.test(last)) return "反问钩子";
  if (ACTION_WORDS.test(last)) return "事件/动作钩子";
  return "叙述钩子";
}

function analyzeText(text) {
  const source = String(text || "");
  const m = textMetrics(source);
  const sents = splitSentences(source);
  const lens = sents.map(chars).filter((n) => n > 0);
  const totalSent = lens.length || 1;
  const paras = paragraphs(source);
  const paraSent = paras.map((p) => splitSentences(p).length);
  const talkParas = paras.filter((p) => /[“”]/.test(p)).length;
  const actionParas = paras.filter((p) => !/[“”]/.test(p) && ACTION_WORDS.test(p)).length;
  const narrParas = Math.max(0, paras.length - talkParas - actionParas);
  const commas = (source.match(/，/g) || []).length;
  const ellipsis = (source.match(/……/g) || []).length;
  const dash = (source.match(/——/g) || []).length;
  const question = (source.match(/[？?]/g) || []).length;
  const bang = (source.match(/[！!]/g) || []).length;
  const psych = (source.match(PSYCH_HINT) || []).length;
  const oralWords = ORAL_WORDS.filter((word) => source.includes(word));
  const connectors = BOILER_CONNECTORS.filter((word) => source.includes(word));
  const tailCount = countTail(source);
  const tailHits = countTokens(source, TAIL_WORDS);
  const simileCount = countSimile(source);
  const simileMarkers = Array.from(new Set(source.match(SIMILE_RE) || []));
  const simileEg = simileExamples(source);
  const redupCount = countRedup(source);
  const gestureHits = Array.from(new Set(source.match(GESTURE_WORDS) || []));
  const exactHits = Array.from(new Set(source.match(EXACT_WORDS) || []));
  const brokenCount = sents.filter((row) => BROKEN_TAIL.test(row)).length;
  const n = Math.max(chars(source), 1);

  const dims = {
    avgLen: round(mean(lens)),
    shortPct: pct(lens.filter((x) => x <= 10).length, totalSent),
    midPct: pct(lens.filter((x) => x > 10 && x <= 25).length, totalSent),
    longPct: pct(lens.filter((x) => x > 25).length, totalSent),
    std: round(m.std),
    paraAvgSent: round(mean(paraSent)),
    oneSentParaPct: pct(paras.filter((p) => splitSentences(p).length <= 1).length, paras.length || 1),
    dialoguePct: m.dialogueRatio,
    dialogueAvgLen: m.dialogueAvgLen,
    dialoguePer300: m.dialoguePer300,
    talkParaPct: pct(talkParas, paras.length || 1),
    actionParaPct: pct(actionParas, paras.length || 1),
    narrParaPct: pct(narrParas, paras.length || 1),
    commaPer1000: Math.round((commas / n) * 1000),
    ellipsisPer1000: round((ellipsis / n) * 1000, 2),
    dashPer1000: round((dash / n) * 1000, 2),
    questionPer1000: round((question / n) * 1000, 2),
    bangPer1000: round((bang / n) * 1000, 2),
    psychPer1000: round((psych / n) * 1000, 2),
    oralPer1000: round((m.oralCount / n) * 1000, 1),
    tailPer1000: round((tailCount / n) * 1000, 1),
    similePer1000: round((simileCount / n) * 1000, 1),
    redupPer1000: round((redupCount / n) * 1000, 1),
    gesturePer1000: m.gesturePer1000,
    exactPer1000: m.exactPer1000,
    brokenPct: pct(brokenCount, totalSent),
  };

  const style = {
    topWords: topWords(source),
    oral: oralWords,
    tail: tailHits,
    simileMarkers,
    simileEg,
    connectors,
  };
  const human = { gesture: gestureHits, exact: exactHits };

  const report = [
    `## 句子节奏`,
    `- 平均句长：${dims.avgLen} 字`,
    `- 短句（≤10字）占比：${dims.shortPct}%`,
    `- 中句（11—25字）占比：${dims.midPct}%`,
    `- 长句（≥26字）占比：${dims.longPct}%`,
    `- 句长标准差：${dims.std}`,
    `- 一段几句：${dims.paraAvgSent} 句`,
    `- 一句一段占比：${dims.oneSentParaPct}%`,
    ``,
    `## 对白模式`,
    `- 对白占比：${dims.dialoguePct}%`,
    `- 对白平均长度：${dims.dialogueAvgLen} 字`,
    `- 每300字对白：${dims.dialoguePer300} 组`,
    `- 对白后跟什么：（人工确认）动作 / 反应 / 旁白`,
    `- 打断、重复、省略、反问：按范文人工核对`,
    ``,
    `## 叙述视角`,
    `- 人称：（人工确认，默认与本书一致）`,
    `- 旁白距离：（人工确认）贴主角 / 拉开 / 全知`,
    `- 心理描写密度：每千字约 ${dims.psychPer1000} 处（关键词估计）`,
    `- 心理怎么写：（人工确认）直接写 / 动作外化 / 对白外化`,
    ``,
    `## 用词习惯`,
    `- 高频词：${style.topWords.join("、") || "无明显高频词"}`,
    `- 口语骨架词：${style.oral.slice(0, 16).join("、") || "无明显口语词"}`,
    `- 句尾语气词：${style.tail.join("、") || "无"}`,
    `- 叠词：每千字 ${dims.redupPer1000} 处`,
    `- 比喻：每千字 ${dims.similePer1000} 处；标记 ${style.simileMarkers.join("、") || "无"}；例：${style.simileEg.join(" / ") || "无"}`,
    `- 连接词（书面，越少越好）：${style.connectors.join("、") || "无"}`,
    `- 禁止词（范文里没出现）：${HARD_BANS.slice(0, 10).join("、")}`,
    ``,
    `## 人味锚点`,
    `- 手上小动作：每千字 ${dims.gesturePer1000} 处${human.gesture.length ? `；例：${human.gesture.slice(0, 6).join("、")}` : ""}`,
    `- 具体次数/量：每千字 ${dims.exactPer1000} 处${human.exact.length ? `；例：${human.exact.slice(0, 6).join("、")}` : ""}`,
    `- 不完整句（省略号/破折号收尾）：${dims.brokenPct}%`,
    `- 口语骨架词：每千字 ${dims.oralPer1000} 处`,
    `- 心理外化密度：每千字 ${dims.psychPer1000} 处`,
    ``,
    `## 节奏结构`,
    `- 段落数：${paras.length}；平均段长：${round(mean(paras.map(chars)))} 字`,
    `- 小冲突间隔 / 大冲突间隔 / 爽点间隔：（人工确认，建议小冲突 300—500 字一次）`,
    `- 开头切入：${guessOpening(source)}`,
    `- 结尾留钩子：${guessHook(source)}`,
    ``,
    `## 段落结构`,
    `- 平均段长：${dims.paraAvgSent} 句`,
    `- 对白段占比：${dims.talkParaPct}%`,
    `- 动作段占比：${dims.actionParaPct}%`,
    `- 旁白段占比：${dims.narrParaPct}%`,
    ``,
    `## 标点习惯`,
    `- 引号：中文弯引号`,
    `- 省略号：每千字 ${dims.ellipsisPer1000} 处`,
    `- 破折号：每千字 ${dims.dashPer1000} 处`,
    `- 逗号密度：每千字 ${dims.commaPer1000}`,
    `- 问号每千字 ${dims.questionPer1000}；叹号每千字 ${dims.bangPer1000}`,
  ].join("\n");

  const skeleton = [
    `仿写骨架（严格按此比例）`,
    `- 平均句长 ${dims.avgLen} 字；短句 ${dims.shortPct}%、中句 ${dims.midPct}%、长句 ${dims.longPct}%；句长标准差 ${dims.std}`,
    `- 一段 ${dims.paraAvgSent} 句；一句一段 ${dims.oneSentParaPct}%`,
    `- 对白占比 ${dims.dialoguePct}%；对白均长 ${dims.dialogueAvgLen} 字；每300字 ${dims.dialoguePer300} 组`,
    `- 对白段 ${dims.talkParaPct}%、动作段 ${dims.actionParaPct}%、旁白段 ${dims.narrParaPct}%`,
    `- 逗号每千字 ${dims.commaPer1000}；省略号每千字 ${dims.ellipsisPer1000}；破折号每千字 ${dims.dashPer1000}`,
    `【用词与口头禅】高频：${style.topWords.slice(0, 6).join("、") || "无"}；口语：${style.oral.slice(0, 8).join("、") || "无"}；句尾：${style.tail.join("、") || "无"}；叠词每千字 ${dims.redupPer1000}`,
    `【比喻】每千字 ${dims.similePer1000} 处${style.simileEg.length ? `，例：${style.simileEg.join(" / ")}` : ""}；不引入范文没有的比喻`,
    `【人味锚点】小动作每千字 ${dims.gesturePer1000}；具体量每千字 ${dims.exactPer1000}；不完整句 ${dims.brokenPct}%；口语每千字 ${dims.oralPer1000}`,
  ].join("\n");

  return { dims, style, human, report, skeleton, chars: chars(source) };
}

function mergeDims(list) {
  const rows = (list || []).filter((row) => row && typeof row === "object");
  if (!rows.length) return {};
  const keys = Object.keys(rows[0]);
  const out = {};
  for (const key of keys) {
    const values = rows.map((row) => Number(row[key])).filter((n) => Number.isFinite(n));
    if (values.length) out[key] = round(mean(values), 2);
  }
  return out;
}

function skeletonFromDims(dims, style, human) {
  const d = dims || {};
  const s = style || {};
  const h = human || {};
  const top = (s.topWords || []).slice(0, 6).join("、") || "无";
  const oral = (s.oral || []).slice(0, 8).join("、") || "无";
  const tail = (s.tail || []).join("、") || "无";
  const simEg = s.simileEg || [];
  return [
    `仿写骨架（多篇共性，严格按此比例）`,
    `- 平均句长 ${d.avgLen ?? "-"} 字；短句 ${d.shortPct ?? "-"}%、中句 ${d.midPct ?? "-"}%、长句 ${d.longPct ?? "-"}%；句长标准差 ${d.std ?? "-"}`,
    `- 一段 ${d.paraAvgSent ?? "-"} 句；一句一段 ${d.oneSentParaPct ?? "-"}%`,
    `- 对白占比 ${d.dialoguePct ?? "-"}%；对白均长 ${d.dialogueAvgLen ?? "-"} 字；每300字 ${d.dialoguePer300 ?? "-"} 组`,
    `- 对白段 ${d.talkParaPct ?? "-"}%、动作段 ${d.actionParaPct ?? "-"}%、旁白段 ${d.narrParaPct ?? "-"}%`,
    `- 逗号每千字 ${d.commaPer1000 ?? "-"}；省略号每千字 ${d.ellipsisPer1000 ?? "-"}；破折号每千字 ${d.dashPer1000 ?? "-"}`,
    `【用词与口头禅】高频：${top}；口语：${oral}；句尾：${tail}；叠词每千字 ${d.redupPer1000 ?? "-"}`,
    `【比喻】每千字 ${d.similePer1000 ?? "-"} 处${simEg.length ? `，例：${simEg.join(" / ")}` : ""}；不引入骨架没有的比喻`,
    `【人味锚点】小动作每千字 ${d.gesturePer1000 ?? "-"}；具体量每千字 ${d.exactPer1000 ?? "-"}；不完整句 ${d.brokenPct ?? "-"}%；口语每千字 ${d.oralPer1000 ?? "-"}`,
  ].join("\n");
}

function mergeLibrary(list) {
  const rows = (list || []).filter((row) => row && typeof row === "object");
  if (!rows.length) return { dims: {}, style: {}, human: {}, skeleton: "" };
  const analyses = [];
  const dimsList = [];
  for (const row of rows) {
    const excerpt = String(row.excerpt || "").slice(0, 10000);
    if (chars(excerpt) >= 200) {
      const a = analyzeText(excerpt);
      analyses.push(a);
      dimsList.push(a.dims);
    } else if (row.dims && typeof row.dims === "object") {
      dimsList.push(row.dims);
    }
  }
  const dims = mergeDims(dimsList);
  const half = Math.max(1, Math.ceil(analyses.length / 2));
  const pick = (key, limit) => {
    const bag = {};
    for (const a of analyses) {
      for (const token of (a.style?.[key] || [])) bag[token] = (bag[token] || 0) + 1;
    }
    return Object.entries(bag)
      .filter(([, n]) => n >= half)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([token]) => token);
  };
  const mergeHuman = (key, limit) => {
    const bag = {};
    for (const a of analyses) {
      for (const token of (a.human?.[key] || [])) bag[token] = (bag[token] || 0) + 1;
    }
    return Object.entries(bag)
      .filter(([, n]) => n >= half)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([token]) => token);
  };
  const simileEg = [];
  for (const a of analyses) {
    for (const eg of a.style?.simileEg || []) {
      if (!simileEg.includes(eg)) simileEg.push(eg);
      if (simileEg.length >= 3) break;
    }
    if (simileEg.length >= 3) break;
  }
  const style = {
    topWords: pick("topWords", 6),
    oral: pick("oral", 8),
    tail: pick("tail", 16),
    simileEg,
    connectors: pick("connectors", 5),
  };
  const human = { gesture: mergeHuman("gesture", 6), exact: mergeHuman("exact", 6) };
  return { dims, style, human, skeleton: skeletonFromDims(dims, style, human) };
}

function compareDims(dims, text) {
  if (!dims || !Object.keys(dims).length) return [];
  const mine = analyzeText(text).dims;
  const labels = {
    avgLen: "平均句长",
    shortPct: "短句占比",
    midPct: "中句占比",
    longPct: "长句占比",
    std: "句长标准差",
    paraAvgSent: "一段几句",
    oneSentParaPct: "一句一段占比",
    dialoguePct: "对白占比",
    dialogueAvgLen: "对白平均长度",
    talkParaPct: "对白段占比",
    actionParaPct: "动作段占比",
    narrParaPct: "旁白段占比",
    commaPer1000: "逗号密度",
    ellipsisPer1000: "省略号密度",
    dashPer1000: "破折号密度",
    questionPer1000: "问号密度",
    bangPer1000: "叹号密度",
    psychPer1000: "心理密度",
    oralPer1000: "口语密度",
    tailPer1000: "句尾语气词密度",
    similePer1000: "比喻密度",
    redupPer1000: "叠词密度",
    gesturePer1000: "小动作密度",
    exactPer1000: "具体量密度",
    brokenPct: "不完整句占比",
  };
  const rows = [];
  for (const key of Object.keys(labels)) {
    const want = Number(dims[key]);
    const got = Number(mine[key]);
    if (!Number.isFinite(want) || !Number.isFinite(got)) continue;
    const base = Math.max(Math.abs(want), 1);
    const diff = Math.round((Math.abs(got - want) / base) * 100);
    rows.push({ key, label: labels[key], want, got, diff });
  }
  return rows;
}

function buildImitateBlock(craft) {
  if (!craft || craft.imitateOn !== true) return [];
  const skeleton = String(craft.imitate || "").trim();
  if (!skeleton) return [];
  const lines = [
    `# 仿写骨架（严格按比例，先套结构再写内容）`,
    `不分析「为什么」，只复制「是什么」。内容全部替换，禁止抄范文词句。`,
    `句长、标点、对白比例、段落结构按骨架；用词、口头禅、句尾语气词、比喻密度、人味锚点也照骨架走，不引入骨架没有的用法。`,
    skeleton,
    `写完自检：随机抽三段跟骨架对比，句长/对白/标点差异超过 20% 的维度回去改；用词和人味锚点对不上的补回来。`,
  ];
  const notes = String(craft.imitateNotes || "").trim();
  if (notes) lines.push(`作者补充：${notes}`);
  return lines;
}

function normalizeLib(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((row, index) => ({
      id: String(row?.id || `im_${index}_${Date.now().toString(36)}`),
      title: String(row?.title || "").trim().slice(0, 60),
      platform: String(row?.platform || "").trim().slice(0, 20),
      genre: String(row?.genre || "").trim().slice(0, 20),
      style: String(row?.style || "").trim().slice(0, 20),
      check: String(row?.check || "").trim().slice(0, 40),
      excerpt: String(row?.excerpt || "").slice(0, 6000),
      report: String(row?.report || "").slice(0, 8000),
      skeleton: String(row?.skeleton || "").slice(0, 1200),
      dims: row && typeof row.dims === "object" && row.dims ? row.dims : null,
    }))
    .filter((row) => row.title || row.excerpt);
}

module.exports = {
  analyzeText,
  mergeDims,
  mergeLibrary,
  skeletonFromDims,
  compareDims,
  buildImitateBlock,
  normalizeLib,
};
