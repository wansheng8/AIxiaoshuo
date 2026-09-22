import type { CraftFlags, ImitateSample, ThreadItem, ThreadStatus } from "./types";

export const IMITATE_DIMENSIONS: { key: string; label: string }[] = [
  { key: "avgLen", label: "平均句长" },
  { key: "shortPct", label: "短句占比" },
  { key: "midPct", label: "中句占比" },
  { key: "longPct", label: "长句占比" },
  { key: "std", label: "句长标准差" },
  { key: "paraAvgSent", label: "一段几句" },
  { key: "oneSentParaPct", label: "一句一段占比" },
  { key: "dialoguePct", label: "对白占比" },
  { key: "dialogueAvgLen", label: "对白平均长度" },
  { key: "talkParaPct", label: "对白段占比" },
  { key: "actionParaPct", label: "动作段占比" },
  { key: "narrParaPct", label: "旁白段占比" },
  { key: "commaPer1000", label: "逗号密度" },
  { key: "ellipsisPer1000", label: "省略号密度" },
  { key: "dashPer1000", label: "破折号密度" },
  { key: "questionPer1000", label: "问号密度" },
  { key: "bangPer1000", label: "叹号密度" },
  { key: "psychPer1000", label: "心理密度" },
  { key: "oralPer1000", label: "口语密度" },
  { key: "tailPer1000", label: "句尾语气词密度" },
  { key: "similePer1000", label: "比喻密度" },
  { key: "redupPer1000", label: "叠词密度" },
  { key: "gesturePer1000", label: "小动作密度" },
  { key: "exactPer1000", label: "具体量密度" },
  { key: "brokenPct", label: "不完整句占比" },
];

