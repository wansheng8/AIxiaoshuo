require("./env").loadEnv();

const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const {
  listNovelCards,
  getNovel,
  createNovel,
  saveNovel,
  archiveNovel,
  restoreNovel,
  duplicateNovel,
  purgeNovel,
  publicSettings,
  saveSettings,
  getSettings,
  uid,
  now,
  ensureDirs,
} = require("./store");
const { listSkills, getSkill, createSkill, updateSkill, deleteSkill, updateBuiltinMeta, cloneSkill, exportSkills, importSkills, exportSkillMarkdown, importSkillMarkdown, listHistory, restoreHistory, readHistoryEntry, clearHistory, listCraftOverrides, deleteCraftOverride, skillAuthorMessages, parseSkillDraft, sparkAuthorMessages, parseSparkDraft, normalizeSparkPrefs, craftFromSparkPrefs, applyCraftToSkills, toPublicSkill, restoreSkillFactory, restoreAllFactories } = require("./skills");
const { streamChat, completeChat, testChat, settingsReady, listModels } = require("./llm");
const { countWords, isFastSkill } = require("./context");
const { buildPrompt, stubNovel } = require("./prompt");
const { applyGenerated, mergeSavedChapters } = require("./apply");
const { scanText, hydrateLexicon, proofText } = require("./quality");
const { analyzeText, mergeLibrary, compareDims } = require("./imitate");
const { listElements, createElement, updateElement, deleteElement, resetElement } = require("./elements");
const { parseManuscript, countWords: countImportWords } = require("./importers");
const {
    listTeardowns,
    getTeardown,
    createTeardown,
    importTeardown,
    patchTeardown,
    purgeTeardown,
    saveTeardown,
    applyTeardownOutput,
    craftSkillId,
    tabCounts,
    withoutBodies,
    getTeardownChapter,
  } = require("./teardown");
const { buildTeardownContext } = require("./teardown-context");
const {
  VOICE_SKILLS,
  getVoice,
  saveVoice,
  publicVoice,
  addSamples,
  removeSample,
  clearSamples,
  addNovel,
  exportVoice,
  importVoice,
  clearVoiceBody,
  voiceAuthorMessages,
  voiceReviseMessages,
  parseVoiceDraft,
  voiceBlock,
  voicePreviewMessages,
  isVoiceActive,
} = require("./voice");


const app = express();
const PORT = Number(process.env.PORT || 8787);

app.use(cors());
app.use(express.json({ limit: "16mb" }));

const MAX_TEXT_CHARS = 200000;

function capText(value, limit = MAX_TEXT_CHARS) {
  const text = value == null ? "" : String(value);
  return text.length > limit ? text.slice(0, limit) : text;
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, name: "moshu" });
});

app.get("/api/settings", (_req, res) => {
  res.json(publicSettings());
});

app.put("/api/settings", (req, res) => {
  res.json(saveSettings(req.body || {}));
});

app.post("/api/settings/test", async (req, res) => {
  try {
    const reply = await testChat(req.body?.provider);
    res.json({ ok: true, reply });
  } catch (err) {
    res.status(err.status || 500).json({ ok: false, error: err.message });
  }
});

