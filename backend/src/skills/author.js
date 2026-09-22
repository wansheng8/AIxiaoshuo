"use strict";

const { CREATABLE_TARGETS } = require("./core");
const sparkDeck = require("../spark-deck");
const sparkDims = require("../spark-dims");

function skillAuthorMessages(idea, target) {
  const hint = target && CREATABLE_TARGETS.includes(target) ? target : "按需求自行选择";
  return [
    {
      role: "system",
      content: `你是墨枢的中文写作 Skill 作者。根据作者的一句话，写成一份可执行的中文说明书。说明书要让后文写出连载人味：心疼、嘴硬、犹豫、碎碎念、思维拐弯、对白说一半。禁止写成只填结构的流水线。禁止为去AI而故意写差。
只输出一个 JSON 对象，不要 Markdown 围栏，不要解释。字段：
- name：4 到 10 个汉字的名称
- scene：一句话说明何时使用
- target：只能是 ${CREATABLE_TARGETS.join("、")} 之一
  - body：Markdown 说明书，必须含「## 先有感觉」「## 适用场景」「## 输入」「## 输出结构」「## 约束」「## 执行步骤」。「先有感觉」写清怎么让人物心疼、嘴硬、犹豫、误判、说一半，结构和禁区为这点感觉服务。
若 target 是 characters、world 或 props，输出结构必须使用「### 名称（身份或类型）」以及「描述：」「提示词：」两节。
全文简体中文。`,
    },
    {
      role: "user",
      content: `作者需求：${idea}\n建议写入位置：${hint}`,
    },
  ];
}

function parseSkillDraft(text) {
  const raw = String(text || "").trim();
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const payload = fence ? fence[1] : raw;
  const start = payload.indexOf("{");
  const end = payload.lastIndexOf("}");
  if (start < 0 || end < 0) {
    const error = new Error("模型没有返回完整的 Skill 草稿");
    error.status = 502;
    throw error;
  }
  let json;
  try {
    json = JSON.parse(payload.slice(start, end + 1));
  } catch {
    const error = new Error("Skill 草稿无法解析");
    error.status = 502;
    throw error;
  }
  const name = String(json.name || "").trim();
  const body = String(json.body || "").trim();
  if (!name || !body) {
    const error = new Error("草稿缺少名称或说明书");
    error.status = 502;
    throw error;
  }
  return {
    name,
    scene: String(json.scene || "").trim(),
    target: CREATABLE_TARGETS.includes(json.target) ? json.target : "content",
    body,
  };
}

function cleanPrefList(value, maxItems = 16, maxLen = 48) {
  const list = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  return list
    .map((item) => String(item || "").trim())
    .filter((item) => item && item !== "不限定")
    .slice(0, maxItems)
    .map((item) => item.slice(0, maxLen));
}

function normalizeSparkPrefs(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  return {
    genres: cleanPrefList(src.genres),
    romance: cleanPrefList(src.romance),
    hooks: cleanPrefList(src.hooks),
    heroes: cleanPrefList(src.heroes),
    leads: cleanPrefList(src.leads).slice(0, 1),
    povs: cleanPrefList(src.povs).slice(0, 1),
    tones: cleanPrefList(src.tones).slice(0, 1),
    endings: cleanPrefList(src.endings).slice(0, 1),
    length: cleanPrefList(src.length).slice(0, 1),
    pace: cleanPrefList(src.pace).slice(0, 1),
    platforms: cleanPrefList(src.platforms),
    avoid: cleanPrefList(src.avoid, 4, 240),
  };
}

function formatSparkPrefs(prefs) {
  const rows = [
    ["频道/类型", prefs.genres],
    ["CP/感情线", prefs.romance],
    ["爽点偏好", prefs.hooks],
    ["主角设定", prefs.heroes],
    ["叙事主角", prefs.leads],
    ["人称视角", prefs.povs],
    ["文风调性", prefs.tones],
    ["结局走向", prefs.endings],
    ["故事篇幅", prefs.length],
    ["章均篇幅", prefs.pace],
    ["目标平台", prefs.platforms],
    ["想避开", prefs.avoid],
  ];
  return rows.map(([label, items]) => `${label}：${items.length ? items.join("、") : "不限定"}`).join("\n");
}