export function newImitateSample(): ImitateSample {
  return {
    id: `im_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    title: "",
    platform: "",
    genre: "",
    style: "",
    check: "",
    excerpt: "",
    report: "",
    skeleton: "",
    dims: null,
  };
}

export const IMITATE_EXTRA =
  "仿写任务。严格套用给定「仿写骨架」：句长与短中长句占比、一段几句、对白占比与均长、对白段/动作段/旁白段占比、标点密度按骨架走。用词、口头禅、句尾语气词、叠词、比喻密度也照骨架，不引入骨架没有的用法。人味锚点照骨架：小动作、具体次数/量、不完整句、心理外化。内容全部替换，禁止抄范文词句。写完自检：随机抽三段跟骨架对比，句长/对白/标点差异超过 20% 的维度回去改，用词和人味锚点对不上的补回来。只输出章节标题和正文。";

export const STYLES = [
  "网文爽快",
  "轻松吐槽",
  "细密心理",
  "白描克制",
  "冷硬悬疑",
  "甜宠日常",
  "压抑暗黑",
  "热血燃",
  "古典雅正",
  "海明威冷硬",
  "张爱玲绵密",
];

export const POVS = ["第三人称有限", "第一人称", "第三人称全知", "多视角轮换"];

export const DENSITIES = ["密", "中", "疏"] as const;

export const FLOW_OPTIONS = [
  { id: "", label: "不指定", hint: "不套类型引擎，按立项调性写" },
  { id: "system", label: "系统流", hint: "签到/任务/抽奖，即时奖励，数字碾压" },
  { id: "transmigrate", label: "穿越流", hint: "现代知识/先知/原主身份，降维打击" },
  { id: "rebirth", label: "重生流", hint: "前世记忆/预知未来，抢占先机" },
  { id: "hybrid", label: "混合流", hint: "主+副金手指，双信息差，需防崩" },
  { id: "horror", label: "怪谈规则流", hint: "规则不明、代价未知，活下来就是赢" },
] as const;

export const PLATFORM_OPTIONS = [
  { id: "", label: "通用", hint: "不套平台特供规则" },
  { id: "fanqie", label: "番茄", hint: "短快爽，钩子密，正向情绪（1800–2200字）" },
  { id: "qimao", label: "七猫", hint: "强情绪落差，逆袭打脸（2000–2500字）" },
  { id: "qidian", label: "起点", hint: "成长逻辑，伏笔长线，代价明确（2000–3000字）" },
] as const;

export const WORD_PRESETS = [
  { label: "短章", min: 1500, max: 2200 },
  { label: "常章", min: 2200, max: 3800 },
  { label: "长章", min: 3800, max: 5500 },
] as const;

export const CLEAN_COPY_EXTRA =
  "清洗这段正文。删除优先：解释句、总结句、同义复读、说明书对白、一口气想完的内心、下一段解释上一段。去掉AI套话、空形容词、空比喻、空描写和翻译腔，改正错别字、同音别字、人名前后不一、中英混用或重复标点。情节事实、人名、时间线、能力等级保持原样。只删不添，禁止往句子上贴新的形容词或比喻。必须删掉：不禁、不由得、突然意识到、心中暗想、心里暗想、目光深邃、嘴角上扬、空气凝固、倒吸一口凉气、深吸一口气、缓缓开口、眼神复杂、心情复杂、在这一刻、与此同时、总而言之、不堪重负、精准地、特有的、带着一种、下意识地、一丝、微微、仿佛、宛如、像、似的、目光还没收回来、声音渗进来、没进耳朵。把「一种……的」改成直接名词。默认不用比喻。引信、骨头、火炭、鹅卵石、猫踩瓦片、扫泥、扫光这类空比喻直接删掉，改成硌、沉、凉、没声。同一物件连写的触感只留一处。对话里把「什么是某某？」改成带气口的半截话，例如“什么……某某？”。说明书对白改成绕话、打断或说一半。一口气想完对错利弊的内心，只留看见、身体先动和一句俗念头。标点：英文改全角，分号改句号，！！改成一个！，叙述段尾……改句号，对话用“”，禁止「」，系统面板用【】且单独成段。漏在【】外面的「来源：」「等级：」「持续时间：」「冷却时间：」收进【】；纯标签且下一段已经在演的直接删。动作用句号收住后再另起一行写台词。内心独白不用引号。单独成段的单字地点、单字结论删掉，接到手上正摸着的物件后面。总结句收尾必删：动作后补的「那一眼很快」「压得很低」「每个字都落得实」直接删，有触感就压成短句，如「那一眼没停」「低，像含着东西」「说话不快，可没有废话」。把潜台词说破的删成半截话：「我还以为你嫌弃我」→「我还以为……」，「觉得说出来更难看」→整句删，只留手上的动作。太漂亮的刻意细节改成当场生理反应，如「痒得他想咬一口」→「他拿指甲掐了一下。更痒了。」。多余动作和具体次数是活人痕迹，保留别精修：塞得慢、按了两下、拿了一个没吃捏在手里、抽了半包烟。拟声词可单独成句（铛，铛），不要统一成滴答滴答。删掉对比句式：不是A，也不是B，是C；不再是X，是Y，直接写后半句。设计感台词改短改硬：「你要是不来，我拿搜查令来」→「不来，我拿搜查令」，「我正问你」→「你先说」。AI表情改动作：「眼睛眯了一下」→「没说话，先看，再看他」。系统提示一条只放一个信息：「地点：……。时限：……」拆成多条【】。允许有点糙、有点噎、有点没说完，别读太顺。禁止解释。只输出清洗后的正文。字数只减不增。";

export const PERFORM_EXTRA =
  "把这段从案情通报改成现场。先交心口：谁怕丢掉什么，谁会心疼谁，哪一句没说出口。思维断层：看见→身体先动→一句俗念头→做错一步，禁止一口气把对错想完。对白优先绕话、打断、说一半。禁止概括情绪词：我很害怕、气氛很诡异、场面非常恐怖、我感觉不对劲。心里一沉改成手上的物件或一句俗念头。每段若有选择，写出怕死、心疼、得意或发狠的温度，选择要难看。外部描写只留两个能用的抓手，禁止脸、颧骨、胸骨、瞳孔开场。高压处用动作链：动作→身体反应→一句很俗的内心OS→更糟或更可笑的下一动作。过场保持原速，不要每段都上三条动作。碎碎念、关系痕迹、代价犹豫必须留。六层只挑本场用得上的一两层。情节事实、人名、时间线保持原样。动作后不要补总结句（那一眼很快、压得很低、每个字都落得实），改成具体动作或出声：那一眼没停；低，像含着东西；说话不快，可没有废话。潜台词不要说完，「我还以为你嫌弃我」改成「我还以为……」，心理句能删就删只留动作。漂亮设计句改当场生理反应，「痒得他想咬一口」改成「他拿指甲掐了一下。更痒了。」。多余的废动作和具体次数是活人痕迹，保留别抹掉。拟声词可以单独成句。不要对比句式（不是A，也不是B，是C；不再是X，是Y），直接写后半句。台词别写成威胁金句，「你要是不来，我拿搜查令来」改「不来，我拿搜查令」，「我正问你」改「你先说」。AI表情（眼睛眯了一下）改用动作。系统提示一条一个信息，地点和时限拆成多条【】。允许有点糙、有点噎、有点没说完。只输出改写后的正文。";

export const MOODS = ["悲伤", "愤怒", "喜悦", "恐惧", "孤独", "浪漫", "紧张", "释然"];

export const EMOTION_STYLES = ["动作", "环境", "对话", "内心", "综合"];

export const CRAFT_TOGGLES: {
  key: keyof Omit<CraftFlags, "density" | "tone" | "pace" | "talk" | "mood" | "intensity" | "emotionStyle" | "showDontTell" | "voiceSample" | "wordsMin" | "wordsMax">;
  label: string;
}[] = [
  { key: "subtext", label: "潜台词" },
  { key: "noCheat", label: "付代价" },
  { key: "staySmart", label: "人物清醒" },
  { key: "tighten", label: "压节奏" },
  { key: "payoff", label: "回收伏笔" },
  { key: "cleanCopy", label: "写完自动去AI味" },
];

export const THREAD_STATUS: { id: ThreadStatus; label: string }[] = [
  { id: "open", label: "未收" },
  { id: "paid", label: "已兑" },
  { id: "dropped", label: "搁置" },
];

export function defaultCraft(): CraftFlags {
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

export function newThread(): ThreadItem {
  return {
    id: `th_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    name: "",
    plant: "",
    payoff: "",
    status: "open",
    note: "",
  };
}

