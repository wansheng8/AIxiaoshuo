import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../data/api";
import type { Settings } from "../domain/types";

const QUICK = [
  { label: "读这一章，挑出逻辑漏洞", prompt: "读这一章，挑出逻辑漏洞" },
  { label: "把本章伏笔理一遍", prompt: "把本章伏笔理一遍" },
  { label: "下一章怎么接更顺", prompt: "下一章怎么接更顺" },
  { label: "这段改成更口语", prompt: "这段改成更口语" },
];

export default function ChatPanel() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    api.settings()
      .then((row) => setSettings(row))
      .catch(() => setSettings(null));
  }, []);

  const providers = settings?.providers || [];
  const active = providers.find((row) => row.id === settings?.activeId) || providers[0];
  const modelLabel = active ? `${active.name || active.vendor} · ${active.model}` : settings?.model || "未配置模型";

  return (
    <aside className="chat-panel">
      <div className="chat-h">
        <b>墨枢 Chat</b>
        <span className="muted">写作助手</span>
      </div>
      <div className="chat-body">
        <div className="chat-card">
          <p className="muted">当前模型</p>
          <b className="chat-model">{modelLabel}</b>
          <span className="muted chat-ctx">
            {active?.contextLength ? `上下文上限 ${active.contextLength}` : "未接入对话能力"}
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
      </div>
      <div className="chat-foot">
        <textarea
          value={draft}
          spellCheck={false}
          placeholder="有什么想聊的吗？"
          onChange={(event) => setDraft(event.target.value)}
        />
        <button className="btn-mint" type="button" disabled title="接入对话能力后可用">
          发送
        </button>
      </div>
    </aside>
  );
}
