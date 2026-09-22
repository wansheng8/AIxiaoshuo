// 流水线落盘回归测试：验证 P0-1（建议/审稿分字段）、P0-2（整章 replace / 续写 append）、P0-3（拆书字段解耦）。
// 用法：node scripts/apply-test.js
const { applyGenerated } = require("../backend/src/apply.js");
const pipeline = require("../backend/src/pipeline.js");

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: Boolean(ok), detail });
}

function makeNovel(extra = {}) {
  return {
    id: "nv_test",
    craft: { cleanCopy: false, wordsMax: 3800 },
    lexicon: {},
    chapters: [{ id: "ch_1", index: 1, title: "第一章", content: "", beats: "", reviewReport: "" }],
    ...extra,
  };
}

// P0-1：suggest 落 advice，不碰 reviewReport
{
  const novel = makeNovel();
  novel.chapters[0].reviewReport = "正式审稿：节奏偏慢";
  const out = applyGenerated(novel, {
    skill: { id: "suggest", target: "review" },
    chapterId: "ch_1",
    output: "卡壳建议：把冲突提前",
  });
  check("suggest 写入 advice", out.chapters[0].advice === "卡壳建议：把冲突提前", out.chapters[0].advice);
  check("suggest 不覆盖审稿", out.chapters[0].reviewReport === "正式审稿：节奏偏慢", out.chapters[0].reviewReport);
  check("suggest 无 verdict 副作用", !out.chapters[0].reviewVerdict, String(out.chapters[0].reviewVerdict));
}

// review 仍写 reviewReport
{
  const novel = makeNovel();
  const out = applyGenerated(novel, {
    skill: { id: "review", target: "review" },
    chapterId: "ch_1",
    output: "### 判据\n重复铺垫。\n### 过稿判断\n过\n### 改法\n删掉重复铺垫",
  });
  check("review 写入 reviewReport", out.chapters[0].reviewReport.includes("过稿"), out.chapters[0].reviewReport);
  check("review 生成 verdict", out.chapters[0].reviewVerdict === "过", String(out.chapters[0].reviewVerdict));
  check("review 不写 advice", !out.chapters[0].advice, String(out.chapters[0].advice));
}

// P0-2：chapter-prose 整章替换
{
  const novel = makeNovel();
  novel.chapters[0].content = "旧正文有一大段内容。";
  const out = applyGenerated(novel, {
    skill: { id: "chapter-prose", target: "content" },
    chapterId: "ch_1",
    output: "第一章 新标题\n新正文完整一章。",
  });
  check("chapter-prose 整章替换", out.chapters[0].content === "新正文完整一章。", out.chapters[0].content);
}

// P0-2：continue 追加续写
{
  const novel = makeNovel();
  novel.chapters[0].content = "前半章内容。";
  const out = applyGenerated(novel, {
    skill: { id: "continue", target: "content" },
    chapterId: "ch_1",
    output: "后半章接着写。",
  });
  check("continue 追加续写", out.chapters[0].content === "前半章内容。\n后半章接着写。", out.chapters[0].content);
  check("continue 保留旧内容", out.chapters[0].content.startsWith("前半章内容。"), out.chapters[0].content);
}

// P0-3：拆书字段解耦（派生自 pipeline）
{
  const fields = pipeline.teardownSkillField();
  check("td-imitate → imitate", fields["teardown-imitate"] === "imitate", fields["teardown-imitate"]);
  check("td-craft → recipes", fields["teardown-craft"] === "recipes", fields["teardown-craft"]);
  check("td-imitate 与 td-craft 不同字段", fields["teardown-imitate"] !== fields["teardown-craft"], "解耦");
}

// schema v2：模式与字段派生
{
  check("continue 定义 append", pipeline.modeOf(pipeline.stageBySkill({ id: "continue" })) === "append", "append");
  check("chapter-prose 定义 replace", pipeline.modeOf(pipeline.stageBySkill({ id: "chapter-prose" })) === "replace", "replace");
  check("suggest 字段为 advice", pipeline.fieldOf(pipeline.stageBySkill({ id: "suggest" })) === "advice", pipeline.fieldOf(pipeline.stageBySkill({ id: "suggest" })));
  check("continue artifact 为 content", pipeline.stageBySkill({ id: "continue" }).artifact === "content", "content");
}

const failed = results.filter((row) => !row.ok);
for (const row of results) console.log(`${row.ok ? "ok  " : "FAIL"} ${row.name}${row.ok ? "" : ` -> ${row.detail}`}`);
console.log(`\n${results.length - failed.length}/${results.length} 通过`);
process.exit(failed.length ? 1 : 0);
