const { buildContext, countWords } = require("./context");
const { buildBaselineBlock } = require("./baseline");
const { skillPromptBody } = require("./skills");
const { renderElements } = require("./elements");
const pipeline = require("./pipeline");

const DEFAULT_TOKEN_BUDGET = Number(process.env.PROMPT_TOKEN_BUDGET || 40000);
const CJK_TOKENS_PER_CHAR = 0.7;

const LEAD_WRITING =
  "你是长期连载网文作者。按说明书直接交本章成品。用简体中文。不要输出说明书，不要解释过程。「核心设定」和「本章写法」优先。";

const LEAD_DEFAULT =
  "你是一名长期连载网文作者，在墨枢工坊里按 Skill 说明书交稿。成品必须让读者想点下一章。先交心口和剧情，再交结构和禁区。人类感来自不完全规则化：思维会拐弯、话会说一半、信息只讲七成。禁止为了去AI而故意写差。必须严格遵守下面这份 Skill 说明书。用简体中文写作。不要输出这份说明书本身，不要解释过程，直接给出 Skill 要求的成品。用户消息里的「核心设定」和「本章写法」优先于惯性套路。";

const VOICE_TAIL =
  "\n\n【底味自检】交稿前用作者的眼睛默读一遍：句长、标点、用词、比喻、段落切法像不像上方临摹样本和文风说明书？读出 AI 平均腔的句子，按样本改到像再交。顺手扫一遍错别字、同音别字、人名地名前后不一、中英混用标点。";

const KEY_LABELS = {
  brief: "立项",
  world: "世界观",
  characters: "人物",
  outline: "大纲",
  props: "道具",
  beats: "细纲",
  prev: "上一章",
};

const DROP_ORDER = {
  writing: pipeline.dropOrder(true),
  setting: pipeline.dropOrder(false),
};

function isWritingSkill(skill) {
  return pipeline.isWritingSkill(skill);
}

function focusDirective(focusName) {
  const name = String(focusName || "").trim();
  if (!name) return "";
  return `请只输出「${name}」这一条资产。使用 Markdown 标题 ### ${name}（身份或类型），必须含「描述：」和「提示词：」两节。不要输出其他人或其他条目。`;
}

function isCjk(code) {
  return (
    (code >= 0x2e80 && code <= 0x9fff) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xff00 && code <= 0xffef) ||
    (code >= 0x3000 && code <= 0x303f)
  );
}

function estimateTokens(text) {
  const raw = String(text || "");
  let cjk = 0;
  let ascii = 0;
  for (const ch of raw) {
    const code = ch.codePointAt(0);
    if (isCjk(code)) cjk += 1;
    else if (/\s/.test(ch)) continue;
    else ascii += 1;
  }
  return Math.ceil(cjk * CJK_TOKENS_PER_CHAR + ascii / 4);
}

function charCount(text) {
  return Array.from(String(text || "")).length;
}

function part(key, label, text) {
  const body = String(text || "");
  return { key, label, injected: Boolean(body), chars: charCount(body), tokens: estimateTokens(body), text: body };
}

function stubNovel() {
  return {
    id: "__preview__",
    title: "（预览工程）",
    genre: "",
    logline: "",
    brief: "",
    world: "",
    characters: "",
    outline: "",
    props: "",
    chapters: [],
    craft: {},
  };
}

function assemble({ novel, skill, voiceActive, voiceText, contextResult }) {
  const writing = isWritingSkill(skill);
  const lead = writing ? LEAD_WRITING : LEAD_DEFAULT;
  const baseline = buildBaselineBlock({ voiceActive, skill }).join("\n");
  const ctx = {
    voiceActive,
    flow: String((novel && novel.craft && novel.craft.flow) || ""),
    platform: String((novel && novel.craft && novel.craft.platform) || ""),
  };
  const skillBody = skillPromptBody(skill, ctx);
  const elementBlock = renderElements(skill, { novel, chapter: contextResult.chapter, voiceActive });
  const voice = voiceActive ? String(voiceText || "") : "";
  const voiceTail = voice ? VOICE_TAIL : "";
  const body = [baseline, skillBody, elementBlock].filter(Boolean).join("\n\n");
  const system = voice ? `${voice}\n\n${lead}\n\n${body}${voiceTail}` : `${lead}\n\n${body}`;
  const parts = [
    part("voice", "文风底味", voice),
    part("lead", "角色与纪律", lead),
    part("baseline", "共享质量基线", baseline),
    part("skill", "Skill 说明书", skillBody),
    part("elements", "元素注入", elementBlock),
    part("voiceTail", "底味自检", voiceTail),
    part("context", "工程上下文", contextResult.userContent),
  ].filter((row) => row.injected);
  return { system, parts };
}

function measure(system, userContent) {
  const systemTokens = estimateTokens(system);
  const userTokens = estimateTokens(userContent);
  return {
    systemChars: charCount(system),
    userChars: charCount(userContent),
    systemTokens,
    userTokens,
    estTokens: systemTokens + userTokens,
  };
}

function buildPrompt(input = {}) {
  const novel = input.novel || stubNovel();
  const skill = input.skill;
  if (!skill) throw Object.assign(new Error("Skill 不存在"), { status: 404 });
  const voiceActive = Boolean(input.voiceActive);
  const voiceText = String(input.voiceText || "");
  const budget = Number(input.tokenBudget) > 0 ? Number(input.tokenBudget) : DEFAULT_TOKEN_BUDGET;

  let extra = String(input.extra || "");
  const focus = focusDirective(input.focusName);
  if (focus) extra = extra ? `${extra}\n${focus}` : focus;

  const writing = isWritingSkill(skill);
  let include = { ...(input.include || {}) };
  const order = (writing ? DROP_ORDER.writing : DROP_ORDER.setting).filter((key) => key !== skill.target);
  const dropped = [];

  const run = () => {
    const contextResult = buildContext({
      novel,
      skill,
      chapterId: input.chapterId,
      extra,
      selection: input.selection,
      cursorPrefix: input.cursorPrefix,
      include,
      voiceActive,
    });
    const composed = assemble({ novel, skill, voiceActive, voiceText, contextResult });
    const metrics = measure(composed.system, contextResult.userContent);
    return { contextResult, composed, metrics };
  };

  let attempt = run();
  while (attempt.metrics.estTokens > budget && order.length) {
    const key = order.shift();
    if (include[key] === false) continue;
    include = { ...include, [key]: false };
    dropped.push(key);
    attempt = run();
  }

  const warnings = [];
  if (dropped.length) {
    warnings.push(`提示词超出预算，已自动省略：${dropped.map((key) => KEY_LABELS[key] || key).join("、")}`);
  }
  if (attempt.metrics.estTokens > budget) {
    warnings.push(`提示词仍超出预算（估算 ${attempt.metrics.estTokens} tokens，预算 ${budget}）`);
  }

  return {
    chapter: attempt.contextResult.chapter,
    missing: attempt.contextResult.missing,
    system: attempt.composed.system,
    user: attempt.contextResult.userContent,
    parts: attempt.composed.parts,
    metrics: attempt.metrics,
    warnings,
    dropped,
    voiceActive,
    writing,
    tokenBudget: budget,
  };
}

module.exports = {
  buildPrompt,
  estimateTokens,
  focusDirective,
  isWritingSkill,
  stubNovel,
  DEFAULT_TOKEN_BUDGET,
};
