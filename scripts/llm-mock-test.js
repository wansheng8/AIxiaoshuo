// 四套协议（openai-chat / anthropic / ollama / gemini）的模型调用回归测试。
// 起一个本地 mock 上游驱动真实代码路径，不联网、不消耗作者额度。
// 用法：node scripts/llm-mock-test.js
const http = require("http");

const SECRET = "sk-SECRET-sentinel-should-never-appear";
const store = require("../backend/src/store.js");

let CURRENT = null;
store.getSettings = () => CURRENT;

const llm = require("../backend/src/llm.js");

const seen = {};
const slot = (scen) => (seen[scen] = seen[scen] || { count: 0, bodies: [] });

function sse(obj) {
  return `data: ${JSON.stringify(obj)}\n\n`;
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => resolve(raw));
  });
}

// ---- 四种协议的流式 / 整体响应构造 ----

function openaiStream(texts) {
  return texts.map((t) => sse({ choices: [{ delta: { content: t } }] })).join("") + "data: [DONE]\n\n";
}
function openaiWhole(text) {
  return { choices: [{ message: { content: text } }] };
}

function anthropicStream(texts, opts = {}) {
  let out = `event: message_start\ndata: ${JSON.stringify({ type: "message_start" })}\n\n`;
  if (opts.thinking) {
    out += `event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", delta: { type: "thinking_delta", thinking: opts.thinking } })}\n\n`;
  }
  out += `event: content_block_start\ndata: ${JSON.stringify({ type: "content_block_start", content_block: { type: "text", text: "" } })}\n\n`;
  for (const t of texts) {
    out += `event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", delta: { type: "text_delta", text: t } })}\n\n`;
  }
  out += `event: message_stop\ndata: ${JSON.stringify({ type: "message_stop" })}\n\n`;
  return out;
}
function anthropicWhole(text) {
  return { content: [{ type: "thinking", thinking: "内部推理不应进正文" }, { type: "text", text }] };
}

function ollamaStream(texts) {
  return texts.map((t) => `${JSON.stringify({ message: { content: t }, done: false })}\n`).join("")
    + `${JSON.stringify({ done: true })}\n`;
}
function ollamaWhole(text) {
  return { message: { content: text }, done: true };
}

function geminiStream(texts, opts = {}) {
  let out = "";
  if (opts.thought) out += sse({ candidates: [{ content: { parts: [{ text: opts.thought, thought: true }] } }] });
  for (const t of texts) out += sse({ candidates: [{ content: { parts: [{ text: t }] } }] });
  out += sse({ candidates: [{ content: { parts: [] }, finishReason: "STOP" }] });
  return out;
}
function geminiWhole(text) {
  return { candidates: [{ content: { parts: [{ text }] }, finishReason: "STOP" }] };
}

function modelsBody(protocol) {
  if (protocol === "ollama") return { models: [{ name: "mock-model:latest" }, { name: "mock-model-2:latest" }] };
  if (protocol === "gemini") return { models: [{ name: "models/mock-model" }, { name: "models/mock-model-2" }] };
  if (protocol === "anthropic") return { data: [{ id: "mock-model", type: "model" }] };
  return { data: [{ id: "mock-model" }, { id: "mock-model-2" }] };
}

