#!/usr/bin/env node
const { listModels } = require("../backend/src/llm");
const { getSettings } = require("../backend/src/store");

async function main() {
  const settings = getSettings();
  const want = String(settings.model || "").trim();
  if (!settings.baseUrl) {
    console.error("未配置模型。请先启动服务，在「设置」页填写 Base URL、模型名与 API Key。");
    process.exitCode = 1;
    return;
  }
  console.log(`协议：${settings.protocol}`);
  console.log(`地址：${settings.baseUrl}`);
  console.log(`配置模型：${want || "(未填写)"}`);

  let models;
  try {
    models = await listModels({});
  } catch (err) {
    console.error(`自检失败：${err.message}`);
    process.exitCode = 1;
    return;
  }

  console.log(`/models 返回 ${models.length} 个模型`);
  if (!want) {
    console.error("结果：未填写模型名，请从上面列表里挑一个填到「设置」页。");
    process.exitCode = 1;
    return;
  }
  if (models.includes(want)) {
    console.log(`结果：模型「${want}」存在，配置正确。`);
    return;
  }
  console.error(`结果：模型「${want}」不在列表，请改用端点实际提供的名称。`);
  if (models.length) {
    console.error(`端点实际提供（前 10 个）：${models.slice(0, 10).join("、")}`);
  }
  process.exitCode = 1;
}

main();
