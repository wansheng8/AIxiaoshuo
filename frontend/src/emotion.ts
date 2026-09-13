const CUES: Record<string, string[]> = {
  悲伤: ["眼眶", "发酸", "喉头发紧", "泪", "哭出", "哽住", "心口空", "低头不语", "袖口湿", "抹了一把", "丧", "白灯", "灵堂"],
  愤怒: ["咬牙", "握拳", "指节发白", "青筋", "冷笑", "摔门", "吼出", "横眉", "砸在", "牙关", "拂袖"],
  喜悦: ["笑出声", "眼里亮", "松快", "哼着", "拍手", "蹦", "乐呵", "喜滋滋", "忍不住笑"],
  恐惧: ["背脊发凉", "腿软", "退了半步", "耳鸣", "寒毛", "不敢看", "喘不上", "手抖", "死死盯", "嗓子发紧"],
  孤独: ["空荡", "只剩", "一个人", "回音", "冷灶", "独自", "没人应", "四下无人", "灯也灭"],
  浪漫: ["耳尖红", "指尖相触", "心跳漏", "靠近了些", "发丝", "低声问", "呼吸交", "手心热"],
  紧张: ["屏住", "手心湿", "喉咙发干", "停住", "不敢出声", "对上眼", "刀尖", "僵在", "气都短了", "指尖发白"],
  释然: ["松了口气", "肩松", "放下了", "终于还是", "一笑了之", "算了吧", "云开", "踏实下来"],
};

function lastBeat(text: string) {
  const t = String(text || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!t) return "";
  const parts = t
    .split(/[。！？!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 4);
  const beat = parts.pop() || t;
  return beat.slice(-48);
}

function scoreMood(text: string, cues: string[]) {
  let n = 0;
  for (const cue of cues) {
    let from = 0;
    while (from < text.length) {
      const at = text.indexOf(cue, from);
      if (at < 0) break;
      n += cue.length >= 3 ? 2 : 1;
      from = at + cue.length;
    }
  }
  return n;
}

export function inferEmotion(text?: string) {
  const raw = String(text || "");
  const compact = raw.replace(/\s+/g, "");
  if (compact.length < 80) return null;
  const near = raw.slice(-400);
  const far = raw.slice(-1200, -400);
  let best = { mood: "", score: 0 };
  let second = 0;
  for (const [mood, cues] of Object.entries(CUES)) {
    const score = scoreMood(near, cues) * 2 + scoreMood(far, cues);
    if (score > best.score) {
      second = best.score;
      best = { mood, score };
    } else if (score > second) {
      second = score;
    }
  }
  if (best.score < 2 || best.score <= second) return null;
  return { mood: best.mood, beat: lastBeat(near) };
}
