import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../data/api";
import type { TeardownCard } from "../domain/types";
import { useAppState } from "../app-state";
import { STORAGE_KEYS, writeText } from "../data/storage";

export default function TeardownHome() {
  const nav = useNavigate();
  const { setInfo } = useAppState();
  const [list, setList] = useState<TeardownCard[]>([]);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [paste, setPaste] = useState("");
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"active" | "archived">("active");
  const fileRef = useRef<HTMLInputElement | null>(null);
  const pasteWords = Array.from(paste.replace(/\s+/g, "")).length;
  const [menuId, setMenuId] = useState("");
  const [rename, setRename] = useState<TeardownCard | null>(null);
  const [renameTitle, setRenameTitle] = useState("");
  const [loading, setLoading] = useState(true);

  async function load(which: "active" | "archived" = tab) {
    setLoading(true);
    try {
      setList(await api.teardowns(which === "archived"));
      setMenuId("");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(tab).catch((err) => setError(err.message));
  }, [tab]);

  useEffect(() => {
    setInfo({ title: "拆书", subtitle: "", chapter: "", saved: true, genre: "", words: 0, novelId: "", chapterId: "" });
  }, [setInfo]);

  async function importText(markdown: string, sourceName: string, bookTitle: string) {
    setBusy(true);
    setError("");
    try {
      const row = await api.importTeardown({ title: bookTitle, markdown, sourceName });
      writeText(STORAGE_KEYS.lastTeardown, `/teardown/${row.id}`);
      nav(`/teardown/${row.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "导入失败");
    } finally {
      setBusy(false);
    }
  }

  async function onFile(file?: File | null) {
    if (!file) return;
    if (/\.epub$/i.test(file.name)) {
      setError("请把 EPUB 另存为 TXT 或 Markdown 再上传");
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      setError("文件超过 12MB，请先切成较小的 TXT 再上传");
      return;
    }
    const markdown = await file.text();
    const bookTitle = title.trim() || file.name.replace(/\.[^.]+$/, "");
    await importText(markdown, file.name, bookTitle);
  }

  async function onPaste() {
    await importText(paste, "粘贴", title.trim() || "粘贴拆书");
  }

  async function archive(id: string) {
    await api.archiveTeardown(id);
    await load();
  }

  async function restore(id: string) {
    await api.restoreTeardown(id);
    await load();
  }

  async function purge(id: string) {
    if (!window.confirm("彻底删除这份拆书？删除后无法恢复。")) return;
    await api.purgeTeardown(id);
    await load();
  }

  async function saveRename() {
    if (!rename) return;
    await api.saveTeardown(rename.id, { title: renameTitle.trim() || rename.title });
    setRename(null);
    await load();
  }

  return (
    <div className="page tear-home">
      <div className="hero">
        <div className="hero-copy">
          <span className="hero-kicker">拆书</span>
          <h1>把对标小说拆开</h1>
          <p>上传或粘贴正文。默认只拆前 30 章。登录各小说平台抓章做不了。</p>
        </div>
        <div className="hero-meta">
          <button className="btn-mint hero-cta" type="button" onClick={() => setOpen(true)}>
            导入一本
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".txt,.md,.markdown"
          hidden
          onChange={(e) => onFile(e.target.files?.[0]).catch((err) => setError(err.message))}
        />
      </div>
      {error && <p className="banner">{error}</p>}
      <div className="actions tear-filter">
        <button className={tab === "active" ? "btn-mint" : "btn"} type="button" onClick={() => setTab("active")}>
          进行中
        </button>
        <button className={tab === "archived" ? "btn-mint" : "btn"} type="button" onClick={() => setTab("archived")}>
          已归档
        </button>
      </div>
      {loading ? (
        <div className="empty-desk">
          <div className="empty-seal">拆</div>
          <h3>正在读取…</h3>
          <p className="muted">正在加载拆书工程。</p>
        </div>
      ) : list.length === 0 ? (
        <div className="empty-desk">
          <div className="empty-seal">拆</div>
          <h3>{tab === "archived" ? "没有归档的拆书" : "还没有拆过书"}</h3>
          <p className="muted">
            {tab === "archived"
              ? "在「进行中」里归档的拆书会出现在这里，可随时恢复。"
              : "把 TXT 或 Markdown 丢进来，按章切开再抽章纲、角色和黄金三章。"}
          </p>
        </div>
      ) : (
        <div className="cards">
          {list.map((item) => (
            <article className="card" key={item.id}>
              <button
                className="card-more"
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuId(menuId === item.id ? "" : item.id);
                }}
              >
                ···
              </button>
              {menuId === item.id && (
                <div className="card-menu" onClick={(e) => e.stopPropagation()}>
                  {tab === "active" ? (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          writeText(STORAGE_KEYS.lastTeardown, `/teardown/${item.id}`);
                          nav(`/teardown/${item.id}`);
                        }}
                      >
                        打开
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setRename(item);
                          setRenameTitle(item.title);
                          setMenuId("");
                        }}
                      >
                        改名
                      </button>
                      <button type="button" onClick={() => archive(item.id).catch((err) => setError(err.message))}>
                        归档
                      </button>
                    </>
                  ) : (
                    <>
                      <button type="button" onClick={() => restore(item.id).catch((err) => setError(err.message))}>
                        恢复
                      </button>
                      <button type="button" onClick={() => purge(item.id).catch((err) => setError(err.message))}>
                        彻底删除
                      </button>
                    </>
                  )}
                </div>
              )}
              <Link
                to={`/teardown/${item.id}`}
                onClick={() => writeText(STORAGE_KEYS.lastTeardown, `/teardown/${item.id}`)}
              >
                <i className="card-spine" />
                <div className="genre">拆书</div>
                <h3>{item.title}</h3>
                <p className="muted">
                  {item.chapterCount} 章 · 拆前 {item.scopeEnd} 章 · {item.wordCount} 字
                </p>
              </Link>
            </article>
          ))}
        </div>
      )}

      {open && (
        <div className="modal-back" onClick={() => setOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>导入参考正文</h3>
            <p className="muted">支持 TXT / Markdown。番茄、起点上的书请你先另存再贴进来。</p>
            <label>
              书名
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="可选，默认用文件名" />
            </label>
            <label>
              粘贴正文
              <textarea value={paste} onChange={(e) => setPaste(e.target.value)} rows={10} placeholder="至少 500 字" />
            </label>
            <p className="muted">
              {pasteWords < 500 ? `已输入 ${pasteWords} 字，还差 ${500 - pasteWords} 字` : `已输入 ${pasteWords} 字`}
            </p>
            <div className="actions">
              <button className="btn-mint" type="button" disabled={busy || pasteWords < 500} onClick={() => onPaste()}>
                {busy ? "导入中" : "从粘贴导入"}
              </button>
              <button className="btn" type="button" disabled={busy} onClick={() => fileRef.current?.click()}>
                上传文件
              </button>
              <button className="btn-ghost" type="button" onClick={() => setOpen(false)}>
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {rename && (
        <div className="modal-back" onClick={() => setRename(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>改名</h3>
            <label>
              书名
              <input value={renameTitle} onChange={(e) => setRenameTitle(e.target.value)} />
            </label>
            <div className="actions">
              <button className="btn-mint" type="button" onClick={() => saveRename().catch((err) => setError(err.message))}>
                保存
              </button>
              <button className="btn-ghost" type="button" onClick={() => setRename(null)}>
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
