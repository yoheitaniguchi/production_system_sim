import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages（プロジェクトサイト）は https://<owner>.github.io/<repo>/ 配下で配信されるため、
// build成果物とその動作確認（vite preview）ではアセットパスの先頭にリポジトリ名を付与する
// （`npm run dev` の開発サーバーはこれまでどおりルート配信のままにする）。
// PRプレビュー（.github/workflows/pr-preview.yml）はさらに深い pr-preview/pr-<番号>/ 配下に
// 配信されるため、CI側で BASE_PATH 環境変数を渡してそちらを優先させる。
export default defineConfig(({ command, isPreview }) => ({
  plugins: [react()],
  base: process.env.BASE_PATH ?? (command === "build" || isPreview ? "/production_system_sim/" : "/"),
}));
