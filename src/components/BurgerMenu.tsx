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
  const rootRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
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

  const handleScenarioExport = () => {
    downloadTextFile(`scenario_D${state.day}_${todayDateStamp()}.json`, "application/json", serializeScenario(state));
    setScenarioNotice({ kind: "ok", text: `D+${state.day} の状態をシナリオとしてエクスポートしました` });
  };

  const handleScenarioImportFile = async (file: File) => {
    setScenarioNotice(null);
    let imported: SimulationState;
    try {
      imported = parseScenario(await file.text());
    } catch (err) {
      setScenarioNotice({
        kind: "error",
        text: err instanceof ScenarioIOError ? err.message : `読み込みに失敗しました: ${String(err)}`,
      });
      return;
    }
    const summary = `D+${imported.day}、受注${imported.salesOrders.length}件`;
    if (!window.confirm(`現在の状態（マスタ・受注・オーダ・在庫・ログを含む）をすべて置き換えます。取り込む内容：${summary}。続けますか？`)) {
      return;
    }
    dispatch({ type: "SCENARIO_IMPORT", payload: { state: imported } });
    setScenarioNotice({ kind: "ok", text: `シナリオを取り込みました（${summary}）` });
  };

  const lightThemes = THEME_OPTIONS.filter((t) => t.group === "light");
  const darkThemes = THEME_OPTIONS.filter((t) => t.group === "dark");

  return (
    <div className="burger-menu" ref={rootRef}>
      <button
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
            シナリオ
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
                マスタ・受注・オーダ・在庫・ログを含む状態全体をJSONで保存・復元する。取り込むと現在の状態は置き換わる
              </p>
            </div>
          )}

          {scenarioNotice && (
            <div
              className={`burger-menu__notice burger-menu__notice--${scenarioNotice.kind}`}
              role={scenarioNotice.kind === "error" ? "alert" : "status"}
            >
              {scenarioNotice.text}
            </div>
          )}
        </div>
      )}

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
