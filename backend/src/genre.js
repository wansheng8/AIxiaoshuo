// 类型引擎 / 金手指 / 平台特供 / 爽点公式 / 人类特征注入 / 量化验收
// 依据：番茄系统流爽文提示词方法论（类型引擎 + 金手指规则 + 爽点验收 + 去AI统计特征）

const ORAL_WORDS = [
  "可",
  "结果",
  "当然",
  "至于",
  "说白了",
  "好家伙",
  "果不其然",
  "谁承想",
  "倒也不是",
  "反正",
  "横竖",
  "殊不知",
  "此言一出",
  "顿时",
  "瞬间",
  "随后",
  "连忙",
  "赶紧",
  "到头来",
  "怪就怪在",
  "这边",
];

const HARD_BANS = [
  "命运齿轮",
  "时光低语",
  "月光",
  "琥珀",
  "宿命",
  "仿佛",
  "似乎",
  "空气凝固",
  "心中五味杂陈",
  "五味杂陈",
];

const BOILER_CONNECTORS = ["然而", "因此", "与此同时", "值得注意的是", "综上所述"];

const OVERVIEW_WORDS = ["经过一番", "最终", "终于", "不知不觉", "一番争执", "一番折腾"];

// 围观反应：爽点三拍的“反应”拍
const REACTION_WORDS = [
  "震惊",
  "傻眼",
  "目瞪口呆",
  "鸦雀无声",
  "闭嘴",
  "哑火",
  "变脸",
  "想笑不敢笑",
  "大眼瞪小眼",
  "不怒反笑",
  "脸色一变",
  "说不出话",
];

const FLAW_PATTERNS = [
  "不对，是",
  "记不清",
  "想不起来",
  "忘了",
  "过了很久",
  "不知道多久",
  "不知道过了多久",
  "好像",
  "大概是",
  "反正是",
];

// 总结句：动作后补一句形容词/副词总结（AI 爱写「那一眼很快」「压得很低」「每个字都落得实」）
const SUMMARY_TAILS =
  /((?:那|这)(?:一)?[眼声笑顿默停]|声音|语气|每个字|每个音|目光|步子|动作|话)[^。！？\n]{0,8}(?:很|得)(?:快|慢|轻|重|低|响|稳|实|久|冷|淡)/g;
const SUMMARY_OPEN =
  /(?:他|她|我)(?:心如刀绞|如释重负|五味杂陈|百感交集|怅然若失|若有所思|欲言又止|恍然大悟|愕然)/g;
// 把潜台词说破：直接报出心理活动，而非留白（「我还以为你嫌弃我」「觉得说出来更难看」）
const SUBTEXT_TELLS =
  /(?:我还以为|还以为你|还以为他|还以为她|觉得说出来|说出口更|想找个说法|一直没想好|不知道怎么说|其实(?:我|他|她)?(?:知道|明白|清楚|早就|一直|不想|舍不得|在乎))/g;
// 总结词：删掉让读者自己感觉（静下来、走了一路、缓过来）
const SUMMARY_WORDS = /(?:静下来|安静下来|走了一路|缓过来|缓了缓|平复下来|放松下来|松下来)/g;
// AI 对比句式：不是A，也不是B，是C / 不再是X，是Y
const CONTRAST_TELLS = [
  /不是[^。！？\n]{1,16}[，,]?(?:也)?不是[^。！？\n]{1,16}[。，][^。！？\n]{0,4}(?:是|而是)/,
  /不再是[^。！？\n]{1,16}[。，][^。！？\n]{0,6}是/,
  /[。！？\n]不是[^。！？\n]{1,16}[。！？][^。！？\n]{0,6}(?:是|而是)/,
];
// 活人手上的小动作（正向信号，不用改写）
const GESTURE_WORDS =
  /(顿了一下|顿了顿|扯了扯|拽了拽|捏着|捏了捏|搓了搓|摸了摸|敲了敲|弹了弹|甩了甩|抖了抖|缩了一截|往上缩|往下扯|滚了两下|闪了一下|塞回|夹回|压住|抠了抠|掐了一下|按了两下|蹭了蹭|揉了揉)/g;
