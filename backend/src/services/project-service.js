"use strict";

const { getNovel, saveNovel, now } = require("../store");
const { countWords } = require("../context");
const { mergeSavedChapters } = require("../apply");

function updateProject(req, res) {
  const current = getNovel(req.params.id);
  if (!current) return res.status(404).json({ error: "小说工程不存在" });
  const body = req.body || {};
  const next = {
    ...current,
    title: body.title ?? current.title,
    logline: body.logline ?? current.logline,
    genre: body.genre ?? current.genre,
    brief: body.brief ?? current.brief,
    world: body.world ?? current.world,
    characters: body.characters ?? current.characters,
    outline: body.outline ?? current.outline,
    props: body.props ?? current.props ?? "",
    media: body.media ?? current.media ?? {},
    history: current.history || [],
    chapters: Array.isArray(body.chapters) ? mergeSavedChapters(current.chapters, body.chapters) : current.chapters,
    logs: current.logs || [],
    style: body.style ?? current.style ?? "",
    theme: body.theme ?? current.theme ?? "",
    pov: body.pov ?? current.pov ?? "第三人称有限",
    threads: Array.isArray(body.threads) ? body.threads : current.threads || [],
    craft: body.craft ?? current.craft,
    lexicon: body.lexicon ?? current.lexicon,
  };
  next.chapters = next.chapters.map((ch, index) => ({
    ...ch,
    index: Number(ch.index) > 0 ? Number(ch.index) : index + 1,
    wordCount: countWords(ch.content),
    updatedAt: ch.updatedAt || now(),
  }));
  try {
    res.json(saveNovel(next, { expectedRev: body.rev }));
  } catch (err) {
    if (err && err.conflict) {
      return res.status(409).json({ error: err.message, conflict: true, currentRev: err.currentRev });
    }
    throw err;
  }
}

module.exports = { updateProject };
