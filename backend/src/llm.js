const { getSettings } = require("./store");
const { needsKey, normalizeProtocol, providerReady } = require("./providers");

function normalizeBaseUrl(baseUrl, protocol) {
  const trimmed = String(baseUrl || "").replace(/\/+$/, "");
  if (!trimmed) return "";
  const kind = normalizeProtocol(protocol);
  if (kind === "ollama") return trimmed.replace(/\/api$/i, "");
  // Gemini 的路径必须带版本段，裸域名要补 /v1beta
  if (kind === "gemini") return /\/v\d+[a-z]*$/i.test(trimmed) ? trimmed : `${trimmed}/v1beta`;
  if (/\/v\d+[a-z]*$/i.test(trimmed)) return trimmed;
  return `${trimmed}/v1`;
}

function numOr(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function resolveSettings(draft) {
  const saved = getSettings();
  const fromList = draft && draft.providerId
    ? (saved.providers || []).find((row) => row.id === draft.providerId)
    : null;
  const base = fromList || saved;
  const protocol = normalizeProtocol((draft && draft.protocol) || base.protocol);
  const apiKey = String((draft && draft.apiKey) || base.apiKey || "").trim();
  return {
    ...saved,
    ...base,
    protocol,
    baseUrl: normalizeBaseUrl((draft && draft.baseUrl) || base.baseUrl, protocol),
    apiKey,
    model: String((draft && draft.model) || base.model || "").trim(),
    maxTokens: Math.round(numOr(draft && draft.maxTokens != null ? draft.maxTokens : base.maxTokens, 32000, 256, 128000)),
    contextLength: Math.round(numOr(draft && draft.contextLength != null ? draft.contextLength : base.contextLength, 200000, 1024, 1000000)),
    thinking: Boolean(draft && draft.thinking != null ? draft.thinking : base.thinking),
    temperature: numOr(draft && draft.temperature != null ? draft.temperature : base.temperature, 0.88, 0, 2),
  };
}

function settingsReady() {
  const settings = resolveSettings();
  if (!providerReady(settings)) {
    const error = new Error("请先在设置页接入一家供应商，并启用其中一路");
    error.status = 400;
    error.code = "LLM_NOT_CONFIGURED";
    throw error;
  }
  return settings;
}

function authHeaders(apiKey, json = true) {
  const headers = {};
  if (json) headers["Content-Type"] = "application/json";
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  return headers;
}

function fitMessages(messages, contextLength, maxTokens) {
  const reserve = Math.max(256, Number(maxTokens) || 0) + 512;
  const budget = Math.max(2048, (Number(contextLength) || 200000) - reserve);
  const sizeOf = (rows) => rows.reduce((n, row) => n + String(row.content || "").length, 0);
  const out = (messages || []).map((row) => ({ role: row.role, content: String(row.content || "") }));
  if (sizeOf(out) <= budget) return out;
  const system = out.filter((row) => row.role === "system");
  const rest = out.filter((row) => row.role !== "system");
  const userBudget = Math.max(512, budget - sizeOf(system));
  if (rest.length) {
    const last = rest[rest.length - 1];
    if (last.content.length > userBudget) {
      last.content = `…（前文已截断）\n${last.content.slice(-userBudget)}`;
    }
  }
  return [...system, ...rest];
}

function officialDeepseek(settings) {
  const vendor = String(settings.vendor || "").toLowerCase();
  const host = String(settings.baseUrl || "").toLowerCase();
  return vendor === "deepseek" || host.includes("api.deepseek.com") || /deepseek\.com/.test(host);
}

function deepseekThinkHost(settings) {
  const vendor = String(settings.vendor || "").toLowerCase();
  const host = String(settings.baseUrl || "").toLowerCase();
  return vendor === "deepseek" || host.includes("deepseek");
}

function collapseRoles(rows, assistantRole) {
  const out = [];
  for (const row of rows) {
    const role = row.role === "assistant" ? assistantRole : "user";
    const last = out[out.length - 1];
    if (last && last.role === role) last.content += `\n\n${row.content}`;
    else out.push({ role, content: row.content });
  }
  return out;
}

function chatBody(settings, { messages, temperature, stream, maxTokens, thinking }) {
  const body = {
    model: settings.model,
    messages: fitMessages(messages, settings.contextLength, maxTokens || settings.maxTokens),
    temperature,
  };
  if (stream) body.stream = true;
  const think = thinking == null ? Boolean(settings.thinking) : Boolean(thinking);
  if (!think) {
    const cap = Math.min(Number(maxTokens || settings.maxTokens) || 0, 8192);
    if (cap > 0) body.max_tokens = cap;
  }
  if (officialDeepseek(settings)) {
    body.thinking = { type: think ? "enabled" : "disabled" };
  } else if (deepseekThinkHost(settings)) {
    body.thinking = { type: think ? "enabled" : "disabled" };
    body.enable_thinking = Boolean(think);
    body.chat_template_kwargs = { enable_thinking: Boolean(think), thinking: Boolean(think) };
  }
  return body;
}

// 本地模型按 num_ctx 实打实分配 KV 缓存，照搬 200k 会把显存吃光；统一压到 32k
const OLLAMA_MAX_CTX = 32768;

function ollamaContext(settings) {
  return Math.min(Math.max(Number(settings.contextLength) || 0, 2048), OLLAMA_MAX_CTX);
}

function requestPlan(settings, { messages, temperature, stream, maxTokens, thinking }) {
  const protocol = normalizeProtocol(settings.protocol);
  const think = thinking == null ? Boolean(settings.thinking) : Boolean(thinking);
  const cap = Math.min(Number(maxTokens || settings.maxTokens) || 0, 8192);
  const contextLength = protocol === "ollama" ? ollamaContext(settings) : settings.contextLength;
  const fitted = fitMessages(messages, contextLength, maxTokens || settings.maxTokens);

  if (protocol === "anthropic") {
    const system = fitted.filter((row) => row.role === "system").map((row) => row.content).join("\n\n");
    let rest = collapseRoles(fitted.filter((row) => row.role !== "system"), "assistant");
    if (!rest.length) rest = [{ role: "user", content: "请开始。" }];
    if (rest[0].role !== "user") rest.unshift({ role: "user", content: "请继续。" });
    const body = {
      model: settings.model,
      max_tokens: Math.max(256, cap || 1024),
      messages: rest.map((row) => ({ role: row.role, content: row.content })),
      stream: Boolean(stream),
    };
    if (system) body.system = system;
    if (think) {
      // 开启思考时 Anthropic 要求 temperature 保持默认（不传），且预算要小于 max_tokens
      const budget = Math.max(1024, Math.min(Math.round(body.max_tokens / 2), body.max_tokens - 512, 16000));
      body.thinking = { type: "enabled", budget_tokens: budget };
      body.max_tokens = Math.max(body.max_tokens, budget + 512);
    } else if (temperature != null) {
      body.temperature = temperature;
    }
    return {
      url: `${settings.baseUrl}/messages`,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": settings.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body,
      protocol,
    };
  }

  if (protocol === "ollama") {
    const body = {
      model: settings.model,
      messages: fitted,
      stream: Boolean(stream),
      options: {
        temperature,
        num_ctx: contextLength,
      },
    };
    if (cap > 0 && !think) body.options.num_predict = cap;
    return {
      url: `${settings.baseUrl}/api/chat`,
      headers: authHeaders(settings.apiKey),
      body,
      protocol,
    };
  }

  if (protocol === "gemini") {
    const system = fitted.filter((row) => row.role === "system").map((row) => row.content).join("\n\n");
    let rest = collapseRoles(fitted.filter((row) => row.role !== "system"), "model");
    if (!rest.length) rest = [{ role: "user", content: "请开始。" }];
    if (rest[0].role !== "user") rest.unshift({ role: "user", content: "请继续。" });
    const body = {
      contents: rest.map((row) => ({
        role: row.role,
        parts: [{ text: row.content }],
      })),
      generationConfig: {
        temperature,
      },
    };
    if (cap > 0) body.generationConfig.maxOutputTokens = cap;
    // 只有 2.5 系模型认 thinkingConfig，其余模型带上会直接 400
    if (think && /2\.5|thinking/i.test(String(settings.model || ""))) {
      body.generationConfig.thinkingConfig = { includeThoughts: true };
    }
    if (system) body.systemInstruction = { parts: [{ text: system }] };
    const action = stream ? "streamGenerateContent" : "generateContent";
    const qs = stream ? "?alt=sse" : "";
    return {
      url: `${settings.baseUrl}/models/${encodeURIComponent(settings.model)}:${action}${qs}`,
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": settings.apiKey,
      },
      body,
      protocol,
    };
  }

  return {
    url: `${settings.baseUrl}/chat/completions`,
    headers: authHeaders(settings.apiKey),
    body: chatBody(settings, { messages, temperature, stream, maxTokens, thinking }),
    protocol,
  };
}

