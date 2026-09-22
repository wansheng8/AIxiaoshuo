import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { api } from "../data/api";
import type { Voice, VoiceRevision } from "../domain/types";
import Meter, { formatWait, useWaitMeter } from "../components/Meter";
import { STORAGE_KEYS, readJson, removeKey, writeJson } from "../data/storage";

const DRAFT_KEY = STORAGE_KEYS.voiceDraft;

const FILE_ACCEPT = ".txt,.md,.markdown,.text,text/plain";

function FilePick(props: {
  accept: string;
  multiple?: boolean;
  className?: string;
  disabled?: boolean;
  children: ReactNode;
  onFiles: (files: File[]) => void;
}) {
  const [drag, setDrag] = useState(false);
  const disabled = Boolean(props.disabled);
  return (
    <label
      className={`file-pick ${props.className || ""} ${drag ? "drag" : ""} ${disabled ? "disabled" : ""}`}
      onDragOver={(e) => {
        if (disabled) return;
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        if (disabled) return;
        e.preventDefault();
        setDrag(false);
        const files = Array.from(e.dataTransfer?.files || []);
        if (!files.length) return;
        props.onFiles(props.multiple ? files : [files[0]]);
      }}
    >
      {props.children}
      <input
        className="file-pick-input"
        type="file"
        accept={props.accept}
        multiple={props.multiple}
        disabled={disabled}
        onChange={(e) => {
          const files = Array.from(e.target.files || []);
          e.target.value = "";
          if (files.length) props.onFiles(props.multiple ? files : [files[0]]);
        }}
      />
    </label>
  );
}

function scanChapters(text: string) {
  const titles: string[] = [];
  const re = /^第\s*([0-9０-９]+|[零〇一二两三四五六七八九十百千万]+)\s*[章节回].*$/;
  const reEn = /^chapter\s+\d+.*$/i;
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.length > 50) continue;
    if (re.test(t) || reEn.test(t)) {
      if (titles.length < 300) titles.push(t.slice(0, 40));
    }
  }
  return titles;
}

type VoiceDraft = {
  body?: string;
  title?: string;
  text?: string;
  before?: string;
  after?: string;
  dirty?: boolean;
};

function readDraft(): VoiceDraft {
  return readJson<VoiceDraft>(DRAFT_KEY, {});
}

function fmt(iso?: string) {
  return iso ? iso.slice(0, 19).replace("T", " ") : "";
}

function charCount(value: string) {
  return Array.from(String(value || "").replace(/\s+/g, "")).length;
}

const TARGETS = ["立项", "世界", "人物", "大纲", "细纲", "正文", "续写", "润色", "道具"];

