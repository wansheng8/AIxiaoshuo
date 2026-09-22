"use strict";

const { createNovel, saveNovel, uid, now } = require("../store");
const { parseManuscript, countWords: countImportWords } = require("../importers");

function importProject(req, res) {
  try {
    const body = req.body || {};
    let draft;
    if (body.novel && typeof body.novel === "object") {
      const src = body.novel;
      draft = {
        title: src.title,
        logline: src.logline,
        genre: src.genre,
        brief: src.brief,
        world: src.world,
        characters: src.characters,
        outline: src.outline,
        chapters: Array.isArray(src.chapters) ? src.chapters : [],
      };
    } else {
      draft = parseManuscript(body.markdown || body.text || "");
      draft.genre = body.genre || "长篇小说";
    }
    const novel = createNovel({
      title: draft.title,
      logline: draft.logline,
      genre: draft.genre || "长篇小说",
      brief: draft.brief || "",
      world: draft.world || "",
      characters: draft.characters || "",
      outline: draft.outline || "",
    });
    const created = now();
    const chapters = (draft.chapters || []).map((ch, index) => ({
      id: uid("ch"),
      index: index + 1,
      title: String(ch.title || "").trim(),
      beats: String(ch.beats || ""),
      content: String(ch.content || ""),
      wordCount: countImportWords(ch.content),
      updatedAt: created,
    }));
    if (chapters.length) novel.chapters = chapters;
    if (body.novel && typeof body.novel === "object") {
      const src = body.novel;
      novel.props = src.props || "";
      novel.style = src.style || novel.style;
      novel.theme = src.theme || "";
      novel.pov = src.pov || novel.pov;
      novel.threads = Array.isArray(src.threads) ? src.threads : novel.threads;
      if (src.craft && typeof src.craft === "object") novel.craft = { ...novel.craft, ...src.craft };
      if (src.lexicon && typeof src.lexicon === "object") novel.lexicon = src.lexicon;
    }
    res.status(201).json(saveNovel(novel));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
}

module.exports = { importProject };
