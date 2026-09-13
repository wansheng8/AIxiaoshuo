import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { getNovel, saveNovel, now } = require("../backend/src/store");
const { getSkill } = require("../backend/src/skills");
const { completeChat } = require("../backend/src/llm");
const { buildContext, countWords } = require("../backend/src/context");
const { applyGenerated } = require("../backend/src/apply");

const PROJECT = "nv_mtl8h4nr_gwl34t";
const INCLUDE = {
  brief: true,
  world: true,
  characters: true,
  outline: true,
  prev: true,
  beats: true,
  props: true,
};

const CAST = `钉死人名：穿书者林奇；穿书后身份陈无咎（外门废柴男配）；原书男主萧云澜；原书女主苏晚晴；反派血衣楼尹赤；剧情修正系统。调性轻喜剧加烧脑，林奇嘴贱怕死脑子活，禁止无脑爽文腔。内世界是仙侠小说《剑起云澜》，外层是扑街作者的记忆。`;

const PLOT = {
  1: "林奇熬夜猝死，醒来发现自己是自己写的扑街文《剑起云澜》里的炮灰陈无咎。系统弹出第一个任务：三炷香内当众辱骂萧云澜。任务失败扣寿命。本章停在他看见萧云澜朝自己走来。",
  2: "原书打脸戏开场。林奇想躲，系统把任务改成必完成。他用作者记忆找了个漏洞应付，结果骂人成功，萧云澜没有动手，反而多看了他一眼。钩子：苏晚晴在廊下听见了全程。",
  3: "系统奖励一枚废丹，吃了腹泻。苏晚晴来问他为什么不怕萧云澜。林奇不敢说实话。钩子：系统发布新任务——今夜必须偷走萧云澜枕下那块玉。",
  4: "林奇夜入男主住所偷玉，差点被发现。他用原书里自己写过的巡夜漏洞溜走。玉入手后发烫，里面有他作为作者时随手写错的一个地名。钩子：系统提示任务完成，但剧情偏离度+17%。",
  5: "萧云澜发现玉丢了，外门大搜。林奇把玉藏进茅房。系统要他当众把玉交出去并承认。他交了一块假玉。钩子：真玉在茅房里自己亮了，被尹赤的探子看见。",
  6: "尹赤派人接触陈无咎，请他喝酒。林奇知道原书里这顿酒是炮灰投靠反派然后被灭口的情节。他喝了半杯就装醉。钩子：系统弹出任务：必须救尹赤今晚一命。",
  7: "原书今夜尹赤不该死。林奇发现有人要提前杀尹赤——剧情已经被他带崩了。他救了尹赤，尹赤开始认真看他。钩子：萧云澜在暗处看见他救反派。",
  8: "萧云澜白天点名陈无咎比试。林奇用作者记忆躲开杀招，但记错了萧云澜第三剑的变化——那是他后来修过的一稿，这本书里没改。他挨了一剑。钩子：系统冷冷提示：寿命-3天。你正在被原书删除。",
  9: "林奇发现自己手臂上的字迹在淡：原书对陈无咎的描写正在被擦掉。苏晚晴替他包扎，问他是不是从很远的地方来的。钩子：系统发布主线任务：在七日之内让《剑起云澜》的结局改写成你活着。",
  10: "林奇翻开自己随身那本残稿（穿书时带过来的打印稿），末页多了一行不是他写的字：作者已死，角色续写。萧云澜站在门外叫他的名字——叫的是林奇，不是陈无咎。本章停在这一声上。",
};