function extractDelta(json, protocol) {
  if (protocol === "anthropic") {
    const delta = (json && json.delta) || {};
    const block = (json && json.content_block) || {};
    const startText = json && json.type === "content_block_start" ? block.text : "";
    return { content: delta.text || startText || "", reasoning: delta.thinking || "" };
  }
  if (protocol === "ollama") {
    const message = (json && json.message) || {};
    return { content: message.content || json.response || "", reasoning: message.thinking || "" };
  }
  if (protocol === "gemini") {
    const parts = json && json.candidates && json.candidates[0] && json.candidates[0].content
      ? json.candidates[0].content.parts || []
      : [];
    const text = [];
    const thoughts = [];
    for (const part of parts) {
      const chunk = part && part.text ? String(part.text) : "";
      if (!chunk) continue;
      // 2.5 系模型会把思考过程作为 part.thought 一并下发，不能混进正文
      if (part.thought) thoughts.push(chunk);
      else text.push(chunk);
    }
    return { content: text.join(""), reasoning: thoughts.join("") };
  }
  const choice = json && json.choices && json.choices[0] ? json.choices[0] : {};
  const delta = choice.delta || {};
  const message = choice.message || {};
  const content = delta.content || message.content || choice.text || "";
  const reasoning = delta.reasoning_content || delta.reasoning || message.reasoning_content || message.reasoning || "";
  return { content, reasoning };
}