function craftFromSparkPrefs(prefs) {
  const pace = prefs.pace[0] || "";
  const n = Number((pace.match(/(\d{3,5})/) || [])[1] || 0);
  if (pace.includes("8000") || pace.includes("6000") || n >= 5500) {
    return { wordsMin: 4500, wordsMax: 7000, density: "密", pace: 70 };
  }
  if (pace.includes("5000") || n >= 4500) {
    return { wordsMin: 3500, wordsMax: 5200, density: "密", pace: 62 };
  }
  if (pace.includes("3000") || n >= 2800) {
    return { wordsMin: 2200, wordsMax: 3800, density: "中", pace: 55 };
  }
  if (pace.includes("2000") || n >= 1500) {
    return { wordsMin: 1500, wordsMax: 2200, density: "中", pace: 50 };
  }
  return {};
}

function sparkMarkdown(value) {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return value.map(sparkMarkdown).filter(Boolean).join("\n\n");
  if (typeof value === "object") {
    const name = String(value.name || value.title || value.姓名 || value.场景 || "").trim();
    const role = String(value.role || value.type || value.身份 || value.类型 || value.status || "").trim();
    const desc = sparkMarkdown(value.desc || value.description || value.描述 || value.body || value.text || "");
    const prompt = sparkMarkdown(value.prompt || value.提示词 || "");
    const plant = sparkMarkdown(value.plant || value.埋设 || "");
    const payoff = sparkMarkdown(value.payoff || value.回收 || "");
    const note = sparkMarkdown(value.note || value.备注 || "");
    if (name || desc || plant) {
      const head = name ? `### ${name}${role ? `（${role}）` : ""}` : "";
      return [
        head,
        desc && (desc.startsWith("描述") ? desc : `描述：\n${desc}`),
        prompt && (prompt.startsWith("提示词") ? prompt : `提示词：\n${prompt}`),
        plant && `埋设：${plant}`,
        payoff && `回收：${payoff}`,
        note && `备注：${note}`,
      ]
        .filter(Boolean)
        .join("\n");
    }
    return Object.values(value).map(sparkMarkdown).filter(Boolean).join("\n\n");
  }
  return String(value).trim();
}

function sparkAuthorMessages(idea, rawPrefs) {
  const seed = String(idea || "").trim();
  const prefs = normalizeSparkPrefs(rawPrefs);
  const prefBlock = formatSparkPrefs(prefs);
  const lengthNote = prefs.length[0] || "";
  const outlineHint = lengthNote.includes("短篇")
    ? "大纲压成一卷，冲突尽快见血，总字数按五万内收束。"
    : lengthNote.includes("中篇")
      ? "大纲两到三卷，总字数按二十到五十万铺开。"
      : lengthNote.includes("长篇")
        ? "大纲三卷以上，留升级和身份掉马空间，总字数按百万量级铺线。"
        : "篇幅不限定，按题材自己定体量，不要无故注水。";
  return [
    {
      role: "system",
      content: `你是墨枢的开书编辑。根据作者脑洞立一部能追更的中文长篇。
只输出一个 JSON 对象，不要 Markdown 围栏，不要解释。字段：
- title：四到八个汉字的书名，好记、能上榜
 - genre：优先用作者点选的频道/类型；未点选时用玄幻、仙侠、都市、科幻、历史、悬疑、无限流 之一，或自拟二字到四字类型
- logline：一句话卖点，谁想要什么，被什么挡住
- brief：立项说明，400 到 700 字，用 ### 小标题，必须含「卖点」「主角」「核心冲突」「调性」
 - world：3 到 4 个场景/设定卡，每卡格式严格为：
### 名称（类型）
描述：
两到四句可拍摄的规则或场面。
提示词：
画面提示，40 到 80 字。
 - characters：4 个主要人物卡，每卡格式严格为：
### 姓名（身份）
描述：
外表抓手、此刻欲望、旧伤、秘密、说话风格，120 到 200 字。
提示词：
绘人提示，80 字以内。
 - outline：全书大纲，600 到 900 字，用 ### 小标题拆「第一卷」「第二卷」「第三卷」，每卷写出冲突升级和章末钩子
  - style：优先用作者点选的文风调性；未点选时用 网文爽快、轻松吐槽、细密心理、白描克制、冷硬悬疑、甜宠日常、压抑暗黑、热血燃 之一
  - theme：一句话主题，这本书在问什么
  - pov：优先用作者点选的人称视角；未点选时用 第三人称有限、第一人称、第三人称全知、多视角轮换 之一
 - threads：2 到 4 条伏笔，每条格式严格为：
### 伏笔名（open）
埋设：第几章、什么物件或哪句没说完的话
回收：打算哪一章兑现
备注：和主题或人物秘密怎么咬合
 - chapterTitle：第一章章名，不要带「第X章」
全文简体中文。书名不要带书名号。JSON 字符串里的换行写成 \\n。
作者偏好必须成为骨架：点选标签和自定义标签同等有效，必须写进卖点、人物和冲突，禁止把选项清单复读进正文。
叙事主角、人称视角、文风调性、结局走向一旦点选或自拟，必须遵守。
标成「不限定」的维度由你决定，不要同时堆互斥套路。
「想避开」里的元素不得出现在卖点、人物、大纲和伏笔里。
${outlineHint}
目标平台约束尺度、HE/BE 预期和标题气质：番茄偏爽点短打，起点偏长线升级，晋江偏情感关系，盐选偏强情节，LOFTER 偏人设氛围，七猫偏女频爽点，剧本杀偏闭环线索，出版向偏人物与主题。
脑洞可以很碎，也可以写人物细节、必须出现的物件或场面。若脑洞为空，按偏好发明一个够劲的网文脑洞。`,
    },
    {
      role: "user",
      content: `${seed ? `脑洞：${seed}` : "脑洞：作者没写，请按偏好发明一个够劲的开书脑洞。"}\n\n作者偏好：\n${prefBlock}`,
    },
  ];
}