function uid(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function ensureChapters(novel, count) {
  const chapters = [...(novel.chapters || [])];
  while (chapters.length < count) {
    const index = chapters.length + 1;
    chapters.push({
      id: uid("ch"),
      index,
      title: `第${index}章`,
      beats: "",
      content: "",
      wordCount: 0,
      updatedAt: now(),
    });
  }
  chapters.forEach((ch, i) => {
    ch.index = i + 1;
  });
  novel.chapters = chapters;
  return novel;
}

function titleFromBeats(beats, fallback) {
  const text = String(beats || "");
  const named = text.match(/《([^》]+)》/);
  if (named?.[1]) return named[1].trim();
  const line = text.match(/###\s*[^\n]+/);
  if (line) {
    return (
      line[0]
        .replace(/^###\s*/, "")
        .replace(/^第[零一二三四五六七八九十百\d]+章\s*/, "")
        .replace(/[《》]/g, "")
        .trim() || fallback
    );
  }
  return fallback;
}

async function runSkill(skillId, chapterId, extra) {
  const novel = getNovel(PROJECT);
  const skill = getSkill(skillId);
  if (!novel || !skill) throw new Error("工程或写法不存在");
  const { userContent } = buildContext({
    novel,
    skill,
    chapterId,
    extra,
    include: INCLUDE,
  });
  const output = await completeChat({
    messages: [
      {
        role: "system",
        content: `你是墨枢小说工坊里的写作执行者。必须严格遵守下面这份 Skill 说明书。用简体中文写作。不要输出这份说明书本身，不要解释过程，直接给出 Skill 要求的成品。\n\n${skill.raw || skill.body}`,
      },
      { role: "user", content: userContent },
    ],
    temperature: 0.88,
    timeoutMs: skill.target === "content" ? 180000 : 90000,
  });
  const latest = getNovel(PROJECT);
  const merged = applyGenerated(latest, { skill, chapterId, output, mode: "replace" });
  saveNovel(merged);
  return output;
}

async function main() {
  let novel = getNovel(PROJECT);
  if (!novel) throw new Error("找不到《穿书改命系统》");
  novel = ensureChapters(novel, 10);
  saveNovel(novel);
  const firstId = novel.chapters[0].id;

  if (!novel.world) {
    console.log("world");
    await runSkill("world", firstId, CAST);
  }
  novel = getNovel(PROJECT);
  if (!novel.characters) {
    console.log("characters");
    await runSkill("characters", firstId, CAST);
  }
  novel = getNovel(PROJECT);
  if (!novel.outline) {
    console.log("outline");
    await runSkill("outline", firstId, `${CAST}\n先写能支撑前十章的骨架，第一卷节拍至少覆盖十章。`);
  }

  for (let index = 1; index <= 10; index += 1) {
    novel = getNovel(PROJECT);
    const chapter = novel.chapters[index - 1];
    if (chapter.content && countWords(chapter.content) > 800) {
      console.log(`skip chapter ${index} ${chapter.title} (${chapter.wordCount}字)`);
      continue;
    }
    console.log(`beats chapter ${index}`);
    const beats = await runSkill(
      "chapter-beats",
      chapter.id,
      `${CAST}\n只输出第${index}章这一章的细纲，不要写其他章。${PLOT[index]}`
    );
    novel = getNovel(PROJECT);
    const current = novel.chapters.find((c) => c.id === chapter.id);
    current.title = titleFromBeats(beats, current.title);
    saveNovel(novel);
    console.log(`prose chapter ${index} 《${current.title}》`);
    await runSkill(
      "chapter-prose",
      chapter.id,
      `${CAST}\n这是第${index}章《${current.title}》。直接写本章正文，不要标题，不要「第${index}章」。2200到3500字。对话要能听出林奇是现代人嘴，萧云澜是仙侠男主。${PLOT[index]} 承接上一章最后的动作和对话。`
    );
    novel = getNovel(PROJECT);
    const done = novel.chapters.find((c) => c.id === chapter.id);
    console.log(`done chapter ${index} 《${done.title}》 ${done.wordCount}字`);
  }

  novel = getNovel(PROJECT);
  for (const ch of novel.chapters) {
    console.log(`${ch.index}\t${ch.title}\t${ch.wordCount}字`);
  }
}

main().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});
