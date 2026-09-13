export const UNSET = "不限定";

export type SparkPrefKey =
  | "genres"
  | "romance"
  | "hooks"
  | "heroes"
  | "leads"
  | "povs"
  | "tones"
  | "endings"
  | "length"
  | "pace"
  | "platforms";

export type SparkPrefs = Record<SparkPrefKey, string[]>;

export const SPARK_DIMS: {
  key: SparkPrefKey;
  label: string;
  multiple: boolean;
  hint: string;
  wide?: boolean;
  options: string[];
}[] = [
  {
    key: "genres",
    label: "频道 / 类型",
    multiple: true,
    wide: true,
    hint: "可多选，也可自己写，例如「民国探案」",
    options: [
      "古言",
      "现言",
      "玄幻",
      "仙侠",
      "都市",
      "悬疑",
      "科幻",
      "无限流",
      "种田",
      "宫斗",
      "年代",
      "民国",
      "电竞",
      "娱乐圈",
      "校园",
      "末世",
      "克苏鲁",
      "轻小说",
      "西幻",
      "武侠",
      "历史",
      "商战",
      "职场",
      "灵异",
      "快穿",
      "星际",
      "游戏",
      "豪门",
      "医疗",
      "律政",
      "谍战",
    ],
  },
  {
    key: "romance",
    label: "CP / 感情线",
    multiple: true,
    wide: true,
    hint: "感情怎么长，或点「无CP」",
    options: [
      "双洁1v1",
      "追妻火葬场",
      "破镜重圆",
      "先婚后爱",
      "相爱相杀",
      "无CP",
      "女强男强",
      "养成",
      "禁忌",
      "宿敌变恋人",
      "青梅竹马",
      "欢喜冤家",
      "年下",
      "年上",
      "师徒",
      "替身",
      "病娇",
      "日久生情",
      "先虐后甜",
      "先甜后虐",
      "纯爱",
      "人外",
    ],
  },
  {
    key: "hooks",
    label: "爽点偏好",
    multiple: true,
    wide: true,
    hint: "读者追更时最想看到的场面",
    options: [
      "打脸逆袭",
      "扮猪吃虎",
      "智斗碾压",
      "身份揭晓",
      "复仇",
      "团宠",
      "升级流",
      "基建种田",
      "马甲掉落",
      "修罗场",
      "金手指",
      "直播打脸",
      "权谋布局",
      "探案解密",
      "副本通关",
      "经营致富",
      "救赎",
      "白月光归来",
      "契约博弈",
    ],
  },
  {
    key: "heroes",
    label: "主角设定",
    multiple: true,
    wide: true,
    hint: "金手指、身份、性格抓手可叠选",
    options: [
      "重生",
      "穿越",
      "穿书",
      "系统",
      "大佬隐姓埋名",
      "疯批",
      "咸鱼",
      "学霸",
      "玄学",
      "读心术",
      "天才宝贝",
      "恶毒女配觉醒",
      "退婚女主",
      "假死归来",
      "失忆",
      "双穿越",
      "反派洗白",
      "社畜",
      "废柴流",
      "职业者",
      "空间",
    ],
  },
  {
    key: "leads",
    label: "叙事主角",
    multiple: false,
    hint: "故事跟着谁走",
    options: ["女主", "男主", "双女主", "双男主", "双视角", "群像"],
  },
  {
    key: "povs",
    label: "人称视角",
    multiple: false,
    hint: "开书后也可在设定里改",
    options: ["第三人称有限", "第一人称", "第三人称全知", "多视角轮换"],
  },
  {
    key: "tones",
    label: "文风调性",
    multiple: false,
    hint: "句子怎么说话",
    options: ["网文爽快", "轻松吐槽", "细密心理", "白描克制", "冷硬悬疑", "甜宠日常", "压抑暗黑", "热血燃"],
  },
  {
    key: "endings",
    label: "结局走向",
    multiple: false,
    hint: "先定走向，细纲按这个收",
    options: ["HE圆满", "先虐后甜", "开放式", "BE", "刀准HE"],
  },
  {
    key: "length",
    label: "故事篇幅",
    multiple: false,
    hint: "影响大纲卷数和注水尺度",
    options: ["短篇（5万字内）", "中篇（20-50万）", "长篇（100万+）", "超长连载"],
  },
  {
    key: "pace",
    label: "章均篇幅",
    multiple: false,
    hint: "写成一章时的字数区间",
    options: ["日更2000", "日更3000", "日更5000", "日更6000", "日更8000", "随缘"],
  },
  {
    key: "platforms",
    label: "目标平台",
    multiple: true,
    hint: "标题气质和尺度跟着平台走",
    options: ["番茄", "起点", "晋江", "知乎盐选", "LOFTER", "七猫", "剧本杀", "出版向"],
  },
];

export function emptySparkPrefs(): SparkPrefs {
  return Object.fromEntries(SPARK_DIMS.map((dim) => [dim.key, []])) as unknown as SparkPrefs;
}

export function toggleSparkPref(prefs: SparkPrefs, key: SparkPrefKey, option: string, multiple: boolean): SparkPrefs {
  if (option === UNSET) return { ...prefs, [key]: [] };
  const cur = prefs[key] || [];
  const has = cur.includes(option);
  if (multiple) {
    return { ...prefs, [key]: has ? cur.filter((item) => item !== option) : [...cur, option] };
  }
  return { ...prefs, [key]: has ? [] : [option] };
}

export function addSparkPref(prefs: SparkPrefs, key: SparkPrefKey, option: string, multiple: boolean): SparkPrefs {
  const text = option.replace(/\s+/g, " ").trim().slice(0, 48);
  if (!text || text === UNSET) return prefs;
  const cur = prefs[key] || [];
  if (cur.includes(text)) return prefs;
  if (multiple) return { ...prefs, [key]: [...cur, text] };
  return { ...prefs, [key]: [text] };
}

export function sparkPrefsPicked(prefs: SparkPrefs) {
  return SPARK_DIMS.some((dim) => (prefs[dim.key] || []).length > 0);
}
