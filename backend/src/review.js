const { scanText } = require("./quality");
const { textMetrics, findPlatform, findFlow } = require("./genre");

function countWords(text) {
  return Array.from(String(text || "").replace(/\s+/g, "")).length;
}

function parasOf(text) {
  return String(text || "")
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function compact(text) {
  return String(text || "").replace(/\s+/g, "");
}

function parseReviewVerdict(text) {
  const src = String(text || "");
  const start = src.search(/^###\s*过稿判断/m);
  const slice = start >= 0 ? src.slice(start) : src;
  const next = slice.search(/\n###\s+/);
  const body = (next >= 0 ? slice.slice(0, next) : slice).slice(0, 600);
  if (/^\s*改后过\s*$/m.test(body) || /改后过/.test(body)) return "改后过";
  if (/^\s*不过\s*$/m.test(body) || /(^|\n)\s*不过/.test(body)) return "不过";
  if (/^\s*过\s*$/m.test(body)) return "过";
  return "";
}

function buildReviewRuler(novel, chapter, options = {}) {
  const allowSimile = Boolean(options.allowSimile);
  const text = String(chapter?.content || "");
  const words = countWords(text);
  const min = Number(novel?.craft?.wordsMin) || 2200;
  const max = Number(novel?.craft?.wordsMax) || 3800;
  const idx = Number(chapter?.index) || 0;
  const paras = parasOf(text);
  const packed = compact(text);
  const talkParas = paras.filter((p) => /^[“「]/.test(p)).length;
  const sysLines = (text.match(/^【/gm) || []).length;
  const longParas = paras.filter((p) => countWords(p) > 90);
  const { issues } = scanText(novel, text, chapter, { allowSimile });
  const fig = issues.filter((row) => row.reason === "空比喻");
  const empty = issues.filter((row) => row.reason === "空描写");
  const golden = idx >= 1 && idx <= 3;
  const span =
    words < min ? `篇幅：不足，差 ${min - words} 字` : words > max ? `篇幅：超标 ${words - max} 字` : "篇幅：在目标内";
  const metrics = textMetrics(text);
  const platform = findPlatform(novel?.craft?.platform);
  const flow = findFlow(novel?.craft?.flow);
  const noPayoff = flow.id === "horror";

  const lines = [
    `# 本地审稿标尺`,
    `只陈述可计算事实。禁止据此编造完读率、留存、推流或平台后台数据。`,
    `章序：第${idx}章${golden ? "（黄金三章）" : ""}`,
    `字数：${words}（目标 ${min}-${max}）`,
    span,
    `段数：${paras.length}；对话段：${talkParas}；超90字段：${longParas.length}`,
    `系统【】行：${sysLines}`,
    `空比喻命中：${fig.length}`,
    `空描写命中：${empty.length}`,
    `句长标准差：${metrics.std}（目标 ≥ 12）；连续接近句最长 ${metrics.flatRun} 句`,
    `对白占比：${metrics.dialogueRatio}%；对白组数：${metrics.dialogueCount}；对白均长：${metrics.dialogueAvgLen} 字；每300字对白：${metrics.dialoguePer300} 组`,
    `动作句占比：${metrics.actionRatio}%；对白+动作占比参考：${Math.min(100, metrics.dialogueRatio + metrics.actionRatio)}%`,
    `口语骨架词每500字：${metrics.oralPer500}（目标 ≥ 5）；人类瑕疵每1000字：${metrics.flawPer1000}（目标 ≥ 3）`,
    `总结句每1000字：${metrics.summaryPer1000}（目标 < 3）；说破潜台词每1000字：${metrics.subtextPer1000}（目标 < 2.5）`,
    `对比句式每1000字：${metrics.contrastPer1000}（目标 < 1.5）；手上小动作每1000字：${metrics.gesturePer1000}（越多越像人）；具体次数每1000字：${metrics.exactPer1000}`,
    noPayoff
      ? `围观反应词命中：${metrics.reactions.length}（怪谈流不强制三拍，仅作旁观者反应参考）`
      : `围观反应词命中：${metrics.reactions.length}（爽点三拍的“反应”拍）`,
    `硬禁词命中：${metrics.hardBans.length ? metrics.hardBans.join("、") : "无"}`,
    `前300字：${packed.slice(0, 300) || "（空）"}`,
    `章末80字：${packed.slice(-80) || "（空）"}`,
    `末段：${(paras[paras.length - 1] || "").slice(0, 160) || "（空）"}`,
  ];
  if (flow.module || platform.module) {
    lines.splice(2, 0, `类型与平台：${flow.module ? flow.label : "未指定"} · ${platform.module ? platform.label : "通用"}`);
  }
  if (metrics.overview.length) lines.push(`概述词命中（应拆成对白+动作）：${metrics.overview.join("、")}`);
  if (metrics.connectors.length) lines.push(`书面连接词命中：${metrics.connectors.join("、")}`);
  if (fig.length) lines.push(`空比喻原句：${fig.slice(0, 5).map((row) => row.original).join(" / ")}`);
  if (empty.length) lines.push(`空描写原句：${empty.slice(0, 5).map((row) => row.original).join(" / ")}`);
  if (longParas.length) {
    lines.push(
      `超90字段摘：${longParas
        .slice(0, 3)
        .map((p) => `${countWords(p)}字 ${compact(p).slice(0, 24)}`)
        .join("；")}`
    );
  }

  if (golden) {
    const chs = (novel?.chapters || [])
      .filter((ch) => Number(ch.index) >= 1 && Number(ch.index) <= 3)
      .sort((a, b) => Number(a.index) - Number(b.index));
    lines.push(`# 黄金三章对照`);
    for (const ch of chs) {
      const body = compact(ch.content);
      const hasSystem = /【/.test(String(ch.content || ""));
      lines.push(
        body
          ? `第${ch.index}章 ${ch.title || ""}：${countWords(ch.content)}字；系统【】${hasSystem ? "已出现" : "未见"}；开头「${body.slice(0, 80)}」`
          : `第${ch.index}章 ${ch.title || ""}：（未写）`
      );
    }
  }

  const prev = (novel?.chapters || []).find((ch) => Number(ch.index) === idx - 1);
  if (prev?.content) lines.push(`# 上一章钩子余味\n${compact(prev.content).slice(-120)}`);
  const next = (novel?.chapters || []).find((ch) => Number(ch.index) === idx + 1);
  if (next?.beats) lines.push(`# 下一章细纲（对照钩子有没有提前打完）\n${String(next.beats).slice(0, 400)}`);
  if (chapter?.beats) lines.push(`# 本章细纲目标\n${String(chapter.beats).slice(0, 800)}`);

  return lines.join("\n");
}

module.exports = { buildReviewRuler, parseReviewVerdict, countWords };
