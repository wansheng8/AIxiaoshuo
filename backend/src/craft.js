const { extractNouns } = require("./quality");
const { emotionBridgeLines } = require("./emotion");
const { buildGenreBlock, findFlow, findPlatform } = require("./genre");
const { buildImitateBlock, normalizeLib } = require("./imitate");

const STYLES = [
  { label: "网文爽快", guide: "短句推进，信息密度高，对话利落。打脸、掉马要写成围观和来回，过场一两段带过。少空形容词，一句最多一个「的」。" },
  { label: "无脑爽", guide: "每章一次看得见的兑现。打脸要有围观和当场后果。情绪靠碎碎念、物件和选择，不靠旁白报怕。环境只留两个能用的抓手。" },
  { label: "轻松吐槽", guide: "口语、吐槽、当场念头，短句利落，少空抒情。" },
  { label: "白描克制", guide: "少形容词，靠物件、动作、留白。一句一事。" },
  { label: "古典雅正", guide: "文言气息落地成可拍摄场面，意象具体，节奏稳。" },
  { label: "冷硬悬疑", guide: "细节当证据，对话藏刀，气氛靠空间和声音。" },
  { label: "细密心理", guide: "内心用感知和回忆碎片带出，少写长段自我分析。" },
  { label: "甜宠日常", guide: "亲密靠动作和对话，甜而不腻，少旁白解释感情。" },
  { label: "压抑暗黑", guide: "空间、声音、身体不适感压人，少喊惨，细节当刀。" },
  { label: "热血燃", guide: "短句推进，对白硬气，场面靠动作升级，少口号。" },
  { label: "海明威冷硬", guide: "短句、重复、冰山下的动作。少比喻，少解释情绪。" },
  { label: "张爱玲绵密", guide: "物件与世故，凉而准的比喻，对话里藏阶层和欲望。" },
];

function defaultCraft() {
  return {
    subtext: true,
    noCheat: true,
    staySmart: true,
    tighten: true,
    payoff: false,
    density: "中",
    tone: 45,
    pace: 55,
    talk: 50,
    mood: "",
    intensity: 6,
    emotionStyle: "综合",
    showDontTell: true,
    cleanCopy: true,
    voiceSample: "",
    flow: "",
    platform: "",
    goldenFinger: "",
    requiredBeats: "",
    imitateOn: false,
    imitate: "",
    imitateNotes: "",
    imitateDims: {},
    imitateLib: [],
    wordsMin: 2200,
    wordsMax: 3800,
  };
}

function styleGuide(name) {
  const hit = STYLES.find((item) => item.label === name);
  if (hit) return hit.guide;
  if (name) return `按「${name}」的调性写，全书同一把尺子。`;
  return "跟立项调性走，全书同一把尺子。";
}

function normalizeThreads(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((item, index) => ({
      id: String(item?.id || `th_${index}`),
      name: String(item?.name || "").trim() || "未命名伏笔",
      plant: String(item?.plant || "").trim(),
      payoff: String(item?.payoff || "").trim(),
      status: ["open", "paid", "dropped"].includes(item?.status) ? item.status : "open",
      note: String(item?.note || "").trim(),
    }))
    .filter((item) => item.name);
}