// 具体次数或量（正向信号：抽了半包烟、看了两秒、走了三步）
const EXACT_WORDS =
  /(?:[一二两三四五六七八九十半]+|\d+)(?:秒|分钟|小时|下|根|包|步|口|层|片|道|块|张|盒)/g;

const DIALOGUE_QUOTE = /[“”]/g;

const ACTION_WORDS =
  /(走|跑|推|拉|抓|扔|抬|落|站|坐|蹲|扑|踢|打|敲|按|握|捏|挥|举|砸|撕|拽|拖|踩|跨|靠|转|低|点|摇|笑|吼|喊|骂|问|答|看|盯|瞥|皱眉|咬牙|攥|揣|摸|掏|递|接|躲|退|迈|冲|掐|捶|跺|仰|俯|侧|缩|绷|颤|抖|回头|扭头|起身|伸手|抽|甩|拦|抱|拍|戳|拉开门|推开门)/;

const FLOWS = [
  {
    id: "",
    label: "不指定",
    hint: "不套类型引擎，按立项调性写",
  },
  {
    id: "system",
    label: "系统流",
    hint: "签到/任务/抽奖，即时奖励，数字碾压",
    module: [
      "系统流。金手指是系统：签到、任务、抽奖、商城、属性面板。",
      "奖励必须即时、具体、可数：现金、房产、股权、技能、道具、属性点。",
      "系统提示音统一格式【叮，……】。有触发条件、冷却和限制，不能无条件无限给。",
      "系统可以高冷或贱萌，但不抢主角风头。每次奖励后必须有人质疑，再用数字打脸。",
    ],
  },
  {
    id: "transmigrate",
    label: "穿越流",
    hint: "现代知识/先知/原主身份，降维打击",
    module: [
      "穿越流。金手指是现代知识、先知信息或原主身份。",
      "写清穿越身份、原主困境、世界规则。先知优势用来降维打击。",
      "冲突：被轻视 → 展露超越时代的能力 → 众人震惊。",
      "不出现设定外的现代物品，除非金手指允许。",
    ],
  },
  {
    id: "rebirth",
    label: "重生流",
    hint: "前世记忆/预知未来，抢占先机",
    module: [
      "重生流。金手指是前世记忆和预知未来。",
      "写清重生时间点、前世关键事件、仇人、机遇。",
      "爽点：前世被坑 → 今生提前布局 → 仇人傻眼。",
      "必须有记忆盲区和变数，禁止写成全知全能。",
    ],
  },
  {
    id: "hybrid",
    label: "混合流",
    hint: "主+副金手指，双信息差，需防崩",
    module: [
      "混合流。必须指定主金手指和副金手指。",
      "主金手指推动主线，副金手指只做辅助。",
      "禁止两种能力混用导致逻辑崩坏。",
    ],
  },
  {
    id: "horror",
    label: "怪谈规则流",
    hint: "规则不明、代价未知，活下来就是赢",
    module: [
      "怪谈 / 规则恐怖 / 悬疑系统流。核心是规则不明、代价未知，活下来就是赢。",
      "开局用身体感受切入，不写「他醒来发现」。前300字出异常事件（怪、规则、死亡）。",
      "规则一次只给一条，且可能说谎；违反规则的后果具体到身体异变、记忆缺失、被标记。",
      "中段规则试探 + 代价显现 + 同伴可疑；结尾留新规则、新异变、新疑点。",
      "语言重身体感受（冷、烫、痒、抖、铁锈味），比喻来自身体、动物、腐烂、机械。",
      "禁止打脸—围观—震惊爽文三拍，禁止财富数字、美女侧目、亲戚势利眼。",
    ],
  },
];

