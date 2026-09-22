const { buildCraftBlock } = require("./craft");

const { catalogBeats, maxBeatIndex } = require("./beats");
const { buildReviewRuler } = require("./review");
const pipeline = require("./pipeline");

function clip(text, max) {
  const value = String(text || "").trim();
  if (value.length <= max) return value;
  return `${value.slice(0, max)}\n…（已截断）`;
}

function tailSentences(text, count = 2, max = 260) {
  const raw = String(text || "").trim();
  if (!raw) return "";
  const parts = raw
    .split(/(?<=[。！？…”])/)
    .map((part) => part.trim())
    .filter(Boolean);
  const picked = parts.slice(-count).join("");
  return picked ? clip(picked, max) : clip(raw, max);
}

function headingCards(text) {
  const raw = String(text || "").trim();
  if (!raw) return [];
  return raw
    .split(/^###\s+/m)
    .slice(1)
    .map((part) => {
      const nl = part.indexOf("\n");
      const title = (nl < 0 ? part : part.slice(0, nl)).trim();
      const name = title.replace(/[（(].*$/, "").trim();
      return { name, body: `### ${part.trim()}` };
    })
    .filter((row) => row.name);
}

function pickMarkdownSection(text, heading) {
  const raw = String(text || "");
  const re = new RegExp(`###\\s*${heading}[\\s\\S]*?(?=\\n###\\s|$)`);
  const match = raw.match(re);
  return match ? match[0].trim() : "";
}

function snowflakeFromBrief(brief, max = 1200) {
  const chunks = ["雪花一句", "雪花五句", "人物种子", "连载调性"]
    .map((name) => pickMarkdownSection(brief, name))
    .filter(Boolean);
  if (chunks.length) return clip(chunks.join("\n\n"), max);
  return clip(brief, Math.min(max, 900));
}

function pickCharacterCards(characters, beats, max = 1600) {
  const cards = headingCards(characters);
  if (!cards.length) return clip(characters, max);
  const hay = String(beats || "");
  const picked = [];
  const seen = new Set();
  cards.forEach((card, index) => {
    if (seen.has(card.name)) return;
    if (index === 0 || hay.includes(card.name)) {
      seen.add(card.name);
      picked.push(card);
    }
  });
  if (picked.length === 1 && cards[1]) picked.push(cards[1]);
  return clip(picked.map((row) => row.body).join("\n\n"), max);
}

function isWritingSkill(skill) {
  return pipeline.isProseContextSkill(skill);
}

function isFastSkill(skill) {
  return pipeline.isWritingSkill(skill);
}

function looksLikeChapterProse(text) {
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

const SETTING_TARGETS = {
  brief: "立项说明",
  world: "世界观 / 场景",
  characters: "人物小传",
  outline: "全书大纲",
  props: "关键道具",
  beats: "分章细纲",
};

function chapterById(novel, chapterId) {
  return (novel.chapters || []).find((ch) => ch.id === chapterId) || novel.chapters?.[0] || null;
}

function prevChapter(novel, chapter) {
  if (!chapter) return null;
  return (novel.chapters || []).find((ch) => ch.index === chapter.index - 1) || null;
}

function chapterLabel(chapter) {
  let name = String(chapter.title || "").trim();
  const only = /^第\s*[零一二三四五六七八九十百千两０-９\d]+\s*章$/;
  const lead = /^第\s*[零一二三四五六七八九十百千两０-９\d]+\s*章(?:\s*[·•、.:：\-—]\s*|\s+)/;
  for (let i = 0; i < 4 && name; i += 1) {
    if (only.test(name)) {
      name = "";
      break;
    }
    const next = name.replace(lead, "").trim();
    if (next === name) break;
    name = next;
  }
  return name ? `第${chapter.index}章 ${name}` : `第${chapter.index}章`;
}

function writtenProseBlocks(novel, maxChapters = 6, perChapter = 1400, total = 7000) {
  const list = (novel.chapters || [])
    .filter((ch) => String(ch.content || "").trim())
    .sort((a, b) => (Number(a.index) || 0) - (Number(b.index) || 0));
  const picked = list.slice(-maxChapters);
  const parts = picked.map((ch) => {
    const title = String(ch.title || "").trim();
    const head = title ? `第${ch.index}章 ${title}` : `第${ch.index}章`;
    return `${head}\n${clip(ch.content, perChapter)}`;
  });
  if (parts.length) return clip(parts.join("\n\n"), total);
  const hist = (novel.history || []).filter((row) => {
    const id = String(row?.skillId || "");
    const target = String(row?.target || "");
    if (id !== "chapter-prose" && id !== "continue" && target !== "content") return false;
    return String(row.output || "").trim().length >= 80;
  });
  if (!hist.length) return "";
  const histParts = hist.slice(0, maxChapters).map((row, i) => `写稿记录 ${i + 1}\n${clip(row.output, perChapter)}`);
  return clip(histParts.join("\n\n"), total);
}

function beatSketchBlocks(novel, total = 4000) {
  const list = (novel.chapters || [])
    .filter((ch) => String(ch.beats || "").trim())
    .sort((a, b) => (Number(a.index) || 0) - (Number(b.index) || 0))
    .slice(0, 8);
  if (!list.length) return "";
  const parts = list.map((ch) => {
    const title = String(ch.title || "").trim();
    const head = title ? `第${ch.index}章 ${title}` : `第${ch.index}章`;
    return `${head}\n${clip(ch.beats, 700)}`;
  });
  return clip(parts.join("\n\n"), total);
}

function buildContext({ novel, skill, chapterId, extra, selection, cursorPrefix, include = {}, voiceActive = false }) {
  const chapter = chapterById(novel, chapterId);
  const previous = prevChapter(novel, chapter);
  const blocks = [
    `# 小说工程`,
    `书名：${novel.title}`,
    `类型：${novel.genre || "未定"}`,
    `一句话卖点：${novel.logline || "未定"}`,
  ];

  const use = (key, fallback = true) => include[key] !== false && fallback;

  blocks.push(`\n${buildCraftBlock(novel, chapter, skill, { voiceActive })}`);

  const skipIfProse = (key, label, text, max) => {
    if (!use(key) || !text) return;
    if (looksLikeChapterProse(text)) {
      if (skill.target === key) blocks.push(`\n# ${label}\n（现有内容是小说正文，已忽略。请按 Skill 结构重写这一栏，不要续写正文。）`);
      return;
    }
    blocks.push(`\n# ${label}\n${clip(text, max)}`);
  };
  if (isWritingSkill(skill)) {
    if (use("brief") && novel.brief) blocks.push(`\n# 立项核\n${snowflakeFromBrief(novel.brief, 1800)}`);
    if (use("characters") && novel.characters) {
      if (looksLikeChapterProse(novel.characters)) {
        skipIfProse("characters", "本章人物", novel.characters, 1600);
      } else {
        const cards = pickCharacterCards(novel.characters, chapter?.beats, 1600);
        if (cards) blocks.push(`\n# 本章人物\n${cards}`);
      }
    }
  } else {
    const settingBlocks = {
      brief: { label: "立项说明", max: 3200 },
      characters: { label: "人物库", max: 2400 },
      world: { label: "世界观 / 场景", max: 2400 },
      outline: { label: "全书大纲", max: 4600 },
      props: { label: "道具", max: 1600 },
    };
    for (const stage of pipeline.stagesInLine("writing")) {
      const def = settingBlocks[stage.artifact];
      if (!def) continue;
      skipIfProse(stage.artifact, def.label, novel[stage.artifact], def.max);
    }
  }

  if (skill.id === "props" && use("props")) {
    const prose = writtenProseBlocks(novel);
    if (prose) {
      blocks.push(`\n# 已写正文（抽取道具）\n${prose}`);
      blocks.push(
        `\n# 抽取纪律\n物件名必须与正文逐字一致。只输出道具卡片。禁止抄写小说正文，禁止编造正文里没出现、后文也不需要的物件。`
      );
    }
    const beats = beatSketchBlocks(novel);
    if (beats) {
      blocks.push(`\n# 细纲场面表（物件线索）\n${beats}`);
      if (!prose) {
        blocks.push(
          `\n# 抽取纪律\n正文还空着。从场面表里已经点名、被拿着、被藏着或付过代价的物件抽卡。物件名与细纲逐字一致。只输出道具卡片。`
        );
      }
    }
  }

  if (skill.id === "chapter-beats" && use("beats")) {
    const cat = catalogBeats(novel);
    if (cat.length) {
      const lines = cat.map((item) => `- 第${item.index}章 ${item.title || "（未命名）"}`).join("\n");
      blocks.push(`\n# 已有分章细纲（禁止重写这些编号）\n${clip(lines, 2000)}`);
      const last = cat[cat.length - 1];
      blocks.push(`\n# 上一批最后一章细纲（只作衔接）\n${clip(last.beats, 1200)}`);
    }
  }

  if (chapter) {
    blocks.push(`\n# 当前章节\n${chapterLabel(chapter)}`);
    if (use("beats") && chapter.beats) blocks.push(`本章细纲：\n${clip(chapter.beats, 1600)}`);
    if (skill.target === "review" || skill.target === "polish" || skill.id === "threads") {
      blocks.push(`\n# 本章正文\n${chapter.content ? clip(chapter.content, 6000) : "（空白，没有可审的段落）"}`);
    }
    if (skill.target === "review") {
      blocks.push(`\n${buildReviewRuler(novel, chapter, { allowSimile: voiceActive })}`);
    }
  }
  if (use("prev") && previous?.content) {
    const emptyChapter = !String(chapter?.content || "").trim();
    if (skill.id === "chapter-beats") {
      const lastWritten = [...(novel.chapters || [])]
        .filter((ch) => String(ch.content || "").trim())
        .sort((a, b) => (Number(a.index) || 0) - (Number(b.index) || 0))
        .pop();
      const prevText = previous.content || lastWritten?.content || "";
      if (prevText) {
        blocks.push(`\n# 上一章结尾\n${clip(prevText.slice(-1800), 1800)}`);
        blocks.push(`\n# 衔接\n下一章第一个场面接住上一章钩子。`);
      }
    } else if (isWritingSkill(skill) && emptyChapter) {
      blocks.push(`\n# 上一章结尾（必须从这里接着写，禁止另起一场）\n${clip(previous.content.slice(-1200), 1200)}`);
      blocks.push(
        `\n# 衔接硬性要求\n本章第一句必须接住上一章最后的动作、对话、物件或未完成选择。禁止用全新地点或全新人物冷开场。若要换场，先写人物怎么离开上一章结尾的位置。不要写章名。`
      );
    } else if (isWritingSkill(skill)) {
      blocks.push(`\n# 上一章结尾（对照）\n${clip(previous.content.slice(-800), 800)}`);
    }
  }
  if (skill.id === "chapter-beats" && use("prev") && !previous?.content) {
    const lastWritten = [...(novel.chapters || [])]
      .filter((ch) => String(ch.content || "").trim())
      .sort((a, b) => (Number(a.index) || 0) - (Number(b.index) || 0))
      .pop();
    if (lastWritten?.content) {
      blocks.push(`\n# 上一章结尾\n${clip(lastWritten.content.slice(-1800), 1800)}`);
      blocks.push(`\n# 衔接\n下一章第一个场面接住上一章钩子。`);
    }
  }
  if (skill.target === "content" && chapter?.content && skill.id !== "chapter-prose") {
    blocks.push(`\n# 本章已有正文\n${clip(chapter.content, 3500)}`);
  }
  if (skill.id === "chapter-prose" && chapter?.content) {
    blocks.push(`\n# 本章已有正文（请从已有内容之后接着写，或按作者指令重写）\n${clip(chapter.content, 2000)}`);
  }
  if (cursorPrefix) {
    blocks.push(`\n# 光标前文本\n${clip(cursorPrefix, 2500)}`);
  }
  if (selection) {
    blocks.push(`\n# 作者选中的段落\n${clip(selection, 2500)}`);
  }
  if (extra) {
    blocks.push(`\n# 作者附加指令\n${clip(extra, 2500)}`);
  }

  const settingLabel = SETTING_TARGETS[skill.target];
  if (settingLabel) {
    if (skill.target === "beats") {
      const start = Math.max(1, maxBeatIndex(novel) + 1);
      const end = start + 7;
      const from = start > 1
        ? `从「### 第${start}章 章名」连续编到「### 第${end}章 章名」。禁止输出第${start}章之前的细纲，禁止从第1章重新编号。`
        : `从「### 第1章 章名」连续编到「### 第8章 章名」。`;
      blocks.push(
        `\n# 输出纪律\n只输出分章细纲。每一章标题必须独占一行，严格写成「### 第N章 章名」。${from}章名不要书名号。每章给目标、冲突、心口、冲突链、内外阻力、出场、场面表、误判、转折、钩子、钩子类型、节奏、伏笔、爽点三拍、必写爽点、弧光，一个都不能少。场面表每行：场次｜视角｜进场带着什么｜本场要办成｜谁挡住｜下场带走什么。标明起势/主场/钩子，主场信息量明显更厚。写清心口、误判、钩子类型（A到H八选一，近三章同型不用）。只拆大纲节拍，不另起故事。第1章起势第一句写异常，金手指或面板在前半段露面。每章能力兑现一次可见效果，配角一个生活痕迹。钩子停在动作临界点，禁止把下一章打戏写完。认出未知物先写局部感官再写名字。系统首次出声带一句态度。用条目写场面，禁止写成带对话的小说正文。`
      );
    } else if (skill.id === "kickoff") {
      blocks.push(
        `\n# 输出纪律\n只输出立项说明书。必须含「### 雪花一句」「### 雪花五句」「### 一句话卖点」「### 内容简介」「### 故事线一览」「### 读者与调性」「### 连载调性」「### 类型与金手指」「### 主题句」「### 文风与视角」「### 人物种子」「### 前三章承诺」「### 禁区」，一个都不能少。「雪花一句」不超 30 字且含代价与他在乎的人；「雪花五句」逐句落到动作、物件、选择、代价；「内容简介」写足 300 到 500 字，能逐句对回雪花一句和五句，不剧透；「故事线一览」覆盖主线、感情线、成长线、事业线、恩怨线、悬疑线和每个主要配角线，每条写清目标、起点、转折、结局走向；「人物种子」每人写姓名/身份/缺口/欲望/反差/秘密/会心疼谁/此刻相信的错话；「类型与金手指」写死类型、金手指触发与代价、平台、爽点公式。后文只膨胀这几节，不许另起故事。三灾打在误判和关系上。禁止写小说正文，禁止写对话场面。`
      );
    } else if (skill.id === "characters") {
      blocks.push(
        `\n# 输出纪律\n只输出人物档案。每人必须含描述、提示词、目标、动机、在乎、缺口、反差、冲突、当前利益、当前误判、当前情绪、表面态度、真实态度、声口指纹、顿悟、一句故事线，一个都不能少。每人 180 到 280 字，配三句台词（正常、紧张或嘴硬、绕话或答非所问）。全部写完后另写一节「### 关系简表（总览）」，写清谁欠谁、谁瞒着谁。主角故事线咬住立项雪花五句。禁止写小说正文。`
      );
    } else if (skill.id === "outline") {
      blocks.push(
        `\n# 输出纪律\n只输出全书大纲。必须含「### 主题句」「### 雪花一页」「### 主线」「### 平台节奏」「### 故事线」「### 卷纲」「### 第一卷节拍」「### 伏笔账本」「### 节奏」，一个都不能少。「雪花一页」把立项五句各扩成一段，每段六到十句，写清处境、抓手、选择、代价、失去与误信，且能直接拆成 2 到 3 个章级场面；「故事线」覆盖主线、感情线、成长线、事业线、恩怨线、悬疑线、配角线、支线八类，每条写清起点、推进节点、转折、与主线的交叉章、结算章；「卷纲」按 2 到 4 卷；「伏笔账本」4 到 8 条。只膨胀，不改结局赌注，每卷标失败场。禁止写小说正文，禁止写对话场面。`
      );
    } else if (skill.id === "props") {
      blocks.push(
        `\n# 输出纪律\n只输出关键道具卡片。有已写正文或写稿记录时从正文抽取，物件名与正文逐字一致。无正文时从细纲场面表已点名物件抽卡。每卡「### 物件名（类型）」加「描述：」「谁拿着：」「用途：」「代价：」「提示词：」。来历写在卡里，正文只讲七成。禁止写小说正文。`
      );
    } else {
      blocks.push(
        `\n# 输出纪律\n只输出「${settingLabel}」。禁止写小说正文，禁止写对话场面，禁止用「第N章」当故事开头。资料里如果出现正文片段，只抽取情节骨架，不要续写。只膨胀已有雪花一句和雪花五句，不另起故事。`
      );
    }
  }

  if (skill.id === "chapter-prose") {
    blocks.push(`\n# 输出纪律\n只输出本章正文。不要章名，不要说明书。按场面表写完钩子停笔。`);
  }

  const missing = [];
  if (!novel.outline) missing.push("全书大纲");
  if (!novel.characters) missing.push("人物库");
  if (!novel.world) missing.push("世界观");
  if (skill.id === "review" && missing.length) {
    blocks.push(`\n# 缺失对照资料\n${missing.join("、")}`);
  }

  if (use("prev") && isWritingSkill(skill) && !String(chapter?.content || "").trim() && previous?.content) {
    const lastLine = tailSentences(previous.content, 2, 220);
    blocks.push(
      [
        `\n# 开篇承接（最高优先，压过细纲第一场）`,
        `上一章最后原文：“${lastLine}”`,
        `本章第一句必须从这句的动作、对话、物件或未完成的选择继续：同一时间、同一地点、同一人物状态。`,
        `若本章细纲第一场在别的地点，先用两到四句把人物从上一章结尾的位置、动作或物件带出来，再进细纲第一场；这段承接不算表外新场，必须写。`,
        `禁止用新地点、新人物或「与此同时 / 另一边」冷开场，禁止输出章名。`,
        `交稿前只看第一句：若不是从上一章最后一句继续，就重写开头。`,
      ].join("\n")
    );
  }

  return {
    chapter,
    userContent: blocks.join("\n"),
    missing,
  };
}

function countWords(text) {
  return Array.from(String(text || "").replace(/\s+/g, "")).length;
}

function clipToWordMax(text, max) {
  const raw = String(text || "");
  const limit = Number(max);
  if (!raw || !Number.isFinite(limit) || limit <= 0 || countWords(raw) <= limit) return raw;
  const bySentence = (chunk) => {
    const parts = chunk.split(/(?<=[。！？…])/);
    let acc = "";
    for (const part of parts) {
      const next = acc + part;
      if (countWords(next) > limit) break;
      acc = next;
    }
    return acc;
  };
  const paragraphs = raw.split(/\n{2,}/);
  let kept = "";
  for (const para of paragraphs) {
    const next = kept ? `${kept}\n\n${para}` : para;
    if (countWords(next) <= limit) {
      kept = next;
      continue;
    }
    const cut = bySentence(next).trimEnd();
    if (cut) return cut;
    break;
  }
  if (kept && countWords(kept) <= limit) return kept.trimEnd();
  let count = 0;
  let out = "";
  for (const ch of Array.from(raw)) {
    if (/\s/.test(ch)) {
      out += ch;
      continue;
    }
    if (count >= limit) break;
    out += ch;
    count += 1;
  }
  return out.trimEnd();
}

module.exports = { buildContext, countWords, clip, clipToWordMax, isWritingSkill, isFastSkill };
