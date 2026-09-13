const fs = require("fs");
const path = require("path");
const { ROOT, uid } = require("./store");
const { extractNouns } = require("./quality");
const { emotionBridgeLines } = require("./emotion");
const { atomicWriteJson } = require("./fileio");
const { migrate, stamp } = require("./schema");

const ELEMENTS_FILE = path.join(ROOT, "data", "elements.json");

function clip(text, max) {
  const value = String(text || "").trim();
  if (value.length <= max) return value;
  return `${value.slice(0, max)}…`;
}

function tailText(text, max) {
  const value = String(text || "").replace(/\s+/g, " ").trim();
  if (value.length <= max) return value;
  const parts = value
    .split(/(?<=[。！？…”])/)
    .map((part) => part.trim())
    .filter(Boolean);
  let out = "";
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    const next = parts[i] + out;
    if (next.length > max && out) break;
    out = next;
  }
  return out || `…${value.slice(-max)}`;
}

function previousChapter(novel, chapter) {
  if (!chapter) return null;
  return (novel?.chapters || []).find((ch) => ch.index === chapter.index - 1) || null;
}

function chapterHeading(chapter) {
  const title = String(chapter?.title || "").trim();
  return title ? `第${chapter.index}章 ${title}` : `第${chapter.index}章`;
}

function writtenChapters(novel) {
  return (novel?.chapters || [])
    .filter((ch) => String(ch.content || "").trim())
    .sort((a, b) => (Number(a.index) || 0) - (Number(b.index) || 0));
}

function openThreads(novel) {
  return (novel?.threads || []).filter(
    (row) => row && row.name && row.status !== "paid" && row.status !== "dropped"
  );
}

function renderContextAnchor(ctx = {}) {
  const { novel, chapter } = ctx;
  const lines = [];
  const prev = previousChapter(novel, chapter);
  const written = writtenChapters(novel);
  if (prev?.content) {
    lines.push(`上一章《${chapterHeading(prev)}》最后原文：“${tailText(prev.content, 160)}”`);
  } else if (written.length) {
    const last = written[written.length - 1];
    lines.push(`最近已写《${chapterHeading(last)}》最后原文：“${tailText(last.content, 160)}”`);
  }
  if (written.length) {
    const recent = written
      .slice(-4)
      .map((ch) => `第${ch.index}章`)
      .join("、");
    lines.push(`已写章节：${recent}。时间线必须连续，人物所在地、手上物件、知情范围不得与已写章节冲突。`);
  }
  const threads = openThreads(novel).slice(0, 6);
  if (threads.length) {
    lines.push(`未收伏笔：${threads.map((row) => `${row.name}${row.plant ? `（埋：${row.plant}）` : ""}`).join("；")}`);
  }
  const names = extractNouns(novel, chapter).slice(0, 16);
  if (names.length) lines.push(`专名以专名表为准：${names.join("、")}`);
  lines.push(
    `本章开场必须接上一章最后原文的同一时间、地点、人物状态：第一句接住最后的动作、对话、物件或未完成的选择，这条压过细纲第一场。若细纲第一场在别处，先用两到四句交代人物怎么离开上一章结尾的位置，再进细纲第一场，这段不算表外新场。禁止新地点新人物冷开场；禁止硬切倒计时、面板或新任务。`
  );
  return lines;
}

function renderCompleteness(ctx = {}) {
  const beats = String(ctx.chapter?.beats || "").trim();
  if (!beats) {
    return [
      `交稿前自查：本章主冲突是否写完一个完整来回（起势、压力、后果）；细纲场面有没有漏写或一笔带过。`,
    ];
  }
  return [
    `本章细纲（逐场兑现，缺一场就是内容缺失）：`,
    clip(beats, 900),
    `写完自查：细纲里的每个场面、每次能力兑现、每个钩子是否都写进正文；主冲突是否打完一个来回并留下后果。`,
  ];
}

