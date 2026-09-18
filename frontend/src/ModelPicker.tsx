import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "./api";
import { useAppState } from "./app-state";
import { familyOf, groupModels, shortModel, stampOf, type ModelEntry, type ModelGroup } from "./model-groups";
import ProbeBadge from "./ProbeBadge";
import { useProbe, type ProbeTarget } from "./use-probe";
import type { ProviderPublic, Settings } from "./types";

function mergeIds(list: string[], current: string) {
  const ids = [...new Set((list || []).map((id) => id.trim()).filter(Boolean))];
  if (current && !ids.includes(current)) ids.unshift(current);
  return ids;
}

function payloadFrom(settings: Settings, patch: (row: ProviderPublic) => ProviderPublic, activeId: string) {
  return {
    activeId,
    providers: (settings.providers || []).map((row) => {
      const next = patch(row);
      return {
        id: next.id,
        vendor: next.vendor,
        name: next.name,
        protocol: next.protocol,
        baseUrl: next.baseUrl,
        model: next.model,
        models: next.models || [],
        note: next.note,
        contextLength: next.contextLength,
        maxTokens: next.maxTokens,
        temperature: next.temperature,
        thinking: next.thinking,
      };
    }),
  };
}

export default function ModelPicker() {
  const { setConfigured } = useAppState();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [groupId, setGroupId] = useState("");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const probe = useProbe((providerId, model, result) => {
    setSettings((prev) =>
      prev
        ? {
            ...prev,
            providers: (prev.providers || []).map((row) =>
              row.id === providerId ? { ...row, probes: { ...(row.probes || {}), [model]: result } } : row
            ),
          }
        : prev
    );
  });

  const providers = settings?.providers || [];
  const groups = useMemo(() => groupModels(providers), [providers]);
  const active = providers.find((row) => row.id === settings?.activeId) || providers[0];
  const currentModel = active?.model || settings?.model || "";
  const currentFamily = currentModel ? familyOf(currentModel).label : active?.name || "未接入";
  const activeGroup = groups.find((row) => row.id === groupId) || groups[0] || null;

  async function load() {
    const next = await api.settings();
    setSettings(next);
    setConfigured(Boolean(next.configured));
    const nextGroups = groupModels(next.providers || []);
    const current = (next.providers || []).find((row) => row.id === next.activeId);
    const fam = current?.model ? familyOf(current.model).id : nextGroups[0]?.id || "";
    setGroupId((prev) => (nextGroups.some((row) => row.id === prev) ? prev : fam));
    return next;
  }

  useEffect(() => {
    load().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!open) return;
    load().catch(() => undefined);
    const onDoc = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function persist(next: Settings, providerId: string, model: string, models?: string[]) {
    const saved = await api.saveSettings(
      payloadFrom(
        next,
        (row) =>
          row.id === providerId
            ? { ...row, model, models: mergeIds(models || row.models || [], model) }
            : row,
        providerId
      )
    );
    setSettings(saved);
    setConfigured(Boolean(saved.configured));
    return saved;
  }

  async function pick(model: string, providerId: string) {
    if (!settings || !model || busy) return;
    setBusy(true);
    try {
      await persist(settings, providerId, model);
      setOpen(false);
      setMsg("");
    } catch (err) {
      setMsg((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function pullGroup(group: ModelGroup) {
    const providerId = group.items[0]?.providerId;
    const provider = providers.find((row) => row.id === providerId);
    if (!provider || !settings) return;
    setBusy(true);
    try {
      const r = await api.listModels({
        baseUrl: provider.baseUrl,
        protocol: provider.protocol,
        providerId: provider.id.startsWith("tmp_") ? undefined : provider.id,
      });
      const models = mergeIds(r.models || [], provider.model);
      const nextModel = provider.model || models[0] || "";
      const saved = await persist(settings, provider.id, nextModel, models);
      const nextGroups = groupModels(saved.providers || []);
      const keep = nextGroups.some((row) => row.id === group.id) ? group.id : familyOf(nextModel).id;
      setGroupId(nextGroups.some((row) => row.id === keep) ? keep : nextGroups[0]?.id || "");
      if (!models.length) setMsg("接口已通，但没有返回模型名。可在右侧手填。");
      else setMsg(`已拉取 ${models.length} 个模型`);
    } catch (err) {
      setMsg((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function submitDraft() {
    const name = draft.trim();
    if (!name || !activeGroup || !settings) return;
    const providerId = activeGroup.items[0]?.providerId || active?.id;
    if (!providerId) return;
    setBusy(true);
    try {
      await persist(settings, providerId, name);
      setDraft("");
      setOpen(false);
    } catch (err) {
      setMsg((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function targetOf(item: ModelEntry): ProbeTarget | null {
    const provider = providers.find((row) => row.id === item.providerId);
    if (!provider || !item.model) return null;
    return { providerId: provider.id, model: item.model, baseUrl: provider.baseUrl, protocol: provider.protocol };
  }

  function probeGroup(group: ModelGroup) {
    const targets = group.items.map(targetOf).filter((row): row is ProbeTarget => Boolean(row));
    void probe.probeMany(targets);
  }

  const empty = !providers.length;

  return (
    <div className="pick" ref={rootRef}>
      <button
        type="button"
        className={`pick-trigger ${open ? "on" : ""}`}
        onClick={() => setOpen((v) => !v)}
        title="选择写章模型"
      >
        <i>{stampOf(currentFamily)}</i>
        <span>
          <em>{currentFamily}</em>
          <b>{currentModel ? shortModel(currentModel, 16) : "选择模型"}</b>
        </span>
        <u />
      </button>
      {open ? (
        <div className="pick-pop">
          {empty ? (
            <div className="pick-empty">
              <p>还没有接入供应商。</p>
              <Link to="/settings" onClick={() => setOpen(false)}>
                去设置接入
              </Link>
            </div>
          ) : (
            <>
              <div className="pick-left">
                {groups.map((group) => (
                  <button
                    key={group.id}
                    type="button"
                    className={`pick-group ${group.id === activeGroup?.id ? "on" : ""}`}
                    onClick={() => {
                      setGroupId(group.id);
                      setMsg("");
                    }}
                  >
                    <i>{stampOf(group.label)}</i>
                    <span>
                      <strong>{group.label}</strong>
                      <em>{group.hint}</em>
                    </span>
                    <b />
                  </button>
                ))}
              </div>
              <div className="pick-right">
                <div className="pick-head">
                  <strong>{activeGroup?.label || "模型"}</strong>
                  <div className="pick-head-actions">
                    <button type="button" disabled={busy || !activeGroup} onClick={() => activeGroup && pullGroup(activeGroup)}>
                      {busy ? "拉取中" : "刷新列表"}
                    </button>
                    <button
                      type="button"
                      disabled={busy || !activeGroup || (!probe.progress && !(activeGroup?.items || []).some((item) => item.model))}
                      onClick={() => {
                        if (probe.progress) probe.stop();
                        else if (activeGroup) probeGroup(activeGroup);
                      }}
                    >
                      {probe.progress ? `停止 ${probe.progress.done}/${probe.progress.total}` : "全部探测"}
                    </button>
                  </div>
                </div>
                <ul className="pick-list">
                  {(activeGroup?.items || [])
                    .filter((item) => item.model)
                    .map((item) => {
                      const on = item.providerId === active?.id && item.model === currentModel;
                      const rowActive = Boolean(probe.active[`${item.providerId}:${item.model}`]);
                      return (
                        <li key={`${item.providerId}:${item.model}`}>
                          <button type="button" className={on ? "on" : ""} disabled={busy} onClick={() => pick(item.model, item.providerId)}>
                            <i>{stampOf(familyOf(item.model).label)}</i>
                            <span>
                              <b>{item.model}</b>
                              <em>
                                {item.providerName}
                                {rowActive ? " · 探测中" : ""}
                              </em>
                            </span>
                            <span className="pick-tail">
                              {on ? <u>在用</u> : null}
                              <ProbeBadge probe={item.probe} />
                            </span>
                          </button>
                        </li>
                      );
                    })}
                </ul>
                {!(activeGroup?.items || []).some((item) => item.model) ? (
                  <p className="pick-miss">这一组还没有模型名。点刷新列表，或在下面手填。</p>
                ) : null}
                <form
                  className="pick-draft"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void submitDraft();
                  }}
                >
                  <input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="手填模型名后回车"
                    autoComplete="off"
                  />
                  <button type="submit" disabled={busy || !draft.trim()}>
                    用这个
                  </button>
                </form>
                {msg ? <p className="pick-msg">{msg}</p> : null}
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
