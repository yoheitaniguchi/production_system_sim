import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

// SEC-003：本アプリにはバックエンドが無く永続化も無いため、予期しない例外で白画面のまま固まると
// 演習内容が復旧不能になる。React自体は例外を捕捉しないとツリー全体を空にするため、
// Error Boundaryをルート直下（main.tsx）に置き、最低限の再読み込み導線を出す。
class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // 利用者には詳細なスタックトレースを見せず、開発者向けにconsoleへ残す
    console.error("予期しないエラーが発生しました", error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="error-boundary" role="alert">
          <h1>エラーが発生しました</h1>
          <p>アプリの表示中に問題が発生しました。ページを再読み込みしてください。</p>
          <p>この操作でシミュレーションの状態（受注・在庫等）は失われます（本アプリは非永続です）。</p>
          <button type="button" onClick={() => window.location.reload()}>
            再読み込み
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
