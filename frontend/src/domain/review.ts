export type ReviewSection = { title: string; body: string };
export type ReviewVerdict = "" | "过" | "改后过" | "不过";

export type ReviewFix = {
  index: number;
  location: string;
  problem: string;
  fix: string;
  original: string;
};

export function parseReviewFixes(text: string): ReviewFix[] {
  const src = String(text || "");
  const start = src.search(/^###\s*改稿清单/m);
  if (start < 0) return [];
  let slice = src.slice(start).replace(/^###[^\n]*\n?/, "");
  const stop = slice.search(/\n###\s+/);
  if (stop >= 0) slice = slice.slice(0, stop);
  const blocks = slice.split(/\n(?=\s*\d+[.、]\s)/);
  const fixes: ReviewFix[] = [];
  for (const block of blocks) {
    const m = block.match(/^\s*(\d+)[.、]\s*([\s\S]*)$/);
    if (!m) continue;
    const fields: Record<string, string[]> = { 位置: [], 问题: [], 改法: [] };
    let cur = "";
    for (const line of m[2].split("\n")) {
      const fm = line.match(/^\s*[-*]?\s*(位置|问题|改法)[：:]\s*(.*)$/);
      if (fm) {
        cur = fm[1];
        fields[cur].push(fm[2]);
      } else if (cur && line.trim()) {
        fields[cur].push(line.trim());
      }
    }
    const location = fields.位置.join("\n").trim();
    const problem = fields.问题.join("\n").trim();
    const fix = fields.改法.join("\n").trim();
    const quoted = location.match(/[「“"【]([^」”"】]+)[」”"】]/);
    fixes.push({
      index: Number(m[1]),
      location,
      problem,
      fix,
      original: quoted ? quoted[1] : "",
    });
  }
  return fixes;
}

const STRUCTURAL_FIX = /(补一场|补一段|补足|顺带|重写|整场|主场|细纲|字数|加一场|加一段|删掉这?一?场)/;

export function fixIsDelete(fix: string) {
  return /^删(掉|去|了)?/.test(String(fix || "").trim());
}

export function fixCanReplace(fix: ReviewFix, chapterText: string) {
  if (!fix.original || !fix.fix) return false;
  if (!chapterText.includes(fix.original)) return false;
  if (fix.fix.includes("\n")) return false;
  return !STRUCTURAL_FIX.test(fix.fix);
}

export function parseReviewSections(text: string): ReviewSection[] {
  const src = String(text || "").trim();
  if (!src) return [];
  return src
    .split(/^###\s+/m)
    .filter(Boolean)
    .map((block) => {
      const nl = block.indexOf("\n");
      if (nl < 0) return { title: block.trim(), body: "" };
      return { title: block.slice(0, nl).trim(), body: block.slice(nl + 1).trim() };
    });
}

export function looksLikeReview(text: string) {
  return /###\s*过稿判断/.test(String(text || ""));
}

export function parseReviewVerdict(text: string): ReviewVerdict {
  const src = String(text || "");
  const start = src.search(/^###\s*过稿判断/m);
  const slice = start >= 0 ? src.slice(start) : src;
  const next = slice.search(/\n###\s+/);
  const body = (next >= 0 ? slice.slice(0, next) : slice).slice(0, 600);
  if (/^\s*改后过\s*$/m.test(body) || /改后过/.test(body)) return "改后过";
  if (/^\s*不过\s*$/m.test(body) || /(^|\n)\s*不过/.test(body)) return "不过";
  if (/^\s*过\s*$/m.test(body)) return "过";
  return "";
}

export function verdictClass(verdict: string) {
  if (verdict === "过") return "pass";
  if (verdict === "改后过") return "fix";
  if (verdict === "不过") return "fail";
  return "";
}