function parseSparkDraft(text) {
  const raw = String(text || "").trim();
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const payload = fence ? fence[1] : raw;
  const start = payload.indexOf("{");
  const end = payload.lastIndexOf("}");
  if (start < 0 || end < 0) {
    const error = new Error("模型没有返回完整的开书草稿");
    error.status = 502;
    throw error;
  }
  let json;
  try {
    json = JSON.parse(payload.slice(start, end + 1));
  } catch {
    const error = new Error("开书草稿无法解析");
    error.status = 502;
    throw error;
  }
  const title = String(json.title || "").trim().replace(/[《》]/g, "");
  const logline = String(json.logline || "").trim();
  const brief = sparkMarkdown(json.brief);
  if (!title || !logline) {
    const error = new Error("草稿缺少书名或卖点");
    error.status = 502;
    throw error;
  }
  return {
    title,
    genre: String(json.genre || "").trim() || "长篇小说",
    logline,
    brief,
    world: sparkMarkdown(json.world),
    characters: sparkMarkdown(json.characters),
    outline: sparkMarkdown(json.outline),
    chapterTitle: String(json.chapterTitle || "").trim().replace(/^第[零一二三四五六七八九十百\d]+章\s*/, ""),
    style: String(json.style || "").trim(),
    theme: String(json.theme || "").trim(),
    pov: String(json.pov || "").trim(),
    threads: sparkMarkdown(json.threads),
  };
}

