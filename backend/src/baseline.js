const BASELINE_VERSION = "2026-09-12.1";

function baseLines(voiceActive) {
  const lines = [
    `# 平台质量基线（v${BASELINE_VERSION}，单一来源，冲突以本节为准）`,
    `标点一律中文全角。对话用“”。系统所有输出（说话、面板、警告、损人）一律【】且单独成段，禁止用「」。内心独白不加引号，直接叙述。`,
    `章首承接最高优先：若本章已有上一章正文，第一句必须接住上一章最后的动作、对话、物件或未完成选择；细纲第一场在别处时，先用两到四句带出再进场面，该段不算表外新场。`,
    `一章一条主冲突。只准演，不报情绪：情绪落在动作、身体反应、物件、停顿和没说出口的话上。`,
    `去AI 按句检查：句长要有长短锯齿，别全章一个速度；总结句改糙；潜台词不说完；漂亮设计句改成当场生理。允许有点糙、有点噎、有点没说完。`,
    `字体零容忍：不许有错别字、同音字或别字、多字漏字、生造词，不许中英混用标点或全半角混排。拿不准的字用常见写法，宁可换词也不写别字。人名、地名、功法前后必须一致。`,
  ];
  if (!voiceActive) {
    lines.push(
      `段落节奏：默认一段两到四句、约 40 到 80 字；危机、吐槽、反转允许短句成簇、单句成段；禁止全章同一段长。对话单独成段。一句里的「的」不超过一个。`,
      `量化口径（写作类通用，唯一来源）：句长标准差 ≥ 12 且不出现连续 3 句长度接近；对白平均长度 ≤ 12 字、每 300 字至少 2 组对白；口语骨架词每 500 字 ≥ 5；人类瑕疵每 1000 字 ≥ 3；总结句每 1000 字 < 3；说破潜台词每 1000 字 < 2.5。`,
      `硬禁词与书面连接词出现即改，词表以类型引擎的硬禁词列表为唯一来源。`,
      `默认不用比喻。像、仿佛、宛如、好似、如同、似的一律删，硌就写硌，沉就写沉。`
    );
  } else {
    lines.push(
      `底味优先：个人文风启用且有说明书时，作者的句长、标点、用词、比喻、段落切法压过平台通用家规，本节只保留上面的最低阅读格式。`
    );
  }
  return lines;
}

function buildBaselineBlock(opts = {}) {
  if (!opts.skill) return [];
  const id = String(opts.skill.id || "");
  const target = String(opts.skill.target || "");
  const writing = id === "chapter-prose" || id === "continue" || id === "polish" || target === "content";
  if (!writing) return [];
  return baseLines(Boolean(opts.voiceActive));
}

module.exports = { BASELINE_VERSION, buildBaselineBlock };