function extractComplete(json, protocol) {
  if (protocol === "anthropic") {
    const blocks = Array.isArray(json && json.content) ? json.content : [];
    return blocks.map((block) => block.text || "").join("");
  }
  if (protocol === "ollama") {
    return ((json && json.message && json.message.content) || (json && json.response) || "");
  }
  if (protocol === "gemini") {
    // 与流式走同一套解析：思考片段同样不算正文
    return extractDelta(json, protocol).content;
  }
  return extractDelta(json, protocol).content;
}

// 上游把错误塞进 200 响应体（Anthropic 的 error 事件、Ollama 的 {"error":...}），
// 或 Gemini 因安全策略直接拦下请求时，正文都会是空的，必须显式抛出而不是当成空生成
function guardPayload(json, protocol) {
  if (!json || typeof json !== "object") return;
  const embedded = Array.isArray(json) ? null : json.error;
  if (embedded) {
    const detail = typeof embedded === "string" ? embedded : embedded.message || JSON.stringify(embedded);
    const error = new Error(publicLlmError(400, detail));
    error.status = 400;
    error.httpStatus = 400;
    error.kind = "upstream";
    error.retryable = false;
    if (/overload|rate.?limit|too many|busy|过载|繁忙/i.test(detail)) {
      error.message = "大模型服务暂时不可用";
      error.kind = "overloaded";
      error.retryable = true;
    }
    throw error;
  }
  if (protocol !== "gemini") return;
  const feedback = json.promptFeedback || {};
  const candidate = (json.candidates && json.candidates[0]) || {};
  if (!feedback.blockReason && candidate.finishReason !== "SAFETY") return;
  const error = new Error("内容被上游安全策略拦截，改一下措辞再试");
  error.status = 400;
  error.httpStatus = 400;
  error.kind = "safety";
  error.retryable = false;
  throw error;
}

function publicLlmError(status, detail) {
  const text = String(detail || "");
  if (/safety|content[_ ]?filter|blocked|prohibited|违规|敏感|风控/i.test(text)) {
    return "内容被上游安全策略拦截，改一下措辞再试";
  }
  if (/model.*(not|no)[_ ]?(found|exist)|unknown model|invalid model|模型.*(不存在|无效)/i.test(text)) {
    return "模型名不存在，去设置页核对或点「拉取模型」选择";
  }
  if (status === 401 || status === 403) {
    if (/api[_-]?key|authorization|bearer|sk-|token/i.test(text)) return "Token 无效，去设置页核对";
    return "Token 无效或无权限，去设置页核对";
  }
  if (status === 402) return "账户额度不足或未开通，请到服务商后台处理";
  if (status === 404) return "接口地址不存在（404），检查 Base URL 路径是否正确";
  if (status === 405 || status === 501) return "该接口不提供这个能力，检查 Base URL 或协议选择";
  if (status === 429) return "调用过于频繁，稍后再试";
  if (status === 408 || status === 504 || status === 524) return "大模型响应超时，稍后再试";
  if (status >= 500) return "大模型服务暂时不可用";
  if (status === 400) return "请求被上游拒绝（400），检查模型名或参数";
  return `大模型接口错误 ${status}`;
}

