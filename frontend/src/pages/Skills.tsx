import { useEffect, useRef, useState } from "react";
import { api } from "../data/api";
import type { CraftOverride, Element, Skill, SkillHistoryItem } from "../domain/types";
import { TARGETS, PIPE_SKILL_IDS, groupSkills, sortedSkills, stageOf } from "../domain/pipeline";
import Meter, { formatWait, useWaitMeter } from "../components/Meter";
import { PromptPreview } from "../components/PromptPreview";

const empty = {
  name: "",
  scene: "",
  target: "content",
  body: "",
  elements: [] as string[],
  tags: [] as string[],
  whenFlow: [] as string[],
  whenPlatform: [] as string[],
  whenVoice: "",
};

function listText(value?: string[]) {
  return (value || []).join(", ");
}

function parseList(value: string) {
  return value
    .split(/[,，、]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

type DiffRow = { type: "same" | "add" | "del"; text: string };

function diffLines(prev: string, next: string): DiffRow[] {
  const a = String(prev || "").split("\n");
  const b = String(next || "").split("\n");
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const rows: DiffRow[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      rows.push({ type: "same", text: a[i] });
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      rows.push({ type: "del", text: a[i] });
      i += 1;
    } else {
      rows.push({ type: "add", text: b[j] });
      j += 1;
    }
  }
  while (i < n) rows.push({ type: "del", text: a[i++] });
  while (j < m) rows.push({ type: "add", text: b[j++] });
  return rows;
}

function ConditionFields({
  value,
  onChange,
}: {
  value: { tags: string[]; whenFlow: string[]; whenPlatform: string[]; whenVoice: string };
  onChange: (next: { tags: string[]; whenFlow: string[]; whenPlatform: string[]; whenVoice: string }) => void;
}) {
  return (
    <div className="skill-cond">
      <label className="field">
        <span>检索标签（逗号分隔）</span>
        <input
          value={listText(value.tags)}
          onChange={(e) => onChange({ ...value, tags: parseList(e.target.value) })}
          placeholder="钩子, 爽点, 都市"
        />
      </label>
      <label className="field">
        <span>仅在流派（id，逗号分隔，留空不限）</span>
        <input
          value={listText(value.whenFlow)}
          onChange={(e) => onChange({ ...value, whenFlow: parseList(e.target.value) })}
          placeholder="system, horror"
        />
      </label>
      <label className="field">
        <span>仅在平台（id，逗号分隔，留空不限）</span>
        <input
          value={listText(value.whenPlatform)}
          onChange={(e) => onChange({ ...value, whenPlatform: parseList(e.target.value) })}
          placeholder="fanqie, qidian"
        />
      </label>
      <label className="field">
        <span>个人文风条件</span>
        <select value={value.whenVoice} onChange={(e) => onChange({ ...value, whenVoice: e.target.value })}>
          <option value="">不限</option>
          <option value="active">仅文风启用时</option>
          <option value="off">仅文风关闭时</option>
        </select>
      </label>
    </div>
  );
}

function skillElementIds(skill: Skill): string[] {
  return Array.isArray(skill.elements) ? skill.elements : skill.defaultElements || [];
}

function download(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function SkillsPage() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [crafts, setCrafts] = useState<CraftOverride[]>([]);
  const [current, setCurrent] = useState<Skill | null>(null);
  const [form, setForm] = useState(empty);
  const [creating, setCreating] = useState(false);
  const [msg, setMsg] = useState("");
  const [idea, setIdea] = useState("");
  const [busy, setBusy] = useState(false);
  const [mobile, setMobile] = useState<"list" | "edit">("list");
  const [view, setView] = useState<"compare" | "full">("compare");
  const wait = useWaitMeter(busy, 22000);
  const [query, setQuery] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [viewMode, setViewMode] = useState<"group" | "order">("group");
  const [history, setHistory] = useState<SkillHistoryItem[] | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [diffFor, setDiffFor] = useState<string | null>(null);
  const [diffRows, setDiffRows] = useState<DiffRow[] | null>(null);
  const [craftOpen, setCraftOpen] = useState(false);
  const [elements, setElements] = useState<Element[]>([]);
  const [elementEdit, setElementEdit] = useState<Element | null>(null);
  const [elementCreating, setElementCreating] = useState(false);
  const [elementDraft, setElementDraft] = useState({ name: "", desc: "", body: "", scope: "all" });
  const importRef = useRef<HTMLInputElement | null>(null);
  const importMdRef = useRef<HTMLInputElement | null>(null);

  async function load() {
    const list = await api.skills();
    const visible = list.filter((s) => !/^tdcraft_/.test(s.id));
    setSkills(visible);
    setCurrent((prev) => visible.find((s) => s.id === prev?.id) || visible[0] || null);
    api
      .craftOverrides()
      .then(setCrafts)
      .catch(() => setCrafts([]));
    api
      .elements()
      .then(setElements)
      .catch(() => setElements([]));
  }

  useEffect(() => {
    load().catch((err) => setMsg(err.message));
  }, []);

  const shown = sortedSkills(
    skills.filter((skill) => {
      if (tagFilter && !(skill.tags || []).includes(tagFilter)) return false;
      const q = query.trim().toLowerCase();
      if (!q) return true;
      const hay = `${skill.name}${skill.scene}${skill.id}${(skill.tags || []).join(" ")}${skill.body}`.toLowerCase();
      return hay.includes(q);
    })
  );

  const allTags = Array.from(new Set(skills.flatMap((skill) => skill.tags || []))).sort((a, b) => a.localeCompare(b, "zh"));

  async function saveCustom() {
    const name = (creating ? form.name : current?.name || "").trim();
    const body = (creating ? form.body : current?.body || "").trim();
    if (!name) {
      setMsg("请先填名称");
      return;
    }
    if (!body) {
      setMsg("说明书正文还是空的，先点「写成说明书」或手写一段");
      return;
    }
    if (creating) {
      await api.createSkill({
        name,
        scene: form.scene,
        target: form.target,
        body,
        tags: form.tags,
        whenFlow: form.whenFlow,
        whenPlatform: form.whenPlatform,
        whenVoice: form.whenVoice,
      });
      setCreating(false);
      setForm(empty);
      setIdea("");
    } else if (current?.source === "custom") {
      await api.updateSkill(current.id, {
        name: current.name,
        scene: current.scene,
        target: current.target,
        body: current.body,
        enabled: current.enabled,
        tags: current.tags || [],
        whenFlow: current.whenFlow || [],
        whenPlatform: current.whenPlatform || [],
        whenVoice: current.whenVoice || "",
      });
    } else if (current) {
      await api.updateSkill(current.id, {
        tags: current.tags || [],
        whenFlow: current.whenFlow || [],
        whenPlatform: current.whenPlatform || [],
        whenVoice: current.whenVoice || "",
      });
    }
    setMsg("已保存");
    await load();
  }

  async function removeCustom() {
    if (!current || current.source !== "custom") return;
    if (!window.confirm(`删除「${current.name}」？制作台将不再显示这份写法。`)) return;
    await api.deleteSkill(current.id);
    setCurrent(null);
    setMsg("已删除");
    await load();
  }

  async function restoreOne() {
    if (!current || !current.upgraded) return;
    if (!window.confirm(`恢复「${current.name}」出厂说明书？制作台写稿将立刻改回出厂规则。`)) return;
    await api.restoreSkill(current.id);
    setMsg("已恢复出厂说明书");
    setView("full");
    await load();
  }

  async function restoreAll() {
    const n = skills.filter((s) => s.upgraded).length;
    if (!n) return;
    if (!window.confirm(`把 ${n} 份已写入对标技法的说明书全部恢复出厂？制作台写稿将立刻改回出厂规则。`)) return;
    const result = await api.restoreAllSkills();
    setMsg(`已恢复 ${result.restored.length} 份出厂说明书`);
    setView("full");
    await load();
  }

  async function generateDraft() {
    const prompt = idea.trim();
    if (!prompt) {
      setMsg("先用一句话写下你要的写法");
      return;
    }
    setBusy(true);
    setMsg("正在写成说明书…");
    try {
      const draft = await api.generateSkill({
        idea: prompt,
        target: creating ? form.target : current?.target,
      });
      if (creating) {
        setForm((cur) => ({ ...cur, ...draft }));
      } else if (current?.source === "custom") {
        setCurrent({ ...current, ...draft });
      }
      setMsg("说明书已生成，确认后保存即可在制作台使用。");
    } catch (err) {
      setMsg((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleEnabled(skill: Skill) {
    const next = !skill.enabled;
    setSkills((prev) => prev.map((s) => (s.id === skill.id ? { ...s, enabled: next } : s)));
    setCurrent((prev) => (prev && prev.id === skill.id ? { ...prev, enabled: next } : prev));
    try {
      await api.updateSkill(skill.id, { enabled: next });
      setMsg(next ? `已启用「${skill.name}」` : `已停用「${skill.name}」`);
    } catch (err) {
      setMsg((err as Error).message);
      await load();
    }
  }

  async function moveSkill(id: string, dir: -1 | 1) {
    try {
      const result = await api.moveSkill(id, { direction: dir < 0 ? "up" : "down" });
      setSkills(result.skills);
      if (!result.moved) setMsg("已在当前阶段边界");
    } catch (err) {
      setMsg((err as Error).message);
      await load();
    }
  }

  async function cloneOne() {
    if (!current) return;
    const cloned = await api.cloneSkill(current.id);
    setMsg(`已复制为「${cloned.name}」`);
    await load();
    setCurrent(cloned);
    setMobile("edit");
  }

  async function exportOne() {
    if (!current) return;
    const bundle = await api.exportSkills([current.id]);
    download(`skill-${current.id}.json`, bundle);
  }

  async function exportOneMarkdown() {
    if (!current) return;
    const md = await api.exportSkillMarkdown(current.id);
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `skill-${current.id}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function exportAll() {
    const ids = skills.map((s) => s.id);
    const bundle = await api.exportSkills(ids);
    download("moshu-skills.json", bundle);
  }

  async function importFile(file: File) {
    const text = await file.text();
    if (/\.md$/i.test(file.name) || !text.trim().startsWith("{")) {
      const created = await api.importSkillMarkdown(text, file.name);
      setMsg(`已导入写法「${created.name}」`);
    } else {
      const parsed = JSON.parse(text);
      const result = await api.importSkills(parsed);
      setMsg(`已导入 ${result.created.length} 份写法`);
    }
    await load();
  }

  async function openHistory() {
    if (!current) return;
    setDiffFor(null);
    setDiffRows(null);
    const list = await api.skillHistory(current.id);
    setHistory(list);
  }

  async function toggleDiff(entry: string, older: string | null) {
    if (!current) return;
    if (diffFor === entry) {
      setDiffFor(null);
      setDiffRows(null);
      return;
    }
    const next = await api.skillHistoryEntry(current.id, entry);
    const prevBody = older ? (await api.skillHistoryEntry(current.id, older)).body : "";
    setDiffRows(diffLines(prevBody, next.body));
    setDiffFor(entry);
  }

  async function restoreVersion(entry: string) {
    if (!current) return;
    if (!window.confirm("用这条历史覆盖当前正文？当前内容会先存成一条新历史。")) return;
    await api.restoreSkillHistory(current.id, entry);
    const list = await api.skillHistory(current.id);
    setHistory(list);
    setMsg("已回退到该版本");
    await load();
  }

  async function clearHistory() {
    if (!current) return;
    if (!window.confirm("清空这份写法的全部历史版本？")) return;
    await api.clearSkillHistory(current.id);
    setHistory([]);
    setMsg("历史已清空");
  }

  async function removeCraft(craft: CraftOverride) {
    if (!window.confirm(`删除拆书覆盖层「${craft.name || craft.id}」？已写入内置说明书的对标技法不会自动回退，需要的话去「全部恢复出厂」。`)) return;
    await api.deleteCraftOverride(craft.id);
    setMsg("已删除拆书法覆盖层");
    await load();
  }

  async function toggleElement(el: Element) {
    if (!current) return;
    const ids = skillElementIds(current);
    const next = ids.includes(el.id) ? ids.filter((id) => id !== el.id) : [...ids, el.id];
    setCurrent({ ...current, elements: next });
    setSkills((prev) => prev.map((s) => (s.id === current.id ? { ...s, elements: next } : s)));
    try {
      await api.updateSkill(current.id, { elements: next });
    } catch (err) {
      setMsg((err as Error).message);
      await load();
    }
  }

  function openElementNew() {
    setElementCreating(true);
    setElementEdit(null);
    setElementDraft({ name: "", desc: "", body: "", scope: "all" });
  }

  function openElementEdit(el: Element) {
    setElementCreating(false);
    setElementEdit(el);
    setElementDraft({ name: el.name, desc: el.desc, body: el.body, scope: el.scope });
  }

  async function saveElement() {
    const name = elementDraft.name.trim();
    const body = elementDraft.body.trim();
    if (!name || !body) {
      setMsg("元素需要名称和内容");
      return;
    }
    if (elementCreating) await api.createElement({ ...elementDraft, name, body });
    else if (elementEdit) await api.updateElement(elementEdit.id, { ...elementDraft, name, body });
    setElementEdit(null);
    setElementCreating(false);
    setMsg("元素已保存");
    await load();
  }

  async function removeElement(el: Element) {
    if (!window.confirm(`删除自定义元素「${el.name}」？用到它的 Skill 将不再注入这段。`)) return;
    await api.deleteElement(el.id);
    setMsg("元素已删除");
    await load();
  }

  async function resetElement(el: Element) {
    if (!window.confirm(`把「${el.name}」恢复成内置原文？`)) return;
    await api.resetElement(el.id);
    setMsg("已恢复内置元素");
    await load();
  }

  function pick(skill: Skill) {
    setCreating(false);
    setCurrent(skill);
    setIdea("");
    setView("compare");
    setMobile("edit");
  }

  function renderItem(skill: Skill) {
    const idx = shown.findIndex((s) => s.id === skill.id);
    return (
      <div key={skill.id} className={`ep-item skill-row ${!creating && current?.id === skill.id ? "on" : ""}`}>
        <button className="skill-pick" onClick={() => pick(skill)}>
          <b>
            {skill.name}
            {PIPE_SKILL_IDS.has(skill.id) ? <em className="skill-badge">流水线</em> : null}
          </b>
          <span className="muted">
            {skill.source === "builtin" ? (skill.upgraded ? "内置 · 对标" : "内置") : "自定义"} · {stageOf(skill).label}
            {skill.enabled ? "" : " · 停用"}
          </span>
          {(skill.tags || []).length ? (
            <span className="skill-tag-row">
              {(skill.tags || []).map((tag) => (
                <em key={tag} className="skill-tag-mini">
                  {tag}
                </em>
              ))}
            </span>
          ) : null}
        </button>
        <div className="skill-ops">
          <button
            className={`mini ${skill.enabled ? "on" : ""}`}
            title={skill.enabled ? "停用" : "启用"}
            onClick={(e) => {
              e.stopPropagation();
              toggleEnabled(skill).catch((err) => setMsg(err.message));
            }}
          >
            {skill.enabled ? "停" : "启"}
          </button>
          {viewMode === "order" ? (
            <>
              <button className="mini" disabled={idx <= 0} onClick={() => moveSkill(skill.id, -1).catch((err) => setMsg(err.message))}>
                ↑
              </button>
              <button className="mini" disabled={idx >= shown.length - 1} onClick={() => moveSkill(skill.id, 1).catch((err) => setMsg(err.message))}>
                ↓
              </button>
            </>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="studio-root">
      <div className="mobile-tabs">
        <button className={mobile === "list" ? "on" : ""} onClick={() => setMobile("list")}>
          列表
        </button>
        <button className={mobile === "edit" ? "on" : ""} onClick={() => setMobile("edit")}>
          编辑
        </button>
      </div>
      <div className="workspace skills-work">
      <aside className={`ep ${mobile === "list" ? "show" : ""}`}>
        <div className="toolbar">
          <h2 className="panel-title">写法说明书</h2>
          <button
            className="btn-mint"
            onClick={() => {
              setCreating(true);
              setCurrent(null);
              setForm(empty);
              setIdea("");
              setMsg("");
              setMobile("edit");
            }}
          >
            用 AI 写一份
          </button>
          {skills.some((s) => s.upgraded) ? (
            <button className="btn-ghost" onClick={() => restoreAll().catch((err) => setMsg(err.message))}>
              全部恢复出厂
            </button>
          ) : null}
        </div>
        <div className="skill-tools">
          <button className={viewMode === "group" ? "btn on" : "btn"} onClick={() => setViewMode("group")}>
            按流程分组
          </button>
          <button className={viewMode === "order" ? "btn on" : "btn"} onClick={() => setViewMode("order")}>
            排序
          </button>
          <button className="btn-ghost" onClick={() => exportAll().catch((err) => setMsg(err.message))}>
            导出全部
          </button>
          <button className="btn-ghost" onClick={() => importRef.current?.click()}>
            导入
          </button>
          <button className="btn-ghost" onClick={() => importMdRef.current?.click()}>
            导入 Markdown
          </button>
          <input
            ref={importRef}
            type="file"
            accept="application/json,.json"
            style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) importFile(file).catch((err) => setMsg(err.message));
            }}
          />
          <input
            ref={importMdRef}
            type="file"
            accept="text/markdown,.md,.markdown"
            style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) importFile(file).catch((err) => setMsg(err.message));
            }}
          />
        </div>
        <input
          className="ep-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜说明书"
        />
        {allTags.length ? (
          <div className="skill-tags">
            <button className={`skill-tag ${tagFilter ? "" : "on"}`} onClick={() => setTagFilter("")}>
              全部
            </button>
            {allTags.map((tag) => (
              <button
                key={tag}
                className={`skill-tag ${tagFilter === tag ? "on" : ""}`}
                onClick={() => setTagFilter((prev) => (prev === tag ? "" : tag))}
              >
                {tag}
              </button>
            ))}
          </div>
        ) : null}
        {viewMode === "group"
          ? groupSkills(shown).map((g) => (
              <div className="skill-group" key={g.label}>
                <p className="skill-group-head">{g.label}</p>
                {g.items.map(renderItem)}
              </div>
            ))
          : shown.map(renderItem)}
        <div className="skill-group">
          <button className="skill-group-toggle" onClick={() => setCraftOpen((v) => !v)}>
            拆书法覆盖层 · {crafts.length} {craftOpen ? "收起" : "展开"}
          </button>
          {craftOpen ? (
            crafts.length ? (
              crafts.map((c) => (
                <div className="skill-craft" key={c.id}>
                  <div>
                    <b>{c.name || c.id}</b>
                    <span className="muted">
                      {c.chars} 字{c.slots.length ? ` · ${c.slots.length} 栏` : ""}
                      {c.legacy ? " · 旧版分片" : ""}
                    </span>
                  </div>
                  <button className="mini" onClick={() => removeCraft(c).catch((err) => setMsg(err.message))}>
                    删
                  </button>
                </div>
              ))
            ) : (
              <p className="muted">还没有拆书法覆盖层。</p>
            )
          ) : null}
        </div>
      </aside>
      <section className={`stage ${mobile === "edit" ? "show" : ""}`}>
        {creating ? (
          <>
            <label className="field">
              <span>用一句话写下你要的写法</span>
              <textarea
                value={idea}
                onChange={(e) => setIdea(e.target.value)}
                placeholder="例如：每场只写一个冲突，结尾停在没说完的话上"
              />
            </label>
            <label className="field">
              <span>名称</span>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </label>
            <label className="field">
              <span>适用场景</span>
              <input value={form.scene} onChange={(e) => setForm({ ...form, scene: e.target.value })} />
            </label>
            <label className="field">
              <span>写入位置</span>
              <select value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })}>
                {TARGETS.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>说明书正文</span>
              <textarea
                style={{ minHeight: 360, fontFamily: "var(--serif)" }}
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
                placeholder="点右侧「写成说明书」，或在此直接改中文正文。"
              />
            </label>
            <ConditionFields value={form} onChange={(v) => setForm({ ...form, ...v })} />
          </>
        ) : current ? (
          <>
            <h2 className="book-title">{current.name}</h2>
            <p className="muted">{current.scene}</p>
            <div className="row-actions skill-view-bar">
              <button className={`btn ${current.enabled ? "on" : ""}`} onClick={() => toggleEnabled(current).catch((err) => setMsg(err.message))}>
                {current.enabled ? "已启用" : "已停用"}
              </button>
              <button className="btn-ghost" onClick={() => cloneOne().catch((err) => setMsg(err.message))}>
                复制为自定义
              </button>
              <button className="btn-ghost" onClick={() => exportOne().catch((err) => setMsg(err.message))}>
                导出这份
              </button>
              <button className="btn-ghost" onClick={() => exportOneMarkdown().catch((err) => setMsg(err.message))}>
                导出 Markdown
              </button>
              <button className="btn-ghost" onClick={() => openHistory().catch((err) => setMsg(err.message))}>
                历史记录
              </button>
              <button className="btn-ghost" onClick={() => setPreviewOpen(true)}>
                预览提示词
              </button>
              {current.upgraded ? (
                <button className="btn-ghost" onClick={() => restoreOne().catch((err) => setMsg(err.message))}>
                  恢复出厂说明书
                </button>
              ) : null}
              {current.source === "custom" ? (
                <button className="btn-ghost" onClick={() => removeCustom().catch((err) => setMsg(err.message))}>
                  删除
                </button>
              ) : null}
            </div>
            {current.upgraded ? (
              <p className="muted">拆书技法已写入这份说明书。对照栏左边是出厂正文，右边是现在全站写稿在用的对标技法。</p>
            ) : null}
            {current.source === "custom" ? (
              <>
                <label className="field">
                  <span>用一句话改写这份说明书</span>
                  <textarea
                    value={idea}
                    onChange={(e) => setIdea(e.target.value)}
                    placeholder="例如：再强调每段不超过四行，结尾留问句"
                  />
                </label>
                <label className="field">
                  <span>名称</span>
                  <input value={current.name} onChange={(e) => setCurrent({ ...current, name: e.target.value })} />
                </label>
                <label className="field">
                  <span>适用场景</span>
                  <input value={current.scene} onChange={(e) => setCurrent({ ...current, scene: e.target.value })} />
                </label>
                <label className="field">
                  <span>写入位置</span>
                  <select value={current.target} onChange={(e) => setCurrent({ ...current, target: e.target.value })}>
                    {TARGETS.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>说明书</span>
                  <textarea
                    style={{ minHeight: 360, fontFamily: "var(--serif)" }}
                    value={current.body}
                    onChange={(e) => setCurrent({ ...current, body: e.target.value })}
                  />
                </label>
                <ConditionFields
                  value={{
                    tags: current.tags || [],
                    whenFlow: current.whenFlow || [],
                    whenPlatform: current.whenPlatform || [],
                    whenVoice: current.whenVoice || "",
                  }}
                  onChange={(v) => setCurrent({ ...current, ...v })}
                />
              </>
            ) : current.upgraded ? (
              <>
                <div className="row-actions skill-view-bar">
                  <button className={view === "compare" ? "btn on" : "btn"} onClick={() => setView("compare")}>
                    对照
                  </button>
                  <button className={view === "full" ? "btn on" : "btn"} onClick={() => setView("full")}>
                    全文
                  </button>
                </div>
                {view === "compare" ? (
                  <div className="skill-compare">
                    <div className="skill-pane">
                      <h3>出厂说明书</h3>
                      <pre>{current.factoryBody || ""}</pre>
                    </div>
                    <div className="skill-pane skill-pane-craft">
                      <h3>对标技法 · {current.craftRules?.length || 0} 条</h3>
                      <div className="skill-rules">
                        {(current.craftRules || []).length ? (
                          (current.craftRules || []).map((rule, i) => (
                            <article className="skill-rule" key={i}>
                              <b>第 {i + 1} 条</b>
                              <p>{rule}</p>
                            </article>
                          ))
                        ) : (
                          <p className="muted">对标技法段落为空。</p>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <pre className="side-result skill-full">{current.body}</pre>
                )}
              </>
            ) : (
              <pre className="side-result skill-full">{current.body}</pre>
            )}
            {current.source === "builtin" ? (
              <details className="skill-condition-box">
                <summary>注入条件与检索标签</summary>
                <ConditionFields
                  value={{
                    tags: current.tags || [],
                    whenFlow: current.whenFlow || [],
                    whenPlatform: current.whenPlatform || [],
                    whenVoice: current.whenVoice || "",
                  }}
                  onChange={(v) => setCurrent({ ...current, ...v })}
                />
                <button className="btn-mint" onClick={() => saveCustom().catch((err) => setMsg(err.message))}>
                  保存条件
                </button>
              </details>
            ) : null}
            {elements.length ? (
              <div className="skill-elements">
                <div className="skill-elements-head">
                  <h3>组合元素</h3>
                  <button className="btn-ghost" onClick={openElementNew}>
                    新建元素
                  </button>
                </div>
                <p className="muted">
                  勾选后写稿时把该元素追加到这份 Skill 之后。「动态」元素会读当前稿本状态自动生成内容。内置元素可改文案，自定义元素可删。
                </p>
                <div className="element-list">
                  {elements.map((el) => {
                    const on = skillElementIds(current).includes(el.id);
                    return (
                      <div className={`element-row ${on ? "on" : ""}`} key={el.id}>
                        <label className="element-pick">
                          <input type="checkbox" checked={on} onChange={() => toggleElement(el).catch((err) => setMsg(err.message))} />
                          <b>{el.name}</b>
                          <em className="element-scope">{el.scope === "writing" ? "写稿" : "通用"}</em>
                          {el.dynamic ? <em className="element-scope">动态</em> : null}
                          {el.customized ? <em className="element-scope">已改</em> : null}
                        </label>
                        <div className="element-ops">
                          <button className="mini" onClick={() => openElementEdit(el)}>
                            改
                          </button>
                          {el.builtin ? (
                            el.customized ? (
                              <button className="mini" onClick={() => resetElement(el).catch((err) => setMsg(err.message))}>
                                复原
                              </button>
                            ) : null
                          ) : (
                            <button className="mini" onClick={() => removeElement(el).catch((err) => setMsg(err.message))}>
                              删
                            </button>
                          )}
                        </div>
                        <span className="muted">{el.desc}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </>
        ) : null}
        {(creating || current?.source === "custom") && (
          <>
          {busy ? (
            <Meter percent={wait.percent} label={`正在写成说明书 · ${formatWait(wait.elapsed)}`} running />
          ) : null}
          <div className="row-actions" style={{ marginTop: 12 }}>
            <button className="btn" disabled={busy} onClick={() => generateDraft()}>
              {busy ? "正在生成…" : "写成说明书"}
            </button>
            <button className="btn-mint" disabled={busy} onClick={() => saveCustom().catch((err) => setMsg(err.message))}>
              保存到制作台
            </button>
          </div>
          </>
        )}
        {msg && <p>{msg}</p>}
      </section>
      <aside className="inspector">
        {current?.upgraded ? (
          <>
            <h2 className="panel-title">对标对照</h2>
            <p className="muted">
              左栏是出厂说明书，右栏是拆书写入的对标技法。制作台现在按右栏写稿。点「恢复出厂说明书」后，全站改回左栏规则。
            </p>
          </>
        ) : creating || current?.source === "custom" ? (
          <>
            <h2 className="panel-title">自定义写法</h2>
            <p className="muted">
              用中文说你要的笔法即可。点「写成说明书」，模型会生成名称、适用场景和正文；确认后保存，制作台右侧就能用。复制内置写法可以从内置规则起步。
            </p>
          </>
        ) : (
          <>
            <h2 className="panel-title">内置说明书</h2>
            <p className="muted">
              这份写法跟着制作台流程走。停用后制作台不再显示；复制为自定义可另存一份自由改。拆书提炼技法后会在正文末尾追加「对标技法」。
            </p>
          </>
        )}
      </aside>
      {history ? (
        <div className="modal-back" onClick={() => setHistory(null)}>
          <div className="modal skill-history" onClick={(e) => e.stopPropagation()}>
            <h2 className="panel-title">编辑历史 · {current?.name}</h2>
            {history.length ? (
              history.map((h, i) => {
                const older = history[i + 1]?.id || null;
                return (
                  <div className="history-block" key={h.id}>
                    <div className="history-row">
                      <div>
                        <b>{new Date(h.at).toLocaleString("zh-CN")}</b>
                        <span className="muted">
                          {h.note} · {h.chars} 字
                        </span>
                      </div>
                      <button className="btn-ghost" onClick={() => toggleDiff(h.id, older).catch((err) => setMsg(err.message))}>
                        {diffFor === h.id ? "收起差异" : "看差异"}
                      </button>
                      <button className="btn-ghost" onClick={() => restoreVersion(h.id).catch((err) => setMsg(err.message))}>
                        回退
                      </button>
                    </div>
                    {diffFor === h.id && diffRows ? (
                      <pre className="history-diff">
                        {diffRows.map((row, k) => (
                          <div key={k} className={`diff-${row.type}`}>
                            {row.type === "add" ? "+ " : row.type === "del" ? "- " : "  "}
                            {row.text}
                          </div>
                        ))}
                      </pre>
                    ) : null}
                  </div>
                );
              })
            ) : (
              <p className="muted">还没有历史版本。每次编辑保存都会先存一份快照，最多保留 20 条。</p>
            )}
            <div className="row-actions">
              {history.length ? (
                <button className="btn-ghost" onClick={() => clearHistory().catch((err) => setMsg(err.message))}>
                  清空历史
                </button>
              ) : null}
              <button className="btn" onClick={() => setHistory(null)}>
                关闭
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {elementEdit || elementCreating ? (
        <div
          className="modal-back"
          onClick={() => {
            setElementEdit(null);
            setElementCreating(false);
          }}
        >
          <div className="modal skill-history" onClick={(e) => e.stopPropagation()}>
            <h2 className="panel-title">{elementCreating ? "新建元素" : `编辑元素 · ${elementEdit?.name}`}</h2>
            <label className="field">
              <span>名称</span>
              <input value={elementDraft.name} onChange={(e) => setElementDraft({ ...elementDraft, name: e.target.value })} />
            </label>
            <label className="field">
              <span>说明</span>
              <input value={elementDraft.desc} onChange={(e) => setElementDraft({ ...elementDraft, desc: e.target.value })} />
            </label>
            <label className="field">
              <span>适用</span>
              <select value={elementDraft.scope} onChange={(e) => setElementDraft({ ...elementDraft, scope: e.target.value })}>
                <option value="all">通用</option>
                <option value="writing">写稿</option>
              </select>
            </label>
            <label className="field">
              <span>注入正文</span>
              <textarea
                style={{ minHeight: 240, fontFamily: "var(--serif)" }}
                value={elementDraft.body}
                onChange={(e) => setElementDraft({ ...elementDraft, body: e.target.value })}
              />
            </label>
            <div className="row-actions">
              <button className="btn-mint" onClick={() => saveElement().catch((err) => setMsg(err.message))}>
                保存元素
              </button>
              <button
                className="btn"
                onClick={() => {
                  setElementEdit(null);
                  setElementCreating(false);
                }}
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <PromptPreview
        open={previewOpen && Boolean(current)}
        onClose={() => setPreviewOpen(false)}
        skillId={current?.id || ""}
        skillName={current?.name}
      />
    </div>
    </div>
  );
}
