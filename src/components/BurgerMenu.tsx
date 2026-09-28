// 左上のバーガーメニュー。押下でメニューの開閉をトグルし、内部の「スタイル」ボタンで
// ライト/ダークの配色テーマ（6種類）を、「シナリオ」ボタンで現在の状態全体のJSON書き出し・取り込み
// （Issue #61、design.md EXT-40）を行えるようにする。
import { useEffect, useRef, useState } from "react";
import { parseScenario, ScenarioIOError, serializeScenario } from "../domain/scenarioIO";
import type { SimulationAction } from "../domain/reducer";
import { downloadTextFile } from "../fileDownload";
import { todayDateStamp } from "../csvExport";
import { THEME_OPTIONS } from "../theme";
import type { SimulationState } from "../types";

interface BurgerMenuProps {
  themeId: string;
  onSelectTheme: (id: string) => void;
  state: SimulationState;
  dispatch: (action: SimulationAction) => void;
}

interface ScenarioNotice {
  kind: "ok" | "error";
  text: string;
}

function BurgerMenu({ themeId, onSelectTheme, state, dispatch }: BurgerMenuProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [styleOpen, setStyleOpen] = useState(false);
  const [scenarioOpen, setScenarioOpen] = useState(false);
  const [scenarioNotice, setScenarioNotice] = useState<ScenarioNotice | null>(null);
  // 結果の読み上げ専用。メニュー内の通知は動的に挿入・破棄されるため、常時マウントしておく領域で確実に伝える
  const [liveMessage, setLiveMessage] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    // どの経路（外側クリック・Esc・ボタン）で閉じても、展開状態と通知を同じようにリセットする
    const close = () => {
      setMenuOpen(false);
      setStyleOpen(false);
      setScenarioOpen(false);
      setScenarioNotice(null);
    };
    const handlePointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close();
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
        // メニュー内のボタンにあったフォーカスがbodyへ落ちないよう、開閉ボタンへ戻す
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

  const toggleMenu = () => {
    setMenuOpen((open) => {
      if (open) {
        setStyleOpen(false);
        setScenarioOpen(false);
        setScenarioNotice(null);
      }
      return !open;
    });
  };

  const showScenarioNotice = (notice: ScenarioNotice) => {
    setScenarioNotice(notice);
    setLiveMessage(notice.kind === "error" ? notice.text.split("\n")[0] : notice.text);
  };

  const handleScenarioExport = () => {
    downloadTextFile(`scenario_D${state.day}_${todayDateStamp()}.json`, "application/json", serializeScenario(state));
    showScenarioNotice({ kind: "ok", text: `D+${state.day} の状態をシナリオとしてエクスポートしました` });
  };

  const handleScenarioImportFile = async (file: File) => {
    setScenarioNotice(null);
    let imported: SimulationState;
    try {
      imported = parseScenario(await file.text());
    } catch (err) {
      showScenarioNotice({
        kind: "error",
        text: err instanceof ScenarioIOError ? err.message : `読み込みに失敗しました: ${String(err)}`,
      });
      return;
    }
    const summary = `D+${imported.day}、受注${imported.salesOrders.length}件`;
    const confirmed = window.confirm(
      `現在の状態（D+${state.day}、受注${state.salesOrders.length}件）を、取り込む内容（${summary}）で置き換えます。` +
        "マスタ・受注・オーダ・在庫・ログのすべてが対象です。\n\n" +
        "この操作は元に戻せません。現在の状態が必要なら、先に「現在の状態をエクスポート」で保存してください。続けますか？",
    );
    if (!confirmed) return;
    dispatch({ type: "SCENARIO_IMPORT", payload: { state: imported } });
    showScenarioNotice({ kind: "ok", text: `シナリオを取り込みました（${summary}）` });
  };

  const lightThemes = THEME_OPTIONS.filter((t) => t.group === "light");
  const darkThemes = THEME_OPTIONS.filter((t) => t.group === "dark");

  return (
    <div className="burger-menu" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="burger-menu__button"
        aria-label={menuOpen ? "メニューを閉じる" : "メニューを開く"}
        aria-expanded={menuOpen}
        onClick={toggleMenu}
      >
        <span />
        <span />
        <span />
      </button>

      {menuOpen && (
        <div className="burger-menu__panel">
          <button
            type="button"
            className="burger-menu__item"
            aria-expanded={styleOpen}
            onClick={() => setStyleOpen((open) => !open)}
          >
            スタイル
            <span className="burger-menu__caret" aria-hidden="true">
              {styleOpen ? "▲" : "▼"}
            </span>
          </button>

          {styleOpen && (
            <div className="burger-menu__submenu">
              <p className="burger-menu__group-label">ライトモード</p>
              {lightThemes.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={
                    t.id === themeId
                      ? "burger-menu__theme burger-menu__theme--active"
                      : "burger-menu__theme"
                  }
                  aria-pressed={t.id === themeId}
                  onClick={() => onSelectTheme(t.id)}
                >
                  {t.label}
                </button>
              ))}
              <p className="burger-menu__group-label">ダークモード</p>
              {darkThemes.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={
                    t.id === themeId
                      ? "burger-menu__theme burger-menu__theme--active"
                      : "burger-menu__theme"
                  }
                  aria-pressed={t.id === themeId}
                  onClick={() => onSelectTheme(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}

          <button
            type="button"
            className="burger-menu__item"
            aria-expanded={scenarioOpen}
            onClick={() => setScenarioOpen((open) => !open)}
          >
            シナリオの保存・復元
            <span className="burger-menu__caret" aria-hidden="true">
              {scenarioOpen ? "▲" : "▼"}
            </span>
          </button>

          {scenarioOpen && (
            <div className="burger-menu__submenu">
              <button type="button" className="burger-menu__action" onClick={handleScenarioExport}>
                現在の状態をエクスポート
              </button>
              <button type="button" className="burger-menu__action" onClick={() => fileInputRef.current?.click()}>
                ファイルからインポート
              </button>
              <p className="burger-menu__hint">
                マスタ・受注・オーダ・在庫・ログを含む状態全体をJSONで保存・復元する（マスタだけの入出力はマスタタブ）。
                取り込むと現在の状態は置き換わり、元に戻せない
              </p>
            </div>
          )}

          {scenarioNotice && scenarioNotice.kind === "ok" && (
            <div className="burger-menu__notice burger-menu__notice--ok">{scenarioNotice.text}</div>
          )}

          {scenarioNotice && scenarioNotice.kind === "error" && (
            <div className="burger-menu__notice burger-menu__notice--error">
              {/* 読み上げるのは概要の1行だけ。詳細は下の領域をキーボードでスクロールして読む */}
              <p role="alert" className="burger-menu__notice-summary">
                {scenarioNotice.text.split("\n")[0]}
              </p>
              {scenarioNotice.text.includes("\n") && (
                <pre className="burger-menu__notice-detail" tabIndex={0} aria-label="エラーの詳細（スクロールできます）">
                  {scenarioNotice.text.split("\n").slice(1).join("\n")}
                </pre>
              )}
            </div>
          )}
        </div>
      )}

      <div className="burger-menu__live" role="status" aria-live="polite">
        {liveMessage}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        className="burger-menu__file-input"
        aria-label="シナリオJSONファイルを選択"
        onChange={(e) => {
          const file = e.target.files?.[0];
          // 同じファイルを続けて選び直せるように値をクリアしておく
          e.target.value = "";
          if (file) void handleScenarioImportFile(file);
        }}
      />
    </div>
  );
}

export default BurgerMenu;