function classifyLlmError(status, detail) {
  const code = Number(status) || 0;
  const text = String(detail || "");
  if (code === 401 || code === 403) return { kind: "auth", retryable: false, status: code };
  if (code === 402) return { kind: "insufficient_quota", retryable: false, status: code };
  if (code === 429) return { kind: "rate_limit", retryable: true, status: code };
  if (code === 408 || code === 504 || code === 524) return { kind: "timeout", retryable: true, status: code };
  if (code >= 500) return { kind: "overloaded", retryable: true, status: code };
  if (code === 400 || code === 415 || code === 422) {
    if (/safety|content[_ ]?filter|blocked|prohibited|违规|敏感|风控/i.test(text)) {
      return { kind: "safety", retryable: false, status: code };
    }
    if (/stream|event-stream|sse/i.test(text)) {
      return { kind: "stream_unsupported", retryable: false, status: code };
    }
    if (/model.*(not|no)[_ ]?(found|exist)|unknown model|invalid model|模型.*(不存在|无效)/i.test(text)) {
      return { kind: "bad_model", retryable: false, status: code };
    }
    return { kind: "bad_request", retryable: false, status: code };
  }
  if (code === 404 || code === 405 || code === 501) {
    return { kind: "endpoint_missing", retryable: false, status: code };
  }
  return { kind: "unknown", retryable: false, status: code };
}

function retryConfig(settings) {
  const pick = (value, fallback, min, max) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, Math.round(n)));
  };
  return {
    attempts: pick(process.env.LLM_RETRY_ATTEMPTS || (settings && settings.retryAttempts), 3, 1, 8),
    base: pick(process.env.LLM_RETRY_BASE_MS || (settings && settings.retryBaseMs), 800, 100, 10000),
    maxDelay: pick(process.env.LLM_RETRY_MAX_MS || (settings && settings.retryMaxMs), 15000, 500, 60000),
  };
}

function parseRetryAfter(value) {
  if (!value) return 0;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 30000);
  const at = Date.parse(value);
  if (Number.isFinite(at)) return Math.max(0, Math.min(at - Date.now(), 30000));
  return 0;
}

function backoffDelay(attempt, base, maxDelay, retryAfterMs) {
  if (retryAfterMs) return retryAfterMs;
  const raw = base * 2 ** (attempt - 1);
  const jitter = raw * 0.25 * Math.random();
  return Math.min(maxDelay, Math.round(raw + jitter));
}

const WAIT_MIN = 1000;
const WAIT_MAX = 600000;

function pickMs(name, fallback, min = WAIT_MIN, max = WAIT_MAX) {
  const raw = Number(process.env[name]);
  if (!Number.isFinite(raw) || raw <= 0) return fallback;
  return Math.min(max, Math.max(min, Math.round(raw)));
}

function timeoutConfig({ thinking, writing, timeoutMs, idleMs } = {}) {
  const think = Boolean(thinking);
  const givenFirst = Number(timeoutMs);
  const givenIdle = Number(idleMs);
  const clamp = (ms) => Math.min(WAIT_MAX, Math.max(WAIT_MIN, Math.round(ms)));
  return {
    first: givenFirst > 0 ? clamp(givenFirst) : pickMs("LLM_FIRST_TOKEN_MS", think ? 120000 : 45000),
    idle: givenIdle > 0
      ? clamp(givenIdle)
      : pickMs("LLM_IDLE_MS", think ? 180000 : writing ? 90000 : 60000),
  };
}

function probeMs() {
  return pickMs("LLM_PROBE_MS", 15000, 1000, 120000);
}

// 只暴露主机与路径，绝不带 API Key
function endpointLabel(settings) {
  const raw = String((settings && settings.baseUrl) || "").replace(/\/+$/, "");
  if (!raw) return "(未填地址)";
  try {
    const url = new URL(raw);
    return `${url.host}${url.pathname.replace(/\/+$/, "")}`;
  } catch {
    return raw;
  }
}

function modelLabel(settings) {
  return String((settings && settings.model) || "").trim() || "(未填模型名)";
}

function seconds(ms) {
  return Math.max(1, Math.round((Number(ms) || 0) / 1000));
}

function timeoutError({ settings, waitedMs, partial, sawBytes }) {
  const where = `${endpointLabel(settings)} · ${modelLabel(settings)}`;
  const secs = seconds(waitedMs);
  let message;
  if (partial) {
    message = `生成中断：${secs} 秒内没有收到新内容（${where}），已保留已生成的部分`;
  } else if (sawBytes) {
    message = `大模型连上后 ${secs} 秒没有返回正文（${where}），可能是上游繁忙或中转站缓冲`;
  } else {
    message = `大模型 ${secs} 秒内没有返回任何内容（${where}）；中转站或反向代理可能开启了缓冲，也可能是上游繁忙`;
  }
  const error = new Error(message);
  error.status = 504;
  error.code = "LLM_TIMEOUT";
  error.kind = "timeout";
  error.partial = Boolean(partial);
  error.waitedMs = waitedMs;
  return error;
}

