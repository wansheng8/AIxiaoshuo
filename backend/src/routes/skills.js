const express = require("express");
const {
  listSkills,
  getSkill,
  createSkill,
  updateSkill,
  deleteSkill,
  updateBuiltinMeta,
  moveSkillOrder,
  cloneSkill,
  exportSkills,
  importSkills,
  exportSkillMarkdown,
  importSkillMarkdown,
  listHistory,
  restoreHistory,
  readHistoryEntry,
  clearHistory,
  listCraftOverrides,
  deleteCraftOverride,
  skillAuthorMessages,
  parseSkillDraft,
  toPublicSkill,
  restoreSkillFactory,
  restoreAllFactories,
} = require("../skills");
const pipeline = require("../pipeline");
const { completeChat, settingsReady } = require("../llm");

const router = express.Router();

router.get("/skills", (_req, res) => {
  res.json(listSkills().map(toPublicSkill).filter(Boolean));
});

router.get("/pipeline", (_req, res) => {
  res.json(pipeline.DEFINITION);
});

router.post("/skills/:id/move", (req, res) => {
  try {
    const result = moveSkillOrder(req.params.id, req.body || {});
    res.json({ ok: true, moved: result.moved, skills: (result.skills || []).map(toPublicSkill).filter(Boolean) });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.post("/skills", (req, res) => {
  try {
    res.status(201).json(createSkill(req.body || {}));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.post("/skills/generate", async (req, res) => {
  const idea = String(req.body?.idea || "").trim();
  if (!idea) return res.status(400).json({ error: "请先用中文描述你要的写法" });
  try {
    settingsReady();
    const text = await completeChat({
      messages: skillAuthorMessages(idea, req.body?.target),
      temperature: 0.4,
      timeoutMs: 60000,
    });
    res.json(parseSkillDraft(text));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.put("/skills/:id", (req, res) => {
  try {
    const id = req.params.id;
    const current = getSkill(id);
    if (!current) return res.status(404).json({ error: "Skill 不存在" });
    if (current.source === "builtin") {
      return res.json(toPublicSkill(updateBuiltinMeta(id, req.body || {})));
    }
    res.json(updateSkill(id, req.body || {}));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.post("/skills/:id/clone", (req, res) => {
  try {
    res.status(201).json(toPublicSkill(cloneSkill(req.params.id)));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.get("/skills/export", (req, res) => {
  const ids = String(req.query.ids || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  res.json(exportSkills(ids));
});

router.post("/skills/import", (req, res) => {
  try {
    res.status(201).json(importSkills(req.body || {}));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.get("/skills/:id/markdown", (req, res) => {
  try {
    const md = exportSkillMarkdown(req.params.id);
    res.setHeader("Content-Type", "text/markdown; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${req.params.id}.md"`);
    res.send(md);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.post("/skills/import-markdown", (req, res) => {
  try {
    const text = String(req.body?.markdown || req.body?.text || "");
    if (!text.trim()) return res.status(400).json({ error: "没有可导入的 Markdown 内容" });
    res.status(201).json(importSkillMarkdown(text, req.body?.filename || ""));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.get("/skills/craft-overrides", (_req, res) => {
  res.json(listCraftOverrides());
});

router.delete("/skills/craft-overrides/:id", (req, res) => {
  try {
    res.json(deleteCraftOverride(req.params.id));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.get("/skills/:id/history", (req, res) => {
  res.json(listHistory(req.params.id));
});

router.get("/skills/:id/history/:entry", (req, res) => {
  const entry = readHistoryEntry(req.params.id, req.params.entry);
  if (!entry) return res.status(404).json({ error: "这条版本已不存在" });
  res.json(entry);
});

router.post("/skills/:id/history/:entry/restore", (req, res) => {
  try {
    res.json(toPublicSkill(restoreHistory(req.params.id, req.params.entry)));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.delete("/skills/:id/history", (req, res) => {
  try {
    res.json(clearHistory(req.params.id));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.delete("/skills/:id", (req, res) => {
  try {
    res.json(deleteSkill(req.params.id));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.post("/skills/restore-all", (_req, res) => {
  try {
    res.json(restoreAllFactories());
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.post("/skills/:id/restore", (req, res) => {
  try {
    res.json(toPublicSkill(restoreSkillFactory(req.params.id)));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

module.exports = router;
