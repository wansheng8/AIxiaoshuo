// 脑洞二次抽卡回归测试：校验卡库结构、后端示例选择与模型返回解析。
// 用法：node scripts/spark-deck-test.js
const fs = require("fs");
const path = require("path");

const FILE = path.join(__dirname, "..", "shared", "spark-deck.json");

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: Boolean(ok), detail });
}

let deck = null;
try {
  deck = JSON.parse(fs.readFileSync(FILE, "utf8"));
} catch (err) {
  console.error(`无法读取卡库：${err.message}`);
  process.exit(2);
}

const CHANNELS = ["male", "female", "common"];
const MIN_PER_CHANNEL = { male: 10, female: 10, common: 5 };
const cards = Array.isArray(deck.cards) ? deck.cards : [];

check("版本号为 1", deck.version === 1, String(deck.version));
check("卡片为数组且非空", Array.isArray(deck.cards) && cards.length > 0, String(cards.length));

const ids = cards.map((card) => card.id);
check("id 全局唯一", new Set(ids).size === ids.length, `${ids.length} 张卡`);
check(
  "channel 取值合法",
  cards.every((card) => CHANNELS.includes(card.channel)),
  cards.filter((card) => !CHANNELS.includes(card.channel)).map((card) => card.id).join(",") || "全部合法"
);
check(
  "tags 为 1-3 个非空字符串",
  cards.every((card) => Array.isArray(card.tags) && card.tags.length >= 1 && card.tags.length <= 3 && card.tags.every((tag) => String(tag || "").trim())),
  cards.filter((card) => !Array.isArray(card.tags) || !card.tags.length).map((card) => card.id).join(",") || "全部合法"
);
check(
  "hook/conflict/edge 非空",
  cards.every((card) => ["hook", "conflict", "edge"].every((key) => String(card[key] || "").trim())),
  "全部合法"
);
check(
  "details 为 2-4 条非空",
  cards.every((card) => Array.isArray(card.details) && card.details.length >= 2 && card.details.length <= 4 && card.details.every((item) => String(item || "").trim())),
  "全部合法"
);
for (const channel of CHANNELS) {
  const count = cards.filter((card) => card.channel === channel).length;
  check(`${channel} 频道卡片不少于 ${MIN_PER_CHANNEL[channel]} 张`, count >= MIN_PER_CHANNEL[channel], `${count} 张`);
}

// ---- 后端示例选择 ----
const deckMod = require("../backend/src/spark-deck.js");
check("deckCards('common') 只含通用卡", deckMod.deckCards("common").every((card) => card.channel === "common"), "common");
check("deckCards('male') 含男频与通用、不含女频", deckMod.deckCards("male").every((card) => card.channel === "male" || card.channel === "common") && deckMod.deckCards("male").some((card) => card.channel === "male"), "male");
check("examplesFor 返回指定数量", CHANNELS.every((channel) => deckMod.examplesFor(channel, 2).length === 2), "每频道 2 条");
check("examplesFor 优先后取本频道卡", deckMod.examplesFor("male", 2).every((card) => card.channel === "male"), deckMod.examplesFor("male", 2).map((card) => card.channel).join(","));

// ---- 模型返回解析 ----
const skills = require("../backend/src/skills");
const cardJson = (n, extra = {}) =>
  Array.from({ length: n }, (_, i) => JSON.stringify({ hook: `H${i}`, conflict: `C${i}`, edge: `E${i}`, details: ["d1", "d2", "d3"], tags: ["玄幻"], ...extra })).join(",");

const fenced = skills.parseSparkCards("```json\n[" + cardJson(3) + "]\n```", "male");
check("解析围栏 JSON 数组", fenced.length === 3, `${fenced.length} 张`);
check("解析结果带上频道与 id", fenced.every((card) => card.channel === "male" && card.id), JSON.stringify(fenced[0]));
check("解析结果为纯字段卡", fenced.every((card) => card.hook && card.conflict && card.edge && card.details.length >= 2), "完整字段");

const bare = skills.parseSparkCards("[" + cardJson(2) + "]", "female");
check("解析裸 JSON 数组", bare.length === 2 && bare.every((card) => card.channel === "female"), `${bare.length} 张`);

const wrapped = skills.parseSparkCards(JSON.stringify({ cards: JSON.parse("[" + cardJson(3) + "]") }), "common");
check("解析 {cards:[...]} 包装", wrapped.length === 3, `${wrapped.length} 张`);

const underfilled = skills.parseSparkCards(JSON.stringify([JSON.parse(cardJson(1)), { hook: "只有核" }]), "male");
check("丢弃缺少细节的卡", underfilled.length === 1, `${underfilled.length} 张`);

const capped = skills.parseSparkCards("[" + cardJson(5) + "]", "male");
check("最多保留三张", capped.length === 3, `${capped.length} 张`);

const cappedTags = skills.parseSparkCards(
  "[" + JSON.stringify({ hook: "H", conflict: "C", edge: "E", details: ["a", "b"], tags: ["A", "B", "C", "D"] }) + "]",
  "male"
);
check("卡牌标签最多保留三个", cappedTags[0].tags.length === 3, `${cappedTags[0].tags.length} 个`);

const withPicks = skills.parseSparkCards(
  "[" +
    JSON.stringify({
      hook: "H",
      conflict: "C",
      edge: "E",
      details: ["a", "b"],
      tags: ["玄幻"],
      picks: { genres: ["玄幻", "仙侠", "都市", "武侠"], leads: ["女主", "男主"], tones: ["网文爽快"] },
    }) +
    "]",
  "male"
);
check(
  "picks 保留多选维度最多 3 个、单选维度最多 1 个",
  withPicks[0].picks.genres.length === 3 && withPicks[0].picks.leads.length === 1 && withPicks[0].picks.tones[0] === "网文爽快",
  JSON.stringify(withPicks[0].picks)
);

const badPicks = skills.parseSparkCards(
  "[" +
    JSON.stringify({
      hook: "H",
      conflict: "C",
      edge: "E",
      details: ["a", "b"],
      tags: [],
      picks: { genres: ["不存在的类型", "玄幻"], nope: ["x"], leads: ["男主"] },
    }) +
    "]",
  "male"
);
check(
  "picks 丢弃非法维度与非法候选项",
  badPicks[0].picks.genres.join(",") === "玄幻" && !badPicks[0].picks.nope,
  JSON.stringify(badPicks[0].picks)
);

const barePicks = skills.parseSparkCards("[" + JSON.stringify({ hook: "H", conflict: "C", edge: "E", details: ["a", "b"], tags: [] }) + "]", "male");
check("缺 picks 的卡仍可用", barePicks.length === 1 && !barePicks[0].picks, JSON.stringify(barePicks[0].picks || null));

let malformedThrew = false;
try {
  skills.parseSparkCards("模型没给 JSON", "male");
} catch (err) {
  malformedThrew = err.status === 502;
}
check("无法解析时抛 502", malformedThrew, "malformed");

const failed = results.filter((row) => !row.ok);
for (const row of results) if (!row.ok) console.log(`  FAIL ${row.name} → ${row.detail || ""}`);
console.log(`\n${results.length - failed.length}/${results.length} 通过`);
process.exit(failed.length ? 1 : 0);
