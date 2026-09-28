import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// Issue #63：ux-reviewerによる手動アクセシビリティレビューの一部をCI上の自動テストとして担保する。
// 検査対象はライト・ダーク2テーマ（他4テーマはindex.cssのトークン共有により大きく状態が変わらない前提の
// ため初期スコープでは対象外。design.md/CLAUDE.mdの既定テーマIDと合わせる）× 主要画面（App.tsxのTABS、
// 現状15タブ）。タブ一覧はDOMから動的に取得するため、TABS配列に新規画面を追加しても検査対象に自動で
// 含まれる。
// 重大度ゲート：critical/serious相当の違反が1件でもあればテストを失敗させる。minor/moderateは
// アタッチメントとしてレポートするのみで、テストを失敗させない（Issue #63の要件どおり）。
const THEMES = [
  { id: "material-light", label: "ライト（マテリアル・クリーン）" },
  { id: "deep-gray", label: "ダーク（ディープグレー）" },
] as const;

const THEME_STORAGE_KEY = "production-system-sim:theme";
const BLOCKING_IMPACTS = new Set(["critical", "serious"]);

interface ViolationRecord {
  tab: string;
  id: string;
  impact: string | null;
  help: string;
  helpUrl: string;
  nodeCount: number;
}

for (const theme of THEMES) {
  test.describe(`アクセシビリティ検査（${theme.label}）`, () => {
    test.beforeEach(async ({ page }) => {
      // App起動前にlocalStorageへテーマを仕込む（theme.tsのloadStoredTheme()が初回描画時に参照する）。
      await page.addInitScript(
        ({ key, value }) => window.localStorage.setItem(key, value),
        { key: THEME_STORAGE_KEY, value: theme.id },
      );
      await page.goto("/");
      await expect(page.locator("nav.app__tabs")).toBeVisible();
    });

    test("各タブでcritical/serious相当の違反がないこと", async ({ page }, testInfo) => {
      // プロセス連携図トグル（aria-pressed属性を持つ）はポップアップ表示のため、ドメイン/分析タブとは
      // 別に扱う（App.tsx参照）。ここでは主要画面タブのみを対象にする。
      const tabButtons = page.locator("nav.app__tabs button.app__tab:not([aria-pressed])");
      const tabCount = await tabButtons.count();
      expect(tabCount).toBeGreaterThan(0);

      const allViolations: ViolationRecord[] = [];
      const blockingMessages: string[] = [];

      for (let i = 0; i < tabCount; i++) {
        const button = tabButtons.nth(i);
        const tabLabel = (await button.textContent())?.trim() || `tab-${i}`;
        await button.click();
        await expect(button).toHaveClass(/app__tab--active/);

        const results = await new AxeBuilder({ page }).analyze();

        for (const violation of results.violations) {
          allViolations.push({
            tab: tabLabel,
            id: violation.id,
            impact: violation.impact ?? null,
            help: violation.help,
            helpUrl: violation.helpUrl,
            nodeCount: violation.nodes.length,
          });
          if (violation.impact && BLOCKING_IMPACTS.has(violation.impact)) {
            blockingMessages.push(
              `[${tabLabel}] ${violation.id} (${violation.impact}): ${violation.help} — ${violation.nodes.length}件`,
            );
          }
        }
      }

      await testInfo.attach(`axe-violations-${theme.id}.json`, {
        body: JSON.stringify(allViolations, null, 2),
        contentType: "application/json",
      });

      // minor/moderateはCIを失敗させない（上のattachでレポートのみ行う）。
      expect(blockingMessages, blockingMessages.join("\n")).toEqual([]);
    });

    // Issue #67：初期状態では作業指示が無く、能力タブは山積みバーグラフを描画せず空メッセージを出すだけなので、
    // 上のテストではグラフが一度も検査されない。TC-04〜05相当の操作（受注→MRP→計画オーダ確定）で負荷を作って
    // からグラフ付きの能力タブを検査する。狭い幅ではグラフが横スクロールし、フォーカスできないスクロール領域
    // （axeのscrollable-region-focusable）が生じうるため、通常幅と狭い幅の両方で確認する。
    for (const viewport of [
      { label: "通常幅", width: 1280, height: 900 },
      { label: "狭い幅", width: 375, height: 800 },
    ]) {
      test(`山積みバーグラフのある能力タブでcritical/serious相当の違反がないこと（${viewport.label}）`, async ({ page }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        const main = page.locator("main.app__main");
        const tabs = page.locator("nav.app__tabs");
        const gotoTab = (label: string) => tabs.getByRole("button", { name: new RegExp(`^${label}`) }).click();

        await gotoTab("受注");
        await main.getByLabel("数量").fill("10");
        await main.getByLabel("希望納期（D+）").fill("15");
        await main.getByRole("button", { name: "受注登録", exact: true }).click();
        await main.getByLabel("回答納期（D+）").fill("15");
        await main.getByRole("button", { name: "納期回答", exact: true }).click();
        await gotoTab("計画");
        await main.getByRole("button", { name: "MRPを実行", exact: true }).click();
        await main.getByRole("button", { name: /^計画オーダを確定/ }).click();
        await gotoTab("能力");
        await expect(page.locator(".capacity-chart__svg")).toBeVisible();

        const results = await new AxeBuilder({ page }).analyze();
        const blocking = results.violations
          .filter((v) => v.impact && BLOCKING_IMPACTS.has(v.impact))
          .map((v) => `${v.id} (${v.impact}): ${v.help} — ${v.nodes.length}件`);
        expect(blocking, blocking.join("\n")).toEqual([]);
      });
    }
  });
}
