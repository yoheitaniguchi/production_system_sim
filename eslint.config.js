import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

// 初期導入（Issue #82）のため、既存コードへの影響が少ない設定を優先する。
// error扱いはバグに直結するルール（未定義変数・hooksのルール違反等）に限定し、
// 大量の既存修正を伴いうるルールはwarnまたはoffにとどめる。
export default tseslint.config(
  {
    ignores: ["dist", "coverage", "playwright-report", "test-results", "eslint-report.json"],
  },
  {
    files: ["**/*.{ts,tsx}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: {
      // hooksの呼び出し順序違反は実行時エラーに直結するためerror。依存配列の抜けは
      // 誤検知もあるためwarnにとどめる（react-hooks v7の"recommended"は
      // React Compiler向けの追加ルール群まで含み本リポジトリの対象外のため使わない）
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",

      // tsconfig.jsonのnoUnusedLocals/noUnusedParametersで既にtscがビルド時に
      // 検出しているため、ESLint側では重複を避けoffにする
      "@typescript-eslint/no-unused-vars": "off",
      // ドメインロジック層のCLAUDE.md方針（reducer.tsが渡した状態をクローンして直接書き換える）
      // 上、`any`を機械的に禁止すると既存コードの広範な書き換えが必要になるためwarnにとどめる
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
);
