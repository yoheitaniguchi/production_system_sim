import { configDefaults, defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// GitHub Pages（プロジェクトサイト）は https://<owner>.github.io/<repo>/ 配下で配信されるため、
// build成果物とその動作確認（vite preview）ではアセットパスの先頭にリポジトリ名を付与する
// （`npm run dev` の開発サーバーはこれまでどおりルート配信のままにする）。
// PRプレビュー（.github/workflows/pr-preview.yml）はさらに深い pr-preview/pr-<番号>/ 配下に
// 配信されるため、CI側で BASE_PATH 環境変数を渡してそちらを優先させる。
export default defineConfig(({ command, isPreview }) => ({
  plugins: [react()],
  base: process.env.BASE_PATH ?? (command === "build" || isPreview ? "/production_system_sim/" : "/"),
  // e2e/配下はPlaywright専用（playwright.config.ts参照）。ファイル名が*.spec.tsのためvitestの
  // デフォルトincludeと衝突するので明示的に除外する
  test: {
    exclude: [...configDefaults.exclude, "e2e/**"],
    // 自動テスト管理アプリ（PoC）等の外部ツールがCI結果を機械的に取り込めるよう、JUnit XMLも
    // 併せて出力する（vitestに標準搭載のreporterで追加devDependencyは不要）。出力先はPlaywright用の
    // test-results/と共有するが、ファイル名を分けて衝突を避ける
    reporters: ["default", "junit"],
    outputFile: {
      junit: "test-results/junit.xml",
    },
    coverage: {
      provider: "v8",
      // 人が読むレポート（text/html）に加え、外部ツールが数値を機械的に読み取れる
      // json-summaryも出力する。CIでの実行・成果物アップロードは今回は行わない
      reporter: ["text", "html", "json-summary"],
      exclude: [...configDefaults.exclude, "e2e/**", "src/**/*.test.ts", "src/main.tsx"],
    },
  },
}));