function networkError(settings, cause) {
  const error = new Error(`连接大模型失败，请检查网络或接口地址（${endpointLabel(settings)}）`);
  error.status = 502;
  error.code = "LLM_NETWORK";
  error.kind = "network";
  error.retryable = true;
  if (cause) error.cause = cause;
  return error;
}

// 端点不支持 GET /models 时，允许上层回退到一次对话探测
function modelsUnsupported(status, detail) {
  const code = Number(status) || 0;
  if (code === 404 || code === 405 || code === 501) return true;
  if (code === 400 && /not\s*(support|implement)|unsupported|不存在|不支持/i.test(String(detail || ""))) {
    return true;
  }
  return false;
}

function abortWait() {
  const error = new Error("已停止生成");
  error.name = "AbortError";
  error.status = 499;
  return error;
}

function wait(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal && signal.aborted) return reject(abortWait());
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    const onAbort = () => {
      cleanup();
      reject(abortWait());
    };
    function cleanup() {
      clearTimeout(timer);
      if (signal) signal.removeEventListener("abort", onAbort);
    }
    if (signal) signal.addEventListener("abort", onAbort);
  });
}

function looksLikeStreamReject(status, detail) {
  const text = String(detail || "");
  if (/stream.*(not|un)support|not support.*stream|event-stream/i.test(text)) return true;
  if ((status === 400 || status === 415 || status === 422) && /stream|sse/i.test(text)) return true;
  return false;
}

function isSseResponse(response) {
  const ct = String(response.headers.get("content-type") || "").toLowerCase();
  if (!ct) return true;
  return ct.includes("text/event-stream") || ct.includes("text/plain") || ct.includes("octet-stream");
}

function shouldReadAsStream(response, protocol) {
  const ct = String(response.headers.get("content-type") || "").toLowerCase();
  if (protocol === "ollama") {
    if (ct.includes("application/json") && !ct.includes("ndjson") && !ct.includes("stream")) return false;
    return true;
  }
  return isSseResponse(response);
}

