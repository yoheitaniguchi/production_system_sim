// 左上のバーガーメニュー。押下でメニューの開閉をトグルし、内部の「スタイル」ボタンで
// ライト/ダークの配色テーマ（6種類）を切り替えられるようにする。
import { useEffect, useRef, useState } from "react";
import { THEME_OPTIONS } from "../theme";

interface BurgerMenuProps {
  themeId: string;
  onSelectTheme: (id: string) => void;
}

function BurgerMenu({ themeId, onSelectTheme }: BurgerMenuProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [styleOpen, setStyleOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

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
      if (open) setStyleOpen(false);
      return !open;
    });
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
        </div>
      )}
    </div>
  );
}

export default BurgerMenu;
