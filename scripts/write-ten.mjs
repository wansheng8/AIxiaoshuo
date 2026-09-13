import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { getNovel, saveNovel, now } = require("../backend/src/store");
const { getSkill } = require("../backend/src/skills");
const { completeChat } = require("../backend/src/llm");
const { buildContext, countWords } = require("../backend/src/context");
const { applyGenerated } = require("../backend/src/apply");

const PROJECT = "nv_mtl6jvrn_b754ms";
const INCLUDE = {
  brief: true,
  world: true,
  characters: true,
  outline: true,
  prev: true,
  beats: true,
  props: true,
};

const PLOT = {
  4: "承接上一章结尾：老灯头说「你看到了。那就别回头了。」闻舟必须追问湿沙上为何出现「闻舟」二字。本章写他被迫跟着老灯头下城墙，街灯惨白，井水开始发咸。钩子落到：禁闭室的门其实是老灯头故意没锁。",
  5: "闻舟夜入城门洞，用引路灯照向门缝。灯不照人间，只照出父亲的背影站在城内青石路上、面朝城外往外走。禁止写成回忆，必须是灯照出来的现场。钩子：老灯头出现在他身后。",
  6: "老灯头承认「你爹是自己走出去的。是我关的门。」墙上被刀刮掉的名牌是老灯头自己的旧名。闻舟的身份锚点碎裂。钩子：潮女在井边等他。",
  7: "潮女告诉闻舟：父亲不是被潮叫走，是去给潮送名字——送「闻舟」。闻舟第一次把灯照向一张活人的脸。停在灯火碰到她面颊之前，不要立刻吞没名字。",
  8: "灯吞没潮女的名字，她溶进井水。城心大井先变咸。闻舟失去唯一能解释父亲为何离开的证人。钩子：街上有人开始被集体遗忘。",
  9: "城中出现「叫名」：一个更夫的名字从所有人口中消失，人还在，却没人认得。闻舟去城主府查潮汐历。钩子：沈砚的门从里面反锁，屋里有人在对着什么念名字。",
  10: "闻舟看见潮汐历最后一页：今夜破城，名字栏一道刀痕划掉「闻舟」，换成「沈砚」。沈砚说：「你爹替你换了。现在轮到我了。」整章停在这句话上。",
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
    return line[0]
      .replace(/^###\s*/, "")
      .replace(/^第[零一二三四五六七八九十百\d]+章\s*/, "")
      .replace(/[《》]/g, "")
      .trim() || fallback;
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
  if (!novel) throw new Error("找不到《夜潮入城》");
  novel = ensureChapters(novel, 10);
  saveNovel(novel);

  for (let index = 4; index <= 10; index += 1) {
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
      `只输出第${index}章这一章的细纲，不要写其他章。${PLOT[index]}`
    );
    novel = getNovel(PROJECT);
    const current = novel.chapters.find((c) => c.id === chapter.id);
    current.title = titleFromBeats(beats, current.title);
    saveNovel(novel);
    console.log(`prose chapter ${index} 《${current.title}》`);
    await runSkill(
      "chapter-prose",
      chapter.id,
      `这是第${index}章《${current.title}》。直接写本章正文，不要标题，不要「第${index}章」。2200到3500字。${PLOT[index]} 承接上一章最后的动作和对话，信息增量必须不同。`
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
