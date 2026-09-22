"use strict";

const express = require("express");
const {
  listNovelCards,
  getNovel,
  createNovel,
  archiveNovel,
  restoreNovel,
  duplicateNovel,
  purgeNovel,
} = require("../store");
const { countWords } = require("../context");
const { analyzeText, mergeLibrary, compareDims } = require("../imitate");
const { capText } = require("../http/text");
const { importProject } = require("../services/project-import-service");
const { updateProject } = require("../services/project-service");
const sparkService = require("../services/spark-service");
const proofService = require("../services/proof-service");

const router = express.Router();

router.get("/projects", (req, res) => {
  res.json(listNovelCards(req.query.archived === "1"));
});

router.post("/projects", (req, res) => {
  const novel = createNovel(req.body || {});
  res.status(201).json(novel);
});

router.post("/projects/import", importProject);

router.post("/projects/spark/draw", sparkService.draw);

router.post("/projects/spark", sparkService.author);

router.get("/projects/:id", (req, res) => {
  const novel = getNovel(req.params.id);
  if (!novel) return res.status(404).json({ error: "小说工程不存在" });
  res.json(novel);
});

router.post("/projects/:id/scan", proofService.scan);

router.post("/projects/:id/proof", proofService.proof);

router.post("/imitate/analyze", (req, res) => {
  const text = capText(req.body?.text, 100000);
  if (countWords(text) < 200) return res.status(400).json({ error: "范文摘录至少 200 字" });
  res.json(analyzeText(text));
});

router.post("/imitate/merge", (req, res) => {
  const library = Array.isArray(req.body?.library) ? req.body.library.slice(0, 60) : [];
  const merged = mergeLibrary(library);
  res.json({ dims: merged.dims, skeleton: merged.skeleton });
});

router.post("/imitate/compare", (req, res) => {
  const dims = req.body?.dims && typeof req.body.dims === "object" ? req.body.dims : {};
  res.json({ rows: compareDims(dims, capText(req.body?.text, 100000)) });
});

router.put("/projects/:id", updateProject);

router.delete("/projects/:id", (req, res) => {
  const ok = archiveNovel(req.params.id);
  if (!ok) return res.status(404).json({ error: "小说工程不存在" });
  res.json({ ok: true });
});

router.post("/projects/:id/restore", (req, res) => {
  const novel = restoreNovel(req.params.id);
  if (!novel) return res.status(404).json({ error: "小说工程不存在" });
  res.json(novel);
});

router.post("/projects/:id/duplicate", (req, res) => {
  const novel = duplicateNovel(req.params.id);
  if (!novel) return res.status(404).json({ error: "小说工程不存在" });
  res.status(201).json(novel);
});

router.delete("/projects/:id/purge", (req, res) => {
  const ok = purgeNovel(req.params.id);
  if (!ok) return res.status(404).json({ error: "小说工程不存在" });
  res.json({ ok: true });
});

module.exports = router;
