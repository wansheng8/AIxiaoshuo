"use strict";

const core = require("./core");
const history = require("./history");
const io = require("./io");
const order = require("./order");
const factory = require("./factory");
const craft = require("./craft");
const author = require("./author");

module.exports = {
  listSkills: core.listSkills,
  getSkill: core.getSkill,
  createSkill: io.createSkill,
  updateSkill: io.updateSkill,
  deleteSkill: io.deleteSkill,
  updateBuiltinMeta: order.updateBuiltinMeta,
  moveSkillOrder: order.moveSkillOrder,
  cloneSkill: io.cloneSkill,
  exportSkills: io.exportSkills,
  importSkills: io.importSkills,
  exportSkillMarkdown: io.exportSkillMarkdown,
  importSkillMarkdown: io.importSkillMarkdown,
  listHistory: history.listHistory,
  restoreHistory: history.restoreHistory,
  readHistoryEntry: history.readHistoryEntry,
  clearHistory: history.clearHistory,
  listCraftOverrides: craft.listCraftOverrides,
  deleteCraftOverride: craft.deleteCraftOverride,
  skillAuthorMessages: author.skillAuthorMessages,
  parseSkillDraft: author.parseSkillDraft,
  sparkAuthorMessages: author.sparkAuthorMessages,
  sparkDrawMessages: author.sparkDrawMessages,
  parseSparkDraft: author.parseSparkDraft,
  parseSparkCards: author.parseSparkCards,
  normalizeSparkPrefs: author.normalizeSparkPrefs,
  craftFromSparkPrefs: author.craftFromSparkPrefs,
  listInjectedGuides: factory.listInjectedGuides,
  upsertInjectSkill: craft.upsertInjectSkill,
  parseCraftSections: factory.parseCraftSections,
  applyCraftToSkills: craft.applyCraftToSkills,
  skillPromptBody: factory.skillPromptBody,
  toPublicSkill: factory.toPublicSkill,
  restoreSkillFactory: factory.restoreSkillFactory,
  restoreAllFactories: factory.restoreAllFactories,
  CRAFT_SLOTS: factory.CRAFT_SLOTS,
};
