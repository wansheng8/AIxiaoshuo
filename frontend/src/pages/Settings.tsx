import { useEffect, useMemo, useState } from "react";
import { api } from "../data/api";
import { useAppState } from "../app-state";
import Meter, { formatWait, useWaitMeter } from "../components/Meter";
import ProbeBadge from "../components/ProbeBadge";
import { useProbe, type ProbeTarget } from "../data/use-probe";
import type { ModelProbe, ProtocolInfo, ProviderPublic, VendorPreset } from "../domain/types";

type Draft = {
  id: string;
  vendor: string;
  name: string;
  protocol: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  apiKeyMasked: string;
  note: string;
  contextLength: number;
  maxTokens: number;
  temperature: number;
  thinking: boolean;
  retryAttempts: number;
  retryBaseMs: number;
  retryMaxMs: number;
  models: string[];
  probes: Record<string, ModelProbe>;
};

const FALLBACK_PROTOCOLS: ProtocolInfo[] = [
  { id: "openai-chat", label: "OpenAI Chat 兼容", hint: "/chat/completions", auth: "bearer" },
  { id: "anthropic", label: "Anthropic Messages", hint: "/messages", auth: "x-api-key" },
  { id: "ollama", label: "Ollama", hint: "/api/chat", auth: "none" },
  { id: "gemini", label: "Google Gemini", hint: "/models:generateContent", auth: "query" },
];

