const PROTOCOLS = [
  { id: "openai-chat", label: "OpenAI Chat 兼容", hint: "/chat/completions", auth: "bearer" },
  { id: "anthropic", label: "Anthropic Messages", hint: "/messages", auth: "x-api-key" },
  { id: "ollama", label: "Ollama", hint: "/api/chat", auth: "none" },
  { id: "gemini", label: "Google Gemini", hint: "/models:generateContent", auth: "query" },
];

const VENDORS = [
  { id: "deepseek", name: "DeepSeek", protocol: "openai-chat", baseUrl: "https://api.deepseek.com/v1", model: "deepseek-chat" },
  { id: "openai", name: "OpenAI", protocol: "openai-chat", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" },
  { id: "qwen", name: "通义千问", protocol: "openai-chat", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", model: "qwen-plus" },
  { id: "zhipu", name: "智谱 GLM", protocol: "openai-chat", baseUrl: "https://open.bigmodel.cn/api/paas/v4", model: "glm-4-flash" },
  { id: "kimi", name: "Kimi", protocol: "openai-chat", baseUrl: "https://api.moonshot.cn/v1", model: "moonshot-v1-auto" },
  { id: "siliconflow", name: "硅基流动", protocol: "openai-chat", baseUrl: "https://api.siliconflow.cn/v1", model: "" },
  { id: "openrouter", name: "OpenRouter", protocol: "openai-chat", baseUrl: "https://openrouter.ai/api/v1", model: "" },
  { id: "groq", name: "Groq", protocol: "openai-chat", baseUrl: "https://api.groq.com/openai/v1", model: "" },
  { id: "anthropic", name: "Anthropic", protocol: "anthropic", baseUrl: "https://api.anthropic.com/v1", model: "claude-sonnet-4-5" },
  { id: "gemini", name: "Gemini", protocol: "gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta", model: "gemini-2.0-flash" },
  { id: "ollama", name: "Ollama", protocol: "ollama", baseUrl: "http://127.0.0.1:11434", model: "" },
  { id: "modelsquare", name: "模型广场", protocol: "openai-chat", baseUrl: "https://model-square.app.baizhi.cloud/v1", model: "" },
  { id: "oneapi", name: "One API", protocol: "openai-chat", baseUrl: "", model: "" },
  { id: "litellm", name: "LiteLLM", protocol: "openai-chat", baseUrl: "", model: "" },
  { id: "custom", name: "自定义", protocol: "openai-chat", baseUrl: "", model: "" },
];

const PROTOCOL_IDS = new Set(PROTOCOLS.map((row) => row.id));
const VENDOR_MAP = Object.fromEntries(VENDORS.map((row) => [row.id, row]));

function clampInt(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function clampTemp(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0.88;
  return Math.min(2, Math.max(0, Math.round(n * 100) / 100));
}

function normalizeProtocol(value) {
  const id = String(value || "").trim();
  return PROTOCOL_IDS.has(id) ? id : "openai-chat";
}

function needsKey(protocol) {
  return normalizeProtocol(protocol) !== "ollama";
}

function guessVendor(baseUrl) {
  const u = String(baseUrl || "").toLowerCase();
  const hits = [
    ["deepseek.com", "deepseek"],
    ["api.openai.com", "openai"],
    ["dashscope.aliyuncs.com", "qwen"],
    ["bigmodel.cn", "zhipu"],
    ["moonshot.cn", "kimi"],
    ["siliconflow.cn", "siliconflow"],
    ["openrouter.ai", "openrouter"],
    ["groq.com", "groq"],
    ["anthropic.com", "anthropic"],
    ["googleapis.com", "gemini"],
    ["baizhi.cloud", "modelsquare"],
    [":11434", "ollama"],
  ];
  for (const [needle, id] of hits) {
    if (u.includes(needle)) return id;
  }
  return "custom";
}

function vendorName(vendor, fallback) {
  if (VENDOR_MAP[vendor]) return VENDOR_MAP[vendor].name;
  return String(fallback || "自定义").trim() || "自定义";
}

function blankProvider() {
  return {
    id: "",
    vendor: "custom",
    name: "",
    protocol: "openai-chat",
    baseUrl: "",
    model: "",
    apiKey: "",
    note: "",
    contextLength: 200000,
    maxTokens: 32000,
    temperature: 0.88,
    thinking: false,
    retryAttempts: 3,
    retryBaseMs: 800,
    retryMaxMs: 15000,
    models: [],
    probes: {},
  };
}

function cleanModels(list, model) {
  const ids = (Array.isArray(list) ? list : []).map((item) => String(item || "").trim()).filter(Boolean);
  const current = String(model || "").trim();
  if (current) ids.unshift(current);
  return [...new Set(ids)];
}

const PROBE_TTL_MS = 12 * 60 * 60 * 1000;

function probeTtlMs() {
  const raw = Number(process.env.MODEL_PROBE_TTL_MS);
  if (!Number.isFinite(raw) || raw <= 0) return PROBE_TTL_MS;
  return Math.min(7 * 24 * 60 * 60 * 1000, Math.max(60 * 1000, Math.round(raw)));
}

function cleanProbes(map, models) {
  const allowed = new Set(cleanModels(models));
  const out = {};
  if (!map || typeof map !== "object") return out;
  for (const [model, value] of Object.entries(map)) {
    if (!allowed.has(model)) continue;
    if (!value || typeof value !== "object") continue;
    out[model] = {
      ok: Boolean(value.ok),
      ms: Math.max(0, Math.round(Number(value.ms) || 0)),
      reason: String(value.reason || ""),
      at: String(value.at || ""),
    };
  }
  return out;
}

function normalizeProvider(row, fallbackKey, prev) {
  const vendor = String((row && row.vendor) || "custom").trim() || "custom";
  const preset = VENDOR_MAP[vendor];
  const modelsSource = Array.isArray(row && row.models) ? row.models : (prev && prev.models) || [];
  const models = cleanModels(modelsSource, (row && row.model) || (prev && prev.model));
  const probesSource = (row && row.probes) || (prev && prev.probes) || {};
  return {
    id: String((row && row.id) || "").trim(),
    vendor,
    name: String((row && row.name) || (preset && preset.name) || "自定义").trim() || "自定义",
    protocol: normalizeProtocol((row && row.protocol) || (preset && preset.protocol)),
    baseUrl: String((row && row.baseUrl) || "").trim(),
    model: String((row && row.model) || "").trim(),
    apiKey: String((row && row.apiKey) || fallbackKey || "").trim(),
    note: String((row && row.note) || "").trim(),
    contextLength: clampInt(row && row.contextLength, 200000, 1024, 1000000),
    maxTokens: clampInt(row && row.maxTokens, 32000, 256, 128000),
    temperature: clampTemp(row && row.temperature),
    thinking: Boolean(row && row.thinking),
    retryAttempts: clampInt(row && row.retryAttempts, 3, 1, 8),
    retryBaseMs: clampInt(row && row.retryBaseMs, 800, 100, 10000),
    retryMaxMs: clampInt(row && row.retryMaxMs, 15000, 500, 60000),
    models,
    probes: cleanProbes(probesSource, models),
  };
}

function hydrateSettings(file, uidFn) {
  const raw = file && typeof file === "object" ? file : {};
  if (Array.isArray(raw.providers) && raw.providers.length) {
    const providers = raw.providers.map((row) => {
      const next = normalizeProvider(row);
      if (!next.id) next.id = uidFn("pv");
      return next;
    });
    const activeId = providers.some((p) => p.id === raw.activeId) ? raw.activeId : providers[0].id;
    return { providers, activeId };
  }
  if (raw.baseUrl || raw.model || raw.apiKey) {
    const vendor = guessVendor(raw.baseUrl);
    const provider = normalizeProvider({
      ...raw,
      id: "pv_legacy",
      vendor,
      name: vendorName(vendor, raw.note),
    });
    return { providers: [provider], activeId: provider.id };
  }
  return { providers: [], activeId: "" };
}

function providerReady(row) {
  if (!row) return false;
  if (!String(row.baseUrl || "").trim() || !String(row.model || "").trim()) return false;
  if (needsKey(row.protocol) && !String(row.apiKey || "").trim()) return false;
  return true;
}

const CATALOG = { protocols: PROTOCOLS, vendors: VENDORS };

module.exports = {
  CATALOG,
  PROTOCOLS,
  VENDORS,
  blankProvider,
  cleanProbes,
  guessVendor,
  hydrateSettings,
  needsKey,
  normalizeProtocol,
  normalizeProvider,
  probeTtlMs,
  providerReady,
  vendorName,
};
