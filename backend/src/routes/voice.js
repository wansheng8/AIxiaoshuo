const express = require("express");
const {
  saveVoice,
  publicVoice,
  addSamples,
  removeSample,
  clearSamples,
  addNovel,
  exportVoice,
  importVoice,
  clearVoiceBody,
} = require("../voice");
const voiceService = require("../services/voice-service");

const router = express.Router();

router.get("/voice", (_req, res) => {
  res.json(publicVoice());
});

router.get("/voice/export", (_req, res) => {
  res.json(exportVoice());
});

router.post("/voice/import", (req, res) => {
  try {
    res.json(publicVoice(importVoice(req.body || {})));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.post("/voice/import-novel", (req, res) => {
  try {
    res.json(addNovel(req.body || {}));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.delete("/voice", (_req, res) => {
  try {
    res.json(publicVoice(clearVoiceBody()));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.put("/voice", (req, res) => {
  try {
    const patch = {};
    if (req.body?.enabled !== undefined) patch.enabled = Boolean(req.body.enabled);
    if (req.body?.body !== undefined) patch.body = String(req.body.body || "");
    if (req.body?.summary !== undefined) patch.summary = String(req.body.summary || "");
    res.json(publicVoice(saveVoice(patch)));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.post("/voice/samples", (req, res) => {
  try {
    res.status(201).json(publicVoice(addSamples(req.body || {})));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.delete("/voice/samples/:id", (req, res) => {
  try {
    res.json(publicVoice(removeSample(req.params.id)));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.delete("/voice/samples", (_req, res) => {
  try {
    res.json(publicVoice(clearSamples()));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.post("/voice/build", voiceService.build);

router.post("/voice/preview", voiceService.preview);

router.post("/voice/revise", voiceService.revise);

module.exports = router;
