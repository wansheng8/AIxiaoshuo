import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, chat, type ChatMessage } from "../data/api";
import { useAppState } from "../app-state";
import type { Settings } from "../domain/types";

const QUICK = [
  { label: "读这一章，挑出逻辑漏洞", prompt: "读这一章，挑出逻辑漏洞" },
  { label: "把本章伏笔理一遍", prompt: "把本章伏笔理一遍" },
  { label: "下一章怎么接更顺", prompt: "下一章怎么接更顺" },
  { label: "这段改成更口语", prompt: "这段改成更口语" },
];

export default function ChatPanel() {
  const { info } = useAppState();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    api.settings()
      .then((row) => setSettings(row))
      .catch(() => setSettings(null));
  }, []);

  useEffect(() => {
    const el = bodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const providers = settings?.providers || [];
  const active = providers.find((row) => row.id === settings?.activeId) || providers[0];
  const modelLabel = active ? `${active.name || active.vendor} · ${active.model}` : settings?.model || "未配置模型";
  const ready = Boolean(settings) && (Boolean(active) || Boolean(settings?.model));

  async function send(text: string) {
    const content = text.trim();
    if (!content || busy) return;
    const history: ChatMessage[] = [...messages, { role: "user", content }];
    setDraft("");
    setError("");
    setMessages([...history, { role: "assistant", content: "" }]);
    setBusy(true);
    const controller = new AbortController();
    abortRef.current = controller;
    let streamed = "";
    try {
      await chat(
        {
          messages: history,
          context: {
            novelId: info.novelId || undefined,
            chapterId: info.chapterId || undefined,
            title: info.title || undefined,
            genre: info.genre || undefined,
          },
        },
        {
          signal: controller.signal,
          onToken: (token) => {
            streamed += token;
            setMessages((prev) => {
              const next = [...prev];
              next[next.length - 1] = { role: "assistant", content: streamed };
              return next;
            });
          },
          onError: (message) => setError(message),
        }
      );
      if (!streamed) {
        setMessages((prev) => prev.slice(0, -1));
        setError((prev) => prev || "模型没有返回内容");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "对话失败";
      setError(message);
      setMessages((prev) => (prev.length && prev[prev.length - 1].content ? prev : prev.slice(0, -1)));
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  }

  function stop() {
    abortRef.current?.abort();
  }

  function clear() {
    if (busy) abortRef.current?.abort();
    setMessages([]);
    setError("");
  }

  return (
    <aside className="chat-panel">
      <div className="chat-h">
        <b>墨枢 Chat</b>
        <span className="muted">写作助手</span>
        {messages.length > 0 && (
          <button className="btn-ghost chat-clear" type="button" onClick={clear}>
            清空
          </button>
        )}
      </div>
      <div className="chat-body" ref={bodyRef}>
        {messages.length === 0 ? (
          <>
            <div className="chat-card">
              <p className="muted">当前模型</p>
              <b className="chat-model">{modelLabel}</b>
              <span className="muted chat-ctx">
                {active?.contextLength ? `上下文上限 ${active.contextLength}` : ready ? "已接入对话能力" : "未接入对话能力"}
              </span>
              <div className="row-actions">
                <Link className="btn-ghost" to="/settings">
                  管理
                </Link>
              </div>
            </div>
            <div className="chat-quick">
              <p className="muted">快捷功能</p>
              {QUICK.map((item) => (
                <button key={item.label} className="chat-quick-item" type="button" onClick={() => setDraft(item.prompt)}>
                  {item.label}
                </button>
              ))}
            </div>
          </>
        ) : (
          <ol className="chat-log">
            {messages.map((row, index) => (
              <li key={index} className={`chat-msg chat-msg-${row.role}`}>
                {row.content ? (
                  <p>{row.content}</p>
                ) : (
                  <p className="muted">{busy && index === messages.length - 1 ? "思考中…" : "（空）"}</p>
                )}
              </li>
            ))}
          </ol>
        )}
        {error && <p className="chat-error">{error}</p>}
      </div>
      <div className="chat-foot">
        <textarea
          value={draft}
          spellCheck={false}
          placeholder="有什么想聊的吗？"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              send(draft);
            }
          }}
        />
        {busy ? (
          <button className="btn chat-stop" type="button" onClick={stop}>
            停止
          </button>
        ) : (
          <button className="btn-mint" type="button" disabled={!draft.trim()} onClick={() => send(draft)}>
            发送
          </button>
        )}
      </div>
    </aside>
  );
}