async function pumpLines(response, onLine, signal, onActivity) {
  if (!response.body) {
    throw new Error("上游未返回流式响应");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  while (true) {
    if (signal && signal.aborted) break;
    const { done, value } = await reader.read();
    if (done) break;
    if (onActivity) onActivity();
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n");
    buffer = chunks.pop() || "";
    for (const line of chunks) onLine(line);
  }
  if (buffer.trim()) onLine(buffer);
}

// SSE / NDJSON 单行解析：四种协议共用一套入口
function makeLineHandler(protocol, sink) {
  const ndjson = protocol === "ollama";
  return (line) => {
    const trimmed = String(line || "").trim();
    if (!trimmed) return;
    let payload = trimmed;
    if (!ndjson) {
      if (!trimmed.startsWith("data:")) return;
      payload = trimmed.slice(5).trim();
      if (!payload || payload === "[DONE]") return;
    }
    let json = null;
    try {
      json = JSON.parse(payload);
    } catch {
      return; // keep-alive 与不完整的半包
    }
    guardPayload(json, protocol);
    const { content, reasoning } = extractDelta(json, protocol);
    if (content) sink.onContent(content);
    else if (reasoning && sink.onActivity) sink.onActivity();
  };
}

async function readStream(response, protocol, sink, signal) {
  let sawToken = false;
  await pumpLines(
    response,
    makeLineHandler(protocol, {
      onContent: (text) => {
        sawToken = true;
        sink.onContent(text);
      },
      onActivity: sink.onActivity,
    }),
    signal,
    sink.onActivity
  );
  return sawToken;
}

// 上游不按流式返回时：可能是整体 JSON，也可能是塞在 JSON content-type 里的 SSE / NDJSON
// 返回 { sawContent, parsed }：parsed=false 表示既不是合法 JSON、也没能按 SSE/NDJSON 解出内容
function readWholeBody(raw, protocol, sink) {
  const text = String(raw || "");
  if (!text.trim()) return { sawContent: false, parsed: true };
  let json = null;
  let isJson = true;
  try {
    json = JSON.parse(text);
  } catch {
    isJson = false;
  }
  if (isJson) {
    // Gemini 不带 alt=sse 时会把分块结果装在数组里返回
    const rows = Array.isArray(json) ? json : [json];
    let seen = false;
    for (const row of rows) {
      guardPayload(row, protocol);
      const content = extractComplete(row, protocol);
      if (content) {
        sink.onContent(content);
        seen = true;
      }
    }
    return { sawContent: seen, parsed: true };
  }
  let sawToken = false;
  const onLine = makeLineHandler(protocol, {
    onContent: (chunk) => {
      sawToken = true;
      sink.onContent(chunk);
    },
    onActivity: sink.onActivity,
  });
  for (const line of text.split("\n")) onLine(line);
  return { sawContent: sawToken, parsed: false };
}

async function completeOnce(settings, { messages, temperature, maxTokens, signal, thinking }) {
  const plan = requestPlan(settings, { messages, temperature, maxTokens, thinking, stream: false });
  let response;
  try {
    response = await fetch(plan.url, {
      method: "POST",
      headers: plan.headers,
      body: JSON.stringify(plan.body),
      signal,
    });
  } catch (err) {
    // 只有传输层失败才算网络错误；响应体解析问题在下面单独处理
    if (err && err.name === "AbortError") throw err;
    throw networkError(settings, err);
  }
  if (!response.ok) {
    const detail = await response.text();
    const cls = classifyLlmError(response.status, detail);
    const error = new Error(publicLlmError(response.status, detail));
    error.status = 502;
    error.httpStatus = response.status;
    error.kind = cls.kind;
    error.retryable = cls.retryable;
    throw error;
  }
  const raw = await response.text();
  let out = "";
  const whole = readWholeBody(raw, plan.protocol, {
    onContent: (text) => {
      out += text;
    },
    onActivity: () => {},
  });
  if (!whole.parsed && !whole.sawContent) {
    const error = new Error("上游返回了无法解析的内容，检查协议与 Base URL 是否正确");
    error.status = 502;
    error.httpStatus = response.status;
    throw error;
  }
  return out;
}

async function streamChat({ messages, temperature, signal, onDelta, timeoutMs, idleMs, maxTokens, thinking, writing }) {
  const settings = settingsReady();
  const protocol = normalizeProtocol(settings.protocol);
  const temp = temperature == null ? settings.temperature : temperature;
  const think = thinking == null ? Boolean(settings.thinking) : Boolean(thinking);
  const { first: firstWait, idle: idleWait } = timeoutConfig({ thinking: think, writing, timeoutMs, idleMs });
  let controller = new AbortController();
  let timedOut = false;
  let timer = null;
  let armedMs = firstWait;
  // sawBytes：收到过任意字节（含 keep-alive）；sawToken：收到过正文
  let sawBytes = false;
  let sawToken = false;
  const arm = (ms) => {
    armedMs = ms;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, ms);
  };
  const release = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    if (signal) signal.removeEventListener("abort", onAbort);
  };
  const onAbort = () => controller.abort();
  // 已 abort 的 controller 不能复用，兜底重试前换一个新的
  const renewAbort = () => {
    if (signal) signal.removeEventListener("abort", onAbort);
    controller = new AbortController();
    timedOut = false;
    if (signal && signal.aborted) controller.abort();
    else if (signal) signal.addEventListener("abort", onAbort);
  };
  if (signal) signal.addEventListener("abort", onAbort);
  arm(firstWait);

  const failAbort = (err) => {
    if (err && err.name === "AbortError") {
      if (timedOut) throw timeoutError({ settings, waitedMs: armedMs, partial: sawToken, sawBytes });
      throw abortWait();
    }
    throw err;
  };

  const pumpComplete = async () => {
    const retry = retryConfig(settings);
    for (let attempt = 1; ; attempt += 1) {
      try {
        const text = await completeOnce(settings, {
          messages,
          temperature: temp,
          maxTokens: maxTokens || settings.maxTokens,
          thinking: think,
          signal: controller.signal,
        });
        if (text) onDelta(text);
        return;
      } catch (err) {
        if (err && err.name === "AbortError") throw err;
        if (err && err.retryable === false) throw err;
        if (attempt >= retry.attempts || timedOut || (signal && signal.aborted)) throw err;
        await wait(backoffDelay(attempt, retry.base, retry.maxDelay, 0), controller.signal);
      }
    }
  };

  // 退回一次性请求：流式被上游拒绝，或建连后长时间没有任何字节时使用
  const fallbackNonStream = async (waitMs) => {
    renewAbort();
    arm(waitMs);
    await pumpComplete();
  };

  // 返回 null 表示兜底成功；否则返回兜底过程中的错误
  const rescueNonStream = async (waitMs) => {
    try {
      await fallbackNonStream(waitMs);
      return null;
    } catch (err) {
      return err;
    }
  };

  // 有具体 HTTP 状态或网络错误时优先暴露它，比笼统的「超时」更好定位
  const preferError = (retryErr, timeoutErr) => {
    if (retryErr && (retryErr.httpStatus || retryErr.code === "LLM_NETWORK")) return retryErr;
    return timeoutErr;
  };

  const sink = {
    onContent: (text) => {
      sawToken = true;
      sawBytes = true;
      arm(idleWait);
      onDelta(text);
    },
    onActivity: () => {
      sawBytes = true;
      arm(idleWait);
    },
  };

  try {
    const retry = retryConfig(settings);
    let response = null;
    let netError = null;
    let failStatus = 0;
    let failDetail = "";
    for (let attempt = 1; attempt <= retry.attempts; attempt += 1) {
      response = null;
      netError = null;
      failStatus = 0;
      failDetail = "";
      try {
        const plan = requestPlan(settings, { messages, temperature: temp, stream: true, maxTokens, thinking: think });
        response = await fetch(plan.url, {
          method: "POST",
          headers: plan.headers,
          body: JSON.stringify(plan.body),
          signal: controller.signal,
        });
      } catch (err) {
        response = null;
        if (err && err.name === "AbortError") failAbort(err);
        netError = err;
      }
      if (response && response.ok) break;
      if (timedOut || (signal && signal.aborted)) break;
      let retryAfter = 0;
      let canRetry = Boolean(netError);
      if (response && !response.ok) {
        failStatus = response.status;
        failDetail = await response.text();
        const cls = classifyLlmError(failStatus, failDetail);
        canRetry = cls.retryable;
        retryAfter = parseRetryAfter(response.headers.get("retry-after"));
        response = null;
      }
      if (!canRetry || attempt >= retry.attempts) break;
      try {
        await wait(backoffDelay(attempt, retry.base, retry.maxDelay, retryAfter), controller.signal);
      } catch (err) {
        failAbort(err);
      }
    }

    if (!response) {
      if (netError && !failStatus) throw networkError(settings, netError);
      if (!timedOut && !(signal && signal.aborted) && looksLikeStreamReject(failStatus, failDetail)) {
        await fallbackNonStream(firstWait);
        return;
      }
      if (timedOut) {
        // 建连阶段就没有响应：再试一次非流式，仍失败才报超时
        const retryErr = await rescueNonStream(idleWait);
        if (!retryErr) return;
        throw preferError(retryErr, timeoutError({ settings, waitedMs: armedMs, partial: false, sawBytes }));
      }
      const error = new Error(publicLlmError(failStatus, failDetail));
      error.status = 502;
      error.httpStatus = failStatus;
      throw error;
    }

    if (!shouldReadAsStream(response, protocol)) {
      // 上游按整体响应返回：可能是 JSON，也可能是塞在 JSON 里的 SSE / NDJSON
      const raw = await response.text();
      sawToken = readWholeBody(raw, protocol, sink).sawContent;
      if (!sawToken) await fallbackNonStream(firstWait);
      return;
    }

    try {
      await readStream(response, protocol, sink, controller.signal);
    } catch (err) {
      // 因超时被中断时统一走下面的兜底与报错，不当成普通错误抛出
      if (timedOut) {
        // fallthrough
      } else if (
        !sawToken &&
        !(signal && signal.aborted) &&
        err &&
        err.status !== 504 &&
        err.kind !== "safety"
      ) {
        // 安全拦截换个姿势也还是会被拦，不进兜底
        await fallbackNonStream(firstWait);
        return;
      } else {
        throw err;
      }
    }

    if (timedOut && !sawToken) {
      // 建连后一个字节都没给：先试一次非流式，仍失败才报超时
      const retryErr = await rescueNonStream(idleWait);
      if (!retryErr) return;
      throw preferError(retryErr, timeoutError({ settings, waitedMs: armedMs, partial: false, sawBytes }));
    }
    if (timedOut) {
      // 已产出正文后中途断流：交给上层保留已生成内容
      throw timeoutError({ settings, waitedMs: armedMs, partial: true, sawBytes });
    }
    if (!sawToken && !(signal && signal.aborted)) {
      await fallbackNonStream(firstWait);
    }
  } catch (err) {
    failAbort(err);
  } finally {
    release();
  }
}