function renderEmotionBridge(ctx = {}) {
  const { novel, chapter } = ctx;
  const prev = previousChapter(novel, chapter);
  const tail = String(prev?.content || "").trim() || String(writtenChapters(novel).slice(-1)[0]?.content || "").trim();
  if (!tail) {
    return [`本章情绪从人物身体、没说完的话和物件温度里自然长出来，不要旁白报情绪。`];
  }
  return emotionBridgeLines(tail, "prev");
}

function renderProofScan(ctx = {}) {
  const names = extractNouns(ctx.novel, ctx.chapter).slice(0, 20);
  const lines = [
    `交稿前逐字扫一遍：错别字、同音别字、地名/人名/专名前后写法是否一致，中英标点是否混用。`,
  ];
  if (names.length) lines.push(`专名固定写法：${names.join("、")}。正文里出现相近写法一律按此改。`);
  return lines;
}

function renderOpenThread(ctx = {}) {
  const threads = openThreads(ctx.novel).slice(0, 6);
  if (!threads.length) return [`本章可埋新线，至少用一个细节回扣一条已有伏笔。`];
  return [
    `未收伏笔：${threads
      .map((row) => `${row.name}（埋：${row.plant || "未填"}｜拟收：${row.payoff || "未定"}）`)
      .join("；")}`,
    `本章至少兑现或显著推进其中一条，让读者在场面里摸到。`,
  ];
}

const BUILTIN = [
  {
    id: "context-anchor",
    name: "上下文锚定",
    desc: "注入已写章节的关键状态（位置、物件、知情范围、未收伏笔），防止跳接。",
    scope: "writing",
    order: 10,
    dynamic: true,
    body: "",
    render: renderContextAnchor,
  },
  {
    id: "content-completeness",
    name: "内容完整性",
    desc: "把本章细纲逐场摆出，交稿前自查场面与能力兑现有没有漏。",
    scope: "writing",
    order: 20,
    dynamic: true,
    body: "",
    render: renderCompleteness,
  },
  {
    id: "emotion-bridge",
    name: "情绪衔接",
    desc: "读出上一章落点，让本章情绪从同一处身体和话尾接着长。",
    scope: "writing",
    order: 30,
    dynamic: true,
    body: "",
    render: renderEmotionBridge,
  },
  {
    id: "open-thread",
    name: "伏笔回收",
    desc: "列出未收伏笔，要求本章至少兑现或推进一条。",
    scope: "writing",
    order: 40,
    dynamic: true,
    body: "",
    render: renderOpenThread,
  },
  {
    id: "proof-scan",
    name: "错别字与一致性自检",
    desc: "交稿前逐字扫错别字、同音别字与专名前后不一，并给出专名固定写法。",
    scope: "all",
    order: 50,
    dynamic: true,
    body: "",
    render: renderProofScan,
  },
  {
    id: "cliffhanger",
    name: "章末钩子",
    desc: "章末停在动作临界点，钩子类型轮换，禁止把下一章写完。",
    scope: "writing",
    order: 60,
    dynamic: false,
    body: `章末停在动作或决定的临界点：手伸出去、门推开一半、话卡在喉咙。钩子类型轮换（新人物/新信息/新危险/新奖励/新选择/身份反转/认知反转/更大问题），近三章同型不用。禁止用内心吐槽收尾，禁止把下一章的打戏写完。`,
  },
  {
    id: "show-not-tell",
    name: "只演不说",
    desc: "情绪只准通过动作、身体、物件和没说出口的话来演。",
    scope: "writing",
    order: 70,
    dynamic: false,
    body: `情绪只准演：改成动作、身体反应、物件、停顿、没说出口的话。禁止「他很害怕」「气氛诡异」「心里一沉」这类直接报情绪。碎碎念要俗、要当场、要跟声口。`,
  },
  {
    id: "dialogue-subtext",
    name: "对白潜台词",
    desc: "对白绕话、打断、答非所问，不做说明书。",
    scope: "writing",
    order: 80,
    dynamic: false,
    body: `对白优先绕话、打断、答非所问、说一半，每句留一点不交齐。禁止用对白做说明书。同一场对话推动局势、关系或知情范围至少一项。`,
  },
  {
    id: "sensory-ground",
    name: "五感落地",
    desc: "高压场面至少两种具体感官，含一个不舒服的细节。",
    scope: "writing",
    order: 90,
    dynamic: false,
    body: `高压场面至少两种具体感官，其中一种是不舒服的细节（霉味、湿脚、膝盖磕瓷砖）。环境只留当场用得上的两个抓手，禁止衣着、气味、建筑清单。`,
  },
  {
    id: "punct-format",
    name: "标点与排版",
    desc: "全角标点、对话与系统【】的排版硬约束。",
    scope: "all",
    order: 100,
    dynamic: false,
    body: `一律中文全角标点。一段连续逗号不超过3个，破折号一章最多3处，段尾用句号。对话单独成段、用“”。系统所有输出单独成段、一律【】，禁止「」。内心独白不用引号。`,
  },
  {
    id: "anti-ai",
    name: "去AI味",
    desc: "删翻译腔、空形容词、空比喻、套话、总结句与说破的潜台词。",
    scope: "all",
    order: 110,
    dynamic: false,
    body: `删翻译腔、空形容词、空比喻、总结句、说明书对白。能用动词就不用「XX地」。一句里「的」不超过一个。禁止「值得注意的是」「与此同时」「总而言之」这类套话。动作后别补总结句，如「那一眼很快」「压得很低」「每个字都落得实」，改成具体动作或出声。潜台词不要说完，「我还以为你嫌弃我」改成「我还以为……」，心理句能删就删只留动作。太漂亮的刻意细节改成当场生理反应，如「痒得他想咬一口」→「他拿指甲掐了一下。更痒了。」。禁止对比句式（不是A，也不是B，是C；不再是X，是Y），直接写后半句。台词别写成威胁金句，「你要是不来，我拿搜查令来」改「不来，我拿搜查令」，「我正问你」改「你先说」。AI 表情（眼睛眯了一下）改用动作代替。系统提示一条只放一个信息，地点和时限拆成多条【】。多余废动作和具体次数是活人痕迹，保留别精修；拟声词可单独成句。允许有点糙、有点噎、有点没说完。`,
  },
];