const server = http.createServer(async (req, res) => {
  const hit = /^\/([a-z0-9-]+)\/([a-z0-9-]+)\/(.*)$/.exec(req.url || "");
  const json = (code, obj) => {
    res.writeHead(code, { "Content-Type": "application/json" });
    res.end(JSON.stringify(obj));
  };
  if (!hit) return json(404, { error: "no scenario" });
  const protocol = hit[1];
  const scen = hit[2];
  const tail = String(hit[3] || "").split("?")[0];

  const isModels = /(^|\/)models$/.test(tail) || tail === "api/tags";
  const isChat = !isModels;

  const row = slot(scen);
  row.count += 1;
  row.protocol = protocol;
  let body = {};
  if (isChat) {
    const raw = await readBody(req);
    try { body = JSON.parse(raw || "{}"); } catch { body = {}; }
    row.bodies.push(body);
    row.headers = req.headers;
  }
  // gemini 不走 body.stream，而是用 URL 上的 :streamGenerateContent 表达流式
  const wantsStream = isChat && (body.stream === true || /:streamGenerateContent$/i.test(tail));
  const streamCt = protocol === "ollama" ? "application/x-ndjson" : "text/event-stream";
  const startStream = (ct) => {
    res.writeHead(200, { "Content-Type": ct, "Cache-Control": "no-cache" });
    res.flushHeaders();
  };
  const streamer = (texts, opts) => {
    if (protocol === "openai-chat") return openaiStream(texts);
    if (protocol === "anthropic") return anthropicStream(texts, opts);
    if (protocol === "ollama") return ollamaStream(texts);
    return geminiStream(texts, opts);
  };
  const whole = (text) => {
    if (protocol === "openai-chat") return openaiWhole(text);
    if (protocol === "anthropic") return anthropicWhole(text);
    if (protocol === "ollama") return ollamaWhole(text);
    return geminiWhole(text);
  };

  if (isModels) {
    if (scen === "nomodels") return json(404, { error: "not found" });
    return json(200, modelsBody(protocol));
  }

  if (scen === "buffered") {
    if (wantsStream) {
      startStream(streamCt);
      const t = setTimeout(() => {
        if (res.writableEnded || res.destroyed) return;
        try {
          res.write(streamer(["缓冲", "上游", "才回"]));
          res.end();
        } catch { /* socket gone */ }
      }, 3000);
      res.on("close", () => clearTimeout(t));
      return;
    }
    return json(200, whole("非流式兜底成功"));
  }

  if (scen === "dead") return; // 永不响应

  if (scen === "mid-stall") {
    startStream(streamCt);
    res.write(streamer(["第一段", "第二段"]));
    return; // 之后一直静默
  }

  if (scen === "jsonsse") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(streamer(["整体", "塞进", "JSON"]));
  }

  if (scen === "streamreject") {
    if (wantsStream) return json(400, { error: { message: "stream is not supported" } });
    return json(200, whole("退回流式成功"));
  }

  if (scen === "quota") return json(402, { error: { message: "insufficient balance" } });

  if (scen === "badmodel") return json(400, { error: { message: `model ${body.model}-9 does not exist` } });

  // 上游忽略 stream 参数，直接把整体 JSON 返回
  if (scen === "proto-nostream") return json(200, whole("整体回答"));

  // 200 里塞错误：Anthropic 的 error 事件 / Ollama 的内嵌 error
  if (scen === "anth-error") {
    startStream("text/event-stream");
    res.write(`event: error\ndata: ${JSON.stringify({ type: "error", error: { type: "overloaded_error", message: "Overloaded" } })}\n\n`);
    return res.end();
  }
  if (scen === "ollama-badmodel") {
    startStream("application/x-ndjson");
    res.write(`${JSON.stringify({ error: "model 'mock-model' not found, try pulling it first" })}\n`);
    return res.end();
  }

  // Gemini 安全拦截：HTTP 200 但没有任何 candidate
  if (scen === "gemini-safety") {
    startStream("text/event-stream");
    res.write(sse({ promptFeedback: { blockReason: "SAFETY" } }));
    return res.end();
  }
  // Gemini 不带 alt=sse：分块装在数组里
  if (scen === "gemini-array") {
    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify([
      { candidates: [{ content: { parts: [{ text: "整体" }] } }] },
      { candidates: [{ content: { parts: [{ text: "回答" }] } }] },
    ]));
  }

  // 默认：正常返回 甲乙丙（场景名含 think 时附带思考片段）
  if (wantsStream) {
    startStream(streamCt);
    res.write(streamer(["甲", "乙", "丙"], { thinking: "推理链", thought: "思考片段" }));
    return res.end();
  }
  return json(200, whole("整体回答"));
});

function settings(scen, protocol, extra = {}) {
  const root = `http://127.0.0.1:${server.address().port}/${protocol}/${scen}`;
  return {
    baseUrl: protocol === "ollama" ? root : `${root}/v1`,
    model: "mock-model",
    apiKey: SECRET,
    protocol,
    temperature: 0.5,
    maxTokens: 1024,
    contextLength: 8000,
    thinking: false,
    retryAttempts: 1,
    retryBaseMs: 100,
    retryMaxMs: 200,
    ...extra,
  };
}

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function withEnv(env, fn) {
  const saved = {};
  for (const k of Object.keys(env)) {
    saved[k] = process.env[k];
    process.env[k] = String(env[k]);
  }
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      for (const k of Object.keys(env)) {
        if (saved[k] === undefined) delete process.env[k];
        else process.env[k] = saved[k];
      }
    });
}

