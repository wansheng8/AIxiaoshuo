"use strict";

const { getNovel, getSettings, saveNovel, now, uid } = require("../store");
const { getSkill } = require("../skills");
const { buildPrompt } = require("../prompt");
const { VOICE_SKILLS, voiceBlock, isVoiceActive } = require("../voice");
const { streamChat, settingsReady } = require("../llm");
const { isFastSkill, countWords } = require("../context");
const pipeline = require("../pipeline");
const { applyGenerated } = require("../apply");
const { openSse, writeSse, abortOnClose } = require("../http/sse");

async function generate(req, res) {
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

  openSse(res);
  const abort = new AbortController();
  abortOnClose(res, abort);

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
    const think = isFastSkill(skill) ? false : Boolean(getSettings().thinking);
    await streamChat({
      messages: [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user },
      ],
      temperature: skill.id === "review" || skill.id === "suggest" ? 0.3 : undefined,
      thinking: think,
      writing: Boolean(prompt.writing),
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
    } else if (output && (err.partial || err.code === "LLM_TIMEOUT")) {
      // 中途断流：已生成的部分照常保留，只标记为不完整
      status = "incomplete";
      errorMessage = err.message || "生成中断";
      writeSse(res, { type: "done", chars: countWords(output), incomplete: true, message: errorMessage });
    } else {
      status = "error";
      errorMessage = err.message || "生成失败";
      writeSse(res, { type: "error", message: errorMessage });
    }
  }

  const latest = getNovel(projectId);
  if (latest) {
    const stage = pipeline.stageBySkill(skill);
    const applyMode = mode || (stage ? pipeline.modeOf(stage) : skill.id === "continue" ? "append" : "replace");
    const stoppedKeep = abort.signal.aborted && output;
    const partialKeep = status === "incomplete" && output;
    const shouldApply = output && (status === "success" || stoppedKeep || partialKeep);
    const skipApply = skill.target === "polish";
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
}

module.exports = { generate };