export function parseThreads(md: string): ThreadItem[] {
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
      let status: ThreadStatus = "open";
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
    .filter(Boolean) as ThreadItem[];
}

export function mergeThreads(prev: ThreadItem[] | undefined, incoming: ThreadItem[]) {
  const base = Array.isArray(prev) ? prev : [];
  const next = incoming.map((item) => {
    const old = base.find((row) => row.name === item.name);
    return old ? { ...old, ...item, id: old.id } : item;
  });
  const kept = base.filter((row) => !next.some((item) => item.name === row.name));
  return [...next, ...kept];
}

export function countCraftWords(text: string) {
  return Array.from(String(text || "").replace(/\s+/g, "")).length;
}

export function clipToWordMax(text: string, max: number) {
  const raw = String(text || "");
  const limit = Number(max);
  if (!raw || !Number.isFinite(limit) || limit <= 0 || countCraftWords(raw) <= limit) return raw;
  const bySentence = (chunk: string) => {
    const parts = chunk.split(/(?<=[。！？…])/);
    let acc = "";
    for (const part of parts) {
      const next = acc + part;
      if (countCraftWords(next) > limit) break;
      acc = next;
    }
    return acc;
  };
  const paragraphs = raw.split(/\n{2,}/);
  let kept = "";
  for (const para of paragraphs) {
    const next = kept ? `${kept}\n\n${para}` : para;
    if (countCraftWords(next) <= limit) {
      kept = next;
      continue;
    }
    const cut = bySentence(next).trimEnd();
    if (cut) return cut;
    break;
  }
  if (kept && countCraftWords(kept) <= limit) return kept.trimEnd();
  let count = 0;
  let out = "";
  for (const ch of Array.from(raw)) {
    if (/\s/.test(ch)) {
      out += ch;
      continue;
    }
    if (count >= limit) break;
    out += ch;
    count += 1;
  }
  return out.trimEnd();
}
