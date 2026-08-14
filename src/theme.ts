// スタイル切り替え（バーガーメニュー「スタイル」）用のテーマ定義。
// 実際の配色は src/index.css の [data-theme="..."] ブロックで定義する。
export type ThemeGroup = "light" | "dark";

export interface ThemeOption {
  id: string;
  label: string;
  group: ThemeGroup;
}

export const THEME_OPTIONS: ThemeOption[] = [
  { id: "material-light", label: "マテリアル・クリーン", group: "light" },
  { id: "warm-paper", label: "ソフトペーパー", group: "light" },
  { id: "glass-light", label: "グラスモフィズム・ライト", group: "light" },
  { id: "deep-gray", label: "ディープグレー", group: "dark" },
  { id: "true-black", label: "トゥルーブラック", group: "dark" },
  { id: "midnight-blue", label: "ダークネイビー・ミッドナイト", group: "dark" },
];

export const DEFAULT_LIGHT_THEME_ID = "material-light";
export const DEFAULT_DARK_THEME_ID = "deep-gray";

const STORAGE_KEY = "production-system-sim:theme";

function isThemeId(value: string | null): value is string {
  return value !== null && THEME_OPTIONS.some((t) => t.id === value);
}

// 画面表示用のテーマ選択はUI上の好みであり、design.md記載の「シミュレーション状態は非永続」
// （受注・在庫などのドメインデータ）とは別物のため、localStorageに保存してよい。
export function loadStoredTheme(): string {
  if (typeof window === "undefined") return DEFAULT_LIGHT_THEME_ID;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (isThemeId(stored)) return stored;
  const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  return prefersDark ? DEFAULT_DARK_THEME_ID : DEFAULT_LIGHT_THEME_ID;
}

export function storeTheme(themeId: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, themeId);
}
