"use strict";

const { createNovel } = require("../store");
const { completeChat, settingsReady } = require("../llm");
const {
  sparkAuthorMessages,
  sparkDrawMessages,
  parseSparkDraft,
  parseSparkCards,
  normalizeSparkPrefs,
  craftFromSparkPrefs,
} = require("../skills");

async function draw(req, res) {
  try {
    settingsReady();
    const idea = String(req.body?.idea || "").trim();
    if (!idea) {
      res.status(400).json({ error: "请先写一句脑洞或创意，再抽卡" });
      return;
    }
    const channel = ["male", "female", "common"].includes(req.body?.channel) ? req.body.channel : "common";
    const text = await completeChat({
      messages: sparkDrawMessages(idea, req.body?.prefs, channel),
      temperature: 1.05,
      timeoutMs: 120000,
    });
    res.json({ cards: parseSparkCards(text, channel) });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
}

async function author(req, res) {
  try {
    settingsReady();
    const idea = String(req.body?.idea || "").trim();
    const text = await completeChat({
      messages: sparkAuthorMessages(idea, req.body?.prefs),
      temperature: 0.92,
      timeoutMs: 120000,
    });
    const draft = parseSparkDraft(text);
    const prefs = normalizeSparkPrefs(req.body?.prefs);
    if (prefs.genres.length) {
      const genre = String(draft.genre || "");
      const covered = prefs.genres.some((g) => genre.includes(g) || g.includes(genre));
      if (!covered) draft.genre = prefs.genres.slice(0, 2).join("·");
    }
    if (prefs.povs[0]) draft.pov = prefs.povs[0];
    if (prefs.tones[0]) draft.style = prefs.tones[0];
    const novel = createNovel({ ...draft, craft: craftFromSparkPrefs(prefs) });
    res.status(201).json(novel);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
}

module.exports = { draw, author };