const DEFAULT_BY_SKILL = {
  "chapter-prose": ["context-anchor", "content-completeness", "emotion-bridge", "proof-scan"],
  continue: ["context-anchor", "content-completeness", "emotion-bridge", "proof-scan"],
  polish: ["emotion-bridge", "show-not-tell", "anti-ai", "proof-scan"],
  review: ["proof-scan"],
};

const DEFAULT_BY_TARGET = {
  content: ["context-anchor", "content-completeness", "emotion-bridge", "proof-scan"],
  polish: ["emotion-bridge", "show-not-tell", "anti-ai", "proof-scan"],
  review: ["proof-scan"],
};

function defaultElementIds(skill) {
  if (!skill) return [];
  if (DEFAULT_BY_SKILL[skill.id]) return DEFAULT_BY_SKILL[skill.id].slice();
  if (DEFAULT_BY_TARGET[skill.target]) return DEFAULT_BY_TARGET[skill.target].slice();
  return [];
}

function enabledElementIds(skill) {
  if (Array.isArray(skill?.elements)) return skill.elements.map(String).filter(Boolean);
  return defaultElementIds(skill);
}

function readStore() {
  try {
    const parsed = JSON.parse(fs.readFileSync(ELEMENTS_FILE, "utf8"));
    const { doc: raw } = migrate("elements", parsed);
    return {
      overrides: raw && typeof raw.overrides === "object" && raw.overrides ? raw.overrides : {},
      custom: Array.isArray(raw?.custom) ? raw.custom : [],
    };
  } catch {
    return { overrides: {}, custom: [] };
  }
}

function writeStore(data) {
  atomicWriteJson(ELEMENTS_FILE, stamp("elements", data), { backup: true, keep: 10 });
}

function publicElement(base, override) {
  return {
    id: base.id,
    name: String(override?.name ?? base.name ?? ""),
    desc: String(override?.desc ?? base.desc ?? ""),
    scope: base.scope || "all",
    order: Number(override?.order ?? base.order) || 50,
    body: String(override?.body ?? base.body ?? ""),
    builtin: Boolean(base.builtin),
    dynamic: Boolean(base.dynamic),
    customized: Boolean(override),
  };
}

