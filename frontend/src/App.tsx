import { NavLink, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import { useEffect, useState, type FormEvent } from "react";
import Home from "./pages/Home";
import Studio from "./pages/Studio";
import Skills from "./pages/Skills";
import Voice from "./pages/Voice";
import Settings from "./pages/Settings";
import { useAppState } from "./app-state";
import TeardownHome from "./pages/Teardown";
import TeardownDesk from "./pages/TeardownDesk";
import { api } from "./data/api";
import type { NovelCard } from "./domain/types";
import { IconAsset, IconGear, IconHome, IconStory, IconTear } from "./components/icons";
import ModelPicker from "./components/ModelPicker";
import ChatPanel from "./components/ChatPanel";
import { ShellBodyContext } from "./components/shell-slot";
import Meter, { formatWait, useWaitMeter } from "./components/Meter";
import { jobDisplayPercent, jobLabel, stopJob, useJob } from "./data/jobs";

import { STORAGE_KEYS, readText } from "./data/storage";

function lastStudio() {
  return readText(STORAGE_KEYS.last) || "/";
}

function lastTeardown() {
  return readText(STORAGE_KEYS.lastTeardown) || "/teardown";
}

function StudioPage() {
  const { id } = useParams();
  return <Studio key={id} />;
}

function PasswordGate({ onDone }: { onDone: () => void }) {
  const [pw, setPw] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.login(pw);
      onDone();
    } catch {
      setError("访问密码不正确");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-back">
      <form className="modal" onSubmit={submit}>
        <h3>访问验证</h3>
        <p style={{ color: "var(--muted)", lineHeight: 1.7, marginTop: 0 }}>
          「墨枢」已启用访问密码，请输入后继续。
        </p>
        <label className="field">
          <span>访问密码</span>
          <input
            type="password"
            autoFocus
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder="请输入访问密码"
          />
        </label>
        {error && <p style={{ color: "var(--danger)", margin: "8px 0 0" }}>{error}</p>}
        <div className="toolbar" style={{ marginBottom: 0 }}>
          <span />
          <button className="btn-mint" type="submit" disabled={busy || !pw}>
            {busy ? "校验中…" : "进入"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function App() {
  const { info, configured, setConfigured, failCount, doneCount, fileActions, zen } = useAppState();
  const loc = useLocation();
  const nav = useNavigate();
  const [books, setBooks] = useState<NovelCard[]>([]);
  const [authState, setAuthState] = useState<"checking" | "need" | "ok">("checking");
  const [shellBody, setShellBody] = useState<HTMLElement | null>(null);
  const studioId = loc.pathname.match(/^\/studio\/([^/]+)/)?.[1] || "";
  const job = useJob();
  const wait = useWaitMeter(job.running, 40000, job.step);
  const jobPct = jobDisplayPercent(job, wait.percent);
  const jobText = `${jobLabel(job)}${wait.elapsed ? ` · ${formatWait(wait.elapsed)}` : ""}`;
  const onJobPage = job.href && loc.pathname === job.href;

  useEffect(() => {
    api.settings().then((s) => setConfigured(s.configured)).catch(() => setConfigured(false));
  }, [loc.pathname, setConfigured]);

  useEffect(() => {
    api.projects()
      .then((rows) => setBooks(Array.isArray(rows) ? rows : []))
      .catch(() => setBooks([]));
  }, [loc.pathname]);

  useEffect(() => {
    api.authStatus()
      .then((s) => setAuthState(s.required && !s.ok ? "need" : "ok"))
      .catch(() => setAuthState("ok"));
  }, []);

  const bookOptions =
    studioId && !books.some((b) => b.id === studioId)
      ? [{ id: studioId, title: info.title || "当前稿本" } as NovelCard, ...books]
      : books;

  if (authState === "checking") {
    return (
      <div className="modal-back">
        <div className="modal">
          <h3>墨枢</h3>
          <p style={{ color: "var(--muted)", marginBottom: 0 }}>正在校验访问权限…</p>
        </div>
      </div>
    );
  }
  if (authState === "need") {
    return <PasswordGate onDone={() => setAuthState("ok")} />;
  }

  return (
    <ShellBodyContext.Provider value={shellBody}>
    <div className={`shell ${zen ? "zen" : ""}`}>
      <aside className="rail">
        <NavLink to="/" className={() => "rail-logo"} title="墨枢">
          枢
        </NavLink>
        <NavLink to="/" end title="首页">
          <IconHome />
          首页
        </NavLink>
        <NavLink to={studioId ? `/studio/${studioId}` : lastStudio()} title="稿本" className={loc.pathname.startsWith("/studio") ? "active" : ""}>
          <IconStory />
          稿本
        </NavLink>
        <NavLink to={loc.pathname.startsWith("/teardown/") ? loc.pathname : lastTeardown()} title="拆书" className={loc.pathname.startsWith("/teardown") ? "active" : ""}>
          <IconTear />
          拆书
        </NavLink>
        <NavLink to="/skills" title="资产">
          <IconAsset />
          资产
        </NavLink>
        <NavLink to="/voice" title="文风">
          <IconAsset />
          文风
        </NavLink>
        <div className="rail-body" ref={(el) => setShellBody(el)} />
        <div className="rail-gap" />
        <NavLink to="/settings" title="设置">
          <IconGear />
          设置
        </NavLink>
      </aside>

      <header className="topbar">
        <div className="brand-name">
          <b>墨枢</b>
          <em className="wide-only">MOSHU</em>
        </div>
        {studioId ? (
          <select
            className="ghost-select"
            value="file"
            onChange={(e) => {
              const action = e.target.value;
              e.target.value = "file";
              if (action === "save") fileActions.save?.();
              if (action === "export") fileActions.exportMd?.();
              if (action === "archive") fileActions.archive?.();
              if (action === "duplicate") fileActions.duplicate?.();
              if (action === "purge") fileActions.purge?.();
            }}
          >
            <option value="file">文件</option>
            <option value="save">保存工程</option>
            <option value="export">导出正文 Markdown</option>
            <option value="archive">归档本书</option>
            <option value="duplicate">复制本书</option>
            <option value="purge">删除本书</option>
          </select>
        ) : null}
        <div className="crumb">
          {info.chapter && <span>{info.chapter}</span>}
          {studioId && bookOptions.length > 0 && (
            <select
              className="ghost-select"
              value={studioId}
              onChange={(e) => {
                const next = e.target.value;
                if (next && next !== studioId) nav(`/studio/${next}`);
              }}
            >
              {bookOptions.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.title}
                </option>
              ))}
            </select>
          )}
        </div>
        {info.genre && <span className="pill wide-only">{info.genre}</span>}
        {info.words > 0 && <span className="pill wide-only">{info.words} 字</span>}
        <span className={`pill ${info.saved ? "ok" : ""}`}>{info.saved ? "已保存" : "未保存"}</span>
        <ModelPicker />
        <div className="top-right wide-only">
          <span className="pro">专业版</span>
        </div>
      </header>

      <div className="work">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/studio/:id" element={<StudioPage />} />
          <Route path="/teardown" element={<TeardownHome />} />
          <Route path="/teardown/:id" element={<TeardownDesk />} />
          <Route path="/skills" element={<Skills />} />
          <Route path="/voice" element={<Voice />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </div>

      <ChatPanel />

      <footer className="status">
        <span>
          <i className={`dot ${configured ? "on" : ""}`} />
          {configured ? "API 已连" : "API 未配置"}
        </span>
        {failCount > 0 && <span className="fail">{failCount} 项失败</span>}
        {doneCount > 0 && <span className="ok">{doneCount} 项已完成</span>}
        {job.running && !onJobPage ? (
          <>
            <button className="status-job" type="button" onClick={() => job.href && nav(job.href)}>
              <Meter percent={jobPct} label={jobText} running compact />
            </button>
            <button className="btn-danger status-stop" type="button" onClick={() => stopJob()}>
              停止
            </button>
          </>
        ) : (
          <>
            <span className="right">稿本</span>
            <span className="right-quiet">夜案</span>
          </>
        )}
      </footer>
      {job.running && !onJobPage ? (
        <div className="job-dock">
          <button type="button" className="job-dock-go" onClick={() => job.href && nav(job.href)}>
            <Meter percent={jobPct} label={`${job.title ? `${job.title} · ` : ""}${jobText}`} running compact />
          </button>
          <button className="btn-danger" type="button" onClick={() => stopJob()}>
            停止
          </button>
        </div>
      ) : null}
    </div>
    </ShellBodyContext.Provider>
  );
}
