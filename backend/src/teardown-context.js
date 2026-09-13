const { clip, countWords } = require("./context");
const { scopedChapters } = require("./teardown");

function headTail(text, head = 400, tail = 400) {
  const raw = String(text || "").trim();
  const words = countWords(raw);
  if (words <= head + tail + 40) return raw;
  const chars = Array.from(raw);
  let start = "";
  let n = 0;
  for (const ch of chars) {
    start += ch;
    if (!/\s/.test(ch)) n += 1;
    if (n >= head) break;
  }
  let end = "";
  n = 0;
  for (let i = chars.length - 1; i >= 0; i -= 1) {
    const ch = chars[i];
    end = ch + end;
    if (!/\s/.test(ch)) n += 1;
    if (n >= tail) break;
  }
  return `${start.trim()}\n……\n${end.trim()}`;
}

function batchChapters(teardown, fromIndex, size = 8) {
  const scoped = scopedChapters(teardown);
  const start = Math.max(1, Number(fromIndex) || 1);
  return scoped.filter((ch) => ch.index >= start).slice(0, size);
}

function buildTeardownContext({ teardown, skill, extra, fromIndex }) {
  const scoped = scopedChapters(teardown);
  const blocks = [
    `# 拆书工程`,
    `书名：${teardown.title}`,
    `来源文件：${teardown.sourceName || "粘贴导入"}`,
    `拆解范围：第1章到第${teardown.scopeEnd || scoped.length}章，共 ${scoped.length} 章`,
    `纪律：只输出拆解条目。原句摘录每条不超过 80 字并标明章号。禁止把参考书情节整章写进作者自己的稿。禁止输出本章说明书。`,
  ];

  if (skill.id === "teardown-beats") {
    const batch = batchChapters(teardown, fromIndex, 8);
    blocks.push(`\n# 本批章节（只拆这几章）`);
    for (const ch of batch) {
      blocks.push(`## 第${ch.index}章 ${ch.title}\n字数：${ch.wordCount}\n${headTail(ch.content, 400, 400)}`);
    }
    blocks.push(`\n# 输出纪律\n每章一个标题：### 第N章 标题。下面四行：目标： / 冲突： / 出场： / 钩子： 各一句。N 必须与输入章号一致。`);
  } else if (skill.id === "teardown-cast") {
    blocks.push(`\n# 已有章纲\n${clip(teardown.beats, 6000)}`);
    const heads = scoped.filter((ch) => ch.index <= 3);
    for (const ch of heads) {
      blocks.push(`\n# 第${ch.index}章摘录\n${headTail(ch.content, 800, 400)}`);
    }
    blocks.push(`\n# 输出纪律\n每人 ### 姓名。含身份、欲望、关系、声口、首次出场章。`);
  } else if (skill.id === "teardown-golden") {
    for (const ch of scoped.filter((ch) => ch.index <= 3)) {
      blocks.push(`\n# 第${ch.index}章 ${ch.title}\n${clip(ch.content, 6000)}`);
    }
    blocks.push(`\n# 输出纪律\n只分析第1至第3章。必须含：人设立住、核心冲突、金手指或核心能力兑现、三章钩子。`);
  } else if (skill.id === "teardown-events") {
    blocks.push(`\n# 章纲\n${clip(teardown.beats, 8000)}`);
    blocks.push(`\n# 输出纪律\n每个节点 ### 第N章 事件名。含：谁做了什么、代价或转折。按时间排。`);
  } else if (skill.id === "teardown-outline") {
    blocks.push(`\n# 章纲\n${clip(teardown.beats, 5000)}`);
    blocks.push(`\n# 事件线\n${clip(teardown.events, 4000)}`);
    blocks.push(`\n# 输出纪律\n按卷或大阶段概括全书。### 阶段标题。`);
  } else if (skill.id === "teardown-detail") {
    blocks.push(`\n# 整体大纲\n${clip(teardown.outline, 3000)}`);
    blocks.push(`\n# 章纲\n${clip(teardown.beats, 5000)}`);
    blocks.push(`\n# 输出纪律\n展开到冲突与高潮。### 阶段或卷名。`);
  } else if (skill.id === "teardown-fine") {
    const batch = batchChapters(teardown, fromIndex, 8);
    blocks.push(`\n# 详细大纲\n${clip(teardown.outlineDetail, 2500)}`);
    blocks.push(`\n# 本批章纲（只写这几章的场面）`);
    for (const ch of batch) {
      blocks.push(`### 第${ch.index}章 ${ch.title}\n${clip(ch.beat || "", 800)}`);
    }
    blocks.push(`\n# 输出纪律\n只写本批章节。每场一行：章｜谁｜进场带着什么｜本场要办成｜谁挡住｜下场带走什么。禁止对话。`);
  } else if (skill.id === "teardown-craft") {
    blocks.push(`\n# 黄金三章拆解\n${clip(teardown.golden, 4000)}`);
    blocks.push(`\n# 角色声口\n${clip(teardown.cast, 2500)}`);
    blocks.push(`\n# 抽样章纲\n${clip(teardown.beats, 3500)}`);
    blocks.push(`\n# 整体大纲\n${clip(teardown.outline, 2000)}`);
    blocks.push(`\n# 精细大纲抽样\n${clip(teardown.outlineFine, 2500)}`);
    const { getSkill, CRAFT_SLOTS } = require("./skills");
    const currentCraft = [];
    for (const slot of CRAFT_SLOTS) {
      const row = getSkill(slot.id);
      const body = String(row && row.body || "");
      const idx = body.indexOf("## 对标技法");
      if (idx >= 0) {
        currentCraft.push(`## ${slot.name}（${slot.id}）\n${clip(body.slice(idx), 700)}`);
      }
    }
    if (currentCraft.length) {
      blocks.push(`\n# 已写入内置 Skill 的对标技法（请升级：写得更具体、更好看，禁止删掉仍有效的约束）\n${currentCraft.join("\n\n")}`);
    }
    const headers = CRAFT_SLOTS.map((slot) => `### [${slot.id}]`).join("、");
    blocks.push(
      `\n# 输出纪律\n输出会直接写入对应内置 Skill 的「对标技法」一节，覆盖全站写稿。每个步骤一个标题，标题必须写成 ${headers}。标题下一行起写该步骤的祈使句约束，要具体到能直接执行，让成品更好看。立项写雪花一句怎么立、笑点主味从哪来；人物写目标动机冲突顿悟、当前误判、声口指纹；细纲写场面一行怎么排、钩子类型怎么轮、误判写哪；正文写心口、思维断层、对白说一半、信息七成、钩子换类型、删除解释句和总结句。禁止只写结构锁。禁止抄参考书情节，禁止超过 80 字的原句，不要输出 front matter。`
    );
  } else if (skill.id === "teardown-imitate") {
    for (const ch of scoped.slice(0, 5)) {
      blocks.push(`\n# 第${ch.index}章 ${ch.title}\n${clip(ch.content, 2400)}`);
    }
    blocks.push(
      `\n# 输出纪律\n按八个维度输出：### 句子节奏、### 对白模式、### 叙述视角、### 用词习惯、### 人味锚点、### 节奏结构、### 段落结构、### 标点习惯。每维用「- 项目：值」。最后输出「### 通用骨架」，写死这些比例与用词：平均句长与短中长句占比与句长标准差；一段几句与一句一段占比；对白占比与对白均长与每300字对白组数；对白段、动作段、旁白段占比；逗号、省略号、破折号密度；用词与口头禅（高频词、口语词、句尾语气词、叠词密度）；比喻每千字密度与来源；人味锚点（小动作、具体次数/量、不完整句占比、心理外化密度）。数字必须从原文真数出来，禁止编造。只拆结构，禁止复述情节，原句摘录不超过 40 字。不要输出 front matter。`
    );
  }

  if (extra) blocks.push(`\n# 作者附加指令\n${clip(extra, 1200)}`);
  return { userContent: blocks.join("\n"), missing: scoped.length ? [] : ["导入正文"] };
}

module.exports = { buildTeardownContext, batchChapters, headTail };
