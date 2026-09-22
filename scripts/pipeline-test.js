// Skill 流水线单一数据源回归测试。
// 断言 shared/pipeline.json + backend/src/pipeline.js 的派生结果与迁移前硬编码常量完全一致。
// 用法：node scripts/pipeline-test.js
const pipeline = require("../backend/src/pipeline.js");

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: Boolean(ok), detail });
}

// 迁移前的硬编码常量（作为等价性基准）。
const OLD_WRITING_INJECT = "kickoff,characters,world,outline,chapter-beats,chapter-prose,continue,polish,props";
const OLD_CRAFT_SLOTS = [
  { id: "kickoff", name: "立项" },
  { id: "characters", name: "人物" },
  { id: "world", name: "世界" },
  { id: "outline", name: "大纲" },
  { id: "chapter-beats", name: "细纲" },
  { id: "chapter-prose", name: "正文" },
  { id: "continue", name: "续写" },
  { id: "polish", name: "润色" },
  { id: "props", name: "道具" },
];
const OLD_DROP_WRITING = ["brief", "characters"];
const OLD_DROP_SETTING = ["props", "world", "characters", "brief", "outline", "prev"];
const OLD_PIPE_BUILTINS = ["kickoff", "characters", "world", "outline", "chapter-beats", "chapter-prose", "props"];

// ---- 定义完整性 ----
check("定义含写作线与拆书线", pipeline.STAGES.length > 0 && pipeline.DEFINITION.lines.length === 2, String(pipeline.STAGES.length));
const ids = pipeline.STAGES.map((stage) => stage.id);
check("阶段 id 唯一", new Set(ids).size === ids.length, `${ids.length} 个阶段`);
check("阶段 index 单调递增", pipeline.STAGES.every((stage, i) => stage.index === i), "index 顺序");
check("trim 显式保留", Array.isArray(pipeline.dropOrder(true)) && Array.isArray(pipeline.dropOrder(false)), "trim 两线");

// ---- 与迁移前常量等价 ----
check("injectTargets 等价旧 WRITING_INJECT", pipeline.injectTargets().join(",") === OLD_WRITING_INJECT, pipeline.injectTargets().join(","));
check(
  "craftSlots 等价旧 CRAFT_SLOTS",
  JSON.stringify(pipeline.craftSlots()) === JSON.stringify(OLD_CRAFT_SLOTS),
  JSON.stringify(pipeline.craftSlots())
);
check("dropOrder(writing) 等价", JSON.stringify(pipeline.dropOrder(true)) === JSON.stringify(OLD_DROP_WRITING), JSON.stringify(pipeline.dropOrder(true)));
check("dropOrder(setting) 等价", JSON.stringify(pipeline.dropOrder(false)) === JSON.stringify(OLD_DROP_SETTING), JSON.stringify(pipeline.dropOrder(false)));
check(
  "autoStages 内置集合等价",
  JSON.stringify(pipeline.autoStages().map((stage) => stage.builtin)) === JSON.stringify(OLD_PIPE_BUILTINS),
  JSON.stringify(pipeline.autoStages().map((stage) => stage.builtin))
);

// ---- stageOf 归位 ----
const stage = (skill) => pipeline.stageOf(skill).id;
check("内置按 id 归位", stage({ id: "chapter-prose" }) === "content", stage({ id: "chapter-prose" }));
check("自定义按 target 归位", stage({ id: "sk_x", target: "outline" }) === "outline", stage({ id: "sk_x", target: "outline" }));
check("指南按 inject 归位（kickoff → brief）", stage({ id: "tdcraft_x", target: "guide", inject: "kickoff" }) === "brief", stage({ id: "tdcraft_x", target: "guide", inject: "kickoff" }));
check("指南多值 inject 取首个可解析", stage({ id: "tdcraft_y", target: "guide", inject: "unknown, world" }) === "world", stage({ id: "tdcraft_y", target: "guide", inject: "unknown, world" }));
check("未知 target 落 other", stage({ id: "sk_y", target: "totally-unknown" }) === "other", stage({ id: "sk_y", target: "totally-unknown" }));
check("空技能落 other", stage(null) === "other", stage(null));

