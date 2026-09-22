"use strict";

const { getNovel } = require("../store");
const { getSkill } = require("../skills");
const { buildPrompt, stubNovel } = require("../prompt");
const { VOICE_SKILLS, voiceBlock, isVoiceActive } = require("../voice");

function previewPrompt(req, res) {
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
}

module.exports = { previewPrompt };