async function completeChat(opts) {
  let out = "";
  await streamChat({
    ...opts,
    onDelta: (text) => {
      out += text;
    },
  });
  return out;
}

async function probeModel(draft) {
  const settings = resolveSettings(draft);
  if (!settings.baseUrl) {
    const error = new Error("请先填写模型 API 地址");
    error.status = 400;
    throw error;
  }
  if (!settings.model) {
    const error = new Error("请先填写模型名称");
    error.status = 400;
    throw error;
  }
  if (needsKey(settings.protocol) && !settings.apiKey) {
    const error = new Error("请先填写 Token");
    error.status = 400;
    throw error;
  }
  const wait = probeMs();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), wait);
  const started = Date.now();
  try {
    const text = await completeOnce(settings, {
      messages: [{ role: "user", content: "只回复：墨枢已接通。" }],
      temperature: 0,
      maxTokens: 32,
      thinking: false,
      signal: controller.signal,
    });
    return { ok: true, ms: Date.now() - started, at: new Date().toISOString(), reply: String(text || "").trim() };
  } catch (err) {
    const ms = Date.now() - started;
    const at = new Date().toISOString();
    if (err && err.name === "AbortError") {
      return {
        ok: false,
        ms,
        at,
        reason: `接口 ${seconds(wait)} 秒内没有响应（${endpointLabel(settings)}）`,
        status: 504,
        code: "LLM_TIMEOUT",
      };
    }
    return {
      ok: false,
      ms,
      at,
      reason: (err && err.message) || "探测失败",
      status: (err && err.status) || 500,
      code: (err && err.code) || "",
    };
  } finally {
    clearTimeout(timer);
  }
}

