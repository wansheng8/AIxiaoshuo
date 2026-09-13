import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { getNovel, saveNovel, now } = require("../backend/src/store");
const { completeChat } = require("../backend/src/llm");
const { countWords } = require("../backend/src/context");
const { cleanProse } = require("../backend/src/apply");

const BOOKS = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ["nv_mtl8h4nr_gwl34t", "nv_mtl6jvrn_b754ms"];

function paras(text) {
  return String(text || "")
    .trim()
    .split(/\n\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function splitHeadRest(text) {
  const cleaned = cleanProse(text);
  if (cleaned.length < 2200) {
    return { oldOpen: cleaned, rest: "", skip: true };
  }
  let cut = Math.min(1100, Math.max(700, Math.floor(cleaned.length * 0.16)));
  const nl = cleaned.indexOf("\n", cut);
  if (nl > 0 && nl < cut + 280) cut = nl;
  const rest = cleaned.slice(cut).trim();
  if (rest.length < 1600) {
    return { oldOpen: cleaned, rest: "", skip: true };
  }
  return { oldOpen: cleaned.slice(0, cut).trim(), rest, skip: false };
}

function joinOpenRest(opening, rest) {
  const open = String(opening || "").trim();
  const tail = String(rest || "").trim();
  if (!tail) return open;
  for (let n = Math.min(120, tail.length); n >= 16; n--) {
    const piece = tail.slice(0, n);
    const at = open.lastIndexOf(piece);
    if (at >= 0 && at >= open.length - n - 80) {
      return `${open.slice(0, at)}${tail}`.trim();
    }
  }
  return `${open}\n\n${tail}`.trim();
}

async function stitchChapter(novel, prev, curr) {
  const { oldOpen, rest, skip } = splitHeadRest(curr.content);
  if (skip) {
    curr.content = cleanProse(curr.content);
    curr.wordCount = countWords(curr.content);
    return "skip";
  }
  const prevTail = paras(prev.content).slice(-3).join("\n\n");

  const output = await completeChat({
    temperature: 0.45,
    timeoutMs: 120000,
    messages: [
      {
        role: "system",
        content:
          "你是小说连续性修稿。只输出本章新开头，不要解释，不要章名，不要 Markdown。简体中文。",
      },
      {
        role: "user",
        content: `书名：《${novel.title}》
上一章《${prev.title}》最后停在：

${prevTail}

本章《${curr.title}》原来的开头（必须改掉，它和上一章断开了）：

${oldOpen}

本章后半会从下面这段接着写。你的新开头最后一句必须能自然接到这段第一句，不要重复这段，不要把后半重写一遍：

${rest.slice(0, 700)}

硬性要求：
1. 第一句接住上一章最后的动作、对话、物件或没说完的话，像同一场戏的下一秒。
2. 用 400 到 900 字、两到四段，把人物从上一章结尾的位置带到保留正文的第一句。
3. 不发明新的重大情节，只补桥。
4. 声口与原章一致。`,
      },
    ],
  });

  const opening = cleanProse(output);
  if (!opening) throw new Error(`第${curr.index}章衔接稿为空`);
  const before = countWords(curr.content);
  const merged = joinOpenRest(opening, rest);
  if (countWords(merged) < before * 0.7) return "abort-short";
  curr.content = merged.trim();
  curr.wordCount = countWords(curr.content);
  curr.updatedAt = now();
  return "ok";
}

async function main() {
  const args = process.argv.slice(2);
  const ids = [];
  let minIndex = 2;
  for (const a of args) {
    if (/^\d+$/.test(a)) minIndex = Number(a);
    else ids.push(a);
  }
  const targets = ids.length ? ids : ["nv_mtl8h4nr_gwl34t", "nv_mtl6jvrn_b754ms"];
  for (const id of targets) {
    const novel = getNovel(id);
    if (!novel) throw new Error(`找不到 ${id}`);
    if (minIndex <= 1 && novel.chapters?.[0]) {
      novel.chapters[0].content = cleanProse(novel.chapters[0].content);
      novel.chapters[0].wordCount = countWords(novel.chapters[0].content);
    }
    saveNovel(novel);
    for (let i = 1; i < novel.chapters.length; i++) {
      const latest = getNovel(id);
      const prev = latest.chapters[i - 1];
      const curr = latest.chapters[i];
      if (curr.index < minIndex) continue;
      process.stdout.write(`${latest.title} 第${curr.index}章 ${curr.title} ... `);
      const result = await stitchChapter(latest, prev, curr);
      saveNovel(latest);
      console.log(`${result} ${curr.wordCount}字`);
    }
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
