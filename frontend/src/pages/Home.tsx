import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../data/api";
import type { NovelCard } from "../domain/types";
import { useAppState } from "../app-state";
import { addSparkPref, SPARK_DIMS, SPARK_MULTI_LIMIT, UNSET, applySparkPicks, emptySparkPrefs, sparkPrefsPicked, toggleSparkPref, type SparkPrefs } from "../domain/spark";
import { SPARK_CHANNELS, composeSpark, type SparkCard, type SparkChannel } from "../domain/spark-deck";
import Meter, { formatWait, useWaitMeter } from "../components/Meter";
import { STORAGE_KEYS, readText, removeKey } from "../data/storage";

export default function Home() {
  const nav = useNavigate();
  const { setInfo } = useAppState();
  const [list, setList] = useState<NovelCard[]>([]);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [genre, setGenre] = useState("玄幻");
  const [logline, setLogline] = useState("");
  const [error, setError] = useState("");
  const [sparkOpen, setSparkOpen] = useState(false);
  const [idea, setIdea] = useState("");
  const [channel, setChannel] = useState<SparkChannel>("common");
  const [cards, setCards] = useState<SparkCard[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [drawing, setDrawing] = useState(false);
  const [drawHint, setDrawHint] = useState("");
  const [prefs, setPrefs] = useState(emptySparkPrefs);
  const [customDraft, setCustomDraft] = useState<Record<string, string>>({});
  const [avoidText, setAvoidText] = useState("");
  const [busy, setBusy] = useState(false);
  const [autoAfter, setAutoAfter] = useState(true);
  const [shelf, setShelf] = useState<"desk" | "archive">("desk");
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"recent" | "words" | "chapters" | "title">("recent");
  const [menuId, setMenuId] = useState("");
  const [rename, setRename] = useState<NovelCard | null>(null);
  const [renameTitle, setRenameTitle] = useState("");
  const [renameGenre, setRenameGenre] = useState("");
  const [renameLogline, setRenameLogline] = useState("");
  const importRef = useRef<HTMLInputElement | null>(null);
  const wait = useWaitMeter(busy || drawing, sparkOpen ? 28000 : 6000);

  async function load() {
    setLoading(true);
    try {
      setList(shelf === "archive" ? await api.archivedProjects() : await api.projects());
      setMenuId("");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setInfo({ title: "墨枢", subtitle: "", chapter: "", saved: true, genre: "", words: 0, novelId: "", chapterId: "" });
    load().catch((err) => setError(err.message));
  }, [setInfo, shelf]);

  useEffect(() => {
    function close() {
      setMenuId("");
    }
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, []);

  async function createNovel() {
    setBusy(true);
    setError("");
    try {
      const novel = await api.createProject({ title, genre, logline });
      setOpen(false);
      nav(`/studio/${novel.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "立书失败");
    } finally {
      setBusy(false);
    }
  }

  async function sparkNovel(overrideIdea?: string, overridePrefs?: SparkPrefs) {
    setBusy(true);
    setError("");
    try {
      const basePrefs = overridePrefs || prefs;
      const payload = {
        ...basePrefs,
        avoid: avoidText.trim() ? [avoidText.trim().slice(0, 240)] : [],
      };
      const novel = await api.sparkProject({ idea: overrideIdea ?? idea, prefs: payload });
      setSparkOpen(false);
      setIdea("");
      setPrefs(emptySparkPrefs());
      setAvoidText("");
      setCustomDraft({});
      nav(`/studio/${novel.id}${autoAfter ? "?auto=1" : ""}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "开书失败");
    } finally {
      setBusy(false);
    }
  }

  function openSpark() {
    setPrefs(emptySparkPrefs());
    setCustomDraft({});
    setAvoidText("");
    setError("");
    setChannel("common");
    setCards([]);
    setSelectedId("");
    setDrawHint("");
    setSparkOpen(true);
  }

  async function drawCards(nextChannel: SparkChannel = channel) {
    setChannel(nextChannel);
    const seed = idea.trim();
    if (!seed) {
      setCards([]);
      setSelectedId("");
      setDrawHint("先在上面写一句脑洞或创意，再抽卡。");
      return;
    }
    setDrawing(true);
    setDrawHint("");
    setError("");
    try {
      const payload = {
        ...prefs,
        avoid: avoidText.trim() ? [avoidText.trim().slice(0, 240)] : [],
      };
      const res = await api.drawSpark({ idea: seed, channel: nextChannel, prefs: payload });
      const list = Array.isArray(res.cards) ? res.cards : [];
      setCards(list);
      const first = list[0] || null;
      setSelectedId(first?.id || "");
      if (first) setPrefs((cur) => prefsWithCard(cur, first));
      if (!list.length) setDrawHint("这次没抽到可用的脑洞，换个说法再试。");
    } catch (err) {
      setCards([]);
      setSelectedId("");
      setDrawHint(err instanceof Error ? err.message : "抽卡失败");
    } finally {
      setDrawing(false);
    }
  }

  function pickCard(): SparkCard | null {
    return cards.find((item) => item.id === selectedId) || cards[0] || null;
  }

  function normTag(tag: string): string {
    return String(tag || "").replace(/\s+/g, " ").trim().slice(0, 48);
  }

  function pickTags(picked: SparkCard): string[] {
    const raw = Array.isArray(picked.tags) ? picked.tags : [];
    return Array.from(new Set(raw.map(normTag).filter(Boolean)));
  }

  function prefsWithCard(cur: SparkPrefs, picked: SparkCard): SparkPrefs {
    const tags = pickTags(picked);
    const withGenres = tags.reduce((acc, tag) => addSparkPref(acc, "genres", tag, true), cur);
    return applySparkPicks(withGenres, picked.picks);
  }

  function adoptTags() {
    const picked = pickCard();
    if (!picked) return;
    const tags = pickTags(picked);
    setPrefs((cur) => tags.reduce((acc, tag) => addSparkPref(acc, "genres", tag, true), cur));
  }

  function selectCard(picked: SparkCard) {
    setSelectedId(picked.id || "");
    setPrefs((cur) => prefsWithCard(cur, picked));
  }

  function toggleCardTag(tag: string) {
    setPrefs((cur) => toggleSparkPref(cur, "genres", tag, true));
  }

  function adoptCard(open: boolean) {
    const picked = pickCard();
    if (!picked) return;
    const nextIdea = composeSpark(picked);
    const nextPrefs = prefsWithCard(prefs, picked);
    setIdea(nextIdea);
    setPrefs(nextPrefs);
    if (open) void sparkNovel(nextIdea, nextPrefs);
  }

  function openRename(item: NovelCard) {
    setRename(item);
    setRenameTitle(item.title);
    setRenameGenre(item.genre);
    setRenameLogline(item.logline);
    setMenuId("");
  }

  async function saveRename() {
    if (!rename) return;
    await api.saveProject(rename.id, { title: renameTitle, genre: renameGenre, logline: renameLogline });
    setRename(null);
    await load();
  }

  async function duplicateBook(item: NovelCard) {
    setMenuId("");
    const copy = await api.duplicateProject(item.id);
    setShelf("desk");
    nav(`/studio/${copy.id}`);
  }

  async function archiveBook(item: NovelCard) {
    if (!window.confirm(`将「${item.title}」移入归档？之后可在归档里找回。`)) return;
    setMenuId("");
    await api.archiveProject(item.id);
    if (readText(STORAGE_KEYS.last) === `/studio/${item.id}`) removeKey(STORAGE_KEYS.last);
    await load();
  }

  async function restoreBook(item: NovelCard) {
    setMenuId("");
    await api.restoreProject(item.id);
    setShelf("desk");
    await load();
  }

  async function importManuscript(file?: File) {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const raw = await file.text();
      const name = file.name.toLowerCase();
      let novel;
      if (name.endsWith(".json") || raw.trim().startsWith("{")) {
        const parsed = JSON.parse(raw);
        const src = parsed && parsed.chapters ? parsed : parsed.novel;
        if (!src || !Array.isArray(src.chapters)) throw new Error("JSON 里没有 chapters，无法导入");
        novel = await api.importProject({ novel: src });
      } else {
        novel = await api.importProject({ markdown: raw });
      }
      nav(`/studio/${novel.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "导入失败");
    } finally {
      setBusy(false);
      if (importRef.current) importRef.current.value = "";
    }
  }

  async function purgeBook(item: NovelCard) {
    if (!window.confirm(`彻底删除「${item.title}」？正文和设定都会消失，无法找回。`)) return;
    setMenuId("");
    await api.purgeProject(item.id);
    if (readText(STORAGE_KEYS.last) === `/studio/${item.id}`) removeKey(STORAGE_KEYS.last);
    await load();
  }

  const lastId = readText(STORAGE_KEYS.last).match(/\/studio\/([^/]+)/)?.[1] || "";
  const lastBook = list.find((item) => item.id === lastId);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = q
      ? list.filter((item) => `${item.title}${item.genre}${item.logline}`.toLowerCase().includes(q))
      : [...list];
    if (sort === "words") rows.sort((a, b) => b.wordCount - a.wordCount);
    else if (sort === "chapters") rows.sort((a, b) => b.chapterCount - a.chapterCount);
    else if (sort === "title") rows.sort((a, b) => a.title.localeCompare(b.title, "zh-CN"));
    else rows.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
    return rows;
  }, [list, query, sort]);

  return (
    <div className="page">
      <section className="hero">
        <div className="hero-copy">
          <span className="hero-kicker">单人制作台</span>
          <h1>以写法织章</h1>
          <p>点几张偏好卡就能立书。再按章推进：大纲、设定、人物、细纲和正文。</p>
        </div>
        <div className="hero-meta">
          <button className="btn-mint hero-cta" onClick={openSpark}>
            脑洞开新书
          </button>
          <span className="hero-hint">点选或自己写标签，铺开全书骨架</span>
        </div>
      </section>

      <div className="toolbar">
        <div className="shelf-tabs">
          <button className={shelf === "desk" ? "on" : ""} onClick={() => setShelf("desk")}>
            案上稿本
          </button>
          <button className={shelf === "archive" ? "on" : ""} onClick={() => setShelf("archive")}>
            归档
          </button>
        </div>
        {list.length > 0 && (
          <>
            <input
              className="home-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜书名、类型或卖点"
            />
            <select className="ghost-select" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
              <option value="recent">最近更新</option>
              <option value="words">字数最多</option>
              <option value="chapters">章数最多</option>
              <option value="title">书名排序</option>
            </select>
          </>
        )}
        <button className="btn-ghost" onClick={() => setOpen(true)}>
          手动立书
        </button>
        <button className="btn-ghost" disabled={busy} onClick={() => importRef.current?.click()}>
          导入稿本
        </button>
        {shelf === "desk" && lastBook ? (
          <button className="btn-mint" onClick={() => nav(`/studio/${lastBook.id}`)}>
            继续写 · {lastBook.title}
          </button>
        ) : null}
        <input
          ref={importRef}
          type="file"
          accept=".md,.txt,.markdown,.json"
          hidden
          onChange={(e) => importManuscript(e.target.files?.[0]).catch((err) => setError(err.message))}
        />
      </div>
      {error && <p className="banner">{error}</p>}
      {loading ? (
        <p className="muted">正在摊开稿本…</p>
      ) : list.length === 0 ? (
        <div className="empty-desk">
          <div className="empty-seal">墨</div>
          <h3>{shelf === "archive" ? "归档是空的" : "案上还空着"}</h3>
          <p className="muted">
            {shelf === "archive" ? "从案上把旧稿移过来，随时可以再摊开。" : "点几张偏好卡，或右上角手动立书。"}
          </p>
          {shelf === "desk" && (
            <button className="btn-mint" onClick={openSpark}>
              先开一部
            </button>
          )}
        </div>
      ) : visible.length === 0 ? (
        <div className="empty-desk">
          <div className="empty-seal">寻</div>
          <h3>没有匹配的稿本</h3>
          <p className="muted">换个词再找，或清空搜索。</p>
        </div>
      ) : (
        <div className="cards">
          {visible.map((item) => (
            <article className={`card ${item.id === lastId ? "last" : ""}`} key={item.id} data-genre={item.genre || "长篇"}>
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
                  {shelf === "desk" ? (
                    <>
                      <button type="button" onClick={() => nav(`/studio/${item.id}`)}>
                        打开
                      </button>
                      <button type="button" onClick={() => openRename(item)}>
                        改名
                      </button>
                      <button type="button" onClick={() => duplicateBook(item).catch((err) => setError(err.message))}>
                        复制
                      </button>
                      <button type="button" onClick={() => archiveBook(item).catch((err) => setError(err.message))}>
                        归档
                      </button>
                      <button
                        type="button"
                        className="danger"
                        onClick={() => purgeBook(item).catch((err) => setError(err.message))}
                      >
                        删除
                      </button>
                    </>
                  ) : (
                    <>
                      <button type="button" onClick={() => restoreBook(item).catch((err) => setError(err.message))}>
                        恢复到案上
                      </button>
                      <button type="button" onClick={() => duplicateBook(item).catch((err) => setError(err.message))}>
                        复制
                      </button>
                      <button
                        type="button"
                        className="danger"
                        onClick={() => purgeBook(item).catch((err) => setError(err.message))}
                      >
                        彻底删除
                      </button>
                    </>
                  )}
                </div>
              )}
              <Link to={shelf === "desk" ? `/studio/${item.id}` : "#"} onClick={(e) => shelf === "archive" && e.preventDefault()}>
                <i className="card-spine" />
                <div className="genre">{item.genre || "长篇"}</div>
                <h3>{item.title}</h3>
                <p>{item.logline || "还没有一句话卖点"}</p>
                <div className="card-stats">
                  <span>{item.chapterCount} 章</span>
                  <span>{item.wordCount.toLocaleString()} 字</span>
                  {item.id === lastId && shelf === "desk" ? <span>上次</span> : null}
                </div>
              </Link>
            </article>
          ))}
        </div>
      )}

      {sparkOpen && (
        <div className="modal-back" onClick={() => !busy && !drawing && setSparkOpen(false)}>
          <div className="modal spark-modal" onClick={(e) => e.stopPropagation()}>
            <h3>脑洞开新书</h3>
            <p className="muted">点选或自己写标签，三十秒内开书。每一项都可以跳过。</p>
            {error && <p className="banner">{error}</p>}
            <label className="field">
              <span>脑洞与细节（选填）</span>
              <textarea
                value={idea}
                onChange={(e) => setIdea(e.target.value)}
                placeholder="例如：咸鱼编剧穿成糊咖，系统逼她进副本演戏；女主懒得营业，马甲是已故大神白夜。"
                rows={3}
              />
            </label>
            <div className="spark-deck">
              <div className="spark-deck-head">
                <span className="spark-deck-title">脑洞二次抽卡</span>
                <div className="spark-deck-channels">
                  {SPARK_CHANNELS.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={`pref-chip ${channel === item.id ? "on" : ""}`}
                      disabled={busy || drawing}
                      onClick={() => {
                        setChannel(item.id);
                        setCards([]);
                        setSelectedId("");
                        setDrawHint("");
                      }}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className="btn-ghost"
                  disabled={busy || drawing || !idea.trim()}
                  onClick={() => drawCards()}
                >
                  {drawing ? "抽卡中…" : cards.length ? "换一批" : "抽三个脑洞"}
                </button>
              </div>
              <p className="muted spark-deck-hint">
                {drawHint || (idea.trim() ? "按当前脑洞派生三个不同走向，选一个直接开书。" : "先在上面写一句脑洞或创意，再抽卡。")}
              </p>
              {cards.length ? (
                <div className="spark-cards">
                  {cards.map((item, index) => (
                    <div
                      key={item.id || index}
                      role="button"
                      tabIndex={0}
                      aria-pressed={selectedId === item.id}
                      className={`spark-card ${selectedId === item.id ? "on" : ""}`}
                      onClick={() => selectCard(item)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          selectCard(item);
                        }
                      }}
                    >
                      <div className="spark-card-meta">
                        <span>方案 {index + 1}</span>
                        {(item.tags || []).map((rawTag) => {
                          const tag = normTag(rawTag);
                          if (!tag) return null;
                          const on = (prefs.genres || []).includes(tag);
                          return (
                            <button
                              key={tag}
                              type="button"
                              className={`spark-card-tag ${on ? "on" : ""}`}
                              disabled={busy || drawing}
                              title={on ? "点击从类型偏好中取消" : "点击加入类型偏好"}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedId(item.id || "");
                                toggleCardTag(tag);
                              }}
                            >
                              {tag}
                            </button>
                          );
                        })}
                      </div>
                      <p className="spark-card-hook">{item.hook}</p>
                      <p className="spark-card-line">{item.conflict}</p>
                      <p className="spark-card-line">{item.edge}</p>
                      <ul className="spark-card-details">
                        {(item.details || []).map((detail) => (
                          <li key={detail}>{detail}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              ) : null}
              {cards.length ? (
                <div className="spark-card-actions">
                  <button type="button" className="btn-ghost" disabled={busy || drawing} onClick={adoptTags}>
                    采纳标签
                  </button>
                  <button type="button" className="btn-ghost" disabled={busy || drawing} onClick={() => adoptCard(false)}>
                    用这张
                  </button>
                  <button type="button" className="btn" disabled={busy || drawing || !selectedId} onClick={() => adoptCard(true)}>
                    用这张并开书
                  </button>
                </div>
              ) : null}
            </div>
            <div className="pref-board">
              {SPARK_DIMS.map((dim) => (
                <div className={`pref-block${dim.wide ? " wide" : ""}`} key={dim.key}>
                  <h4>{dim.label}</h4>
                  <p className="pref-hint">
                    {dim.hint}
                    {dim.multiple ? `（已选 ${(prefs[dim.key] || []).length}/${SPARK_MULTI_LIMIT}）` : ""}
                  </p>
                  <div className="pref-chips">
                    <button
                      type="button"
                      className={`pref-chip ${(prefs[dim.key] || []).length === 0 ? "on" : ""}`}
                      disabled={busy}
                      onClick={() => setPrefs((cur) => toggleSparkPref(cur, dim.key, UNSET, dim.multiple))}
                    >
                      {UNSET}
                    </button>
                    {dim.options.map((option) => {
                      const picked = (prefs[dim.key] || []).includes(option);
                      const full = dim.multiple && (prefs[dim.key] || []).length >= SPARK_MULTI_LIMIT;
                      return (
                        <button
                          key={option}
                          type="button"
                          className={`pref-chip ${picked ? "on" : ""}`}
                          disabled={busy || (full && !picked)}
                          onClick={() => setPrefs((cur) => toggleSparkPref(cur, dim.key, option, dim.multiple))}
                        >
                          {option}
                        </button>
                      );
                    })}
                    {(prefs[dim.key] || [])
                      .filter((item) => !dim.options.includes(item))
                      .map((option) => (
                        <button
                          key={option}
                          type="button"
                          className="pref-chip custom on"
                          disabled={busy}
                          onClick={() => setPrefs((cur) => toggleSparkPref(cur, dim.key, option, dim.multiple))}
                        >
                          {option}
                        </button>
                      ))}
                  </div>
                  <div className="pref-add">
                    <input
                      value={customDraft[dim.key] || ""}
                      disabled={busy || (dim.multiple && (prefs[dim.key] || []).length >= SPARK_MULTI_LIMIT)}
                      maxLength={48}
                      placeholder={
                        dim.multiple && (prefs[dim.key] || []).length >= SPARK_MULTI_LIMIT
                          ? `已选满 ${SPARK_MULTI_LIMIT} 个`
                          : "自己写，回车加入"
                      }
                      onChange={(e) => setCustomDraft((cur) => ({ ...cur, [dim.key]: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter") return;
                        e.preventDefault();
                        const text = (customDraft[dim.key] || "").trim();
                        if (!text) return;
                        setPrefs((cur) => addSparkPref(cur, dim.key, text, dim.multiple));
                        setCustomDraft((cur) => ({ ...cur, [dim.key]: "" }));
                      }}
                    />
                    <button
                      type="button"
                      className="pref-add-btn"
                      disabled={
                        busy ||
                        !(customDraft[dim.key] || "").trim() ||
                        (dim.multiple && (prefs[dim.key] || []).length >= SPARK_MULTI_LIMIT)
                      }
                      onClick={() => {
                        const text = (customDraft[dim.key] || "").trim();
                        if (!text) return;
                        setPrefs((cur) => addSparkPref(cur, dim.key, text, dim.multiple));
                        setCustomDraft((cur) => ({ ...cur, [dim.key]: "" }));
                      }}
                    >
                      加入
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <label className="field">
              <span>想避开（选填）</span>
              <textarea
                value={avoidText}
                onChange={(e) => setAvoidText(e.target.value)}
                placeholder="例如：无脑打脸、后宫、强行误会、突然失忆"
                rows={2}
                maxLength={240}
              />
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={autoAfter}
                disabled={busy}
                onChange={(e) => setAutoAfter(e.target.checked)}
              />
              开完后自动写细纲和第一章
            </label>
            {busy ? (
              <Meter
                percent={wait.percent}
                label={`正在铺设定 · ${formatWait(wait.elapsed)}`}
                running
              />
            ) : null}
            <div className="row-actions">
              <button className="btn" disabled={busy || drawing} onClick={() => sparkNovel()}>
                {busy
                  ? "正在铺设定，大约半分钟…"
                  : idea.trim() || sparkPrefsPicked(prefs) || avoidText.trim()
                    ? "按偏好开书"
                    : "全部跳过，随机开书"}
              </button>
              <button className="btn-ghost" disabled={busy || drawing} onClick={() => setSparkOpen(false)}>
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {open && (
        <div className="modal-back" onClick={() => setOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>立一部新书</h3>
            <label className="field">
              <span>书名</span>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例如：夜潮入城" />
            </label>
            <label className="field">
              <span>类型</span>
              <input value={genre} onChange={(e) => setGenre(e.target.value)} />
            </label>
            <label className="field">
              <span>一句灵感</span>
              <textarea value={logline} onChange={(e) => setLogline(e.target.value)} placeholder="谁想要什么，被什么挡住" />
            </label>
            {error && <p className="banner">{error}</p>}
            {busy ? (
              <Meter percent={wait.percent} label={`正在立书 · ${formatWait(wait.elapsed)}`} running />
            ) : null}
            <div className="row-actions">
              <button className="btn" disabled={busy} onClick={createNovel}>
                {busy ? "正在立书…" : "开写"}
              </button>
              <button className="btn-ghost" disabled={busy} onClick={() => setOpen(false)}>
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
            <label className="field">
              <span>书名</span>
              <input value={renameTitle} onChange={(e) => setRenameTitle(e.target.value)} />
            </label>
            <label className="field">
              <span>类型</span>
              <input value={renameGenre} onChange={(e) => setRenameGenre(e.target.value)} />
            </label>
            <label className="field">
              <span>一句卖点</span>
              <textarea value={renameLogline} onChange={(e) => setRenameLogline(e.target.value)} />
            </label>
            <div className="row-actions">
              <button
                className="btn"
                onClick={() => saveRename().catch((err) => setError(err.message))}
              >
                保存
              </button>
              <button className="btn-ghost" onClick={() => setRename(null)}>
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
