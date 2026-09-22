"use strict";

const express = require("express");
const {
  listTeardowns,
  getTeardown,
  createTeardown,
  importTeardown,
  patchTeardown,
  purgeTeardown,
  tabCounts,
  withoutBodies,
  getTeardownChapter,
} = require("../teardown");
const { generate } = require("../services/teardown-generation-service");

const router = express.Router();

router.get("/teardowns", (req, res) => {
  res.json(listTeardowns(req.query.archived === "1"));
});

router.post("/teardowns", (req, res) => {
  try {
    res.json(createTeardown(req.body || {}));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.post("/teardowns/import", (req, res) => {
  try {
    res.json(importTeardown(req.body || {}));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.get("/teardowns/:id", (req, res) => {
  const row = getTeardown(req.params.id);
  if (!row) return res.status(404).json({ error: "拆书工程不存在" });
  res.json({ ...withoutBodies(row), tabs: tabCounts(row) });
});

router.get("/teardowns/:id/chapters/:cid", (req, res) => {
  const row = getTeardown(req.params.id);
  if (!row) return res.status(404).json({ error: "拆书工程不存在" });
  const chapter = getTeardownChapter(req.params.id, req.params.cid);
  if (!chapter) return res.status(404).json({ error: "章节不存在" });
  res.json(chapter);
});

router.put("/teardowns/:id", (req, res) => {
  const row = patchTeardown(req.params.id, req.body || {});
  if (!row) return res.status(404).json({ error: "拆书工程不存在" });
  res.json({ ...withoutBodies(row), tabs: tabCounts(row) });
});

router.delete("/teardowns/:id", (req, res) => {
  const row = patchTeardown(req.params.id, { status: "archived" });
  if (!row) return res.status(404).json({ error: "拆书工程不存在" });
  res.json({ ok: true });
});

router.post("/teardowns/:id/restore", (req, res) => {
  const row = patchTeardown(req.params.id, { status: "active" });
  if (!row) return res.status(404).json({ error: "拆书工程不存在" });
  res.json({ ...withoutBodies(row), tabs: tabCounts(row) });
});

router.delete("/teardowns/:id/purge", (req, res) => {
  const ok = purgeTeardown(req.params.id);
  if (!ok) return res.status(404).json({ error: "拆书工程不存在" });
  res.json({ ok: true });
});

router.post("/teardowns/:id/generate", generate);

module.exports = router;