// ---- 写作语义判定 ----
check("brief 非正文写作语境", pipeline.isWritingSkill({ target: "brief" }) === false, "brief");
check("brief 归位正确", stage({ target: "brief" }) === "brief", stage({ target: "brief" }));
check("chapter-prose 属正文语境", pipeline.isProseContextSkill({ target: "content" }) === true, "content");
check("polish 属写作", pipeline.isWritingSkill({ target: "polish" }) === true, "polish");
check("polish 非正文语境", pipeline.isProseContextSkill({ target: "polish" }) === false, "polish");
check("continue 属写作", pipeline.isWritingSkill({ target: "content" }) === true, "content");
check("拆书线非写作", pipeline.isWritingSkill({ target: "td-beats" }) === false, "td-beats");

// ---- 排序 ----
const stageIndex = (id) => pipeline.STAGES.findIndex((row) => row.id === id);
const cmp = pipeline.compareSkills;
check("阶段优先（brief 先于 content）", cmp({ id: "a", target: "brief" }, { id: "b", target: "content" }) < 0, "brief < content");
check("阶段内内置先于自定义", cmp({ id: "a", target: "outline", source: "builtin", order: 9 }, { id: "b", target: "outline", source: "custom", order: 1 }) < 0, "builtin first");
check("同源按 order", cmp({ id: "a", target: "outline", source: "custom", order: 1 }, { id: "b", target: "outline", source: "custom", order: 2 }) < 0, "order");
check("order 相同按 id 稳定", cmp({ id: "a", target: "outline", source: "custom", order: 5 }, { id: "b", target: "outline", source: "custom", order: 5 }) < 0, "id tiebreak");
check("normalizeSkills 不改动传入数组", (() => {
  const list = [{ id: "b", target: "outline", source: "custom", order: 2 }, { id: "a", target: "outline", source: "custom", order: 1 }];
  const copy = list.slice();
  pipeline.normalizeSkills(list);
  return list[0] === copy[0] && list[1] === copy[1];
})(), "immutable");
check(
  "阶段排序：正文语境落在内容阶段",
  (() => {
    const sorted = pipeline.normalizeSkills([
      { id: "sk_c", target: "content", source: "custom", order: 1 },
      { id: "polish", target: "polish", source: "builtin", order: 8 },
      { id: "props", target: "props", source: "builtin", order: 9 },
    ]);
    const ci = sorted.findIndex((s) => s.target === "content");
    const pi = sorted.findIndex((s) => s.target === "polish");
    return ci < pi && stageIndex("content") < stageIndex("polish");
  })(),
  "content < polish"
);

// ---- 中点插值 ----
check("placeBetween 空边界 → STEP", pipeline.placeBetween(null, null) === pipeline.STEP, String(pipeline.placeBetween(null, null)));
check("placeBetween 无前项", pipeline.placeBetween(null, 300) === 200, String(pipeline.placeBetween(null, 300)));
check("placeBetween 无后项", pipeline.placeBetween(200, null) === 300, String(pipeline.placeBetween(200, null)));
check("placeBetween 取中点", pipeline.placeBetween(100, 200) === 150, String(pipeline.placeBetween(100, 200)));
check("gapTight 判空隙过窄", pipeline.gapTight(100, 100.00005) === true && pipeline.gapTight(100, 200) === false, "gap");
check("compactValues 重分配", pipeline.compactValues(3).join(",") === "100,200,300", pipeline.compactValues(3).join(","));

const failed = results.filter((row) => !row.ok);
for (const row of results) if (!row.ok) console.log(`  FAIL ${row.name} → ${row.detail || ""}`);
console.log(`\n${results.length - failed.length}/${results.length} 通过`);
process.exit(failed.length ? 1 : 0);
