#!/usr/bin/env node
const { listModels, testChat, endpointLabel } = require("../backend/src/llm");
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
  console.log(`地址：${endpointLabel(settings)}`);
  console.log(`配置模型：${want || "(未填写)"}`);

  let models = null;
  try {
    models = await listModels({});
  } catch (err) {
    if (err.code === "LLM_NO_MODELS_ENDPOINT") {
      console.log("该端点不提供模型列表，改用一次对话请求验证配置");
    } else {
      console.error(`自检失败：${err.message}`);
      process.exitCode = 1;
      return;
    }
  }

  if (models) {
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
    return;
  }

  if (!want) {
    console.error("结果：未填写模型名，无法用对话接口验证。");
    process.exitCode = 1;
    return;
  }
  try {
    const reply = await testChat({});
    console.log(`对话探测成功，返回：${String(reply).slice(0, 40)}`);
    console.log("结果：配置可用（该端点不提供 /models 列表）。");
  } catch (err) {
    console.error(`对话探测失败：${err.message}`);
    process.exitCode = 1;
  }
}

main();
