import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { error: Error | null };

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("墨枢运行出错：", error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div
        style={{
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          padding: "24px 18px",
          background: "#0b0d11",
          color: "#e7e3da",
          fontFamily: "system-ui, -apple-system, 'Noto Sans SC', sans-serif",
        }}
      >
        <div style={{ maxWidth: 560, width: "100%" }}>
          <h2 style={{ margin: "0 0 8px", fontSize: 20 }}>页面出错了</h2>
          <p style={{ margin: "0 0 12px", color: "#9aa0a6", lineHeight: 1.7 }}>
            界面遇到一个意外错误被拦下了。可以先重试，若反复出现请把下面这段信息发给我。
          </p>
          <pre
            style={{
              margin: "0 0 16px",
              padding: "10px 12px",
              background: "#12151b",
              border: "1px solid #242832",
              borderRadius: 10,
              fontSize: 12,
              lineHeight: 1.6,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              maxHeight: "36vh",
              overflow: "auto",
            }}
          >
            {String(error?.stack || error?.message || error)}
          </pre>
          <div style={{ display: "flex", gap: 10 }}>
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                padding: "9px 16px",
                borderRadius: 8,
                border: "1px solid #2f6f4f",
                background: "#123528",
                color: "#5ee6c3",
                cursor: "pointer",
              }}
            >
              重新加载
            </button>
            <a
              href="/"
              style={{
                padding: "9px 16px",
                borderRadius: 8,
                border: "1px solid #242832",
                color: "#e7e3da",
                textDecoration: "none",
              }}
            >
              返回首页
            </a>
          </div>
        </div>
      </div>
    );
  }
}