const PLATFORMS = [
  { id: "", label: "通用", hint: "不套平台特供规则" },
  {
    id: "fanqie",
    label: "番茄",
    hint: "短快爽，钩子密，正向情绪",
    words: [1800, 2200],
    module: [
      "第1章前100字必须出现冲突或异常。金手指在第1章内激活，不拖到第2章。",
      "每章结尾必留钩子，从 A新人物 / B新信息 / C新危险 / D新奖励 / E新选择 / F身份反转 / G认知反转 / H更大问题 里选，近三章不同型。",
      "对白 + 动作占比 ≥ 60%，纯旁白 ≤ 40%。每300字至少2组对白。",
      "全程正向情绪：可以写屈辱，但不超过500字就必须反转。",
      "禁止大段环境描写、文艺比喻、哲理收尾。",
    ],
  },
  {
    id: "qimao",
    label: "七猫",
    hint: "强情绪落差，逆袭打脸",
    words: [2000, 2500],
    module: [
      "前3000字必须出现第一个高潮。主角前三章完成至少一次身份转变。",
      "强化情绪落差：先写曾经辉煌或被期待，再写跌落，再写反击。",
      "反派要有具体的势利嘴脸和台词，不能只写「看不起」。",
      "压抑必须写清「为什么」：为什么被看不起、为什么跌落。",
      "每章结尾留情绪悬念钩子。禁止超过200字的纯环境或纯心理描写。",
    ],
  },
  {
    id: "qidian",
    label: "起点",
    hint: "成长逻辑，伏笔长线，代价明确",
    words: [2000, 3000],
    module: [
      "每3章一次能力突破，每5章一次认知刷新，每7章一次社会关系重构。",
      "金手指必须有触发条件和代价，不能无限开挂。",
      "前20章不能有剧情漏缝；前期每4000字必有升级加点或打脸小情节。",
      "主角成长路径要有逻辑支撑：为什么变强、代价是什么、限制在哪里。",
      "允许阶段性收束，但主线钩子不能断。",
    ],
  },
];

function findFlow(id) {
  return FLOWS.find((row) => row.id === id) || FLOWS[0];
}

function findPlatform(id) {
  return PLATFORMS.find((row) => row.id === id) || PLATFORMS[0];
}

function flowGuide(id) {
  const flow = findFlow(id);
  return flow.module ? [...flow.module] : [];
}

function platformGuide(id, voiceActive) {
  const platform = findPlatform(id);
  if (!platform.module) return [];
  if (voiceActive) {
    return [
      `平台是「${platform.label}」。个人文风优先，平台家规只保留最低阅读格式：每章留钩子、篇幅按核心设定、系统输出用【】单独成段。`,
    ];
  }
  return [...platform.module];
}

function skillKind(skill) {
  const id = skill && skill.id;
  if (skill && (skill.target === "content" || id === "chapter-prose" || id === "continue")) return "write";
  if (id === "polish") return "polish";
  if (["kickoff", "characters", "outline", "chapter-beats", "suggest", "review", "props", "threads"].includes(id)) {
    return "plan";
  }
  return "other";
}

function payoffFormula() {
  return [
    `# 爽点公式`,
    `开场受压 → 金手指触发 → 即时收益 → 质疑出现 → 亮证据/能力 → 当众打脸 → 围观震惊 → 反派哑火 → 新钩子。`,
    `每个主要冲突至少完成一次「打脸—围观—反应」闭环。三拍缺一不可：`,
    `打脸：质疑/羞辱 → 主角短怼或不解释 → 亮证据/系统奖励/财富数字。`,
    `围观：旁人震惊、闭嘴、傻眼、想笑不敢笑，写变脸的具体过程，不能只写「震惊」。`,
    `反应：反派哑火 → 主角淡定或离场。`,
    `冲突禁止概述。凡出现「经过一番」「最终」「终于」「不知不觉」，必须拆成对白 + 动作 + 围观反应。`,
    `每次财富或身份揭露必须配具体数字：一百万、一个亿、五亿、五折、300万。`,
  ];
}

