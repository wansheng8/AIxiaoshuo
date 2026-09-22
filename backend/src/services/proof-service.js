"use strict";

const { getNovel } = require("../store");
const { scanText, hydrateLexicon, proofText } = require("../quality");
const { isVoiceActive } = require("../voice");
const { capText } = require("../http/text");

function resolveNovelChapter(req) {
  const novel = getNovel(req.params.id);
  if (!novel) return null;
  const chapter = (novel.chapters || []).find((row) => row.id === req.body?.chapterId) || novel.chapters?.[0];
  const text = capText(req.body?.text != null ? String(req.body.text) : chapter?.content || "");
  const lexicon = req.body?.lexicon != null ? hydrateLexicon(req.body.lexicon) : novel.lexicon;
  return { novel, chapter, text, lexicon };
}

function scan(req, res) {
  const ctx = resolveNovelChapter(req);
  if (!ctx) return res.status(404).json({ error: "小说工程不存在" });
  const { novel, chapter, text, lexicon } = ctx;
  res.json(scanText({ ...novel, lexicon }, text, chapter, { allowSimile: isVoiceActive() }));
}

function proof(req, res) {
  const ctx = resolveNovelChapter(req);
  if (!ctx) return res.status(404).json({ error: "小说工程不存在" });
  const { novel, chapter, text, lexicon } = ctx;
  const cleaned = proofText(text, lexicon);
  res.json({ text: cleaned, ...scanText({ ...novel, lexicon }, cleaned, chapter, { allowSimile: isVoiceActive() }) });
}

module.exports = { scan, proof };