function parseThreads(md) {
  const parts = String(md || "")
    .split(/(?=^#{2,3}\s)/m)
    .map((block) => block.trim())
    .filter(Boolean);
  return parts
    .map((block, index) => {
      const line = block.split("\n")[0] || "";
      const match = line.match(/^#{2,3}\s*([^\n（(]+)[（(]?([^)）\n]*)/);
      const name = (match?.[1] || "").trim();
      if (!name) return null;
      const role = (match?.[2] || "").replace(/[）)]/g, "").trim();
      let status = "open";
      if (/已兑|paid/i.test(role)) status = "paid";
      else if (/搁置|dropped|作废/i.test(role)) status = "dropped";
      const plant = (block.match(/埋设[：:]\s*([^\n]+)/) || [])[1] || "";
      const payoff = (block.match(/回收[：:]\s*([^\n]+)/) || [])[1] || "";
      const note = (block.match(/备注[：:]\s*([^\n]+)/) || [])[1] || "";
      return {
        id: `th_${Date.now().toString(36)}_${index}`,
        name,
        plant: plant.trim(),
        payoff: payoff.trim(),
        status,
        note: note.trim(),
      };
    })
    .filter(Boolean);
}

function mergeThreads(prev, incoming) {
  const base = normalizeThreads(prev);
  const next = incoming.map((item) => {
    const old = base.find((row) => row.name === item.name);
    return old ? { ...old, ...item, id: old.id } : item;
  });
  const kept = base.filter((row) => !next.some((item) => item.name === row.name));
  return [...next, ...kept];
}

function hydrateCraft(novel) {
  if (!novel) return novel;
  novel.style = novel.style || "";
  novel.theme = novel.theme || "";
  novel.pov = novel.pov || "第三人称有限";
  novel.threads = normalizeThreads(novel.threads);
  novel.craft = { ...defaultCraft(), ...(novel.craft || {}) };
  if (!["密", "中", "疏"].includes(novel.craft.density)) novel.craft.density = "中";
  novel.craft.tone = clamp100(novel.craft.tone, 45);
  novel.craft.pace = clamp100(novel.craft.pace, 55);
  novel.craft.talk = clamp100(novel.craft.talk, 50);
  novel.craft.intensity = clamp10(novel.craft.intensity, 6);
  if (!["动作", "环境", "对话", "内心", "综合"].includes(novel.craft.emotionStyle)) {
    novel.craft.emotionStyle = "综合";
  }
  novel.craft.showDontTell = novel.craft.showDontTell !== false;
  novel.craft.cleanCopy = novel.craft.cleanCopy !== false;
  novel.craft.mood = String(novel.craft.mood || "");
  novel.craft.voiceSample = String(novel.craft.voiceSample || "").slice(0, 800);
  novel.craft.flow = findFlow(novel.craft.flow).id;
  novel.craft.platform = findPlatform(novel.craft.platform).id;
  novel.craft.goldenFinger = String(novel.craft.goldenFinger || "").slice(0, 1200);
  novel.craft.requiredBeats = String(novel.craft.requiredBeats || "").slice(0, 400);
  novel.craft.imitateOn = novel.craft.imitateOn === true;
  novel.craft.imitate = String(novel.craft.imitate || "").slice(0, 4000);
  novel.craft.imitateNotes = String(novel.craft.imitateNotes || "").slice(0, 600);
  novel.craft.imitateDims =
    novel.craft.imitateDims && typeof novel.craft.imitateDims === "object" && !Array.isArray(novel.craft.imitateDims)
      ? novel.craft.imitateDims
      : {};
  novel.craft.imitateLib = normalizeLib(novel.craft.imitateLib);
  const min = Number(novel.craft.wordsMin);
  const max = Number(novel.craft.wordsMax);
  novel.craft.wordsMin = Number.isFinite(min) ? Math.max(800, Math.min(8000, Math.round(min))) : 2200;
  novel.craft.wordsMax = Number.isFinite(max) ? Math.max(novel.craft.wordsMin, Math.min(12000, Math.round(max))) : Math.max(novel.craft.wordsMin, 3800);
  const platform = findPlatform(novel.craft.platform);
  const atDefaultRange = novel.craft.wordsMin === 2200 && novel.craft.wordsMax === 3800;
  if (platform.words && atDefaultRange) {
    novel.craft.wordsMin = platform.words[0];
    novel.craft.wordsMax = platform.words[1];
  }
  return novel;
}

function clamp100(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function clamp10(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(10, Math.round(n)));
}

function formatThreadLine(item) {
  const status = item.status === "paid" ? "已兑" : item.status === "dropped" ? "搁置" : "未收";
  return `- ${item.name}［${status}］埋设：${item.plant || "未填"}｜拟回收：${item.payoff || "未定"}${
    item.note ? `｜${item.note}` : ""
  }`;
}

function heartGuide(skill) {
  const id = skill && skill.id;
  const lines = [
    `# 先有感觉（压过清单）`,
    `结构和禁区为感觉服务。清单、六层、字数都齐了，心口是空的，这一份作废。`,
  ];
  if (id === "kickoff") {
    lines.push(`立项先交感情赌注：他在乎谁，不成的话那人会怎样。雪花一句里必须摸到这个人。人物种子必须有缺口和反差。三灾打在缺口上。`);
  } else if (id === "characters") {
    lines.push(`每人先钉缺口：缺什么才去追目标。反差必须能演：嘴硬配手软。性格决定他会走哪条错路。再写会心疼谁、会嘴硬哪句。配角也要有咽回去的那句。`);
  } else if (id === "outline") {
    lines.push(`每卷高潮必须落到他在乎的人身上：受伤、离开或反目。灾变写在关系上。冲突必须连锁：上场结果变成下场问题。反转必须有铺垫。`);
  } else if (id === "chapter-beats") {
    lines.push(`每章先写心口：谁怕丢掉什么，谁会心疼谁，哪一句没说出口。场面表围着这三样排。冲突链和内外阻力成对写。`);
  } else if (id === "polish") {
    lines.push(`润色先找心口空的地方：只有动作和部位词、没有碎碎念和犹豫。允许用当场物件和一句俗念头补上。空环境改成抓手。对白不推动局势就删。`);
  } else {
    lines.push(`落笔前用一句话说清：这场谁怕丢掉什么，谁会心疼谁，哪一句没说出口。正文必须让读者摸到这三样。`);
    lines.push(`碎碎念、关系痕迹、代价犹豫、嘴硬和手软，比段数、生理轮换、六层带入优先。六层只挑本场用得上的一两层。`);
    lines.push(`对照：机械「他握紧拳头，后槽牙咬紧，迈步进门。」人味「门把冰得他想缩手。里面那人还在笑，笑得他胃里那口隔夜饭直往上顶。他骂自己怂，手还是按下去了。」`);
  }
  return lines;
}

function serialEngineGuide(skill) {
  const writing = skill && (skill.target === "content" || ["chapter-prose", "continue", "polish"].includes(skill.id));
  const lines = [
    `# 连载作者`,
    `你在连载，读者随时会划走。先交剧情和人味，再交结构和禁区。人类感来自不完全规则化：思维会拐弯、话会说一半、信息只讲七成。禁止为了去AI而故意写差。`,
    `交稿优先级：人物要什么、场面发生了什么、读者想不想点下一章。清单填满心口空，作废。`,
  ];
  if (writing) {
    lines.push(
      `# 思维断层`,
      `人物先反应后理解。反应可以错。理解可以改口。禁止一口气把对错利弊想完。`,
      `内心顺序：看见→身体先动→一句俗念头→做错一步→事后才明白。禁止「他意识到这是个陷阱」。`,
      `# 冲突与性格`,
      `一章一条主冲突。上场结果变成下场问题。选择从性格和缺口长出，禁止作者最优解。反转必须能从已露过的误判、伏笔或反差读出来。`,
      `# 对白`,
      `对白优先绕话、打断、答非所问、说一半。禁止每句都把信息交齐。禁止用对白做说明书。每段对白必须推动局势、关系或知情范围。`,
      `人设进声口：句长、爱不爱反问、紧张时卡壳还是加速。听得出是谁。`,
      `# 画面落地`,
      `画面等于动作、物件、感官。禁止空环境铺陈。一句一个功能。形容词换成动作或物件。`,
      `# 信息`,
      `规则、身世、金手指只讲当场用得上的七成。剩下三成让读者自己拼。禁止下一段解释上一段。`,
      `# 节奏波形`,
      `默认「问题→行动→结果→新问题」。结果先落地，原因后补。失败必须带可见后果和新问题。`,
      `一段可短到一个字，也可拉到观察场。禁止全章同一段长。危机、吐槽、反转允许短句连簇。`,
      `# 钩子去重`,
      `章末钩子换类型：A新人物 / B新信息 / C新危险 / D新奖励 / E新选择 / F身份反转 / G认知反转 / H更大问题。近三章同型禁止再用。禁止硬切同一句式。`,
      `# 删除优先`,
      `动作已经说过的，下一句不要再总结。禁止「这让他明白」「显然他很愤怒」。连续3句禁止同一句法骨架。每段至少一个功能，空段删。开头结构近三章必须换。`
    );
  }
  return lines;
}

function chapterHasProse(chapter) {
  return Array.from(String(chapter?.content || "").replace(/\s+/g, "")).length >= 800;
}

function prevChapter(novel, chapter) {
  if (!chapter) return null;
  return (novel.chapters || []).find((ch) => ch.index === chapter.index - 1) || null;
}

function performGuide(craft) {
  const sample = String(craft.voiceSample || "").trim();
  const lines = [
    `# 只准演`,
    `先把心口演完：怕丢掉的东西、会心疼的人、没说出口的那句。动作链和感官为这三样服务。`,
    `禁止写案情通报。情绪只能通过动作、感官、对话和内心碎碎念表现，不允许直接说出来。`,
    `禁止写：我很害怕 / 气氛很诡异 / 场面非常恐怖 / 我感觉不对劲 / 他突然出现。心里一沉、心中一凛改成手上的物件或一句俗念头。`,
    `要写：手脚具体做了什么、听到闻到摸到什么、脑子里蹦出哪句很俗的当场念头。`,
    `每章至少一次带温度的选择：怕死仍伸手、心疼仍松手、得意仍嘴硬、发狠仍手抖。温度从碎碎念、声口和物件长出。`,
    `外部描写：当场只留两个能用的抓手（能绊脚、能抓住、能闻见）。禁止用脸、颧骨、胸骨、瞳孔开场。第一句写异常动作或对话，场景后补。`,
    `对照：机械「我推开门，房间里很黑，我心里很害怕。」人味「我推开门，手先伸进去摸开关，摸了三下没摸着。脚刚迈进去，后颈一凉，我嗷一嗓子蹦起来，后脑勺磕在门框上。」`,
    `动作链：只在本章主冲突高潮用。动作1 → 身体反应 → 内心OS → 动作2（更糟或更可笑）。过场、排队、领钱、走路禁止三条动作链，一两段带过去。`,
    `感官：高压场面至少两种具体感官，其中一种是不舒服的细节（霉味、湿脚、膝盖磕瓷砖）。过场点一样当场能碰到的东西就够。`,
    `情绪强度参考 ${clamp10(craft?.intensity, 6)}/10：高强度多用动作链和具体感官，低强度靠留白和一两处身体反应。只给作者看，禁止把强度数字写进正文。`,
    `场景细节只留当场用得上的：推动下一步动作、暴露人物、兑现代价、给下一拍接口。同一物件同一感官一段只点一次。全章同一物件最多写两次触感。过场禁止衣着、气味、建筑清单。`,
    `空描写只删空转连接：目光还没收回来、声音渗进来、同一物件连写触感。碎碎念、关系痕迹、代价犹豫必须留。配角出场只留一个生活痕迹。身体反应每个情绪节点一处。`,
    `对话：打脸、对峙、系统口角写成来回，中间不要每句都插身体反应。对白优先绕话、打断、答非所问、说一半。禁止每句把信息交齐，禁止用对白做说明书。`,
    `碎碎念：要俗、要当场、要不合时宜，跟人物小传声口走。可以想还没办的事、明天要打的卡、这人长得像谁。禁止「我命休矣」「此局好生厉害」。思维断层：看见→身体先动→一句俗念头→做错一步。禁止一口气把对错利弊想完。`,
    `冲进死地必须有非去不可的理由：系统时限、外部检查、两烂选项。禁止只靠不甘心、硬气、咬牙一扑。`,
    `宣布未知规则必须有出处：系统提示、当场试探、前人交代。禁止闻一口就报战术。`,
    `阶段性奖励到手要付一小笔代价，或给一个知道代价仍选择吞的犹豫。`,
    `不可名状的牵引写成身体先动：碎片下坠、胸口一沉、脚步前倾。禁止主角把原因讲明白。`,
    `能力代价要变成肌肉记忆：想再用时，身体比脑子先拒绝。`,
  ];
  if (sample) {
    lines.push(`语气样本：全文叙述和心理都贴着下面这段的口头禅、句长和脏话密度。`);
    lines.push(sample.slice(0, 800));
  }
  return lines;
}

const BODY_AMMO = [
  ["后槽牙", /后槽牙/],
  ["指甲掐掌心", /掐进掌心|指甲掐/],
  ["后颈", /后颈/],
  ["耳根", /耳根/],
  ["喉结", /喉结/],
  ["膝盖发软", /膝盖发软|腿一软/],
  ["胃里翻酸", /胃里翻|泛酸/],
  ["指节发白", /指节发白|捏白了/],
  ["太阳穴", /太阳穴/],
  ["虎口", /虎口/],
  ["牙龈", /牙龈/],
];

function scanBodyParts(text) {
  return BODY_AMMO.filter(([, re]) => re.test(String(text || ""))).map(([name]) => name);
}

function recentBodyBan(novel, chapter) {
  const chapters = Array.isArray(novel?.chapters) ? novel.chapters : [];
  const idx = chapters.findIndex((item) => item && chapter && item.id === chapter.id);
  const start = idx >= 0 ? Math.max(0, idx - 3) : Math.max(0, chapters.length - 3);
  const end = idx >= 0 ? idx : chapters.length;
  const used = [];
  const seen = new Set();
  for (let i = start; i < end; i += 1) {
    for (const name of scanBodyParts(chapters[i]?.content)) {
      if (!seen.has(name)) {
        seen.add(name);
        used.push(name);
      }
    }
  }
  return used;
}

function recentHookTypes(novel, chapter) {
  const chapters = Array.isArray(novel?.chapters) ? novel.chapters : [];
  const idx = chapters.findIndex((item) => item && chapter && item.id === chapter.id);
  const start = idx >= 0 ? Math.max(0, idx - 3) : Math.max(0, chapters.length - 3);
  const end = idx >= 0 ? idx : chapters.length;
  const types = [];
  for (let i = start; i < end; i += 1) {
    const m = String(chapters[i]?.beats || "").match(/钩子类型[：:]\s*([A-Ha-h][^\n/]{0,12})/);
    if (m) types.push(m[1].trim());
  }
  return types;
}

function immersionGuide(usedParts, voiceActive) {
  const lines = [
    `# 六层带入`,
    `六层是带入工具。本场只用得上的一两层，关系层优先。禁止当六格表填满。`,
    `1 期待：开书前300字完成三件事——一个异常、一个处境、一个方向。第一句写异常，场景后补。金手指、系统或面板必须在第一章前半段露面。`,
    `2 处境：职业、前世、旧伤变成肌肉记忆，看见物件用以前干过的活来认。每个情绪节点一处生理反应。弹药库轮换：后槽牙、指甲掐掌心、后颈发紧、耳根发热、喉结滚动、膝盖发软、胃里翻酸、指节发白、太阳穴突突、虎口发麻、牙龈渗血。同一部位近三章不要重复。给一个两秒选择镜头：左还是右、走还是留、咬还是忍。`,
    `对照：死的「他前世是美食博主。」活的「玻璃在指尖很熟——他做过探店，敲过高脚杯听声辨材质。面板说这碎片可以吃。」`,
  ];
  if (usedParts && usedParts.length) {
    lines.push(`近三章已用生理部位：${usedParts.join("、")}。本章禁止再用这些部位，换弹药库里没用过的。`);
  }
  lines.push(
    `3 关系：每个出场配角一个生活痕迹（袖口磨白、杯底茶叶沫）。阶层用画面：A级窗口双手递钱，F级窗口指尖勾。系统人格全篇靠齐：毒舌评测员，美食弹幕口吻，永远不夸宿主。说话、面板、警告一律【】，禁止「」。禁止整章只有数据播报。`,
    `4 发现：先感官碎片，再判断。声音→局部→名字。主角的认知跟读者同步。重要信息从记忆里费力调取、系统提醒或环境提示。`,
    `5 节奏：点题台词换成动作。章末停在动作临界点：手伸出去、两人同时抓住、蓝光爆开。${voiceActive ? "" : "紧张短句，观察长句。"}`,
    `6 代偿：本章金手指必须兑现一次可见效果（咬一口锈铁、力气大一点、不饿了）。被嘲后给一次微小反击。系统给出下一步抓手：能吃什么、下一级解锁什么。`
  );
  return lines;
}

function punctGuide(voiceActive) {
  if (voiceActive) {
    return [
      `# 最低阅读格式（个人文风优先）`,
      `作者写法优先于本节：标点密度、段长、破折号数量、对话排布都照作者习惯，不要用平台通用偏好去改。`,
      `只守两条底线：标点一律中文全角；系统所有输出单独成段、一律用【】。`,
    ];
  }
  return [
    `# 网文标点`,
    `标点是节奏。紧张时句号切碎，观察时逗号拉长，转折时破折号劈开，留白时句号停住。`,
    `一律中文全角：，。？！“”【】……。英文标点、分号当场改掉。`,
    `每句有收尾。段尾用句号。省略号只用于对话被打断，段尾、心里想了很多、闪了闪……一律改句号。叙述省略号一章最多2处。`,
    `一段里连续逗号不超过3个，超过就用句号切开。`,
    `手机阅读：默认一段两到四句，大约四十字到八十字。危机、吐槽、反转允许连续两到五个短句成簇，单句也可成段。观察、过场允许一段稍长。超过九十字的叙述段拆开。禁止全章同一段长。对话单独成段。系统面板单独成段。禁止连续两个两字段旁白。`,
    `破折号一章最多3处。叹号一章最多5个，同一段1个。禁止！！。`,
    `对话用“”。系统所有输出一律【】：说话、面板、警告、损人。禁止用「」给系统。禁止「来源：未知。」「等级：F」漏出括号写成叙述。系统用数字说完的，下一句用人物反应，不要再贴一行字段标签。内心独白不用引号，直接叙述。`,
    `对话排版：动作用句号收住，下一行再写“台词”。禁止把长台词接在动作段冒号后面。同一人两句可夹一句动作：“……。”他说，“……。”短台词可跟一句说明：“你干什么。”苏影没回头。`,
    `内心排版：念头接在手上正摸着的东西后面。手插回兜里，摸到那几颗没登记的牙。报到要章，牙给不了。禁止「黑市。」「完了。」这种单字另起一段当标题卡。禁止把心里话写成带引号的“完了。”。机器屏幕、旁人起哄写成叙述。系统【】必须单独成段。禁止「」。`,
    `金手指人格全篇靠齐：毒舌评测员，美食弹幕口吻，永远不夸宿主。`,
    `冒号一句1个。引号内是完整语气，引号外另起动作用句号隔开。`,
    `紧张短句独立成句：蓝光爆开。他手伸出去。`,
  ];
}

function rhythmGuide(craft, skill, voiceActive) {
  const min = Number(craft.wordsMin) || 2200;
  const max = Number(craft.wordsMax) || 3800;
  const rise = Math.round(min * 0.2);
  const main = `${Math.round(min * 0.55)}-${Math.round(max * 0.65)}`;
  const hook = Math.round(min * 0.15);
  const lines = [
    `# 故事节奏`,
    `一章一条主冲突。细纲 2 到 3 场时：第一场起势（约${rise}字），中间主场（约${main}字），最后钩子（约${hook}字）。`,
    `主场是打脸、猎杀、掉马、系统摊牌这种读者追更的一场，必须写够来回：围观、对话、当场后果。`,
    `过场（换场、走路、领钱、数钞票）压缩成一两段。禁止把过场写成跟主场一样长的小冲突。`,
    `默认「问题→行动→结果→新问题」。结果先落地，原因后补。失败必须留下可见后果和新问题。`,
    `钩子停在动作或决定的临界点：手伸出去、门推开一半、话卡在喉咙。钩子类型轮换：A新人物 / B新信息 / C新危险 / D新奖励 / E新选择 / F身份反转 / G认知反转 / H更大问题。近三章同型禁止再用。禁止用内心吐槽收尾。禁止把下一章的打戏、搜证、传话写完。禁止钩子后再另起早点摊、办公室这种完整场。`,
    `高潮打完，用三到六句把身体落下来（嘴里的味道、手里的东西），立刻甩到动作临界点，停笔。`,
    voiceActive
      ? `句子长短、段长照个人文风走，本节不另设限制。`
      : `句子要有长短。动手、逃跑、系统警告用短句成簇；过场和对话一段可以三到五句。禁止整章同一速度、同一段长往前拱。`,
  ];
  if (skill && skill.id === "continue") {
    return [
      `# 故事节奏`,
      `续写只推进当前这一场，800 到 1600 字打完一个完整压力。禁止另开一场跟当前场面同等长度的新戏。`,
      `贴着上一拍的速度：正在打就打完再歇；正在说话就先把来回说完。`,
      `若写到场面收束，停在动作临界点，不要用内心总结把紧张泄掉。`,
    ];
  }
  return lines;
}

function buildCraftBlock(novel, chapter, skill, opts = {}) {
  const craft = { ...defaultCraft(), ...(novel.craft || {}) };
  const voiceActive = Boolean(opts.voiceActive);
  const threads = normalizeThreads(novel.threads);
  const open = threads.filter((item) => item.status === "open");
  const paid = threads.filter((item) => item.status === "paid");
  const densityText =
    craft.density === "密"
      ? "密，场面里多塞可感知细节和信息差"
      : craft.density === "疏"
        ? "疏，留白多，一句一事，少解释"
        : "中，该密的冲突段加密，过渡段留白";
  const lines = [
    `# 核心设定（优先遵守）`,
    `文风：${novel.style || "跟立项调性"}。${styleGuide(novel.style)}`,
    `视角：${novel.pov || "第三人称有限"}。知情范围只到当前视角人物看见、听见、知道的事。`,
    `主题：${novel.theme || "从人物选择和代价里长出来。"}`,
    `雪花：只膨胀立项里的「雪花一句」和「雪花五句」。不另起故事，不换结局赌注。`,
    `信息密度：${densityText}。`,
  ];
  const flow = findFlow(craft.flow);
  const platform = findPlatform(craft.platform);
  if (flow.module || platform.module) {
    lines.push(
      `类型与平台：${flow.module ? flow.label : "未指定类型"} · ${platform.module ? platform.label : "通用平台"}。类型模块和平台特供规则以本文件后续段落为准。`
    );
  }
  if (skill && skill.id === "chapter-prose") {
    const min = craft.wordsMin || 2200;
    const max = craft.wordsMax || 3800;
    lines.push(
      `硬性篇幅：按无空格汉字计，必须写在 ${min} 到 ${max} 字之间。写到 ${max} 字必须落下章末钩子并立刻停笔。超过 ${max} 的文字会被系统截掉。禁止注水，禁止写到一半就停，禁止把后几章写进本章。`
    );
  }
  lines.push(
    `语言：通俗 ${100 - (craft.tone || 45)} / 文学 ${craft.tone || 45}。句长：舒缓 ${100 - (craft.pace || 55)} / 短促 ${craft.pace || 55}（只管句子，场次快慢看「故事节奏」）。场面：描写 ${100 - (craft.talk || 50)} / 对话 ${craft.talk || 50}。`
  );
  const nouns = extractNouns(novel, chapter);
  if (nouns.length) {
    lines.push(`# 文字规范`);
    lines.push(`使用规范简体中文。专有名词必须严格按原样：${nouns.join("、")}。`);
    lines.push(`输出前自查人名、地名是否与上文一致。`);
  }
  if (threads.length) {
    lines.push(`伏笔账本：`);
    threads.forEach((item) => lines.push(formatThreadLine(item)));
  }
  if (paid.length) {
    lines.push(`已兑伏笔后文当作已知事实：${paid.map((item) => item.name).join("、")}`);
  }
  const writing = skill && (skill.target === "content" || skill.id === "chapter-prose" || skill.id === "continue");
  const polishing = skill && skill.id === "polish";
  const planning = skill && ["kickoff", "characters", "world", "outline", "chapter-beats", "props", "threads", "suggest", "review"].includes(skill.id);
  if (planning) {
    lines.push(...heartGuide(skill));
    lines.push(...serialEngineGuide(skill));
    lines.push(...buildGenreBlock(novel, chapter, skill, { voiceActive }));
    lines.push(...buildImitateBlock(craft));
  } else if (writing || polishing) {
    lines.push(...heartGuide(skill));
    lines.push(...serialEngineGuide(skill));
    lines.push(...buildGenreBlock(novel, chapter, skill, { voiceActive }));
    lines.push(...buildImitateBlock(craft));
    lines.push(...performGuide(craft));
    lines.push(...punctGuide(voiceActive));
    if (writing) {
      lines.push(...immersionGuide(recentBodyBan(novel, chapter), voiceActive));
      lines.push(...rhythmGuide(craft, skill, voiceActive));
    }
  }
  lines.push(`# 本章写法`);
  if (craft.subtext !== false) {
    lines.push(`- 潜台词：情绪交给动作、停顿、物件和没说完的话。`);
  }
  if (craft.noCheat !== false) {
    lines.push(`- 付代价：能力、情报、救援都要付世界观里写明的代价。`);
  }
  if (craft.staySmart !== false) {
    lines.push(`- 人物清醒：按小传里的欲望和秘密行动，每个人有自己的算盘。`);
  }
  if (craft.tighten !== false) {
    lines.push(`- 压节奏：删空形容词和翻译腔。能用动词就不用「XX地」。一句里「的」不超过一个。`);
  }
  if (craft.payoff) {
    lines.push(`- 回收伏笔：本章必须兑现或显著推进一条未收伏笔，让读者在场面里摸到。`);
  } else if (open.length) {
    lines.push(`- 伏笔：可埋新线；至少用一个细节点一下某条未收伏笔。`);
  }
  const continuing = skill && skill.id === "continue";
  const done = chapterHasProse(chapter);
  const chapterMood = String(chapter?.mood || "").trim();
  const defaultMood = String(craft.mood || "").trim();
  const mood = chapterMood || (writing && !done && !continuing ? defaultMood : "");
  if (writing || polishing) {
    lines.push(`# 对话情绪`);
    lines.push(`慌、怒、愣、怕时台词先断再接。气口用……。第一次听见陌生设定写成“什么……轮回塔？”。`);
  }
  if (writing) {
    const hookTypes = recentHookTypes(novel, chapter);
    if (hookTypes.length) {
      lines.push(`# 本章钩子`);
      lines.push(`近三章钩子类型：${hookTypes.join(" / ")}。本章换类型。`);
    }
    const previous = prevChapter(novel, chapter);
    const prevTail = String(previous?.content || "").trim();
    const thisTail = String(chapter?.content || "").trim();
    if (continuing && thisTail) {
      lines.push(...emotionBridgeLines(thisTail, "continue"));
    } else if (prevTail) {
      lines.push(...emotionBridgeLines(prevTail, "prev"));
    }
    if (mood) {
      lines.push(`# 本章情感方向`);
      lines.push(
        `这一章往「${mood}」长。用场面自己走到这个方向，不要旁白报情绪，不要写强度数字。表达偏${craft.emotionStyle || "综合"}。`
      );
      if (chapter && chapter.emotionStart != null && chapter.emotionEnd != null) {
        const endN = clamp10(chapter.emotionEnd, 6);
        const startN = clamp10(chapter.emotionStart, endN);
        if (startN !== endN) {
          lines.push(`内部变化参考：从弱到强大约 ${startN} → ${endN}（只给作者看，禁止写进正文）。`);
        }
      }
      if (craft.showDontTell !== false) {
        lines.push(`情绪用身体反应、环境、停顿和潜台词落地。`);
      }
    }
  }
  if (craft.cleanCopy !== false) {
    if (writing || polishing) {
      lines.push(`# 交稿前扫一眼`);
      lines.push(`空比喻、总结句、说破潜台词、对比句式、设计感台词、AI表情、系统信息挤一条、说明书对白、标题卡、漏出【】的系统字段，当场删。`);
    } else {
      lines.push(`# 去AI味`);
      lines.push(`删翻译腔和空比喻。一句一个「的」。人名前后一致。删总结句、对比句式（不是A，也不是B，是C）、设计感台词、AI表情（眼睛眯了一下）；系统一条只放一个信息。`);
    }
  }
  return lines.join("\n");
}

module.exports = {
  STYLES,
  defaultCraft,
  hydrateCraft,
  parseThreads,
  mergeThreads,
  normalizeThreads,
  buildCraftBlock,
  styleGuide,
};