function humanTextureGuide(voiceActive) {
  const lines = [
    `# 人类特征注入（去AI，按句检查）`,
    `AI 文本的统计特征是「太顺、太匀、太干净」。以下按句执行，写完逐段自查。`,
    `硬禁词（出现即改）：${HARD_BANS.join("、")}。`,
    `书面连接词少用或替换：然而→可、因此→结果、与此同时→这边、值得注意的是→怪就怪在、最终→到头来。`,
    `口语骨架词撒进旁白，每500字至少5个：${ORAL_WORDS.slice(0, 16).join("、")}。`,
    `人类瑕疵每1000字至少3处：信息遗漏（不必交代完整）、自我修正（「他走了三步，不对，是四步，他记不清了」）、突然跳题（说着说着想到别的事）、时间模糊（「过了很久」「不知道多久」）。`,
    `语义跳跃：段落之间不总是因果连接，偶尔硬切；旁白偶尔插一句与当前场景无关的话。`,
    `对白不规整：平均长度 ≤ 12字；每组对白至少一次打断、重复、省略或反问；对白后必须跟动作或旁观者反应。`,
    `标点：中文弯引号“”；省略号只用在卡壳处；逗号可以串动作，句号不是每句都收；破折号少用。`,
    `总结句改糙：动作后别补形容词总结。「那一眼很快」→「那一眼没停」；「压得很低」→「低，像含着东西」；「每个字都落得实」→「说话不快，可没有废话」。`,
    `潜台词别说完：「我还以为你嫌弃我」→「我还以为……」；「觉得说出来更难看」→删掉心理句，只留手上的动作。`,
    `漂亮设计句改直接生理：「痒得他想咬一口」→「他拿指甲掐了一下。更痒了。」`,
    `多余动作是加分项：塞得慢、按了两下、拿了一个没吃捏在手里、缸子磕床板、抽了半包烟——保留，不要精修掉。`,
    `拟声词可单独成句（铛，铛），别统一成滴答滴答；能给具体次数就别写「一会儿」。`,
    `别读太顺：允许有点糙、有点噎、有点没说完。`,
    `人工锚点（主动写出来）：用工具或手上的动作代替表情（「笔尖顿了一下」而不是「她愣了一下」）；视线给落点（「从头到脚，最后落在左腕上」，别写「打量」）；允许补一句多余但必要的现状（「他今天没换衣服」，用来解释袖口为什么缩上去）。`,
    `逼问和审讯用无问号短句：「哪条路。」不写「你说的是哪条路？」。撒谎配一个小动作不解释：「把袖口往下扯了扯」。极简回答可以只有两个字：「踩了。」他说。`,
    `口语词替书面词：「脑子糊」不写「意识模糊」；允许省略主语的不完整句：「队里谁接的我，我都不认得」。具体形状不概括：「四四方方，边上缺一个角」不写「一块方形刻痕」。`,
    `密集信息用短句串，数字对比放在一句里不解释：「出来六个人，名单上七个」。沉默可以顶回去：「没接话」。四字短促收尾，不煽情：没敢多看、全朝他来。`,
    `身体感受具体到部位：「风从窗户缝里灌进来，吹得他后脖子发凉」，不写「心里一紧」。时间可以精确到「两秒」但不滥用。`,
    `禁止对比句式：不是A，也不是B，是C；不再是X，是Y。直接写后半句。`,
    `禁止设计感台词金句：「你要是不来，我拿搜查令来」「我正问你」，改成更短更硬的「明天九点。不来，我拿搜查令。」。`,
    `禁止 AI 表情：眼睛眯了一下、眯了眯眼、勾了勾嘴角，用动作代替（先看本子，再看他）。`,
    `系统提示一条只放一个信息，别堆「地点：……。时限：……。」，拆成多条【】更像系统在跳字。`,
  ];
  if (voiceActive) {
    lines.splice(1, 0, `个人文风优先：句长、段长、口头禅照作者习惯，本节只保留硬禁词、人类瑕疵和对白不规整。`);
    lines[8] = `对白不规整：对白后要跟动作或旁观者反应；中断、重复、省略、反问至少来一下。`;
    lines[9] = `标点：标点一律中文全角；系统所有输出单独成段、一律用【】。`;
  } else {
    lines.splice(
      7,
      0,
      `句子要有锯齿：连续两个短句（10—15字）→ 一个长句（35—50字）→ 一个中等句（20—25字）。禁止连续3句长度接近（误差≤3字）。每300字句长标准差目标 ≥ 12（AI 通常只有5—8）。`
    );
  }
  return lines;
}