const FALLBACK_VENDORS: VendorPreset[] = [
  { id: "deepseek", name: "DeepSeek", protocol: "openai-chat", baseUrl: "https://api.deepseek.com/v1", model: "deepseek-chat" },
  { id: "openai", name: "OpenAI", protocol: "openai-chat", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" },
  { id: "qwen", name: "通义千问", protocol: "openai-chat", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", model: "qwen-plus" },
  { id: "zhipu", name: "智谱 GLM", protocol: "openai-chat", baseUrl: "https://open.bigmodel.cn/api/paas/v4", model: "glm-4-flash" },
  { id: "kimi", name: "Kimi", protocol: "openai-chat", baseUrl: "https://api.moonshot.cn/v1", model: "moonshot-v1-auto" },
  { id: "siliconflow", name: "硅基流动", protocol: "openai-chat", baseUrl: "https://api.siliconflow.cn/v1", model: "" },
  { id: "openrouter", name: "OpenRouter", protocol: "openai-chat", baseUrl: "https://openrouter.ai/api/v1", model: "" },
  { id: "anthropic", name: "Anthropic", protocol: "anthropic", baseUrl: "https://api.anthropic.com/v1", model: "claude-sonnet-4-5" },
  { id: "gemini", name: "Gemini", protocol: "gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta", model: "gemini-2.0-flash" },
  { id: "ollama", name: "Ollama", protocol: "ollama", baseUrl: "http://127.0.0.1:11434", model: "" },
  { id: "oneapi", name: "One API", protocol: "openai-chat", baseUrl: "", model: "" },
  { id: "litellm", name: "LiteLLM", protocol: "openai-chat", baseUrl: "", model: "" },
  { id: "custom", name: "自定义", protocol: "openai-chat", baseUrl: "", model: "" },
];

function tmpId() {
  return `tmp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function fromPublic(row: ProviderPublic): Draft {
  return {
    id: row.id,
    vendor: row.vendor,
    name: row.name,
    protocol: row.protocol,
    baseUrl: row.baseUrl,
    model: row.model,
    apiKey: "",
    apiKeyMasked: row.apiKeyMasked,
    note: row.note,
    contextLength: row.contextLength,
    maxTokens: row.maxTokens,
    temperature: row.temperature,
    thinking: row.thinking,
    retryAttempts: row.retryAttempts ?? 3,
    retryBaseMs: row.retryBaseMs ?? 800,
    retryMaxMs: row.retryMaxMs ?? 15000,
    models: row.models || (row.model ? [row.model] : []),
    probes: row.probes || {},
  };
}

function fromVendor(vendor: VendorPreset): Draft {
  return {
    id: tmpId(),
    vendor: vendor.id,
    name: vendor.name,
    protocol: vendor.protocol,
    baseUrl: vendor.baseUrl,
    model: vendor.model,
    apiKey: "",
    apiKeyMasked: "",
    note: "",
    contextLength: 200000,
    maxTokens: 32000,
    temperature: 0.88,
    thinking: false,
    retryAttempts: 3,
    retryBaseMs: 800,
    retryMaxMs: 15000,
    models: vendor.model ? [vendor.model] : [],
    probes: {},
  };
}

function mergeModels(list: string[], current: string) {
  const ids = [...new Set((list || []).map((id) => id.trim()).filter(Boolean))];
  if (current && !ids.includes(current)) ids.unshift(current);
  return ids;
}

function endpointHint(protocol: string, baseUrl: string, model: string) {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  if (protocol === "ollama") return `${trimmed}/api/chat`;
  if (protocol === "anthropic") {
    const withV = /\/v\d+[a-z]*$/i.test(trimmed) ? trimmed : `${trimmed}/v1`;
    return `${withV}/messages`;
  }
  if (protocol === "gemini") {
    const name = model.trim() || "{model}";
    return `${trimmed}/models/${name}:generateContent`;
  }
  const withV = /\/v\d+[a-z]*$/i.test(trimmed) ? trimmed : `${trimmed}/v1`;
  return `${withV}/chat/completions`;
}

function protocolLabel(protocols: ProtocolInfo[], id: string) {
  return protocols.find((row) => row.id === id)?.label || id;
}

export default function Settings() {
  const { setConfigured } = useAppState();
  const [providers, setProviders] = useState<Draft[]>([]);
  const [activeId, setActiveId] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [vendors, setVendors] = useState<VendorPreset[]>(FALLBACK_VENDORS);
  const [protocols, setProtocols] = useState<ProtocolInfo[]>(FALLBACK_PROTOCOLS);
  const [models, setModels] = useState<string[]>([]);
  const [tokenHint, setTokenHint] = useState(false);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const wait = useWaitMeter(busy, 14000);
  const probe = useProbe((providerId, model, result) => {
    setProviders((list) =>
      list.map((row) => (row.id === providerId ? { ...row, probes: { ...(row.probes || {}), [model]: result } } : row))
    );
  });

  const selected = providers.find((row) => row.id === selectedId) || null;
  const proto = protocols.find((row) => row.id === selected?.protocol) || protocols[0];
  const keyOptional = proto?.auth === "none";
  const endpoint = useMemo(
    () => (selected ? endpointHint(selected.protocol, selected.baseUrl, selected.model) : ""),
    [selected]
  );

  function probeTarget(model: string): ProbeTarget | null {
    if (!selected || !model) return null;
    return {
      providerId: selected.id,
      model,
      baseUrl: selected.baseUrl,
      protocol: selected.protocol,
      apiKey: selected.apiKey || undefined,
    };
  }

  function probeRow(model: string) {
    const target = probeTarget(model);
    if (target) void probe.probeOne(target);
  }

  function probeAll() {
    if (!selected) return;
    const targets = mergeModels(models, selected.model)
      .map((model) => probeTarget(model))
      .filter((row): row is ProbeTarget => Boolean(row));
    void probe.probeMany(targets);
  }

  const probeBusy = Object.keys(probe.active).length > 0;
  const probeTotal = selected ? mergeModels(models, selected.model).filter(Boolean).length : 0;

  function patchSelected(partial: Partial<Draft>) {
    if (!selectedId) return;
    setProviders((list) => list.map((row) => (row.id === selectedId ? { ...row, ...partial } : row)));
  }

  useEffect(() => {
    let alive = true;
    api.settings().then(async (s) => {
      if (!alive) return;
      const rows = (s.providers || []).map(fromPublic);
      setVendors(s.catalog?.vendors?.length ? s.catalog.vendors : FALLBACK_VENDORS);
      setProtocols(s.catalog?.protocols?.length ? s.catalog.protocols : FALLBACK_PROTOCOLS);
      setProviders(rows);
      setActiveId(s.activeId || rows[0]?.id || "");
      setSelectedId(s.activeId || rows[0]?.id || "");
      setConfigured(Boolean(s.configured));
      const current = rows.find((row) => row.id === (s.activeId || rows[0]?.id));
      if (current?.baseUrl) {
        try {
          const r = await api.listModels({
            baseUrl: current.baseUrl,
            protocol: current.protocol,
            providerId: current.id.startsWith("tmp_") ? undefined : current.id,
          });
          if (!alive) return;
          setModels(mergeModels(r.models || [], current.model));
        } catch {
          if (alive) setModels([]);
        }
      }
    }).catch((err) => {
      if (alive) setMsg((err as Error).message || "配置加载失败");
    });
    return () => {
      alive = false;
    };
  }, [setConfigured]);

  function addVendor(vendor: VendorPreset) {
    const next = fromVendor(vendor);
    setProviders((list) => [...list, next]);
    setSelectedId(next.id);
    setModels(next.model ? [next.model] : []);
    setMsg(`已加入 ${vendor.name}。填完地址和模型后点「启用这家」，写章会走这一路。`);
  }

  function removeSelected() {
    if (!selected) return;
    const rest = providers.filter((row) => row.id !== selected.id);
    setProviders(rest);
    const nextId = rest[0]?.id || "";
    setSelectedId(nextId);
    if (activeId === selected.id) setActiveId(nextId);
    setModels([]);
    setMsg(rest.length ? "已从列表拿掉这一家，保存后生效。" : "列表已空。保存后写章会提示先接入供应商。");
  }

  async function save(nextActive?: string) {
    setBusy(true);
    try {
      const useActive = typeof nextActive === "string" ? nextActive : activeId;
      const oldIds = providers.map((row) => row.id);
      const s = await api.saveSettings({
        activeId: useActive,
        providers: providers.map((row) => ({
          id: row.id,
          vendor: row.vendor,
          name: row.name,
          protocol: row.protocol,
          baseUrl: row.baseUrl,
          model: row.model,
          apiKey: row.apiKey,
          note: row.note,
          contextLength: row.contextLength,
          maxTokens: row.maxTokens,
          temperature: row.temperature,
          thinking: row.thinking,
          retryAttempts: row.retryAttempts,
          retryBaseMs: row.retryBaseMs,
          retryMaxMs: row.retryMaxMs,
          models: row.models,
        })),
      });
      const rows = (s.providers || []).map(fromPublic);
      setProviders(rows);
      setActiveId(s.activeId || "");
      const keepIndex = oldIds.indexOf(selectedId);
      const keep = rows.find((row) => row.id === selectedId)?.id || rows[keepIndex]?.id || s.activeId || rows[0]?.id || "";
      setSelectedId(keep);
      setConfigured(Boolean(s.configured));
      setMsg(typeof nextActive === "string" ? "已启用这一家，并写入本地配置。" : "已写入本地配置。Token 只在服务端保存，页面仅显示掩码。");
    } catch (err) {
      setMsg((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    if (!selected) {
      setMsg("请先添加一家供应商");
      return;
    }
    setBusy(true);
    try {
      const r = await api.testSettings({
        baseUrl: selected.baseUrl,
        apiKey: selected.apiKey || undefined,
        protocol: selected.protocol,
        model: selected.model,
        providerId: selected.id.startsWith("tmp_") ? undefined : selected.id,
      });
      setMsg(r.reply || "已接通");
    } catch (err) {
      setMsg((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function pullModels() {
    if (!selected) return;
    setBusy(true);
    try {
      const r = await api.listModels({
        baseUrl: selected.baseUrl,
        apiKey: selected.apiKey || undefined,
        protocol: selected.protocol,
        providerId: selected.id.startsWith("tmp_") ? undefined : selected.id,
      });
      const ids = mergeModels(r.models || [], selected.model);
      setModels(ids);
      patchSelected({ models: ids, model: selected.model || ids[0] || "" });
      if (!r.models?.length) setMsg("接口已通，但没有返回模型名。可手动填写。");
      else setMsg(`已拉取 ${r.models.length} 个模型`);
    } catch (err) {
      setMsg((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <div className="settings-card bind-card">
        <span className="hero-kicker">模型聚合</span>
        <h2>接入多家供应商</h2>
        <p className="muted">
          把 DeepSeek、OpenAI、Ollama，以及 One API、LiteLLM 这类兼容网关收到一处。写章只用当前启用的那一家。各家按自己的接口协议说话。
        </p>

        <div className="bind-chips">
          {vendors.map((vendor) => (
            <button key={vendor.id} type="button" className="bind-chip" disabled={busy} onClick={() => addVendor(vendor)}>
              {vendor.name}
            </button>
          ))}
        </div>

        <div className="bind-shell">
          <aside className="bind-rail">
            {providers.length ? (
              providers.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  className={`pv-card ${row.id === selectedId ? "on" : ""} ${row.id === activeId ? "live" : ""}`}
                  onClick={() => {
                    setSelectedId(row.id);
                    setModels(mergeModels(row.models || [], row.model));
                  }}
                >
                  <strong>{row.name || "未命名"}</strong>
                  <em>{protocolLabel(protocols, row.protocol)}</em>
                  <span>{row.model || "未填模型"}</span>
                  {row.id === activeId ? <b>当前写章</b> : null}
                </button>
              ))
            ) : (
              <p className="bind-empty">从上方挑一家接入，或选自定义填自己的网关。</p>
            )}
          </aside>

          {selected ? (
            <div className="bind-form">
              <label className="field">
                <span>显示名称</span>
                <input value={selected.name} onChange={(e) => patchSelected({ name: e.target.value })} placeholder="这一路在列表里怎么叫" />
              </label>

              <label className="field">
                <span>接口协议</span>
                <select value={selected.protocol} onChange={(e) => patchSelected({ protocol: e.target.value })}>
                  {protocols.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>接口地址</span>
                <input
                  value={selected.baseUrl}
                  onChange={(e) => patchSelected({ baseUrl: e.target.value })}
                  placeholder={selected.protocol === "ollama" ? "http://127.0.0.1:11434" : "https://api.example.com/v1"}
                />
              </label>
              {endpoint ? <p className="bind-endpoint">{endpoint}</p> : null}

              <label className="field">
                <span className="bind-label">
                  API Token{keyOptional ? "（可空）" : ""}
                  <button type="button" className="bind-help" onClick={() => setTokenHint((v) => !v)}>
                    如何获得
                  </button>
                </span>
                <input
                  type="password"
                  value={selected.apiKey}
                  onChange={(e) => patchSelected({ apiKey: e.target.value })}
                  placeholder={
                    selected.apiKeyMasked
                      ? `当前 ${selected.apiKeyMasked}，留空则保持原 Token`
                      : keyOptional
                        ? "本地 Ollama 通常不用 Token"
                        : "请输入 API Token"
                  }
                />
              </label>
              {tokenHint ? (
                <p className="bind-hint">
                  {keyOptional
                    ? "Ollama 默认跑在本机 11434，一般不用密钥。若前面挂了反向鉴权，再把 Token 填上。"
                    : "在对应控制台或聚合网关复制 Token。密钥只保存在本机，探测和写章时由服务端携带。"}
                </p>
              ) : null}

              <label className="field">
                <span className="bind-label">
                  模型名称
                  <button type="button" className="bind-help" disabled={busy} onClick={pullModels}>
                    拉取列表
                  </button>
                  <button type="button" className="bind-help" disabled={busy || probeBusy || !models.length} onClick={probeAll}>
                    全部探测
                  </button>
                </span>
                <input
                  value={selected.model}
                  onChange={(e) => patchSelected({ model: e.target.value })}
                  onBlur={(e) => patchSelected({ models: mergeModels(models, e.target.value) })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      patchSelected({ models: mergeModels(models, (e.target as HTMLInputElement).value) });
                      (e.target as HTMLInputElement).blur();
                    }
                  }}
                  placeholder="填写或从下方点选模型名"
                  autoComplete="off"
                />
                {models.length ? (
                  <>
                    <ul className="bind-model-list" role="listbox">
                      {models.map((id) => {
                        const rowActive = Boolean(probe.active[`${selected.id}:${id}`]);
                        return (
                          <li
                            key={id}
                            role="option"
                            aria-selected={id === selected.model}
                            className={id === selected.model ? "on" : ""}
                            onClick={() => patchSelected({ model: id })}
                          >
                            <span className="bind-model-name">{id}</span>
                            <ProbeBadge probe={selected.probes?.[id]} />
                            <button
                              type="button"
                              className="bind-model-probe"
                              disabled={busy || rowActive || !selected.baseUrl}
                              onClick={(event) => {
                                event.stopPropagation();
                                probeRow(id);
                              }}
                            >
                              {rowActive ? "探测中" : "探测"}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                    {probe.progress ? (
                      <p className="bind-hint">
                        正在探测 {probe.progress.done}/{probe.progress.total}
                        <button type="button" className="bind-help" onClick={probe.stop}>
                          停止
                        </button>
                      </p>
                    ) : (
                      <p className="bind-hint">
                        绿点可用、红点不可用、灰点为未测。点「探测」逐条测，或点「全部探测」一次测完当前这 {probeTotal} 个模型。
                      </p>
                    )}
                  </>
                ) : (
                  <p className="bind-hint">点拉取列表，或直接填写模型名。写章时在顶栏两级菜单里切换。</p>
                )}
              </label>

              <label className="field">
                <span>备注</span>
                <input value={selected.note} onChange={(e) => patchSelected({ note: e.target.value })} placeholder="请输入备注（选填）" />
              </label>

              <div className="bind-pair">
                <label className="field">
                  <span>上下文长度</span>
                  <input
                    type="number"
                    min={1024}
                    max={1000000}
                    value={selected.contextLength}
                    onChange={(e) => patchSelected({ contextLength: Number(e.target.value) || 0 })}
                  />
                </label>
                <label className="field">
                  <span>输出长度</span>
                  <input
                    type="number"
                    min={256}
                    max={128000}
                    value={selected.maxTokens}
                    onChange={(e) => patchSelected({ maxTokens: Number(e.target.value) || 0 })}
                  />
                </label>
                <label className="field">
                  <span>温度</span>
                  <input
                    type="number"
                    min={0}
                    max={2}
                    step={0.01}
                    value={selected.temperature}
                    onChange={(e) => patchSelected({ temperature: Number(e.target.value) })}
                  />
                </label>
              </div>

              <div className="bind-pair">
                <label className="field">
                  <span>失败重试次数</span>
                  <input
                    type="number"
                    min={1}
                    max={8}
                    value={selected.retryAttempts}
                    onChange={(e) => patchSelected({ retryAttempts: Number(e.target.value) || 0 })}
                  />
                </label>
                <label className="field">
                  <span>退避基数（毫秒）</span>
                  <input
                    type="number"
                    min={100}
                    max={10000}
                    step={100}
                    value={selected.retryBaseMs}
                    onChange={(e) => patchSelected({ retryBaseMs: Number(e.target.value) || 0 })}
                  />
                </label>
                <label className="field">
                  <span>退避上限（毫秒）</span>
                  <input
                    type="number"
                    min={500}
                    max={60000}
                    step={500}
                    value={selected.retryMaxMs}
                    onChange={(e) => patchSelected({ retryMaxMs: Number(e.target.value) || 0 })}
                  />
                </label>
              </div>
              <p className="bind-hint">只在首个 token 之前重试。限流（429）、服务端 5xx 和网络错误会退避重试；Token 错误、安全拦截、普通 400 不重试。</p>

              <div className="field">
                <span>推理 / 思考</span>
                <button
                  type="button"
                  className={`bind-toggle ${selected.thinking ? "on" : ""}`}
                  onClick={() => patchSelected({ thinking: !selected.thinking })}
                  aria-pressed={selected.thinking}
                >
                  <em>启用</em>
                  <i />
                </button>
              </div>

              {selected.id !== activeId ? (
                <p className="bind-hint">探测和写章都走带「当前写章」标记的这一路。点启用这家会一并保存。</p>
              ) : null}
            </div>
          ) : null}
        </div>

        {busy ? (
          <Meter percent={wait.percent} label={`正在连接模型 · ${formatWait(wait.elapsed)}`} running />
        ) : null}
        <div className="row-actions">
          <button className="btn-mint" disabled={busy} onClick={() => void save()}>
            保存
          </button>
          <button
            className="btn-ghost"
            disabled={busy || !selected}
            onClick={() => {
              if (selected) void save(selected.id);
            }}
          >
            启用这家
          </button>
          <button className="btn-ghost" disabled={busy || !selected} onClick={removeSelected}>
            拿掉
          </button>
          <button className="btn-ghost" disabled={busy} onClick={test}>
            探测接口
          </button>
        </div>
        {msg && <p className="settings-msg">{msg}</p>}
      </div>
    </div>
  );
}
