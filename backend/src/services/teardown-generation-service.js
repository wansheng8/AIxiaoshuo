"use strict";

const {
  getTeardown,
  saveTeardown,
  applyTeardownOutput,
  craftSkillId,
} = require("../teardown");
const { buildTeardownContext } = require("../teardown-context");
const { getSkill, applyCraftToSkills } = require("../skills");
const { streamChat, settingsReady } = require("../llm");
const { countWords } = require("../context");
const { uid, now } = require("../store");
const { openSse, writeSse, abortOnClose } = require("../http/sse");

async function generate(req, res) {
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

  openSse(res);
  const abort = new AbortController();
  abortOnClose(res, abort);

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
}

module.exports = { generate };