function acceptanceGuide(skill, voiceActive, noPayoff) {
  const kind = skillKind(skill);
  const lines = [
    `# 量化验收（不达标就重写）`,
    `前300字是否出现冲突或异常？`,
    `金手指是否按规则触发、且当场兑现一次可见效果？`,
  ];
  if (!noPayoff) {
    lines.push(`是否至少一次「打脸—围观—反应」闭环？`, `财富、身份、奖励是否配了具体数字？`);
  }
  lines.push(`结尾是否停在事件或动作临界点，而不是哲理抒情？`);
  if (!voiceActive) {
    lines.splice(
      lines.length - 1,
      0,
      `冲突章对白 + 动作占比 ≥ 60%，纯旁白 ≤ 40%；对白平均长度 ≤ 12字；每300字至少2组对白。`,
      `硬禁词、书面连接词出现即改；口语骨架词每500字 ≥ 5；人类瑕疵每1000字 ≥ 3。`
    );
  }
  lines.push(`自检不通过就重写，不要解释，不要交半成品。`);
  if (kind === "plan") {
    lines.push(`以上为细纲验收方向：每一章都要能填出这几项，填不出就调整细纲。`);
  }
  return lines;
}

function buildGenreBlock(novel, chapter, skill, opts = {}) {
  const craft = (novel && novel.craft) || {};
  const voiceActive = Boolean(opts.voiceActive);
  const kind = skillKind(skill);
  if (kind === "other") return [];
  const lines = [];

  const flow = findFlow(craft.flow);
  const noPayoff = flow.id === "horror";
  if (flow.module) {
    lines.push(`# 类型引擎`);
    lines.push(...flowGuide(flow.id));
  }

  const finger = String(craft.goldenFinger || "").trim();
  if (finger) {
    lines.push(`# 金手指规则（作者设定，优先遵守）`);
    lines.push(finger);
    lines.push(`金手指规则不写清模型就会无限开挂。触发条件、奖励范围、冷却、限制、成长、提示音以作者设定为准。`);
  } else if (kind === "write" || kind === "plan") {
    lines.push(`# 金手指规则`);
    lines.push(`金手指必须有触发条件、奖励范围、冷却、限制和成长曲线。奖励只给当场用得上的，禁止无条件无限给。`);
  }

  if (kind === "write" && !noPayoff) {
    lines.push(...payoffFormula());
    const beats = String(craft.requiredBeats || "").trim();
    if (beats) {
      lines.push(`# 本章必写爽点`);
      lines.push(beats);
      lines.push(`上面每一项都要落到具体对白、动作、表情或数字，不能一句话带过。`);
    }
  }

  const platformLines = platformGuide(craft.platform, voiceActive);
  if (platformLines.length) {
    lines.push(`# 平台特供（${findPlatform(craft.platform).label}）`);
    lines.push(...platformLines);
  }

  if (kind === "write" || kind === "polish") {
    lines.push(...humanTextureGuide(voiceActive));
  }

  if (kind === "write") {
    lines.push(...acceptanceGuide(skill, voiceActive, noPayoff));
  } else if (kind === "plan") {
    lines.push(
      `# 类型与平台验收`,
      `类型引擎、金手指规则、平台节奏必须在立项/细纲阶段定死；写正文时不再改设定。`,
      noPayoff
        ? `每章细纲要能填出：本章目标、冲突、规则试探、代价显现、结尾钩子。`
        : `每章细纲要能填出：本章目标、冲突、打脸证据、围观反应、结尾钩子。`
    );
  }

  return lines;
}

function splitSentences(text) {
  return String(text || "")
    .split(/(?<=[。！？…\n])/)
    .map((row) => row.trim())
    .filter((row) => chars(row) >= 4);
}

function chars(text) {
  return Array.from(String(text || "").replace(/\s+/g, "")).length;
}

function mean(list) {
  if (!list.length) return 0;
  return list.reduce((a, b) => a + b, 0) / list.length;
}

function stdev(list) {
  if (list.length < 2) return 0;
  const m = mean(list);
  return Math.sqrt(list.reduce((s, n) => s + (n - m) * (n - m), 0) / list.length);
}

function countHits(text, needle) {
  if (!needle) return 0;
  let n = 0;
  let from = 0;
  while (from < text.length) {
    const at = text.indexOf(needle, from);
    if (at < 0) break;
    n += 1;
    from = at + needle.length;
  }
  return n;
}

function countRe(text, re) {
  if (!re) return 0;
  const global = re.global ? re : new RegExp(re.source, `${re.flags}g`);
  global.lastIndex = 0;
  let n = 0;
  while (global.exec(text)) {
    n += 1;
    if (global.lastIndex === 0) break;
  }
  return n;
}

function countList(text, list) {
  return (list || []).reduce((sum, re) => sum + countRe(text, re), 0);
}