async function testChat(draft) {
  const result = await probeModel(draft);
  if (!result.ok) {
    const error = new Error(result.reason || "接口未接通");
    error.status = result.status || 502;
    if (result.code) error.code = result.code;
    throw error;
  }
  return result.reply || "已接通";
}

function modelsPlan(settings) {
  const protocol = normalizeProtocol(settings.protocol);
  if (protocol === "ollama") {
    return { url: `${settings.baseUrl}/api/tags`, headers: authHeaders(settings.apiKey, false) };
  }
  if (protocol === "anthropic") {
    return {
      url: `${settings.baseUrl}/models`,
      headers: {
        "x-api-key": settings.apiKey,
        "anthropic-version": "2023-06-01",
      },
    };
  }
  if (protocol === "gemini") {
    return {
      url: `${settings.baseUrl}/models`,
      headers: { "x-goog-api-key": settings.apiKey },
    };
  }
  return { url: `${settings.baseUrl}/models`, headers: authHeaders(settings.apiKey, false) };
}

function parseModelIds(json, protocol) {
  const rows = Array.isArray(json && json.data)
    ? json.data
    : Array.isArray(json && json.models)
      ? json.models
      : Array.isArray(json)
        ? json
        : [];
  return [...new Set(rows.map((row) => {
    if (typeof row === "string") return row.trim();
    let id = String((row && (row.id || row.name || row.model)) || "").trim();
    if (protocol === "gemini") id = id.replace(/^models\//, "");
    return id;
  }).filter(Boolean))];
}

async function listModels(draft = {}) {
  const settings = resolveSettings(draft);
  if (!settings.baseUrl) {
    const error = new Error("请先填写模型 API 地址");
    error.status = 400;
    throw error;
  }
  if (needsKey(settings.protocol) && !settings.apiKey) {
    const error = new Error("请先填写 Token");
    error.status = 400;
    throw error;
  }
  const plan = modelsPlan(settings);
  const wait = probeMs();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), wait);
  let response;
  try {
    response = await fetch(plan.url, {
      headers: plan.headers,
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if (err.name === "AbortError") {
      const error = new Error(`拉取模型列表超时（${seconds(wait)} 秒 · ${endpointLabel(settings)}）`);
      error.status = 504;
      error.code = "LLM_TIMEOUT";
      throw error;
    }
    throw networkError(settings, err);
  }
  clearTimeout(timer);
  if (!response.ok) {
    const detail = await response.text();
    const error = new Error(publicLlmError(response.status, detail));
    error.status = 502;
    error.httpStatus = response.status;
    if (modelsUnsupported(response.status, detail)) {
      error.code = "LLM_NO_MODELS_ENDPOINT";
      error.status = 501;
      error.message = "该接口不提供模型列表，请手动填写模型名";
    }
    throw error;
  }
  const json = await response.json();
  return parseModelIds(json, normalizeProtocol(settings.protocol));
}

module.exports = {
  streamChat,
  completeChat,
  testChat,
  probeModel,
  settingsReady,
  listModels,
  normalizeBaseUrl,
  classifyLlmError,
  retryConfig,
  parseRetryAfter,
  backoffDelay,
  timeoutConfig,
  endpointLabel,
  modelsUnsupported,
  requestPlan,
  resolveSettings,
};