app.post("/api/settings/models", async (req, res) => {
  try {
    const models = await listModels(req.body || {});
    res.json({ models });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.get("/api/projects", (_req, res) => {
  res.json(listNovelCards(_req.query.archived === "1"));
});

app.post("/api/projects", (req, res) => {
  const novel = createNovel(req.body || {});
  res.status(201).json(novel);
});

app.post("/api/projects/import", (req, res) => {
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
});

app.post("/api/projects/spark", async (req, res) => {
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
});

app.get("/api/projects/:id", (req, res) => {
  const novel = getNovel(req.params.id);
  if (!novel) return res.status(404).json({ error: "小说工程不存在" });
  res.json(novel);
});

app.post("/api/projects/:id/scan", (req, res) => {
  const novel = getNovel(req.params.id);
  if (!novel) return res.status(404).json({ error: "小说工程不存在" });
  const chapter = (novel.chapters || []).find((row) => row.id === req.body?.chapterId) || novel.chapters?.[0];
  const text = capText(req.body?.text != null ? String(req.body.text) : chapter?.content || "");
  const lexicon = req.body?.lexicon != null ? hydrateLexicon(req.body.lexicon) : novel.lexicon;
  res.json(scanText({ ...novel, lexicon }, text, chapter, { allowSimile: isVoiceActive() }));
});

app.post("/api/projects/:id/proof", (req, res) => {
  const novel = getNovel(req.params.id);
  if (!novel) return res.status(404).json({ error: "小说工程不存在" });
  const chapter = (novel.chapters || []).find((row) => row.id === req.body?.chapterId) || novel.chapters?.[0];
  const text = capText(req.body?.text != null ? String(req.body.text) : chapter?.content || "");
  const lexicon = req.body?.lexicon != null ? hydrateLexicon(req.body.lexicon) : novel.lexicon;
  const cleaned = proofText(text, lexicon);
  res.json({ text: cleaned, ...scanText({ ...novel, lexicon }, cleaned, chapter, { allowSimile: isVoiceActive() }) });
});

app.post("/api/imitate/analyze", (req, res) => {
  const text = capText(req.body?.text, 100000);
  if (countWords(text) < 200) return res.status(400).json({ error: "范文摘录至少 200 字" });
  res.json(analyzeText(text));
});

app.post("/api/imitate/merge", (req, res) => {
  const library = Array.isArray(req.body?.library) ? req.body.library.slice(0, 60) : [];
  const merged = mergeLibrary(library);
  res.json({ dims: merged.dims, skeleton: merged.skeleton });
});

app.post("/api/imitate/compare", (req, res) => {
  const dims = req.body?.dims && typeof req.body.dims === "object" ? req.body.dims : {};
  res.json({ rows: compareDims(dims, capText(req.body?.text, 100000)) });
});

app.put("/api/projects/:id", (req, res) => {
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
});

app.delete("/api/projects/:id", (req, res) => {
  const ok = archiveNovel(req.params.id);
  if (!ok) return res.status(404).json({ error: "小说工程不存在" });
  res.json({ ok: true });
});

app.post("/api/projects/:id/restore", (req, res) => {
  const novel = restoreNovel(req.params.id);
  if (!novel) return res.status(404).json({ error: "小说工程不存在" });
  res.json(novel);
});

app.post("/api/projects/:id/duplicate", (req, res) => {
  const novel = duplicateNovel(req.params.id);
  if (!novel) return res.status(404).json({ error: "小说工程不存在" });
  res.status(201).json(novel);
});

app.delete("/api/projects/:id/purge", (req, res) => {
  const ok = purgeNovel(req.params.id);
  if (!ok) return res.status(404).json({ error: "小说工程不存在" });
  res.json({ ok: true });
});

app.get("/api/skills", (_req, res) => {
  res.json(listSkills().map(toPublicSkill).filter(Boolean));
});

app.post("/api/skills", (req, res) => {
  try {
    res.status(201).json(createSkill(req.body || {}));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.post("/api/skills/generate", async (req, res) => {
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

app.put("/api/skills/:id", (req, res) => {
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

app.post("/api/skills/:id/clone", (req, res) => {
  try {
    res.status(201).json(toPublicSkill(cloneSkill(req.params.id)));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.get("/api/skills/export", (req, res) => {
  const ids = String(req.query.ids || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  res.json(exportSkills(ids));
});

app.post("/api/skills/import", (req, res) => {
  try {
    res.status(201).json(importSkills(req.body || {}));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.get("/api/skills/:id/markdown", (req, res) => {
  try {
    const md = exportSkillMarkdown(req.params.id);
    res.setHeader("Content-Type", "text/markdown; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${req.params.id}.md"`);
    res.send(md);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.post("/api/skills/import-markdown", (req, res) => {
  try {
    const text = String(req.body?.markdown || req.body?.text || "");
    if (!text.trim()) return res.status(400).json({ error: "没有可导入的 Markdown 内容" });
    res.status(201).json(importSkillMarkdown(text, req.body?.filename || ""));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.get("/api/skills/craft-overrides", (_req, res) => {
  res.json(listCraftOverrides());
});

app.delete("/api/skills/craft-overrides/:id", (req, res) => {
  try {
    res.json(deleteCraftOverride(req.params.id));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.get("/api/skills/:id/history", (req, res) => {
  res.json(listHistory(req.params.id));
});

app.get("/api/skills/:id/history/:entry", (req, res) => {
  const entry = readHistoryEntry(req.params.id, req.params.entry);
  if (!entry) return res.status(404).json({ error: "这条版本已不存在" });
  res.json(entry);
});

app.post("/api/skills/:id/history/:entry/restore", (req, res) => {
  try {
    res.json(toPublicSkill(restoreHistory(req.params.id, req.params.entry)));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.delete("/api/skills/:id/history", (req, res) => {
  try {
    res.json(clearHistory(req.params.id));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.delete("/api/skills/:id", (req, res) => {
  try {
    res.json(deleteSkill(req.params.id));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.post("/api/skills/restore-all", (_req, res) => {
  try {
    res.json(restoreAllFactories());
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.post("/api/skills/:id/restore", (req, res) => {
  try {
    res.json(toPublicSkill(restoreSkillFactory(req.params.id)));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.get("/api/elements", (_req, res) => {
  res.json(listElements());
});

app.post("/api/elements", (req, res) => {
  try {
    res.status(201).json(createElement(req.body || {}));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.put("/api/elements/:id", (req, res) => {
  try {
    res.json(updateElement(req.params.id, req.body || {}));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.post("/api/elements/:id/reset", (req, res) => {
  try {
    res.json(resetElement(req.params.id));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.delete("/api/elements/:id", (req, res) => {
  try {
    res.json(deleteElement(req.params.id));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.get("/api/voice", (_req, res) => {
  res.json(publicVoice());
});

app.get("/api/voice/export", (_req, res) => {
  res.json(exportVoice());
});

app.post("/api/voice/import", (req, res) => {
  try {
    res.json(publicVoice(importVoice(req.body || {})));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.post("/api/voice/import-novel", (req, res) => {
  try {
    res.json(addNovel(req.body || {}));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.delete("/api/voice", (_req, res) => {
  try {
    res.json(publicVoice(clearVoiceBody()));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.put("/api/voice", (req, res) => {
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

app.post("/api/voice/samples", (req, res) => {
  try {
    res.status(201).json(publicVoice(addSamples(req.body || {})));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.delete("/api/voice/samples/:id", (req, res) => {
  try {
    res.json(publicVoice(removeSample(req.params.id)));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.delete("/api/voice/samples", (_req, res) => {
  try {
    res.json(publicVoice(clearSamples()));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.post("/api/voice/build", async (req, res) => {
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
});

app.post("/api/voice/preview", async (req, res) => {
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
});

app.post("/api/voice/revise", async (req, res) => {
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
});

function writeSse(res, payload) {
  if (res.writableEnded) return;
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

app.post("/api/prompt/preview", (req, res) => {
  const { projectId, skillId, chapterId, selection, cursorPrefix, include, focusName, tokenBudget } = req.body || {};
  const skill = getSkill(skillId);
  if (!skill) return res.status(404).json({ error: "Skill 不存在" });
  const realNovel = projectId ? getNovel(projectId) : null;
  const stub = !realNovel;
  const novel = realNovel || stubNovel();
  try {
    const prompt = buildPrompt({
      novel,
      skill,
      chapterId,
      extra: req.body?.extra,
      selection,
      cursorPrefix,
      include,
      focusName,
      tokenBudget,
      voiceActive: isVoiceActive(),
      voiceText: VOICE_SKILLS.has(skill.id) ? voiceBlock() : "",
    });
    res.json({
      skillId: skill.id,
      skillName: skill.name,
      target: skill.target,
      chapterId: prompt.chapter?.id || "",
      writing: prompt.writing,
      voiceActive: prompt.voiceActive,
      missing: prompt.missing,
      dropped: prompt.dropped,
      warnings: prompt.warnings,
      metrics: prompt.metrics,
      parts: prompt.parts,
      system: prompt.system,
      user: prompt.user,
      stub,
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.post("/api/generate", async (req, res) => {
  const { projectId, skillId, chapterId, selection, cursorPrefix, include, focusName, mode } = req.body || {};
  const extra = req.body?.extra || "";
  const novel = getNovel(projectId);
  if (!novel) return res.status(404).json({ error: "小说工程不存在" });
  const skill = getSkill(skillId);
  if (!skill || skill.enabled === false) {
    return res.status(404).json({ error: "Skill 不存在或已停用" });
  }

  try {
    settingsReady();
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message });
  }

  const startedAt = now();
  let prompt;
  try {
    prompt = buildPrompt({
      novel,
      skill,
      chapterId,
      extra,
      selection,
      cursorPrefix,
      include,
      focusName,
      voiceActive: isVoiceActive(),
      voiceText: VOICE_SKILLS.has(skill.id) ? voiceBlock() : "",
    });
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message || "构建上下文失败" });
  }
  const { chapter, missing } = prompt;

  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const abort = new AbortController();
  res.on("close", () => {
    if (!res.writableEnded) abort.abort();
  });

  writeSse(res, {
    type: "meta",
    skillId: skill.id,
    skillName: skill.name,
    target: skill.target,
    chapterId: chapter?.id || "",
    missing,
  });

  let output = "";
  let status = "success";
  let errorMessage = "";

  try {
    const writing = prompt.writing;
    const think = isFastSkill(skill) ? false : Boolean(getSettings().thinking);
    await streamChat({
      messages: [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user },
      ],
      temperature: skill.id === "review" || skill.id === "suggest" ? 0.3 : undefined,
      thinking: think,
      timeoutMs: think ? 120000 : 45000,
      idleMs: think ? 180000 : writing ? 90000 : 60000,
      signal: abort.signal,
      onDelta: (text) => {
        output += text;
        writeSse(res, { type: "token", text });
      },
    });
    writeSse(res, { type: "done", chars: countWords(output) });
  } catch (err) {
    if (abort.signal.aborted && output) {
      writeSse(res, { type: "done", chars: countWords(output), stopped: true });
    } else if (abort.signal.aborted) {
      status = "stopped";
      writeSse(res, { type: "error", message: "已停止生成" });
    } else {
      status = "error";
      errorMessage = err.message || "生成失败";
      writeSse(res, { type: "error", message: errorMessage });
    }
  }

  const latest = getNovel(projectId);
  if (latest) {
    const applyMode = mode || (skill.id === "continue" ? "append" : "replace");
    const stoppedKeep = abort.signal.aborted && output;
    const shouldApply = output && (status === "success" || stoppedKeep);
    const skipApply = skill.target === "polish" || skill.id === "suggest";
    const merged = shouldApply && !skipApply
      ? applyGenerated(latest, { skill, chapterId, output, mode: applyMode, focusName })
      : latest;
    merged.logs = [
      {
        id: uid("log"),
        skillId: skill.id,
        skillName: skill.name,
        chapterId: chapter?.id || "",
        startedAt,
        endedAt: now(),
        status: abort.signal.aborted && output ? "stopped" : status,
        outputChars: countWords(output),
        error: errorMessage,
        focusName: focusName || "",
      },
      ...(merged.logs || []),
    ].slice(0, 40);
    if (output) {
      merged.history = [
        {
          id: uid("hs"),
          skillId: skill.id,
          skillName: skill.name,
          target: skill.target,
          focusName: focusName || "",
          output,
          createdAt: now(),
        },
        ...(merged.history || []),
      ].slice(0, 30);
    }
    saveNovel(merged);
    writeSse(res, { type: "saved", rev: Number(merged.rev) || 0 });
  }

  res.end();
});

app.get("/api/teardowns", (req, res) => {
  res.json(listTeardowns(req.query.archived === "1"));
});

app.post("/api/teardowns", (req, res) => {
  try {
    res.json(createTeardown(req.body || {}));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.post("/api/teardowns/import", (req, res) => {
  try {
    res.json(importTeardown(req.body || {}));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.get("/api/teardowns/:id", (req, res) => {
    const row = getTeardown(req.params.id);
    if (!row) return res.status(404).json({ error: "拆书工程不存在" });
    res.json({ ...withoutBodies(row), tabs: tabCounts(row) });
  });

  app.get("/api/teardowns/:id/chapters/:cid", (req, res) => {
    const row = getTeardown(req.params.id);
    if (!row) return res.status(404).json({ error: "拆书工程不存在" });
    const chapter = getTeardownChapter(req.params.id, req.params.cid);
    if (!chapter) return res.status(404).json({ error: "章节不存在" });
    res.json(chapter);
  });

  app.put("/api/teardowns/:id", (req, res) => {
    const row = patchTeardown(req.params.id, req.body || {});
    if (!row) return res.status(404).json({ error: "拆书工程不存在" });
    res.json({ ...withoutBodies(row), tabs: tabCounts(row) });
  });

app.delete("/api/teardowns/:id", (req, res) => {
  const row = patchTeardown(req.params.id, { status: "archived" });
  if (!row) return res.status(404).json({ error: "拆书工程不存在" });
  res.json({ ok: true });
});

app.post("/api/teardowns/:id/restore", (req, res) => {
  const row = patchTeardown(req.params.id, { status: "active" });
  if (!row) return res.status(404).json({ error: "拆书工程不存在" });
  res.json({ ...withoutBodies(row), tabs: tabCounts(row) });
});

app.delete("/api/teardowns/:id/purge", (req, res) => {
  const ok = purgeTeardown(req.params.id);
  if (!ok) return res.status(404).json({ error: "拆书工程不存在" });
  res.json({ ok: true });
});

app.post("/api/teardowns/:id/generate", async (req, res) => {
  const { skillId, extra, fromIndex } = req.body || {};
  const teardown = getTeardown(req.params.id);
  if (!teardown) return res.status(404).json({ error: "拆书工程不存在" });
  if (!(teardown.chapters || []).length) return res.status(400).json({ error: "请先导入正文再拆书" });
  const skill = getSkill(skillId);
  if (!skill || skill.enabled === false) return res.status(404).json({ error: "Skill 不存在或已停用" });
  if (!/^teardown-/.test(skill.id)) return res.status(400).json({ error: "该 Skill 不能用于拆书台" });

  try {
    settingsReady();
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message });
  }

  const { userContent, missing } = buildTeardownContext({
    teardown,
    skill,
    extra,
    fromIndex,
  });
  if (missing.length) return res.status(400).json({ error: "请先导入正文再拆书" });

  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const abort = new AbortController();
  res.on("close", () => {
    if (!res.writableEnded) abort.abort();
  });

  writeSse(res, {
    type: "meta",
    skillId: skill.id,
    skillName: skill.name,
    target: skill.target,
    chapterId: "",
    missing: [],
  });

  let output = "";
  let status = "success";
  let errorMessage = "";
  const startedAt = now();

  try {
    await streamChat({
      messages: [
        {
          role: "system",
          content: `你是墨枢拆书台的执行者。拆的是写法：人味、思维断层、对白说一半、钩子类型、信息藏多少。禁止复述参考书情节。必须严格遵守下面这份 Skill 说明书。用简体中文。不要输出说明书本身，不要解释过程，直接给出成品。\n\n${skill.raw || skill.body}`,
        },
        { role: "user", content: userContent },
      ],
      temperature: 0.4,
      timeoutMs: 180000,
      idleMs: 180000,
      signal: abort.signal,
      onDelta: (text) => {
        output += text;
        writeSse(res, { type: "token", text });
      },
    });
    writeSse(res, { type: "done", chars: countWords(output) });
  } catch (err) {
    if (abort.signal.aborted && output) {
      writeSse(res, { type: "done", chars: countWords(output), stopped: true });
    } else if (abort.signal.aborted) {
      status = "stopped";
      writeSse(res, { type: "error", message: "已停止生成" });
    } else {
      status = "error";
      errorMessage = err.message || "生成失败";
      writeSse(res, { type: "error", message: errorMessage });
    }
  }

  const latest = getTeardown(req.params.id);
  const teardownShouldApply = output && (status === "success" || (abort.signal.aborted && output));
  if (latest && teardownShouldApply) {
    const merged = applyTeardownOutput(latest, skill, output, { fromIndex });
    if (skill.id === "teardown-craft") {
      const body = String(output || "")
        .replace(/^```[a-z]*\n?/i, "")
        .replace(/\n?```$/i, "")
        .trim();
      const saved = applyCraftToSkills({
        craftId: craftSkillId(merged.id),
        title: merged.title,
        body,
      });
      merged.skillId = saved.id;
      merged.recipes = body;
    }
    merged.logs = [
      {
        id: uid("log"),
        skillId: skill.id,
        skillName: skill.name,
        chapterId: "",
        startedAt,
        endedAt: now(),
        status: abort.signal.aborted && output ? "stopped" : status,
        outputChars: countWords(output),
        error: errorMessage,
      },
      ...(merged.logs || []),
    ].slice(0, 40);
    saveTeardown(merged);
  }

  res.end();
});

const DIST_DIR = path.resolve(__dirname, "../../frontend/dist");
if (fs.existsSync(path.join(DIST_DIR, "index.html"))) {
  app.use(express.static(DIST_DIR, { index: false, maxAge: "1h" }));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api/")) return next();
    res.sendFile(path.join(DIST_DIR, "index.html"));
  });
}

app.use((_req, res) => {
  res.status(404).json({ error: "接口不存在" });
});

app.use((err, _req, res, _next) => {
  const status = Number(err && err.status) || 500;
  if (status >= 500) console.error("[api]", err && err.stack ? err.stack : err);
  if (res.headersSent) {
    try {
      res.end();
    } catch {
      /* 连接已关闭 */
    }
    return;
  }
  res.status(status).json({ error: (err && err.message) || "服务器错误" });
});

ensureDirs();

app.listen(PORT, "0.0.0.0", () => {
  console.log(`moshu backend on ${PORT}`);
  const skillsDir = path.resolve(__dirname, "../../skills/builtin");
  if (!fs.existsSync(skillsDir)) {
    console.warn(`[moshu] 未找到内置 Skill 目录：${skillsDir}，部署时请带上 skills/builtin，否则无可用 Skill`);
  }
});
