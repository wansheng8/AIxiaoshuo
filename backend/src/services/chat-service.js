"use strict";

const { getNovel } = require("../store");
const { streamChat, settingsReady } = require("../llm");
const { openSse, writeSse, abortOnClose } = require("../http/sse");

const MAX_TURNS = 24;
const MAX_MESSAGE_CHARS = 8000;
const MAX_CHAPTER_CHARS = 6000;

function cleanMessages(input) {
  return (Array.isArray(input) ? input : [])
    .filter((row) => row && (row.role === "user" || row.role === "assistant" || row.role === "system"))
    .map((row) => ({ role: row.role, content: String(row.content || "").slice(0, MAX_MESSAGE_CHARS) }))
    .filter((row) => row.content.trim())
    .slice(-MAX_TURNS);
}

function clip(text, limit) {
  const value = String(text || "").trim();
  return value.length > limit ? value.slice(-limit) : value;
}

function buildSystemPrompt(context) {
  const ctx = context || {};
  const lines = [
    "你是「墨枢」写作助手，服务中文网络小说作者。",
    "用简体中文回答；建议要具体、可落地，直接指出问题与改法。",
  ];
  const novel = ctx.novelId ? getNovel(ctx.novelId) : null;
  if (novel) {
    lines.push(`当前作品：《${novel.title || "未命名"}》${novel.genre ? `（${novel.genre}）` : ""}。`);
    if (novel.logline) lines.push(`一句话简介：${novel.logline}`);
    const chapters = novel.chapters || [];
    const idx = chapters.findIndex((ch) => ch.id === ctx.chapterId);
    const chapter = idx >= 0 ? chapters[idx] : null;
    if (chapter) lines.push(`正在写：第${idx + 1}章《${chapter.title || ""}》。`);
    const prose = clip(chapter && chapter.content, MAX_CHAPTER_CHARS);
    if (prose) lines.push(`\n【本章正文节选】\n${prose}`);
  } else if (ctx.title) {
    lines.push(`当前作品：《${ctx.title}》${ctx.genre ? `（${ctx.genre}）` : ""}。`);
    if (ctx.chapter) lines.push(`正在写：${ctx.chapter}。`);
  }
  return lines.join("\n");
}

async function chat(req, res) {
  const messages = cleanMessages(req.body && req.body.messages);
  if (!messages.length) return res.status(400).json({ error: "消息为空" });
  try {
    settingsReady();
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message });
  }

  const system = buildSystemPrompt(req.body && req.body.context);
  openSse(res);
  const abort = new AbortController();
  abortOnClose(res, abort);

  let output = "";
  try {
    await streamChat({
      messages: [{ role: "system", content: system }, ...messages],
      temperature: 0.7,
      thinking: false,
      signal: abort.signal,
      onDelta: (text) => {
        output += text;
        writeSse(res, { type: "token", text });
      },
    });
    writeSse(res, { type: "done", chars: output.length });
  } catch (err) {
    if (abort.signal.aborted) writeSse(res, { type: "done", chars: output.length, stopped: true });
    else writeSse(res, { type: "error", message: (err && err.message) || "对话失败" });
  }
  res.end();
}

module.exports = { chat };