function maxFlatRun(lens, tolerance = 3) {
  let best = 0;
  let run = 1;
  for (let i = 1; i < lens.length; i += 1) {
    if (Math.abs(lens[i] - lens[i - 1]) <= tolerance) {
      run += 1;
      best = Math.max(best, run);
    } else {
      run = 1;
    }
  }
  return best;
}

function dialogueStats(text) {
  const matches = String(text || "").match(/“[^”]{0,200}”/g) || [];
  const lengths = matches.map((row) => chars(row.replace(/[“”]/g, ""))).filter((n) => n >= 2);
  const irregular = /……|——|，|？|！|\.\.\./.test(String(text || ""));
  return {
    count: matches.length,
    avgLen: Math.round(mean(lengths) * 10) / 10,
    irregular,
  };
}

function textMetrics(text) {
  const source = String(text || "");
  const nChars = chars(source);
  const sents = splitSentences(source);
  const lens = sents.map(chars);
  const std = Math.round(stdev(lens) * 10) / 10;
  const dialogueChars = (source.match(/“[^”]{0,200}”/g) || []).reduce(
    (sum, row) => sum + chars(row.replace(/[“”]/g, "")),
    0
  );
  const dialogue = dialogueStats(source);
  const actionSents = sents.filter((row) => ACTION_WORDS.test(row) && !/^“/.test(row)).length;
  const oralCount = ORAL_WORDS.reduce((sum, word) => sum + countHits(source, word), 0);
  const flawCount = FLAW_PATTERNS.reduce((sum, word) => sum + countHits(source, word), 0);
  const summaryCount =
    countRe(source, SUMMARY_TAILS) + countRe(source, SUMMARY_OPEN) + countRe(source, SUMMARY_WORDS);
  const subtextCount = countRe(source, SUBTEXT_TELLS);
  const contrastCount = countList(source, CONTRAST_TELLS);
  const gestureCount = countRe(source, GESTURE_WORDS);
  const exactCount = countRe(source, EXACT_WORDS);
  const hardBans = HARD_BANS.filter((word) => source.includes(word));
  const connectors = BOILER_CONNECTORS.filter((word) => source.includes(word));
  const overview = OVERVIEW_WORDS.filter((word) => source.includes(word));
  const reactions = REACTION_WORDS.filter((word) => source.includes(word));
  const perK = (n) => Math.round((n / Math.max(nChars, 1)) * 1000 * 10) / 10;
  return {
    chars: nChars,
    sentences: sents.length,
    std,
    avgLen: Math.round(mean(lens) * 10) / 10,
    flatRun: maxFlatRun(lens),
    oralCount,
    oralPer500: Math.round((oralCount / Math.max(nChars, 1)) * 500 * 10) / 10,
    flawCount,
    flawPer1000: perK(flawCount),
    summaryCount,
    summaryPer1000: perK(summaryCount),
    subtextCount,
    subtextPer1000: perK(subtextCount),
    contrastCount,
    contrastPer1000: perK(contrastCount),
    gestureCount,
    gesturePer1000: perK(gestureCount),
    exactCount,
    exactPer1000: perK(exactCount),
    dialogueCount: dialogue.count,
    dialogueAvgLen: dialogue.avgLen,
    dialogueIrregular: dialogue.irregular,
    dialogueRatio: nChars ? Math.round((dialogueChars / nChars) * 100) : 0,
    dialoguePer300: Math.round((dialogue.count / Math.max(nChars, 1)) * 300 * 10) / 10,
    actionRatio: sents.length ? Math.round((actionSents / sents.length) * 100) : 0,
    hardBans,
    connectors,
    overview,
    reactions,
  };
}

module.exports = {
  ORAL_WORDS,
  HARD_BANS,
  BOILER_CONNECTORS,
  OVERVIEW_WORDS,
  REACTION_WORDS,
  FLAW_PATTERNS,
  SUMMARY_TAILS,
  SUMMARY_OPEN,
  SUMMARY_WORDS,
  SUBTEXT_TELLS,
  CONTRAST_TELLS,
  GESTURE_WORDS,
  EXACT_WORDS,
  FLOWS,
  PLATFORMS,
  findFlow,
  findPlatform,
  buildGenreBlock,
  textMetrics,
};