function sparkDrawMessages(idea, rawPrefs, channel) {
  const seed = String(idea || "").trim();
  const prefs = normalizeSparkPrefs(rawPrefs);
  const prefBlock = formatSparkPrefs(prefs);
  const channelNote =
    channel === "male"
      ? "本次面向男频：主角是男性向读者关心的人，主线靠目标、对抗、成长或解谜推进，感情线可有可无。"
      : channel === "female"
        ? "本次面向女频：主角是女性向读者关心的人，关系变化和情绪是主驱动，事件服务人物关系。"
        : "本次面向通用向：不限定频道，按创意本身选最合适的写法和人物。";
  const examples = sparkDeck.examplesFor(channel, 2).map((card) =>
    JSON.stringify({
      hook: card.hook,
      conflict: card.conflict,
      edge: card.edge,
      details: card.details.slice(0, 3),
      tags: Array.isArray(card.tags) ? card.tags.slice(0, 3) : [],
    })
  );
  return [
    {
      role: "system",
      content: `你是墨枢的开书策划，专长把一句普通脑洞做成大开的高概念故事。作者给一句脑洞或创意，你要围绕它派生出三个走向明显不同的开书方案，供作者三选一。
只输出一个 JSON 数组，不要 Markdown 围栏，不要解释，不要多余文字。数组恰好三个对象，每个对象字段：
- hook：一句核，25 到 60 字，交代主角处境和最大的不公或欲望，结尾带一个让人想点开的反转或悬念
- conflict：核心冲突，第一章就能演的对抗关系，要顶到规则、身份或世界观层面，不要停在家长里短
- edge：金手指或身份抓手，一句话，最好是一条有边界、能反复制造戏剧的规则，允许带代价或限制
- details：2 到 4 条具体细节，必须是场面、物件、规则或桥段，禁止空泛形容词
- tags：1 到 3 个题材标签，写类型与元素（如「无限流」「克苏鲁」「电竞」「商战」），不要写情绪词
- picks：一个对象，按下方偏好维度给出建议，键只能用这些：${sparkDims.KEYS.join("、")}。可多选维度给 1 到 3 个，单选维度只给 1 个；值必须从该维度的候选项里选，不得自造。
偏好维度候选项：
${sparkDims.optionBlock()}
三个方案必须是三个不同题材，世界观、金手指类型、冲突层级都要明显分岔，禁止只换措辞，禁止都用同一套世界观或同一类金手指。
脑洞越大越好：优先高概念、强反差、规则型设定与跨题材混搭（如「种田加克苏鲁」「谍战加穿书」「娱乐圈加无限流」），把创意推到更极端、更有记忆点的方向，不要收成一个安全的小故事。
越大越好的判据：一句话能让读者立刻想知道「然后呢」；主角处境有极端反差；金手指有明确代价或限制；第一章就有能爆的名场面；三个方案合起来覆盖尽量多的题材与元素。
可选题材参考（优先从中挑，也可自创更贴切的）：古言、现言、玄幻、仙侠、都市、悬疑、科幻、无限流、种田、宫斗、年代、民国、电竞、娱乐圈、校园、末世、克苏鲁、轻小说、西幻、武侠、历史、商战、职场、灵异、快穿、星际、游戏、豪门、医疗、律政、谍战。
${channelNote}
脑洞是根，三个方案都要能看出是从这句脑洞长出来的；可以大胆补设定，但不许换成另一个无关创意。
全文简体中文，用全角标点。禁止 AI 套话、翻译腔、四字堆砌和总结句，不要写正文。
作者已选的偏好与「想避开」必须遵守；若作者已在某维度选了值，picks 里该维度要么省略、要么与作者已选保持一致，单选维度只给 1 个；就在作者已选类型内往更极端、更新鲜的方向做。
下面示例只示范字段风格，禁止照抄内容：
${examples.join("\n")}`,
    },
    {
      role: "user",
      content: `脑洞：${seed}\n\n作者偏好：\n${prefBlock}`,
    },
  ];
}

function parseSparkCards(text, channel) {
  const raw = String(text || "").trim();
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const payload = fence ? fence[1] : raw;
  let data = null;
  const arrStart = payload.indexOf("[");
  const arrEnd = payload.lastIndexOf("]");
  if (arrStart >= 0 && arrEnd > arrStart) {
    try {
      data = JSON.parse(payload.slice(arrStart, arrEnd + 1));
    } catch {
      data = null;
    }
  }
  if (!Array.isArray(data)) {
    const objStart = payload.indexOf("{");
    const objEnd = payload.lastIndexOf("}");
    if (objStart >= 0 && objEnd > objStart) {
      try {
        const obj = JSON.parse(payload.slice(objStart, objEnd + 1));
        if (Array.isArray(obj)) data = obj;
        else if (Array.isArray(obj.cards)) data = obj.cards;
      } catch {
        data = null;
      }
    }
  }
  if (!Array.isArray(data)) {
    const error = new Error("模型没有返回可用的脑洞卡");
    error.status = 502;
    throw error;
  }
  const cards = [];
  for (const item of data) {
    if (!item || typeof item !== "object") continue;
    const hook = String(item.hook || item.core || item.logline || "").trim();
    const conflict = String(item.conflict || item.核心冲突 || "").trim();
    const edge = String(item.edge || item.抓手 || "").trim();
    const details = (Array.isArray(item.details) ? item.details : [])
      .map((detail) => String(detail || "").trim())
      .filter(Boolean)
      .slice(0, 4);
    const tags = (Array.isArray(item.tags) ? item.tags : [])
      .map((tag) => String(tag || "").trim())
      .filter(Boolean)
      .slice(0, 3);
    const picks = sparkDims.normalizePicks(item.picks);
    if (!hook || !conflict || !edge || details.length < 2) continue;
    const card = { id: `card-${cards.length + 1}`, channel, tags, hook, conflict, edge, details };
    if (Object.keys(picks).length) card.picks = picks;
    cards.push(card);
    if (cards.length >= 3) break;
  }
  if (!cards.length) {
    const error = new Error("模型没有返回可用的脑洞卡");
    error.status = 502;
    throw error;
  }
  return cards;
}

module.exports = {
  skillAuthorMessages,
  parseSkillDraft,
  cleanPrefList,
  normalizeSparkPrefs,
  formatSparkPrefs,
  craftFromSparkPrefs,
  sparkMarkdown,
  sparkAuthorMessages,
  parseSparkDraft,
  sparkDrawMessages,
  parseSparkCards,
};
