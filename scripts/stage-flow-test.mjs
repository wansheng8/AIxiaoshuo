// 阶段卡片流回归测试：用 esbuild 打包 TS 模块后在 Node 中断言状态推导。
// 用法：node scripts/stage-flow-test.mjs
import { createRequire } from "module";
import path from "path";
import os from "os";
import fs from "fs";

const ROOT = path.resolve(import.meta.dirname, "..");
const requireFrontend = createRequire(path.join(ROOT, "frontend/package.json"));
const { build } = requireFrontend("esbuild");
const outfile = path.join(os.tmpdir(), `stage-flow-${Date.now()}.cjs`);

await build({
  entryPoints: [path.join(ROOT, "frontend/src/domain/stage-flow.ts")],
  bundle: true,
  format: "cjs",
  platform: "node",
  outfile,
  alias: { "@shared": path.join(ROOT, "shared") },
  logLevel: "silent",
});

const require = createRequire(import.meta.url);
const { buildStageFlow } = require(outfile);
fs.unlinkSync(outfile);
const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: Boolean(ok), detail });
}

const novel = {
  brief: "卖点：死地签到",
  characters: "### 林渡\n### 老陈",
  outline: "三卷大纲",
  props: "### 黑刀\n### 青铜令",
  chapters: [
    { id: "ch_1", index: 1, title: "第一章", beats: "### 开场\n### 转场", content: "正文正文", advice: "把冲突提前" },
  ],
  threads: [{ id: "t1" }, { id: "t2" }],
};
const chapter = novel.chapters[0];

const cards = buildStageFlow({ novel, chapter, line: "writing" });
const byId = Object.fromEntries(cards.map((c) => [c.stage.id, c]));

check("写作线阶段数", cards.length === 12, String(cards.length));
check("顺序与 index 一致", cards.every((c, i) => c.order === i), "order");
check("brief 已完成", byId.brief.status === "done", byId.brief.status);
check("characters 已完成", byId.characters.status === "done", byId.characters.status);
check("world 未开始", byId.world.status === "todo", byId.world.status);
check("content 已完成", byId.content.status === "done", byId.content.status);
check("suggest 已完成（advice）", byId.suggest.status === "done", byId.suggest.status);
check("review 未开始", byId.review.status === "todo", byId.review.status);
check("beats 已完成", byId.beats.status === "done", byId.beats.status);

const worldDeps = byId.world.deps.map((d) => d.id);
check("world 依赖 brief", worldDeps.includes("brief"), JSON.stringify(worldDeps));
check("world 依赖已满足", byId.world.deps.every((d) => d.satisfied), "deps");
const contentDeps = byId.content.deps.find((d) => d.id === "beats");
check("content 依赖 beats 已满足", contentDeps && contentDeps.satisfied, JSON.stringify(contentDeps));

check("content 关联人物 2", byId.content.refs.find((r) => r.kind === "characters")?.count === 2, JSON.stringify(byId.content.refs));
check("content 关联道具 2", byId.content.refs.find((r) => r.kind === "props")?.count === 2, JSON.stringify(byId.content.refs));
check("content 关联细节拍 2", byId.content.refs.find((r) => r.kind === "beats")?.count === 2, JSON.stringify(byId.content.refs));
check("threads 关联 2 条伏笔", byId.threads.refs.find((r) => r.kind === "threads")?.count === 2, JSON.stringify(byId.threads.refs));

// active / failed / skipped 优先级
const active = buildStageFlow({ novel, chapter, line: "writing", activeStageId: "world" });
check("active 覆盖 done", active.find((c) => c.stage.id === "world").status === "active", "active");
const failed = buildStageFlow({ novel, chapter, line: "writing", failedStageId: "outline" });
check("failed 生效", failed.find((c) => c.stage.id === "outline").status === "failed", "failed");
const skipped = buildStageFlow({ novel, chapter, line: "writing", skipped: ["world"] });
check("skipped 生效", skipped.find((c) => c.stage.id === "world").status === "skipped", "skipped");
check("done 优先于 skipped", skipped.find((c) => c.stage.id === "brief").status === "done", "brief");

// 拆书线：record + filled 覆盖
const record = { beats: "### 第一章", cast: "### 林渡", outline: "", outlineDetail: "", outlineFine: "", imitate: "", recipes: "" };
const tear = buildStageFlow({
  line: "teardown",
  record,
  filled: { "td-beats": true, "td-cast": true, "td-craft": true },
  activeStageId: "td-events",
});
const tearById = Object.fromEntries(tear.map((c) => [c.stage.id, c]));
check("拆书线 9 个阶段", tear.length === 9, String(tear.length));
check("td-beats 完成", tearById["td-beats"].status === "done", tearById["td-beats"].status);
check("td-events active", tearById["td-events"].status === "active", tearById["td-events"].status);
check("td-craft 完成", tearById["td-craft"].status === "done", tearById["td-craft"].status);
check("td-imitate 未开始", tearById["td-imitate"].status === "todo", tearById["td-imitate"].status);

// 阶段轨分组与面板映射
const pipeOut = path.join(os.tmpdir(), `pipeline-${Date.now()}.cjs`);
await build({
  entryPoints: [path.join(ROOT, "frontend/src/domain/pipeline.ts")],
  bundle: true,
  format: "cjs",
  platform: "node",
  outfile: pipeOut,
  alias: { "@shared": path.join(ROOT, "shared") },
  logLevel: "silent",
});
const pipeline = require(pipeOut);
fs.unlinkSync(pipeOut);
const grouped = pipeline.WRITING_GROUPS.flatMap((group) => group.stageIds);
const writingIds = pipeline.STAGES.filter((stage) => stage.line === "writing").map((stage) => stage.id);
check("阶段轨覆盖写作线", grouped.length === writingIds.length && writingIds.every((id) => grouped.includes(id)), JSON.stringify(grouped));
check("阶段轨 4 组", pipeline.WRITING_GROUPS.length === 4, String(pipeline.WRITING_GROUPS.length));
const polishStage = pipeline.STAGES.find((stage) => stage.id === "polish");
check("panelOfStage(polish) 指向正文", pipeline.panelOfStage(polishStage).desk === "write" && pipeline.panelOfStage(polishStage).tab === "content", JSON.stringify(pipeline.panelOfStage(polishStage)));
const threadsStage = pipeline.STAGES.find((stage) => stage.id === "threads");
check("panelOfStage(threads) 指向伏笔", pipeline.panelOfStage(threadsStage).desk === "threads", JSON.stringify(pipeline.panelOfStage(threadsStage)));

const failedRows = results.filter((row) => !row.ok);
for (const row of results) console.log(`${row.ok ? "ok  " : "FAIL"} ${row.name}${row.ok ? "" : ` -> ${row.detail}`}`);
console.log(`\n${results.length - failedRows.length}/${results.length} 通过`);
process.exit(failedRows.length ? 1 : 0);