function listElements() {
  const store = readStore();
  const overrides = store.overrides || {};
  const rows = BUILTIN.map((def) => publicElement({ ...def, builtin: true }, overrides[def.id]));
  for (const row of store.custom) {
    if (!row || !row.id) continue;
    rows.push({
      id: String(row.id),
      name: String(row.name || ""),
      desc: String(row.desc || ""),
      scope: String(row.scope || "all"),
      order: Number(row.order) || 50,
      body: String(row.body || ""),
      builtin: false,
      dynamic: false,
      customized: false,
    });
  }
  return rows.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, "zh"));
}

function getElement(id) {
  return listElements().find((row) => row.id === id) || null;
}

function isBuiltin(id) {
  return BUILTIN.some((def) => def.id === id);
}

function createElement(input = {}) {
  const name = String(input.name || "").trim();
  const body = String(input.body || "").trim();
  if (!name || !body) {
    const error = new Error("自定义元素需要名称和内容");
    error.status = 400;
    throw error;
  }
  const store = readStore();
  const row = {
    id: uid("el"),
    name,
    desc: String(input.desc || "").trim(),
    scope: String(input.scope || "all").trim(),
    order: Number(input.order) || 55,
    body,
  };
  store.custom.push(row);
  writeStore(store);
  return getElement(row.id);
}

function updateElement(id, input = {}) {
  const current = getElement(id);
  if (!current) {
    const error = new Error("元素不存在");
    error.status = 404;
    throw error;
  }
  const name = String(input.name ?? current.name).trim();
  const body = String(input.body ?? current.body);
  if (!name) {
    const error = new Error("元素需要名称");
    error.status = 400;
    throw error;
  }
  const patch = {
    name,
    desc: String(input.desc ?? current.desc).trim(),
    scope: input.scope === undefined ? current.scope : String(input.scope) === "all" ? "all" : "writing",
    order: input.order === undefined ? current.order : Number(input.order) || current.order,
    body,
  };
  const store = readStore();
  if (isBuiltin(id)) {
    store.overrides[id] = { ...(store.overrides[id] || {}), ...patch };
  } else {
    const idx = store.custom.findIndex((row) => row && row.id === id);
    if (idx < 0) {
      const error = new Error("元素不存在");
      error.status = 404;
      throw error;
    }
    store.custom[idx] = { ...store.custom[idx], ...patch };
  }
  writeStore(store);
  return getElement(id);
}

function deleteElement(id) {
  const store = readStore();
  const idx = store.custom.findIndex((row) => row && row.id === id);
  if (idx < 0) {
    const error = new Error("只能删除自定义元素");
    error.status = 400;
    throw error;
  }
  store.custom.splice(idx, 1);
  writeStore(store);
  return { ok: true };
}

function resetElement(id) {
  const store = readStore();
  if (store.overrides[id]) {
    delete store.overrides[id];
    writeStore(store);
  }
  return getElement(id);
}

function renderElements(skill, ctx = {}) {
  const ids = enabledElementIds(skill);
  if (!ids.length) return "";
  const byId = new Map(listElements().map((row) => [row.id, row]));
  const defs = new Map(BUILTIN.map((def) => [def.id, def]));
  const out = [];
  for (const id of ids) {
    const row = byId.get(id);
    if (!row) continue;
    const def = defs.get(id);
    let lines = [];
    if (def && typeof def.render === "function") {
      try {
        lines = def.render(ctx) || [];
      } catch {
        lines = [];
      }
      if (lines.length && /^#\s/.test(lines[0])) lines = lines.slice(1);
    }
    const body = String(row.body || "").trim();
    if (body) lines = [...lines, body];
    if (!lines.length) continue;
    out.push(`# 元素 · ${row.name}\n${lines.join("\n")}`);
  }
  return out.join("\n\n");
}

module.exports = {
  listElements,
  getElement,
  createElement,
  updateElement,
  deleteElement,
  resetElement,
  defaultElementIds,
  enabledElementIds,
  renderElements,
};