export default function VoicePage() {
  const draftRef = useRef<VoiceDraft>(readDraft());
  const [voice, setVoice] = useState<Voice | null>(null);
  const [body, setBody] = useState(draftRef.current.body || "");
  const [dirty, setDirty] = useState(Boolean(draftRef.current.dirty));
  const [title, setTitle] = useState(draftRef.current.title || "");
  const [text, setText] = useState(draftRef.current.text || "");
  const [before, setBefore] = useState(draftRef.current.before || "");
  const [after, setAfter] = useState(draftRef.current.after || "");
  const [previewPrompt, setPreviewPrompt] = useState("");
  const [previewText, setPreviewText] = useState("");
  const [busy, setBusy] = useState(false);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [mobile, setMobile] = useState<"list" | "edit">("list");
  const [novelTo, setNovelTo] = useState(30);
  const [importing, setImporting] = useState("");
  const [importMsg, setImportMsg] = useState("");
  const [novelText, setNovelText] = useState("");
  const [novelFile, setNovelFile] = useState<{
    name: string;
    size: number;
    chars: number;
    titles: string[];
  } | null>(null);
  const wait = useWaitMeter(busy, 90000);
  const importWait = useWaitMeter(Boolean(importing), 10000);

  function readText(file: File) {
    if (file.size > 12 * 1024 * 1024) {
      return Promise.reject(new Error("文件超过 12MB，请先切成较小的 TXT 再导入"));
    }
    return file.text();
  }

  useEffect(() => {
    if (dirty || title || text || before || after) {
      writeJson(DRAFT_KEY, { body, title, text, before, after, dirty });
    } else {
      removeKey(DRAFT_KEY);
    }
  }, [body, title, text, before, after, dirty]);

  function apply(next: Voice) {
    setVoice(next);
    draftRef.current = { ...draftRef.current, dirty: false, body: "" };
    setBody(next.body || "");
    setDirty(false);
  }

  async function load() {
    const next = await api.voice();
    setVoice(next);
    if (!draftRef.current.dirty) {
      setBody(next.body || "");
      setDirty(false);
    }
  }

  useEffect(() => {
    load().catch((err) => setMsg((err as Error).message));
  }, []);

  async function addSample() {
    const value = text.trim();
    if (!value) {
      setImportMsg("把你自己写的原文贴进来");
      return;
    }
    try {
      const next = await api.addVoiceSamples({ title: title.trim(), text: value });
      setTitle("");
      setText("");
      setImportMsg(`已收进样本，当前共 ${next.samples.length} 篇`);
      setMobile("edit");
      setVoice(next);
    } catch (err) {
      setImportMsg((err as Error).message);
    }
  }

  async function removeSample(id: string, name: string) {
    if (!window.confirm(`删掉样本「${name}」？`)) return;
    try {
      const next = await api.removeVoiceSample(id);
      setImportMsg("已删除样本");
      setVoice(next);
    } catch (err) {
      setImportMsg((err as Error).message);
    }
  }

  async function clearSamples() {
    if (!voice?.samples.length) return;
    if (!window.confirm(`删掉全部 ${voice.samples.length} 篇样本？文风说明书不受影响。`)) return;
    try {
      const next = await api.clearVoiceSamples();
      setImportMsg("已清空样本");
      setVoice(next);
    } catch (err) {
      setImportMsg((err as Error).message);
    }
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

  async function importSampleFiles(files: File[]) {
    setImportMsg("");
    setImporting(files.length > 1 ? `正在读取 ${files.length} 个文件` : `正在读取《${files[0]?.name || ""}》`);
    const min = voice?.minChars ?? 500;
    const list: Array<{ title: string; text: string }> = [];
    let skipped = 0;
    let skippedContent = "";
    let skippedName = "";
    try {
      for (const file of files) {
        const content = (await readText(file)).trim();
        if (!content) continue;
        const name = file.name.replace(/\.[^.]+$/, "");
        if (charCount(content) < min) {
          skipped += 1;
          if (charCount(content) > charCount(skippedContent)) {
            skippedContent = content;
            skippedName = name;
          }
          continue;
        }
        list.push({ title: name, text: content });
      }
      if (!list.length) {
        if (skippedContent) {
          setText(skippedContent);
          setTitle(skippedName);
        }
        setImportMsg(skipped ? `文件不足 ${min} 字，已放进编辑框，补够了再收。` : "没有读到文本内容");
        return;
      }
      setImporting(`正在上传并入库（${list.length} 篇）`);
      const next = await api.addVoiceSamples({ samples: list });
      setVoice(next);
      setText("");
      setTitle("");
      setImportMsg(
        `已导入 ${list.length} 篇样本，当前共 ${next.samples.length} 篇${skipped ? `；另有 ${skipped} 篇不足 ${min} 字已放进编辑框` : ""}`
      );
    } catch (err) {
      setImportMsg((err as Error).message);
    } finally {
      setImporting("");
    }
  }

  async function selectNovelFile(file: File) {
    setImportMsg("");
    setNovelFile(null);
    setNovelText("");
    setImporting(`正在读取《${file.name}》`);
    try {
      const content = (await readText(file)).trim();
      if (!content) {
        setImportMsg("文件是空的");
        return;
      }
      const titles = scanChapters(content);
      setNovelText(content);
      setNovelFile({
        name: file.name.replace(/\.[^.]+$/, ""),
        size: file.size,
        chars: charCount(content),
        titles,
      });
      setImportMsg(
        titles.length
          ? `本地预检完成：识别到 ${titles.length} 个章节标题，确认无误后点「开始导入」。`
          : "本地预检：没识别到「第X章」标题，将按全文取前一段作为样本。"
      );
    } catch (err) {
      setImportMsg((err as Error).message);
    } finally {
      setImporting("");
    }
  }

  async function runNovelImport() {
    if (!novelFile || !novelText) return;
    setImportMsg("");
    const to = Math.max(1, Number(novelTo) || 30);
    setImporting(`正在上传并拆章（前 ${to} 章）`);
    try {
      const res = await api.importVoiceNovel({ title: novelFile.name, text: novelText, from: 1, to });
      setVoice(res.voice);
      setImportMsg(
        res.total >= 2
          ? `导入成功：《${novelFile.name}》解析出 ${res.total} 章，已按章拆成 ${res.used} 篇样本（共 ${res.chars} 字），当前样本 ${res.voice.samples.length} 篇。点「用样本生成文风 Skill」即可提炼。`
          : `导入成功：没识别到章节标题，取全文 ${res.chars} 字收成 1 篇样本。`
      );
      setNovelFile(null);
      setNovelText("");
    } catch (err) {
      setImportMsg(`导入失败：${(err as Error).message}`);
    } finally {
      setImporting("");
    }
  }

  async function importVoiceFile(file: File) {
    try {
      const parsed = JSON.parse(await file.text());
      const next = await api.importVoice(parsed);
      apply(next);
      setPreviewText("");
      setMsg("已导入文风 Skill，写稿立即生效。");
    } catch (err) {
      setMsg((err as Error).message);
    }
  }

  async function exportVoiceFile() {
    try {
      const bundle = await api.exportVoice();
      download("moshu-voice.json", bundle);
      setMsg("文风 Skill 已导出为 JSON。");
    } catch (err) {
      setMsg((err as Error).message);
    }
  }

  async function deleteVoiceBody() {
    if (!voice?.body) {
      setMsg("还没有文风说明书");
      return;
    }
    if (!window.confirm("删除整份文风 Skill 说明书？样本会保留，可以重新生成。")) return;
    try {
      const next = await api.clearVoice();
      apply(next);
      setPreviewText("");
      setMsg("已删除文风 Skill 说明书。");
    } catch (err) {
      setMsg((err as Error).message);
    }
  }

  function copyText(value: string) {
    if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(value);
    const el = document.createElement("textarea");
    el.value = value;
    document.body.appendChild(el);
    el.select();
    document.execCommand("copy");
    document.body.removeChild(el);
    return Promise.resolve();
  }

  async function copyBody() {
    const value = body.trim();
    if (!value) {
      setMsg("还没有文风说明书可复制");
      return;
    }
    try {
      await copyText(value);
      setMsg("文风说明书已复制到剪贴板。");
    } catch {
      setMsg("复制失败，请手动全选正文框复制。");
    }
  }

  async function buildVoice() {
    setBusy(true);
    setMsg("正在从你的文字里拆文风…");
    try {
      const next = await api.buildVoice();
      apply(next);
      setPreviewText("");
      setMsg("文风 Skill 已生成并保存，写稿时立即生效。");
    } catch (err) {
      setMsg((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function saveVoice() {
    try {
      const next = await api.saveVoice({ enabled: voice?.enabled, body });
      apply(next);
      setMsg("已保存到本地，下次打开仍在。");
    } catch (err) {
      setMsg((err as Error).message);
    }
  }

  async function toggleEnabled(enabled: boolean) {
    try {
      const next = await api.saveVoice({ enabled });
      setVoice(next);
      setMsg(enabled ? "底味已开启" : "底味已关闭，写稿不再套用");
    } catch (err) {
      setMsg((err as Error).message);
    }
  }

  async function reviseVoice() {
    if (!body.trim()) {
      setMsg("先生成或写一份文风 Skill");
      return;
    }
    setBusy(true);
    setMsg("正在对比两稿，提炼你的口味规律…");
    try {
      const next = await api.reviseVoice({ before, after });
      apply(next);
      setBefore("");
      setAfter("");
      setMsg("已把这次改稿的规律合并进文风 Skill。");
    } catch (err) {
      setMsg((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function previewVoice() {
    setPreviewBusy(true);
    setPreviewText("");
    try {
      const res = await api.previewVoice({ prompt: previewPrompt.trim() });
      setPreviewText(res.text);
    } catch (err) {
      setMsg((err as Error).message);
    } finally {
      setPreviewBusy(false);
    }
  }

  function restoreRevision(rev: VoiceRevision) {
    if (!rev.body) {
      setMsg("这一版没有存正文快照，无法恢复。");
      return;
    }
    setBody(rev.body);
    setDirty(true);
    setMsg("已把这一版载入正文框，确认后点「保存」。");
  }

  const hasBody = Boolean(body.trim());
  const minChars = voice?.minChars ?? 500;
  const sampleChars = charCount(text);
  const full = (voice?.samples.length ?? 0) >= (voice?.limit ?? 5);
  const status = !hasBody
    ? { tone: "warn", text: "还没有文风说明书：收进样本后点「生成」，或直接在正文框里手写。" }
    : !voice?.enabled
      ? { tone: "warn", text: "底味已停用：写稿时不会套用。" }
      : dirty
        ? { tone: "warn", text: "有未保存的修改：点「保存」后才会生效。" }
        : voice?.stale
          ? { tone: "warn", text: "样本有更新：点「用样本重做文风 Skill」把新样本并进去。" }
          : { tone: "ok", text: "底味已生效：写稿时自动套用。" };

  return (
    <div className="studio-root">
      <div className="mobile-tabs">
        <button className={mobile === "list" ? "on" : ""} onClick={() => setMobile("list")}>
          样本
        </button>
        <button className={mobile === "edit" ? "on" : ""} onClick={() => setMobile("edit")}>
          文风
        </button>
      </div>
      <div className="workspace skills-work">
        <aside className={`ep ${mobile === "list" ? "show" : ""}`}>
          <div className="toolbar">
            <h2 className="panel-title">我的文风</h2>
          </div>
          <p className="muted">
            收进你自己写的原文（最多 {voice?.limit ?? 5} 篇，每篇至少 {voice?.minChars ?? 500} 字），让模型拆出你的口味，写成一份底味说明书。
          </p>
          {importing || importMsg ? (
            <div className="voice-import">
              {importing ? (
                <Meter
                  percent={importWait.percent}
                  label={`${importing} · ${formatWait(importWait.elapsed)}`}
                  running
                  compact
                />
              ) : null}
              {importMsg ? <p className="voice-import-msg">{importMsg}</p> : null}
            </div>
          ) : null}
          <div className="voice-novel">
            <b>导入整本小说</b>
            <p className="muted">自动按「第X章」拆章，每章存成 1 篇独立样本，方便分别提取开头、节奏、对白、标点等要素。</p>
            <FilePick
              accept={FILE_ACCEPT}
              className="drop-zone"
              disabled={full || Boolean(importing)}
              onFiles={(files) => selectNovelFile(files[0])}
            >
              <span className="drop-zone-main">点击选择小说文件</span>
              <span className="muted">或把 TXT / Markdown 拖到这里</span>
            </FilePick>
            {full ? <p className="muted">样本已满，先删一篇再导入。</p> : null}
            {novelFile ? (
              <div className="novel-preview">
                <p>
                  <b>{novelFile.name}</b>
                  <span className="muted">
                    {" "}
                    {(novelFile.size / 1024 / 1024).toFixed(2)}MB · {novelFile.chars} 字 · 识别 {novelFile.titles.length} 章，将拆成 {novelFile.titles.length || 1} 篇样本
                  </span>
                </p>
                {novelFile.titles.length ? (
                  <p className="muted novel-preview-titles">
                    {novelFile.titles.slice(0, 4).join(" ／ ")}
                    {novelFile.titles.length > 4 ? " …" : ""}
                  </p>
                ) : null}
                <div className="row-actions">
                  <label className="muted">
                    提取前
                    <input
                      type="number"
                      min={1}
                      max={200}
                      value={novelTo}
                      onChange={(e) => setNovelTo(Number(e.target.value))}
                    />
                    章
                  </label>
                  <button className="btn-mint" disabled={full || Boolean(importing)} onClick={() => runNovelImport()}>
                    {importing ? "导入中…" : "开始导入"}
                  </button>
                  <button
                    className="btn-ghost"
                    disabled={Boolean(importing)}
                    onClick={() => {
                      setNovelFile(null);
                      setNovelText("");
                      setImportMsg("");
                    }}
                  >
                    取消
                  </button>
                </div>
              </div>
            ) : null}
          </div>
          {voice ? (
            <label className="muted">
              <input
                type="checkbox"
                checked={voice.enabled}
                onChange={(e) => toggleEnabled(e.target.checked).catch((err) => setMsg((err as Error).message))}
              />{" "}
              写稿时套上这份底味
            </label>
          ) : null}
          {(voice?.samples || []).map((sample) => (
            <div className="voice-sample" key={sample.id}>
              <button
                className="voice-sample-del"
                title="删除样本"
                onClick={() => removeSample(sample.id, sample.title)}
              >
                ×
              </button>
              <details>
                <summary>
                  <b>{sample.title}</b>
                  <span className="muted"> {sample.chars} 字</span>
                </summary>
                <p className="voice-sample-text">{sample.excerpt}</p>
              </details>
            </div>
          ))}
          <label className="field">
            <span>样本标题</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例如：我写的一篇叙事散文" />
          </label>
          <label className="field">
            <span>
              你自己的原文
              <em className="muted">
                {" "}
                {sampleChars} 字 / 至少 {minChars}
              </em>
            </span>
            <textarea
              style={{ minHeight: 180 }}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="只能贴你自己写的内容。AI 帮你写的、别人写的不算。"
            />
          </label>
          <div className="row-actions">
            <button
              className="btn"
              disabled={!text.trim() || sampleChars < minChars || full || Boolean(importing)}
              onClick={() => addSample().catch((err) => setImportMsg((err as Error).message))}
            >
              收进样本
            </button>
            <FilePick
              accept={FILE_ACCEPT}
              multiple
              className="file-pick-btn btn-ghost"
              disabled={full || Boolean(importing)}
              onFiles={(files) => importSampleFiles(files)}
            >
              导入样本
            </FilePick>
            <button
              className="btn-ghost"
              disabled={!voice?.samples.length || Boolean(importing)}
              onClick={() => clearSamples().catch((err) => setImportMsg((err as Error).message))}
            >
              清空样本
            </button>
            {full ? <span className="muted">样本已满，先删一篇再收。</span> : null}
          </div>
          <p className="muted">导入支持 TXT / Markdown，文件名会自动当标题。不足 {minChars} 字的会放进下面的编辑框。</p>
        </aside>

        <section className={`stage ${mobile === "edit" ? "show" : ""}`}>
          <h2 className="book-title">个人文风 Skill</h2>
          <div className={`voice-status ${status.tone}`}>
            <b>{status.text}</b>
            {voice?.updatedAt && !dirty ? <span>保存于 {fmt(voice.updatedAt)}</span> : null}
          </div>
          <p className="muted">套用环节：</p>
          <div className="voice-targets">
            {(voice?.targets?.length ? voice.targets : TARGETS).map((t) => (
              <span className="chip" key={t}>
                {t}
              </span>
            ))}
          </div>
          {busy ? (
            <Meter percent={wait.percent} label={`正在处理 · ${formatWait(wait.elapsed)}`} running />
          ) : null}
          <div className="row-actions">
            <button className="btn-mint" disabled={busy || !voice?.samples.length} onClick={() => buildVoice()}>
              {hasBody ? "用样本重做文风 Skill" : "用样本生成文风 Skill"}
            </button>
            <button className="btn" disabled={busy || !dirty} onClick={() => saveVoice().catch((err) => setMsg((err as Error).message))}>
              {dirty ? "保存" : "已保存"}
            </button>
            <button className="btn-ghost" disabled={!hasBody} onClick={() => copyBody().catch((err) => setMsg((err as Error).message))}>
              复制说明书
            </button>
            <FilePick
              accept="application/json,.json"
              className="file-pick-btn btn-ghost"
              onFiles={(files) => importVoiceFile(files[0])}
            >
              导入 Skill
            </FilePick>
            <button className="btn-ghost" onClick={() => exportVoiceFile()}>
              导出 Skill
            </button>
            <button className="btn-ghost" disabled={!hasBody} onClick={() => deleteVoiceBody()}>
              删除说明书
            </button>
          </div>
          {voice?.stale ? (
            <p className="muted voice-budget-warn">样本比说明书新，重做一次才会把新样本算进去。</p>
          ) : null}
          {voice && voice.promptChars > 0 ? (
            <p className={`muted${voice.promptChars >= voice.promptBudget ? " voice-budget-warn" : ""}`}>
              喂给模型的样本字数 {voice.promptChars} / {voice.promptBudget}
              {voice.promptChars >= voice.promptBudget ? "，已到上限，靠后的样本可能没进提示词。" : "。"}
            </p>
          ) : null}
          <label className="field">
            <span>文风 Skill 正文</span>
            <textarea
              style={{ minHeight: 420, fontFamily: "var(--serif)" }}
              value={body}
              onChange={(e) => {
                setBody(e.target.value);
                setDirty(true);
              }}
              placeholder="点「用样本生成文风 Skill」，或在这里直接手写。"
            />
          </label>

          <h3>试写验证</h3>
          <p className="muted">给个题目，看套上底味后写出来像不像你。改到满意为止。</p>
          <div className="row-actions">
            <input
              className="ep-search voice-preview-input"
              value={previewPrompt}
              onChange={(e) => setPreviewPrompt(e.target.value)}
              placeholder="例如：写一段下雨天等外卖的心情"
            />
            <button
              className="btn"
              disabled={previewBusy || !hasBody || !voice?.enabled}
              onClick={() => previewVoice()}
            >
              {previewBusy ? "正在试写…" : "试写一段"}
            </button>
          </div>
          {previewText ? <pre className="side-result skill-full">{previewText}</pre> : null}

          <h3>改稿反哺</h3>
          <p className="muted">
            把你让 AI 代笔的稿，和你亲手改过的版本都贴进来。模型对比差异，提炼成规则，合并进上面这份文风 Skill。改的次数越多，底味越准。
          </p>
          <div className="skill-compare">
            <div className="skill-pane">
              <h3>AI 原文</h3>
              <textarea
                style={{ minHeight: 220 }}
                value={before}
                onChange={(e) => setBefore(e.target.value)}
                placeholder="模型代笔的原始稿"
              />
            </div>
            <div className="skill-pane">
              <h3>我改后的稿</h3>
              <textarea
                style={{ minHeight: 220 }}
                value={after}
                onChange={(e) => setAfter(e.target.value)}
                placeholder="你一句一句亲手改出来的版本"
              />
            </div>
          </div>
          <div className="row-actions">
            <button className="btn" disabled={busy || !before.trim() || !after.trim()} onClick={() => reviseVoice()}>
              提炼规律，更新文风 Skill
            </button>
          </div>
          {msg && <p>{msg}</p>}
        </section>

        <aside className="inspector">
          <h2 className="panel-title">怎么用</h2>
          <p className="muted">1. 收进 3 到 5 篇你自己最满意的原创文字。</p>
          <p className="muted">
            2. 点生成，得到一份写着你口味的说明书。它会被注入立项、大纲、细纲、正文、润色、续写、道具所有写稿环节。
          </p>
          <p className="muted">3. 点「试写验证」看效果；每次手改 AI 稿，就贴进「改稿反哺」，让底味越改越像你。</p>
          <p className="muted">全部内容保存在本地 data/voice.json，关掉浏览器或重启服务都还在。</p>
          {(voice?.revisions || []).length ? (
            <>
              <h2 className="panel-title">反哺记录</h2>
              {(voice?.revisions || [])
                .slice()
                .reverse()
                .map((row) => (
                  <p className="muted voice-rev" key={row.id}>
                    <span>{row.at.slice(0, 10)} · 对比两稿</span>
                    {row.body ? (
                      <button className="btn-ghost" onClick={() => restoreRevision(row)}>
                        载入这版
                      </button>
                    ) : null}
                  </p>
                ))}
            </>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
