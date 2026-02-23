import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 32, color: "#f5f1ea", fontFamily: "sans-serif" }}>
          <h2 style={{ color: "#dc6d6d" }}>页面渲染出错</h2>
          <p style={{ color: "#d2c8b9" }}>{this.state.error?.message || "未知错误"}</p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              marginTop: 12,
              padding: "8px 16px",
              border: "1px solid rgba(243,206,147,0.4)",
              borderRadius: 999,
              background: "rgba(22,26,32,0.65)",
              color: "#f5f1ea",
              cursor: "pointer"
            }}
          >
            重试
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
