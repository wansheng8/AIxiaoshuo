const { detectAigc, aigcNarrativeHits } = require("./aigc");
const {
  SUMMARY_TAILS,
  SUMMARY_OPEN,
  SUMMARY_WORDS,
  SUBTEXT_TELLS,
  CONTRAST_TELLS,
} = require("./genre");

const CARD_TITLE = /^#{2,3}\s*([^\n（(]+)/;

function cardTitles(md) {
  return String(md || "")
    .split(/(?=^#{2,3}\s)/m)
    .map((block) => {
      const match = block.match(CARD_TITLE);
      return (match?.[1] || "").trim();
    })
    .filter((name) => name && name.length <= 16);
}

function extractNouns(novel, chapter) {
  const names = [];
  const push = (value) => {
    const text = String(value || "").trim();
    if (!text || text.length > 16) return;
    if (/^(未分节|未命名|第\s*[零一二三四五六七八九十百千两０-９\d]+\s*章)$/.test(text)) return;
    if (/^(关系简表|时代与日常|不可破的边界|底色|硬规则|总览|力量体系|地理势力)$/.test(text)) return;
    if (!names.includes(text)) names.push(text);
  };
  push(novel?.title);
  cardTitles(novel?.characters).forEach(push);
  cardTitles(novel?.world).forEach(push);
  cardTitles(novel?.props).forEach(push);
  (novel?.threads || []).forEach((row) => push(row.name));
  if (chapter) {
    const title = String(chapter.title || "")
      .replace(/^第\s*[零一二三四五六七八九十百千两０-９\d]+\s*章\s*/, "")
      .trim();
    push(title);
  }
  (novel?.lexicon?.keep || []).forEach(push);
  return names.slice(0, 24);
}

const TYPOS = [
  ["帐号", "账号"],
  ["帐本", "账本"],
  ["做为", "作为"],
  ["即然", "既然"],
  ["再接再励", "再接再厉"],
  ["好象", "好像"],
  ["必需要", "必须要"],
  ["成现", "呈现"],
  ["内牛满面", "泪流满面"],
  ["登陆系统", "登录系统"],
  ["登陆账号", "登录账号"],
  ["在坐", "在座"],
  ["渡假", "度假"],
  ["签定", "签订"],
  ["按装", "安装"],
  ["成份", "成分"],
  ["份量", "分量"],
  ["修练", "修炼"],
  ["精萃", "精粹"],
  ["其它", "其他"],
  ["做战", "作战"],
  ["蜂涌", "蜂拥"],
  ["追朔", "追溯"],
  ["凑和", "凑合"],
  ["松驰", "松弛"],
  ["寒喧", "寒暄"],
  ["暮然", "蓦然"],
  ["必竟", "毕竟"],
  ["象是", "像是"],
  ["好象是", "好像是"],
  ["帐蓬", "帐篷"],
  ["入场卷", "入场券"],
  ["泊来", "舶来"],
  ["一股脑的", "一股脑地"],
  ["因该", "应该"],
  ["那末", "那么"],
  ["这末", "这么"],
  ["精采", "精彩"],
  ["喝采", "喝彩"],
  ["风糜", "风靡"],
  ["萎糜", "萎靡"],
  ["陷井", "陷阱"],
  ["题纲", "提纲"],
  ["过份", "过分"],
  ["份内", "分内"],
  ["恰谈", "洽谈"],
  ["幅射", "辐射"],
  ["报歉", "抱歉"],
  ["欢渡", "欢度"],
  ["渡过难关", "度过难关"],
  ["座落", "坐落"],
  ["给于", "给予"],
  ["竟争", "竞争"],
  ["决对", "绝对"],
  ["尊守", "遵守"],
  ["通霄", "通宵"],
  ["通迅", "通讯"],
  ["严俊", "严峻"],
  ["沧茫", "苍茫"],
  ["苍海", "沧海"],
  ["按排", "安排"],
  ["安份", "安分"],
  ["按耐", "按捺"],
  ["按纳", "按捺"],
  ["罗嗦", "啰嗦"],
  ["罗唆", "啰嗦"],
  ["打拌", "打扮"],
  ["装拌", "装扮"],
  ["陪钱", "赔钱"],
  ["陪偿", "赔偿"],
  ["决别", "诀别"],
  ["决窍", "诀窍"],
  ["密诀", "秘诀"],
  ["神密", "神秘"],
  ["密月", "蜜月"],
  ["甜密", "甜蜜"],
  ["严励", "严厉"],
  ["震憾", "震撼"],
  ["撼卫", "捍卫"],
  ["焕散", "涣散"],
  ["报怨", "抱怨"],
  ["坚难", "艰难"],
  ["坚苦", "艰苦"],
  ["部置", "布置"],
  ["莫明其妙", "莫名其妙"],
  ["莫名其秒", "莫名其妙"],
  ["走头无路", "走投无路"],
  ["迫不急待", "迫不及待"],
  ["一愁莫展", "一筹莫展"],
  ["兴高彩烈", "兴高采烈"],
  ["无精打彩", "无精打采"],
  ["变本加利", "变本加厉"],
  ["谈笑风声", "谈笑风生"],
  ["顾名思意", "顾名思义"],
  ["不加思索", "不假思索"],
  ["一股作气", "一鼓作气"],
  ["按步就班", "按部就班"],
  ["穿流不息", "川流不息"],
  ["不径而走", "不胫而走"],
  ["脍灸人口", "脍炙人口"],
  ["叹为观之", "叹为观止"],
  ["翻来复去", "翻来覆去"],
  ["山青水秀", "山清水秀"],
  ["声名雀起", "声名鹊起"],
  ["含辛如苦", "含辛茹苦"],
  ["关怀倍至", "关怀备至"],
  ["万事具备", "万事俱备"],
  ["各行其事", "各行其是"],
  ["悬梁刺骨", "悬梁刺股"],
  ["恶灌满盈", "恶贯满盈"],
];

function quotedRanges(text) {
  const ranges = [];
  const re = /[「『“"][^」』”"]{0,400}[」』”"]/g;
  let match;
  while ((match = re.exec(text))) {
    ranges.push([match.index, match.index + match[0].length]);
  }
  return ranges;
}

function inRanges(index, ranges) {
  return ranges.some(([from, to]) => index >= from && index < to);
}

const AI_TELLS = [
  ["空气仿佛凝固", "屋里静下来"],
  ["仿佛时间静止", "停了一拍"],
  ["倒吸一口凉气", "吸了口气"],
  ["令人窒息的", ""],
  ["目光深邃", "看着"],
  ["嘴角微微上扬", "嘴角动了动"],
  ["缓缓开口道", "说"],
  ["突然意识到", "发觉"],
  ["心中暗想", "想"],
  ["心里暗想", "想"],
  ["眼神复杂", "没说话"],
  ["心情复杂", "没说话"],
  ["值得注意的是", ""],
  ["不可否认", ""],
  ["总而言之", ""],
  ["与此同时", "这时"],
  ["在这一刻", "这时"],
  ["深吸一口气", "吸了口气"],
  ["微微颔首", "点了点头"],
  ["一抹苦笑", "苦笑"],
  ["闪过一丝", "闪过"],
  ["不由得", "忍不住"],
  ["不禁", "忍不住"],
  ["不堪重负的", ""],
  ["不堪重负", ""],
  ["精准地", ""],
  ["缓缓地", ""],
  ["深深地", ""],
  ["静静地", ""],
  ["冷冰冰地", ""],
  ["微微地", ""],
  ["像枚没烧完的引信", ""],
  ["像多长了块骨头", ""],
  ["像睡着的火炭", ""],
  ["像在赶瞌睡虫", ""],
  ["像张旧伤疤的脸", ""],
  ["像猫踩过瓦片", "几乎没声"],
  ["像被水冲过的鹅卵石", "表面被磨光了"],
  ["脑子里冒出这个念头的时候，人已经", "人已经"],
  ["脑子里冒出这个念头", ""],
  ["下意识地", ""],
  ["下意识的", ""],
  ["特有的", ""],
  ["不带任何感情", ""],
  ["带着一种", "带着"],
  ["当前主流", ""],
  ["综上所述", ""],
  ["不难看出", ""],
  ["这意味着", ""],
  ["至关重要", ""],
  ["在实际检测中", ""],
  ["具有重要意义", ""],
  ["眼睛眯了一下", "没说话"],
  ["眯了眯眼", "看了眼"],
  ["勾了勾嘴角", "嘴角动了动"],
];

const EMPTY_TELLS = [
  ["电过似的", ""],
  ["细如发丝的", ""],
  ["目光还没收回来，", ""],
  ["他目光还没收回来，", ""],
  ["声音从识海里渗进来，没进耳朵。", ""],
  ["声音从识海里渗进来，不过耳朵。", ""],
  ["像扫一块踩脏的灵田泥", "看了他一眼"],
];

function replaceOutsideQuotes(text, from, to) {
  if (!from) return text;
  const ranges = quotedRanges(text);
  let out = "";
  let cursor = 0;
  while (cursor < text.length) {
    const index = text.indexOf(from, cursor);
    if (index < 0) {
      out += text.slice(cursor);
      break;
    }
    out += text.slice(cursor, index);
    if (inRanges(index, ranges)) out += from;
    else out += to;
    cursor = index + from.length;
  }
  return out;
}

function proofText(text, lexicon) {
  let next = String(text || "");
  const keep = new Set((lexicon?.keep || []).map(String));
  const mapped = (lexicon?.map || [])
    .filter((row) => row && row.from && row.to && row.from !== row.to)
    .map((row) => [String(row.from), String(row.to)]);
  const pairs = [...mapped, ...TYPOS].sort((a, b) => b[0].length - a[0].length);
  for (const [from, to] of pairs) {
    if (keep.has(from) || from === to) continue;
    next = replaceOutsideQuotes(next, from, to);
  }
  const tells = [...AI_TELLS, ...EMPTY_TELLS].sort((a, b) => b[0].length - a[0].length);
  for (const [from, to] of tells) {
    if (keep.has(from) || from === to) continue;
    next = replaceOutsideQuotes(next, from, to);
  }
  next = next
    .replace(/([^\x00-\xff]),/g, "$1，")
    .replace(/([^\x00-\xff])\.(?!\d)/g, "$1。")
    .replace(/([^\x00-\xff])!/g, "$1！")
    .replace(/([^\x00-\xff])\?/g, "$1？")
    .replace(/([^\x00-\xff]);/g, "$1。")
    .replace(/；/g, "。")
    .replace(/([^\x00-\xff]):/g, "$1：")
    .replace(/!!+/g, "！")
    .replace(/\.{3,}/g, "……")
    .replace(/。{2,}/g, "。")
    .replace(/，{2,}/g, "，")
    .replace(/！{2,}/g, "！")
    .replace(/？{2,}/g, "？")
    .replace(/ {2,}/g, " ")
    .replace(/。[，,]/g, "。")
    .replace(/([^”」』】\n])……([ \t]*)(?=\n|$)/g, "$1。$2")
    .replace(/([^。！？\n]{4,40}。)(\1)+/g, "$1");
  {
    let open = true;
    next = next.replace(/"/g, () => {
      const mark = open ? "“" : "”";
      open = !open;
      return mark;
    });
  }
  next = next.replace(/「/g, "“").replace(/」/g, "”");
  next = next.replace(
    /(^|\n)((?:来源|等级|持续时间|冷却时间|属性复制完成)[^\n【]*)/g,
    (_match, lead, line) => `${lead}【${line.trim()}】`
  );
  next = layoutProse(next);
  return next;
}

function countPlain(text) {
  return Array.from(String(text || "").replace(/\s+/g, "")).length;
}

function splitLongPara(para, max = 90) {
  const raw = String(para || "").trim();
  if (!raw) return [];
  if (countPlain(raw) <= max) return [raw];
  if (/^【/.test(raw) && /】$/.test(raw) && countPlain(raw) <= 160) return [raw];
  const parts = raw.split(/(?<=[。！？])/);
  const chunks = [];
  let acc = "";
  for (const part of parts) {
    if (!part) continue;
    const next = acc + part;
    if (acc && countPlain(next) > max) {
      chunks.push(acc.trim());
      acc = part;
    } else {
      acc = next;
    }
  }
  if (acc.trim()) chunks.push(acc.trim());
  return chunks.length ? chunks : [raw];
}

function layoutProse(text) {
  let next = String(text || "");
  next = next.replace(/([^\n])[ \t]*(【)/g, "$1\n\n$2");
  next = next.replace(/(】)[ \t]*(?=[^\n])/g, "$1\n\n");
  next = next.replace(/([。！？])[ \t]*“/g, "$1\n\n“");
  next = next.replace(/([^“\n]{10,})：[ \t]*“/g, "$1。\n\n“");
  next = next.replace(/\n{3,}/g, "\n\n");
  const out = [];
  for (const para of next.split(/\n{2,}/)) {
    for (const piece of splitLongPara(para, 90)) {
      if (piece && piece !== out[out.length - 1]) out.push(piece);
    }
  }
  return out.join("\n\n");
}

function scanAiFlavor(text) {
  const source = String(text || "");
  const ranges = quotedRanges(source);
  const issues = [];
  const seen = new Set();
  for (const [from, to] of [...AI_TELLS, ...EMPTY_TELLS]) {
    let cursor = 0;
    while (cursor < source.length) {
      const index = source.indexOf(from, cursor);
      if (index < 0) break;
      if (!inRanges(index, ranges)) {
        const key = `${index}:${from}`;
        if (!seen.has(key)) {
          seen.add(key);
          issues.push({
            id: `ai_${index}_${from}`,
            kind: "ai",
            original: from,
            suggest: to,
            start: index,
            end: index + from.length,
            reason: "AI套话 / 翻译腔",
          });
        }
      }
      cursor = index + Math.max(from.length, 1);
    }
  }
  return issues;
}

// 叙事级 AI 味：机制说明句 / 机械伏笔 / 因果过拟合 / 视角滑移，带字符位置
function scanAigcNarrative(text) {
  const source = String(text || "");
  const ranges = quotedRanges(source);
  const issues = [];
  const seen = new Set();
  for (const hit of aigcNarrativeHits(source)) {
    if (hit.dim !== "dialogueExpo" && inRanges(hit.start, ranges)) continue;
    const key = `${hit.start}:${hit.end}`;
    if (seen.has(key)) continue;
    seen.add(key);
    issues.push({
      id: `nar_${hit.dim}_${hit.start}`,
      kind: "ai",
      original: source.slice(hit.start, hit.end),
      suggest: hit.suggest,
      start: hit.start,
      end: hit.end,
      reason: hit.reason,
    });
  }
  return issues.slice(0, 20);
}

const XIANG_WORDS = new Set([
  "摄像",
  "画像",
  "肖像",
  "偶像",
  "图像",
  "映像",
  "幻像",
  "影像",
  "遗像",
  "雕像",
  "塑像",
  "头像",
  "好像",
  "对象",
  "印象",
  "迹象",
  "大象",
  "征象",
  "录像",
  "景象",
  "现象",
  "气象",
  "抽象",
  "想像",
  "像样",
  "像话",
]);

const XIANG_NO_FIG_PREV = new Set(["不", "没", "未", "别", "想", "相", "偶"]);

function scanEmptyFig(text) {
  const source = String(text || "");
  const ranges = quotedRanges(source);
  const issues = [];
  const re = /仿佛|宛如|好似|如同|似的|如发丝|像(?!是)/g;
  let match;
  while ((match = re.exec(source))) {
    if (inRanges(match.index, ranges)) continue;
    if (match[0] === "像") {
      const two = source.slice(Math.max(0, match.index - 1), match.index + 1);
      if (XIANG_WORDS.has(two)) continue;
      const prev = source[match.index - 1];
      if (prev && XIANG_NO_FIG_PREV.has(prev)) continue;
    }
    issues.push({
      id: `fig_${match.index}`,
      kind: "ai",
      original: source.slice(match.index, match.index + Math.min(12, match[0].length + 6)),
      suggest: "改成当场动作或触感",
      start: match.index,
      end: match.index + match[0].length,
      reason: "空比喻",
    });
  }
  return issues;
}

function scanEmptyDesc(text) {
  const source = String(text || "");
  const ranges = quotedRanges(source);
  const issues = [];
  const re = /目光还没收回|渗进来|没进耳朵|不过耳朵|一种[^。！？\n]{1,8}的/g;
  let match;
  while ((match = re.exec(source))) {
    if (inRanges(match.index, ranges)) continue;
    issues.push({
      id: `desc_${match.index}`,
      kind: "ai",
      original: match[0].slice(0, 16),
      suggest: "删掉空转连接，接到手上动作",
      start: match.index,
      end: match.index + match[0].length,
      reason: "空描写",
    });
  }
  return issues;
}

function scanFlatAsk(text) {
  const source = String(text || "");
  const issues = [];
  const re = /[“「]什么是([^”」？?]{1,16})[？?][”」]/g;
  let match;
  while ((match = re.exec(source))) {
    const name = String(match[1] || "")
      .replace(/[啊呀呢吗的]+$/g, "")
      .trim();
    if (!name) continue;
    const start = match.index + 1;
    const original = source.slice(start, match.index + match[0].length - 1);
    issues.push({
      id: `ask_${start}`,
      kind: "ai",
      original,
      suggest: `什么……${name}？`,
      start,
      end: start + original.length,
      reason: "问句太完整，改成带气口的半截话",
    });
  }
  return issues;
}

function scanSummaryTalk(text) {
  const source = String(text || "");
  const ranges = quotedRanges(source);
  const issues = [];
  const push = (pattern, reason, suggest) => {
    const list = Array.isArray(pattern) ? pattern : [pattern];
    for (const re of list) {
      const rx = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
      let match;
      while ((match = rx.exec(source))) {
        if (match.index === rx.lastIndex) rx.lastIndex += 1;
        if (inRanges(match.index, ranges)) continue;
        issues.push({
          id: `sum_${match.index}_${match[0].length}`,
          kind: "ai",
          original: match[0].slice(0, 20),
          suggest,
          start: match.index,
          end: match.index + match[0].length,
          reason,
        });
      }
    }
  };
  push([SUMMARY_TAILS, SUMMARY_OPEN, SUMMARY_WORDS], "总结句", "删掉总结，换成具体动作或出声");
  push(SUBTEXT_TELLS, "潜台词说破", "改成半截话，或不说完");
  push(CONTRAST_TELLS, "对比句式", "删掉对比，直接写后半句");
  return issues;
}

const PERFECT_LINE =
  /(?:我正问你|你要是[^”]{0,14}[，,][^”]{0,10}(?:我就|我拿|我让|别怪)|如果你[^”]{0,14}[，,][^”]{0,10}(?:我就|我拿|我让))/g;

function scanPerfectLine(text) {
  const source = String(text || "");
  const issues = [];
  const rx = new RegExp(PERFECT_LINE.source, "g");
  let match;
  while ((match = rx.exec(source))) {
    if (match.index === rx.lastIndex) rx.lastIndex += 1;
    issues.push({
      id: `pl_${match.index}_${match[0].length}`,
      kind: "ai",
      original: match[0].slice(0, 20),
      suggest: "改短改硬，如「明天九点。不来，我拿搜查令。」",
      start: match.index,
      end: match.index + match[0].length,
      reason: "设计感台词",
    });
  }
  return issues;
}

function scanTypos(text, lexicon) {
  const issues = [];
  const keep = new Set((lexicon?.keep || []).map(String));
  const ranges = quotedRanges(text);
  const mapped = (lexicon?.map || [])
    .filter((row) => row && row.from && row.to && row.from !== row.to)
    .map((row) => [String(row.from), String(row.to)]);
  const pairs = [];
  const seen = new Set();
  for (const [from, to] of [...mapped, ...TYPOS]) {
    if (seen.has(from)) continue;
    seen.add(from);
    pairs.push([from, to]);
  }
  for (const [from, to] of pairs) {
    if (keep.has(from)) continue;
    let cursor = 0;
    while (cursor < text.length) {
      const index = text.indexOf(from, cursor);
      if (index < 0) break;
      if (!inRanges(index, ranges)) {
        issues.push({
          id: `ty_${index}_${from}`,
          kind: "typo",
          original: from,
          suggest: to,
          start: index,
          end: index + from.length,
          reason: keep.size || mapped.length ? "词库或易错词典" : "易错词典",
        });
      }
      cursor = index + Math.max(from.length, 1);
    }
  }
  return issues;
}

const TELL =
  /((?:他|她|你|我)很(?:伤心|难过|愤怒|高兴|开心|绝望|害怕|孤独|紧张|无奈|激动|委屈|痛苦)|感到(?:绝望|悲伤|愤怒|开心|恐惧|孤独|无奈|幸福)|心里(?:想|暗想|一沉)|心中(?:暗想|一凛)|不禁|不由得|突然意识到|非常(?:伤心|难过|愤怒|高兴|激动)|心情(?:复杂|沉重|激动|低落)|一股(?:悲伤|怒火|暖流)|气氛很(?:诡异|恐怖|紧张)|场面非常(?:恐怖|可怕)|感觉不对劲|不祥的预感|毛骨悚然|气氛诡异)/;
const SENSE = /手指|喉咙|胸口|发颤|发紧|发闷|发冷|颤抖|雨|冷风|空荡|停顿|咬唇|握紧|眼眶|指节|袖口|沉默|鼻尖|膝盖|瓷砖|后颈|鸡皮|霉味|腥|遥控器|脚趾|开关/;

function scanEmotion(text) {
  const source = String(text || "");
  const issues = [];
  let offset = 0;
  for (const para of source.split(/\n\n+/)) {
    const start = source.indexOf(para, offset);
    const end = start + para.length;
    offset = Math.max(end, offset + 1);
    if (start < 0 || para.length < 12) continue;
    if (TELL.test(para) && !SENSE.test(para)) {
      const hit = para.match(TELL);
      issues.push({
        id: `em_${start}`,
        kind: "emotion",
        original: (hit?.[0] || para).slice(0, 24),
        suggest: "改成动作、感官或环境细节",
        start,
        end,
        reason: "概括性情绪，缺少身体或环境落地",
      });
    }
  }
  return issues;
}

function isCjk(text) {
  return /^[\u4e00-\u9fff]+$/.test(text);
}

function oneEditApart(a, b) {
  if (a === b) return false;
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  if (la === lb) {
    let diff = 0;
    for (let i = 0; i < la; i += 1) {
      if (a[i] !== b[i]) diff += 1;
      if (diff > 1) return false;
    }
    return diff === 1;
  }
  const longer = la > lb ? a : b;
  const shorter = la > lb ? b : a;
  let i = 0;
  let j = 0;
  let skipped = 0;
  while (i < longer.length) {
    if (j < shorter.length && longer[i] === shorter[j]) {
      i += 1;
      j += 1;
    } else {
      skipped += 1;
      if (skipped > 1) return false;
      i += 1;
    }
  }
  return true;
}

const COMMON_WORDS = new Set([
  "一个",
  "没有",
  "他们",
  "我们",
  "自己",
  "什么",
  "因为",
  "所以",
  "可以",
  "已经",
  "还是",
  "但是",
  "然后",
  "开始",
  "出来",
  "过来",
  "起来",
  "时候",
  "现在",
  "知道",
  "觉得",
  "看见",
  "听到",
  "突然",
  "终于",
  "于是",
  "只是",
  "可是",
  "不是",
  "就是",
  "不能",
  "不会",
  "不要",
  "只见",
  "只听",
  "心中",
  "心里",
  "眼前",
  "身后",
  "旁边",
  "中间",
  "里面",
  "外面",
  "上面",
  "下面",
  "林中",
  "林间",
  "林里",
]);

const COMMON_TAIL = new Set(
  "的了是在有和就人也中上大这我个们到说去过你对发成时可同工面后多小么心想眼前手路边间里下外内子风声光色气水火天日年左右家相门氏府宅院巷街庄村城".split("")
);
const NAME_FOLLOW = new Set("公子哥姐妹兄弟爷叔伯婶奶爸妈巷街府园院阁楼堂宫寺门氏家城镇村大人姑娘".split(""));
const NAME_TAIL_STOP = new Set(
  "罩灭旧新破窄宽厚薄软硬干湿冷热真假好坏高低长短粗细明暗开关推拉摆动转站坐躺睡吃喝穿脱拿放丢捡抱捧拖挤踩踏踢滚爬走跑跳飞落升降断电亮照响叫喊问答看见望听闻记忘爱恨怕惊怒笑哭泣骂打死活亡".split("")
);

function hasNameTailStop(slice) {
  const tail = slice[slice.length - 1] || "";
  return COMMON_TAIL.has(tail) || NAME_TAIL_STOP.has(tail);
}

function nounRanges(text, nouns) {
  const ranges = [];
  for (const name of nouns) {
    if (!name) continue;
    let cursor = 0;
    while (cursor < text.length) {
      const index = text.indexOf(name, cursor);
      if (index < 0) break;
      ranges.push([index, index + name.length]);
      cursor = index + Math.max(name.length, 1);
    }
  }
  return ranges;
}

function overlapsRange(start, end, ranges) {
  return ranges.some(([from, to]) => start < to && end > from);
}

function scanNameDrift(text, nouns) {
  const source = String(text || "");
  const names = (nouns || []).filter((name) => name && name.length >= 2 && name.length <= 6 && isCjk(name));
  const ranges = nounRanges(source, names);
  const issues = [];
  const seen = new Set();
  for (const name of names) {
    const width = name.length;
    for (let i = 0; i <= source.length - width; i += 1) {
      const slice = source.slice(i, i + width);
      if (!isCjk(slice) || slice === name) continue;
      if (names.includes(slice) || COMMON_WORDS.has(slice)) continue;
      if (hasNameTailStop(slice)) continue;
      if (NAME_FOLLOW.has(source[i + width] || "")) continue;
      if (slice[0] !== name[0]) continue;
      if (overlapsRange(i, i + width, ranges)) continue;
      if (!oneEditApart(slice, name)) continue;
      const key = `${i}:${slice}`;
      if (seen.has(key)) continue;
      seen.add(key);
      issues.push({
        id: `nm_${i}_${slice}`,
        kind: "name",
        original: slice,
        suggest: name,
        start: i,
        end: i + width,
        reason: `专名表是「${name}」，正文写成了「${slice}」`,
      });
    }
  }
  return issues;
}

function dedupeIssues(issues) {
  const seen = new Set();
  const out = [];
  for (const item of issues) {
    const key = `${item.start}:${item.end}:${item.original}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function hydrateLexicon(raw) {
  const keep = Array.isArray(raw?.keep) ? raw.keep.map((item) => String(item || "").trim()).filter(Boolean) : [];
  const map = Array.isArray(raw?.map)
    ? raw.map
        .map((row) => ({
          from: String(row?.from || "").trim(),
          to: String(row?.to || "").trim(),
        }))
        .filter((row) => row.from && row.to)
    : [];
  return { keep, map };
}

function scanPunct(text) {
  const source = String(text || "");
  const ranges = quotedRanges(source);
  const issues = [];
  const push = (id, original, suggest, start, end, reason) => {
    issues.push({ id, kind: "punct", original, suggest, start, end, reason });
  };

  const en = /([^\x00-\xff])([,.!?])/g;
  let match;
  while ((match = en.exec(source))) {
    const map = { ",": "，", ".": "。", "!": "！", "?": "？" };
    push(`en_${match.index}`, match[2], map[match[2]], match.index + 1, match.index + 2, "改成中文全角标点");
  }

  const bang = /[!！]{2,}/g;
  while ((match = bang.exec(source))) {
    push(`bang_${match.index}`, match[0], "！", match.index, match.index + match[0].length, "叹号一次一个");
  }

  const semi = /；/g;
  while ((match = semi.exec(source))) {
    push(`semi_${match.index}`, "；", "。", match.index, match.index + 1, "网文用句号切开");
  }

  const trail = /……[ \t]*(?=\n|$)/g;
  while ((match = trail.exec(source))) {
    if (inRanges(match.index, ranges)) continue;
    push(`ellip_${match.index}`, "……", "。", match.index, match.index + 2, "段尾用句号停住");
  }

  let cursor = 0;
  for (const sent of source.split(/(?<=[。！？\n])/)) {
    const sentStart = cursor;
    cursor += sent.length;
    let commas = 0;
    let first = -1;
    const find = /，/g;
    let hit;
    while ((hit = find.exec(sent))) {
      const abs = sentStart + hit.index;
      if (inRanges(abs, ranges)) continue;
      commas += 1;
      if (first < 0) first = abs;
    }
    const narrLen = sent
      .replace(/[「『“"][^」』”"]{0,400}[」』”"]/g, "")
      .replace(/\s/g, "").length;
    if (commas >= 4 && narrLen > 12 && first >= 0) {
      push(`comma_${first}`, "，", "。", first, first + 1, "连续逗号过多，用句号切开");
    }
  }

  const bangCount = (source.match(/！/g) || []).length;
  if (bangCount > 5) {
    push("bang_count", "！", "克制叹号", 0, 1, `本章叹号${bangCount}个，最多5个`);
  }

  const dashCount = (source.match(/——/g) || []).length;
  if (dashCount > 3) {
    push("dash_count", "——", "破折号一章最多3处", 0, 2, `本章破折号${dashCount}处`);
  }

  const corner = /[「」]/g;
  while ((match = corner.exec(source))) {
    push(`corner_${match.index}`, match[0], match[0] === "「" ? "“" : "”", match.index, match.index + 1, "对话用“”，系统用【】");
  }

  const leak = /(?:^|\n)((?:来源|等级|持续时间|冷却时间|属性复制完成)[^\n]*)/g;
  while ((match = leak.exec(source))) {
    const line = match[1];
    if (line.startsWith("【")) continue;
    const start = match.index + (match[0].startsWith("\n") ? 1 : 0);
    push(`sysleak_${start}`, line.slice(0, 16), `【${line}】`, start, start + line.length, "系统字段必须写在【】里");
  }

  let ellipNarr = 0;
  const ellip = /……/g;
  while ((match = ellip.exec(source))) {
    if (!inRanges(match.index, ranges)) ellipNarr += 1;
  }
  if (ellipNarr > 2) {
    push("ellip_count", "……", "叙述省略号一章最多2处", 0, 2, `叙述省略号${ellipNarr}处`);
  }

  return issues.slice(0, 16);
}

function scanLayout(text) {
  const source = String(text || "");
  const issues = [];
  let offset = 0;
  for (const para of source.split(/\n\n+/)) {
    const start = source.indexOf(para, offset);
    offset = Math.max((start < 0 ? offset : start) + para.length, offset + 1);
    if (start < 0) continue;
    const n = countPlain(para);
    if (n > 90) {
      issues.push({
        id: `para_${start}`,
        kind: "punct",
        original: para.replace(/\s+/g, "").slice(0, 16),
        suggest: "拆成四十字到八十字一段",
        start,
        end: start + para.length,
        reason: "超90字段",
      });
    }
    const narr = para.replace(/[「『“"][^」』”"]{0,400}[」』”"]/g, "").replace(/\s/g, "");
    if (/[。！？][^\n]{0,8}“/.test(para) && n > 24 && narr.length > 16) {
      issues.push({
        id: `talk_${start}`,
        kind: "punct",
        original: "对话",
        suggest: "对话单独成段",
        start,
        end: start + Math.min(para.length, 12),
        reason: "对话应单独成段",
      });
    }
    if (/[^】\n]【/.test(para) || (/【/.test(para) && /】[^\n]/.test(para) && !/^【/.test(para.trim()))) {
      issues.push({
        id: `sys_${start}`,
        kind: "punct",
        original: "【",
        suggest: "系统【】单独成段",
        start,
        end: start + 2,
        reason: "系统面板应单独成段",
      });
    }
    for (const block of para.match(/【[^】]*】/g) || []) {
      const fields = (block.match(/(?:地点|时限|时间|来源|等级|冷却时间|持续时间|奖励|触发条件|限制|目标|任务)：/g) || []).length;
      if (fields >= 2) {
        const at = source.indexOf(block, start);
        issues.push({
          id: `sysmulti_${at}`,
          kind: "punct",
          original: block.slice(0, 20),
          suggest: "一条只放一个信息，拆成多条【】",
          start: at,
          end: at + block.length,
          reason: "系统信息挤一条",
        });
        break;
      }
    }
  }
  return issues.slice(0, 12);
}

function scanText(novel, text, chapter, options = {}) {
  const source = String(text || "");
  const lexicon = hydrateLexicon(novel?.lexicon);
  const nouns = extractNouns(novel, chapter);
  return {
    issues: dedupeIssues([
      ...scanTypos(source, lexicon),
      ...scanNameDrift(source, nouns),
      ...scanAiFlavor(source),
      ...scanAigcNarrative(source),
      ...(options.allowSimile ? [] : scanEmptyFig(source)),
      ...scanEmptyDesc(source),
      ...scanFlatAsk(source),
      ...scanSummaryTalk(source),
      ...scanPerfectLine(source),
      ...scanEmotion(source),
      ...scanPunct(source),
      ...scanLayout(source),
    ]),
    nouns,
    aigc: detectAigc(source),
  };
}

module.exports = {
  extractNouns,
  scanText,
  scanTypos,
  scanEmotion,
  scanNameDrift,
  scanAiFlavor,
  scanAigcNarrative,
  scanSummaryTalk,
  scanPerfectLine,
  proofText,
  hydrateLexicon,
  scanPunct,
};
