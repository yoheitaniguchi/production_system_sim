import { defineConfig, devices } from "@playwright/test";

// アクセシビリティ自動テスト（Issue #63）専用のPlaywright設定。
// npm run dev（base "/"）を対象にする。npm run build/previewはbaseが/production_system_sim/になり
// CIジョブを分ける目的（型チェック・vitestジョブとブラウザインストールコストを分離）に対して
// ビルド待ちが増えるだけで得るものが無いため、devサーバーで十分とする。
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:5173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