function run(scen, protocol, { env = {}, extra = {}, call } = {}) {
  CURRENT = settings(scen, protocol, extra);
  return withEnv({ LLM_RETRY_ATTEMPTS: 1, LLM_FIRST_TOKEN_MS: 1500, LLM_IDLE_MS: 1500, ...env }, async () => {
    let out = "";
    const work = call
      ? call()
      : llm.streamChat({
          messages: [{ role: "system", content: "你是写手" }, { role: "user", content: "写一段" }],
          temperature: extra.temperature,
          onDelta: (t) => { out += t; },
        });
    await work;
    return out;
  });
}

async function expectThrows(scen, protocol, opts = {}) {
  try {
    const out = await run(scen, protocol, opts);
    return { error: null, out };
  } catch (err) {
    return { error: err, out: null };
  }
}

const errors = [];
function record(r) {
  if (r && r.error) errors.push(r.error.message);
}

const PROTOCOLS = ["openai-chat", "anthropic", "ollama", "gemini"];

async function main() {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  console.log(`mock upstream on :${server.address().port}\n`);

  // ===== 超时 / 断流 / 错误归类（openai-chat 基线） =====
  const t1 = await run("buffered", "openai-chat", { env: { LLM_FIRST_TOKEN_MS: 700 } });
  check("缓冲中转站 → 非流式兜底成功", t1 === "非流式兜底成功", JSON.stringify(t1));

  const t2 = await expectThrows("dead", "openai-chat", { env: { LLM_FIRST_TOKEN_MS: 600, LLM_IDLE_MS: 600 } });
  record(t2);
  check("无响应 → 报超时", t2.error && t2.error.code === "LLM_TIMEOUT", t2.error && t2.error.message);
  check(
    "超时消息含端点与模型名",
    t2.error && t2.error.message.includes("127.0.0.1") && t2.error.message.includes("mock-model"),
    t2.error && t2.error.message,
  );

  const t3 = await expectThrows("mid-stall", "openai-chat", { env: { LLM_IDLE_MS: 600 } });
  record(t3);
  check("中途断流 → partial 错误", t3.error && t3.error.partial === true, t3.error && t3.error.message);

  const t4 = await expectThrows("quota", "openai-chat");
  record(t4);
  check("402 → 额度不足文案", t4.error && /额度不足/.test(t4.error.message), t4.error && t4.error.message);

  const t5 = await expectThrows("badmodel", "openai-chat");
  record(t5);
  check("模型不存在 → 提示核对模型名", t5.error && /模型名不存在/.test(t5.error.message), t5.error && t5.error.message);

  // ===== 四套协议通用能力 =====
  for (const p of PROTOCOLS) {
    const out = await run("proto-stream", p);
    check(`${p} · 流式拼装`, out === "甲乙丙", JSON.stringify(out));
  }
  for (const p of PROTOCOLS) {
    const out = await run("proto-nostream", p);
    check(`${p} · 上游整体返回 JSON`, out === "整体回答", JSON.stringify(out));
  }
  for (const p of PROTOCOLS) {
    const out = await run("streamreject", p);
    check(`${p} · 拒绝流式 → 退回非流式`, out === "退回流式成功", JSON.stringify(out));
  }
  for (const p of PROTOCOLS) {
    const t = await expectThrows("dead", p, { env: { LLM_FIRST_TOKEN_MS: 500, LLM_IDLE_MS: 500 } });
    record(t);
    check(`${p} · 上游不响应 → 超时`, t.error && t.error.code === "LLM_TIMEOUT", t.error && t.error.message);
  }
  for (const p of PROTOCOLS) {
    CURRENT = settings("proto-stream", p);
    let ids = [];
    try {
      ids = await llm.listModels({});
    } catch (err) {
      ids = [`ERR:${err.message}`];
    }
    check(`${p} · 拉取模型列表`, ids.length >= 1 && ids[0].startsWith("mock-model"), JSON.stringify(ids));
  }
  for (const p of PROTOCOLS) {
    CURRENT = settings("nomodels", p);
    let code = "";
    try {
      await llm.listModels({});
    } catch (err) {
      code = err.code || "";
    }
    check(`${p} · 无 /models 端点 → 专用错误码`, code === "LLM_NO_MODELS_ENDPOINT", code);
  }
  // proto-nostream：服务端永远返回整体 JSON，客户端必须自己判断该按整体读
  check("ollama baseUrl 去掉 /api 后缀", llm.normalizeBaseUrl("http://x:11434/api", "ollama") === "http://x:11434", "");
  check("gemini baseUrl 保持原样", llm.normalizeBaseUrl("https://g/v1beta", "gemini") === "https://g/v1beta", "");

  // ===== Anthropic 专属 =====
  const a1 = await run("proto-anth", "anthropic", { extra: { temperature: 0.3 } });
  const aSent = slot("proto-anth").bodies[0] || {};
  const aHead = slot("proto-anth").headers || {};
  check("anthropic · 流式拼装（跳过 event: 行）", a1 === "甲乙丙", JSON.stringify(a1));
  check("anthropic · 用 x-api-key + anthropic-version 头", aHead["x-api-key"] === SECRET && Boolean(aHead["anthropic-version"]), JSON.stringify({ v: aHead["anthropic-version"] }));
  check("anthropic · 未开思考保留 temperature", aSent.temperature === 0.3 && !aSent.thinking, JSON.stringify({ t: aSent.temperature, think: aSent.thinking }));
  check("anthropic · system 拆成顶层字段", aSent.system === "你是写手" && !JSON.stringify(aSent.messages).includes("你是写手"), JSON.stringify(aSent.system));

  const a2 = await run("proto-anth-think", "anthropic", { extra: { thinking: true } });
  const aSent2 = slot("proto-anth-think").bodies[0] || {};
  check("anthropic · 思考片段不进正文", a2 === "甲乙丙", JSON.stringify(a2));
  check(
    "anthropic · 开思考带 budget 且不传 temperature",
    Boolean(aSent2.thinking) && aSent2.temperature === undefined && aSent2.thinking.budget_tokens < aSent2.max_tokens,
    JSON.stringify({ think: aSent2.thinking, max: aSent2.max_tokens, t: aSent2.temperature }),
  );

  const aErr = await expectThrows("anth-error", "anthropic");
  record(aErr);
  check("anthropic · 200 里的 error 事件 → 可读报错", Boolean(aErr.error && /暂时不可用|Overloaded|请求被上游拒绝/.test(aErr.error.message)), aErr.error && aErr.error.message);

  // ===== Ollama 专属 =====
  const o1 = await run("proto-ollama", "ollama", { extra: { contextLength: 200000 } });
  const oSent = slot("proto-ollama").bodies[0] || {};
  check("ollama · NDJSON 流式拼装", o1 === "甲乙丙", JSON.stringify(o1));
  check(
    "ollama · num_ctx 压到 32k 而不是 200k",
    oSent.options && oSent.options.num_ctx === 32768 && oSent.options.num_predict === 1024,
    JSON.stringify(oSent.options),
  );
  const oErr = await expectThrows("ollama-badmodel", "ollama");
  record(oErr);
  check("ollama · 200 里内嵌 error → 可读报错", Boolean(oErr.error && /模型名不存在/.test(oErr.error.message)), oErr.error && oErr.error.message);

  // ===== Gemini 专属 =====
  const g1 = await run("proto-gem-think", "gemini", { extra: { thinking: true } });
  const gSent1 = slot("proto-gem-think").bodies[0] || {};
  check("gemini · 思考片段（part.thought）不进正文", g1 === "甲乙丙", JSON.stringify(g1));
  check(
    "gemini · 非 2.5 模型不发 thinkingConfig",
    !gSent1.generationConfig || gSent1.generationConfig.thinkingConfig === undefined,
    JSON.stringify(gSent1.generationConfig),
  );
  const g2 = await run("proto-gem-25", "gemini", { extra: { thinking: true, model: "gemini-2.5-flash" } });
  const gSent2 = slot("proto-gem-25").bodies[0] || {};
  check(
    "gemini · 2.5 模型开思考带 includeThoughts",
    g2 === "甲乙丙" && Boolean(gSent2.generationConfig && gSent2.generationConfig.thinkingConfig),
    JSON.stringify(gSent2.generationConfig),
  );
  const gArr = await run("gemini-array", "gemini");
  check("gemini · 数组分块（未走 alt=sse）→ 拼装", gArr === "整体回答", JSON.stringify(gArr));

  const before = (seen["gemini-safety"] && seen["gemini-safety"].count) || 0;
  const gSafe = await expectThrows("gemini-safety", "gemini");
  record(gSafe);
  check("gemini · 安全拦截 → 可读报错", Boolean(gSafe.error && /安全/.test(gSafe.error.message)), gSafe.error && gSafe.error.message);
  check("gemini · 安全拦截 → 不兜底不重试", seen["gemini-safety"].count === before + 1, `请求 ${seen["gemini-safety"].count - before} 次`);

  // ===== 模型可用性探测 =====
  const { cleanProbes, normalizeProvider, probeTtlMs } = require("../backend/src/providers.js");

  for (const p of PROTOCOLS) {
    CURRENT = settings("proto-stream", p);
    const r = await llm.probeModel({});
    check(`${p} · 探测成功带延时`, r.ok === true && Number.isInteger(r.ms) && r.ms >= 0 && Boolean(r.at), JSON.stringify(r));
  }
  for (const p of PROTOCOLS) {
    CURRENT = settings("dead", p);
    const r = await withEnv({ LLM_PROBE_MS: 500 }, () => llm.probeModel({}));
    check(`${p} · 探测超时 → 标记失败`, r.ok === false && r.code === "LLM_TIMEOUT" && r.ms >= 0, JSON.stringify(r));
  }

  CURRENT = settings("quota", "openai-chat");
  const pQuota = await llm.probeModel({});
  check("探测 · 402 归为不可用并带原因", pQuota.ok === false && /额度不足/.test(pQuota.reason), pQuota.reason);
  check("探测 · 失败原因不含 Token", !String(pQuota.reason).includes(SECRET), pQuota.reason);

  const probeHits = slot("proto-stream").count;
  CURRENT = { ...settings("proto-stream", "openai-chat"), model: "" };
  let missingModel = null;
  try {
    await llm.probeModel({});
  } catch (err) {
    missingModel = err;
  }
  check("探测 · 缺模型名 → 400", Boolean(missingModel && missingModel.status === 400), missingModel && missingModel.message);
  check("探测 · 缺模型名不发网络请求", slot("proto-stream").count === probeHits, `请求 ${slot("proto-stream").count - probeHits} 次`);

  CURRENT = settings("proto-stream", "openai-chat");
  const probeReply = (await llm.probeModel({})).reply;
  const chatReply = await llm.testChat({});
  check("探测接口复用同一实现（testChat）", Boolean(probeReply) && chatReply === probeReply, JSON.stringify({ probeReply, chatReply }));

  const np = normalizeProvider({
    id: "pv_x",
    model: "a",
    models: ["a", "b"],
    probes: { a: { ok: true, ms: 12, at: "t" }, c: { ok: true, ms: 1 } },
  });
  check("probes 按模型列表裁剪", Object.keys(np.probes).join(",") === "a", JSON.stringify(np.probes));
  const np2 = normalizeProvider({ id: "pv_x", model: "a", models: ["a"] }, "", {
    probes: { a: { ok: true, ms: 9, reason: "", at: "t" } },
  });
  check("客户端保存不带 probes 时沿用服务端记录", Boolean(np2.probes.a) && np2.probes.a.ms === 9, JSON.stringify(np2.probes));
  check("probeTtlMs 默认 12 小时", probeTtlMs() === 12 * 60 * 60 * 1000, String(probeTtlMs()));
  await withEnv({ MODEL_PROBE_TTL_MS: "60000" }, () => {
    check("probeTtlMs 支持 env 覆盖", probeTtlMs() === 60000, String(probeTtlMs()));
    return null;
  });
  check("cleanProbes 丢弃非对象项", Object.keys(cleanProbes({ a: null }, ["a"])).length === 0, JSON.stringify(cleanProbes({ a: null }, ["a"])));

  // ===== 安全与配置 =====
  check("错误消息不含 API Key", errors.every((m) => !String(m).includes(SECRET)), errors.join(" | "));

  CURRENT = settings("dead", "openai-chat");
  const cfg = await withEnv({ LLM_FIRST_TOKEN_MS: 5000, LLM_IDLE_MS: 4000 }, async () =>
    llm.timeoutConfig({ thinking: false, writing: true }),
  );
  check("env 覆盖首字/空闲超时", cfg.first === 5000 && cfg.idle === 4000, JSON.stringify(cfg));

  server.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} 通过`);
  if (failed.length) failed.forEach((f) => console.log(`  FAIL ${f.name}`));
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
