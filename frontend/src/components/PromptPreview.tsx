import { useEffect, useMemo, useState } from "react";
import { api } from "../data/api";
import type { PromptPreview as PromptPreviewData } from "../domain/types";

type Props = {
  open: boolean;
  onClose: () => void;
  skillId: string;
  skillName?: string;
  projectId?: string;
  chapterId?: string;
  extra?: string;
  include?: Record<string, boolean>;
  tokenBudget?: number;
};

export function PromptPreview({ open, onClose, skillId, skillName, projectId, chapterId, extra, include, tokenBudget }: Props) {
  const [data, setData] = useState<PromptPreviewData | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<"parts" | "system" | "user">("parts");
  const [expanded, setExpanded] = useState<string>("");
  const [copied, setCopied] = useState("");

  useEffect(() => {
    if (!open || !skillId) return;
    let alive = true;
    setBusy(true);
    setError("");
    setData(null);
    setExpanded("");
    api
      .previewPrompt({ skillId, projectId, chapterId, extra, include, tokenBudget })
      .then((res) => {
        if (!alive) return;
        setData(res);
        setExpanded(res.parts.find((p) => p.key === "skill")?.key || res.parts[0]?.key || "");
      })
      .catch((err) => alive && setError((err as Error).message))
      .finally(() => alive && setBusy(false));
    return () => {
      alive = false;
    };
  }, [open, skillId, projectId, chapterId, extra, include, tokenBudget]);

  const totals = useMemo(() => {
    if (!data) return { system: 0, user: 0, est: 0 };
    return { system: data.metrics.systemTokens, user: data.metrics.userTokens, est: data.metrics.estTokens };
  }, [data]);

  async function copy(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(""), 1500);
    } catch {
      setCopied("");
    }
  }

  if (!open) return null;

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal prompt-preview" onClick={(e) => e.stopPropagation()}>
        <header className="prompt-head">
          <div>
            <h3>将注入的提示词</h3>
            <p className="muted">
              {skillName || data?.skillName || skillId}
              {data ? ` · ${data.writing ? "写作类" : "设定/审稿类"}${data.voiceActive ? " · 底味已开" : ""}` : ""}
              {data?.stub ? " · 预览工程（未选稿本）" : ""}
            </p>
          </div>
          <button className="btn-ghost" onClick={onClose}>
            关闭
          </button>
        </header>

        {busy && <p className="muted">正在组装…</p>}
        {error && <p className="err">{error}</p>}

        {data && (
          <>
            <div className="prompt-stats">
              <span>
                system <b>{totals.system}</b> tokens
              </span>
              <span>
                user <b>{totals.user}</b> tokens
              </span>
              <span className={`prompt-total ${totals.est > (tokenBudget || 40000) ? "over" : ""}`}>
                合计 <b>{totals.est}</b> tokens
              </span>
              <span className="muted">预算 {tokenBudget || 40000}</span>
            </div>

            {data.warnings.length > 0 && (
              <ul className="prompt-warns">
                {data.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            )}
            {data.missing.length > 0 && <p className="muted">缺失资料：{data.missing.join("、")}</p>}

            <div className="prompt-tabs">
              {(
                [
                  ["parts", `分段（${data.parts.length}）`],
                  ["system", `完整 system（${data.metrics.systemChars} 字）`],
                  ["user", `完整 user（${data.metrics.userChars} 字）`],
                ] as const
              ).map(([key, label]) => (
                <button key={key} className={view === key ? "on" : ""} onClick={() => setView(key)}>
                  {label}
                </button>
              ))}
            </div>

            {view === "parts" && (
              <div className="prompt-parts">
                {data.parts.map((p) => (
                  <div key={p.key} className="prompt-part">
                    <button className="prompt-part-head" onClick={() => setExpanded(expanded === p.key ? "" : p.key)}>
                      <b>{p.label}</b>
                      <span className="muted">
                        {p.chars} 字 · {p.tokens} tokens
                      </span>
                      <span className="prompt-caret">{expanded === p.key ? "收起" : "展开"}</span>
                    </button>
                    {expanded === p.key && (
                      <>
                        <div className="prompt-part-actions">
                          <button className="btn-ghost" onClick={() => copy(p.text, p.key)}>
                            {copied === p.key ? "已复制" : "复制这段"}
                          </button>
                        </div>
                        <pre className="prompt-body">{p.text}</pre>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}

            {view === "system" && (
              <div className="prompt-full">
                <div className="prompt-part-actions">
                  <button className="btn-ghost" onClick={() => copy(data.system, "system")}>
                    {copied === "system" ? "已复制" : "复制 system"}
                  </button>
                </div>
                <pre className="prompt-body">{data.system}</pre>
              </div>
            )}

            {view === "user" && (
              <div className="prompt-full">
                <div className="prompt-part-actions">
                  <button className="btn-ghost" onClick={() => copy(data.user, "user")}>
                    {copied === "user" ? "已复制" : "复制 user"}
                  </button>
                </div>
                <pre className="prompt-body">{data.user}</pre>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
