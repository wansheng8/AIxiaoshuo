const { getSettings } = require("./store");
const { needsKey, normalizeProtocol, providerReady } = require("./providers");

function normalizeBaseUrl(baseUrl, protocol) {
  const trimmed = String(baseUrl || "").replace(/\/+$/, "");
  if (!trimmed) return "";
  const kind = normalizeProtocol(protocol);
  if (kind === "ollama") return trimmed.replace(/\/api$/i, "");
  if (kind === "gemini") return trimmed;
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

function requestPlan(settings, { messages, temperature, stream, maxTokens, thinking }) {
  const protocol = normalizeProtocol(settings.protocol);
  const think = thinking == null ? Boolean(settings.thinking) : Boolean(thinking);
  const cap = Math.min(Number(maxTokens || settings.maxTokens) || 0, 8192);
  const fitted = fitMessages(messages, settings.contextLength, maxTokens || settings.maxTokens);

  if (protocol === "anthropic") {
    const system = fitted.filter((row) => row.role === "system").map((row) => row.content).join("\n\n");
    let rest = collapseRoles(fitted.filter((row) => row.role !== "system"), "assistant");
    if (!rest.length) rest = [{ role: "user", content: "请开始。" }];
    if (rest[0].role !== "user") rest.unshift({ role: "user", content: "请继续。" });
    const body = {
      model: settings.model,
      max_tokens: Math.max(256, cap || 1024),
      temperature,
      messages: rest.map((row) => ({ role: row.role, content: row.content })),
      stream: Boolean(stream),
    };
    if (system) body.system = system;
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
        num_ctx: settings.contextLength,
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
    return { content: parts.map((part) => part.text || "").join(""), reasoning: "" };
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
    const parts = json && json.candidates && json.candidates[0] && json.candidates[0].content
      ? json.candidates[0].content.parts || []
      : [];
    return parts.map((part) => part.text || "").join("");
  }
  return extractDelta(json, protocol).content;
}

function publicLlmError(status, detail) {
  const text = String(detail || "");
  if (/safety|content[_ ]?filter|blocked|prohibited|违规|敏感|风控/i.test(text)) {
    return "内容被上游安全策略拦截，改一下措辞再试";
  }
  if (/api[_-]?key|authorization|bearer|sk-|token/i.test(text)) {
    if (status === 401) return "Token 无效，去设置页核对";
    return `大模型接口错误 ${status}`;
  }
  if (status === 401 || status === 403) return "Token 无效或无权限，去设置页核对";
  if (status === 429) return "调用过于频繁，稍后再试";
  if (status === 408 || status === 504) return "大模型响应超时，稍后再试";
  if (status >= 500) return "大模型服务暂时不可用";
  return `大模型接口错误 ${status}`;
}

function classifyLlmError(status, detail) {
  const code = Number(status) || 0;
  const text = String(detail || "");
  if (code === 401 || code === 403) return { kind: "auth", retryable: false, status: code };
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
    return { kind: "bad_request", retryable: false, status: code };
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

async function readSse(response, protocol, onDelta, signal, onActivity) {
  let sawToken = false;
  await pumpLines(
    response,
    (line) => {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) return;
      const data = trimmed.slice(5).trim();
      if (!data || data === "[DONE]") return;
      try {
        const json = JSON.parse(data);
        const { content, reasoning } = extractDelta(json, protocol);
        if (content) {
          sawToken = true;
          onDelta(content);
        } else if (reasoning && onActivity) {
          onActivity();
        }
      } catch {
        // ignore malformed keep-alive
      }
    },
    signal,
    onActivity
  );
  return sawToken;
}

async function readNdjson(response, protocol, onDelta, signal, onActivity) {
  let sawToken = false;
  await pumpLines(
    response,
    (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      try {
        const json = JSON.parse(trimmed);
        const { content, reasoning } = extractDelta(json, protocol);
        if (content) {
          sawToken = true;
          onDelta(content);
        } else if (reasoning && onActivity) {
          onActivity();
        }
      } catch {
        // ignore keep-alive
      }
    },
    signal,
    onActivity
  );
  return sawToken;
}

async function completeOnce(settings, { messages, temperature, maxTokens, signal, thinking }) {
  const plan = requestPlan(settings, { messages, temperature, maxTokens, thinking, stream: false });
  const response = await fetch(plan.url, {
    method: "POST",
    headers: plan.headers,
    body: JSON.stringify(plan.body),
    signal,
  });
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
  const json = await response.json();
  return extractComplete(json, plan.protocol);
}

async function streamChat({ messages, temperature, signal, onDelta, timeoutMs, idleMs, maxTokens, thinking }) {
  const settings = settingsReady();
  const protocol = normalizeProtocol(settings.protocol);
  const temp = temperature == null ? settings.temperature : temperature;
  const think = thinking == null ? Boolean(settings.thinking) : Boolean(thinking);
  const firstWait = timeoutMs || (think ? 120000 : 45000);
  const idleWait = idleMs || (think ? 180000 : 60000);
  const controller = new AbortController();
  let timedOut = false;
  let timer = null;
  const arm = (ms) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, ms);
  };
  arm(firstWait);
  const onAbort = () => controller.abort();
  if (signal) signal.addEventListener("abort", onAbort);

  const failAbort = (err) => {
    clearTimeout(timer);
    if (signal) signal.removeEventListener("abort", onAbort);
    if (err && err.name === "AbortError") {
      const error = new Error(timedOut ? "大模型超时未返回内容" : "已停止生成");
      error.status = timedOut ? 504 : 499;
      throw error;
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

  const retry = retryConfig(settings);
  let response = null;
  let networkError = null;
  let failStatus = 0;
  let failDetail = "";
  for (let attempt = 1; attempt <= retry.attempts; attempt += 1) {
    response = null;
    networkError = null;
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
      networkError = err;
    }
    if (response && response.ok) break;
    if (timedOut || (signal && signal.aborted)) break;
    let retryAfter = 0;
    let canRetry = Boolean(networkError);
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

  if (!response && networkError && !failStatus) {
    clearTimeout(timer);
    if (signal) signal.removeEventListener("abort", onAbort);
    const error = new Error("连接大模型失败，请检查网络或接口地址");
    error.status = 502;
    error.code = "LLM_NETWORK";
    throw error;
  }

  if (!response) {
    if (!timedOut && !(signal && signal.aborted) && looksLikeStreamReject(failStatus, failDetail)) {
      try {
        arm(firstWait);
        await pumpComplete();
        clearTimeout(timer);
        if (signal) signal.removeEventListener("abort", onAbort);
        return;
      } catch (err) {
        failAbort(err);
      }
    }
    clearTimeout(timer);
    if (signal) signal.removeEventListener("abort", onAbort);
    const error = new Error(publicLlmError(failStatus, failDetail));
    error.status = 502;
    throw error;
  }

  if (!shouldReadAsStream(response, protocol)) {
    try {
      const json = await response.json();
      const text = extractComplete(json, protocol);
      if (text) onDelta(text);
      clearTimeout(timer);
      if (signal) signal.removeEventListener("abort", onAbort);
      return;
    } catch (err) {
      failAbort(err);
    }
  }

  let first = true;
  let sawToken = false;
  const reader = protocol === "ollama" ? readNdjson : readSse;
  try {
    sawToken = await reader(
      response,
      protocol,
      (text) => {
        if (first) first = false;
        arm(idleWait);
        onDelta(text);
      },
      controller.signal,
      () => {
        first = false;
        arm(idleWait);
      }
    );
    if (timedOut && !sawToken) {
      const error = new Error("大模型超时未返回内容");
      error.status = 504;
      throw error;
    }
    if (!sawToken && !timedOut && !(signal && signal.aborted)) {
      arm(firstWait);
      await pumpComplete();
    }
  } catch (err) {
    if (!sawToken && !timedOut && !(signal && signal.aborted) && err && err.status !== 504) {
      try {
        arm(firstWait);
        await pumpComplete();
      } catch (inner) {
        failAbort(inner);
      }
    } else {
      failAbort(err);
    }
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener("abort", onAbort);
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

async function testChat(draft) {
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
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const text = await completeOnce(settings, {
      messages: [{ role: "user", content: "只回复：墨枢已接通。" }],
      temperature: 0,
      maxTokens: 32,
      thinking: false,
      signal: controller.signal,
    });
    return text || "已接通";
  } catch (err) {
    if (err.name === "AbortError") {
      const error = new Error("探测超时，接口没有在时限内返回");
      error.status = 504;
      throw error;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
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
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  let response;
  try {
    response = await fetch(plan.url, {
      headers: plan.headers,
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if (err.name === "AbortError") {
      const error = new Error("拉取模型列表超时");
      error.status = 504;
      throw error;
    }
    throw err;
  }
  clearTimeout(timer);
  if (!response.ok) {
    const detail = await response.text();
    const error = new Error(publicLlmError(response.status, detail));
    error.status = 502;
    throw error;
  }
  const json = await response.json();
  return parseModelIds(json, normalizeProtocol(settings.protocol));
}

module.exports = { streamChat, completeChat, testChat, settingsReady, listModels, normalizeBaseUrl, classifyLlmError, retryConfig, parseRetryAfter, backoffDelay };
