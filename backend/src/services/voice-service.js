"use strict";

const {
  getVoice,
  saveVoice,
  publicVoice,
  voiceAuthorMessages,
  voiceReviseMessages,
  parseVoiceDraft,
  voiceBlock,
  voicePreviewMessages,
} = require("../voice");
const { completeChat, settingsReady } = require("../llm");
const { countWords } = require("../context");
const { uid, now } = require("../store");

async function build(req, res) {
  try {
    const voice = getVoice();
    if (!voice.samples.length) return res.status(400).json({ error: "先收进至少一篇你自己的原文" });
    settingsReady();
    const text = await completeChat({
      messages: voiceAuthorMessages(voice.samples),
      temperature: 0.5,
      timeoutMs: 120000,
    });
    const body = parseVoiceDraft(text);
    res.json(publicVoice(saveVoice({ body })));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
}

async function preview(req, res) {
  if (!voiceBlock()) return res.status(400).json({ error: "还没有生效的文风说明书" });
  try {
    settingsReady();
    const text = await completeChat({
      messages: voicePreviewMessages(req.body?.prompt),
      temperature: 0.8,
      timeoutMs: 60000,
    });
    res.json({ text: String(text || "").trim() });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
}

async function revise(req, res) {
  const before = String(req.body?.before || "").trim();
  const after = String(req.body?.after || "").trim();
  if (countWords(before) < 100 || countWords(after) < 100) {
    return res.status(400).json({ error: "两段稿子都至少 100 字，才能看出差异" });
  }
  try {
    settingsReady();
    const voice = getVoice();
    const text = await completeChat({
      messages: voiceReviseMessages(before, after, voice.body),
      temperature: 0.4,
      timeoutMs: 120000,
    });
    const body = parseVoiceDraft(text);
    const revisions = [
      ...(voice.revisions || []),
      {
        id: uid("vr"),
        at: now(),
        before: before.slice(0, 160),
        after: after.slice(0, 160),
        body: voice.body || "",
      },
    ].slice(-20);
    res.json(publicVoice(saveVoice({ body, revisions })));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
}

module.exports = { build, preview, revise };
