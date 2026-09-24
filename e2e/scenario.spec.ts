import { expect, test } from "@playwright/test";

// Issue #90：業務シナリオの自動E2Eテスト（縮小版スコープ）。
// v5-spec.md §9.3の正常系テストケースのうち、受注登録から出荷実績登録までの主要フロー
// （TC-02・TC-03・TC-04・TC-05・TC-07・TC-08・TC-09・TC-10・TC-11・TC-12・TC-15・TC-16相当）を
// 1本のテストとして、ブラウザ上の実際の操作（フォーム入力→ボタン押下→表への反映）で検証する。
// 既存のe2e/a11y.spec.tsとは別ファイル・別npm script（test:e2e:scenario）・別CIジョブ（e2e-scenario）
// として独立させている（package.json・.github/workflows/test.yml参照）。
//
// 対象範囲外（Issue #90「対象範囲外」参照）：TC-01・TC-06・TC-13・TC-14・TC-17・TC-18、
// TC-E1〜E3、TC-M1、design.mdで追加された画面（マスタCRUD・原価・能力等）のシナリオ化。
//
// TodayActionsBar（App.tsx、<main>の外側に常時表示）が「納期回答待ちの受注（1）」のような
// ボタンを表示し、パネル内の「納期回答」等のボタン名と部分一致してしまうため、パネル操作は
// すべて<main class="app__main">配下に明示的にスコープする。

test.describe("業務シナリオ：受注登録から出荷実績登録まで（v5-spec.md §9.3 正常系、縮小版）", () => {
  test("TC-02〜05・07〜12・15〜16相当を通しで操作する", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("nav.app__tabs")).toBeVisible();

    const tabs = page.locator("nav.app__tabs");
    const main = page.locator("main.app__main");
    const gotoTab = (label: string) => tabs.getByRole("button", { name: new RegExp(`^${label}`) }).click();

    const dayLabel = page.locator(".clock-controls__day");
    const advanceDayTo = async (targetDay: number) => {
      let current = Number((await dayLabel.textContent())?.replace("D+", ""));
      while (current < targetDay) {
        await page.getByRole("button", { name: "次の日へ進む" }).click();
        current++;
      }
      await expect(dayLabel).toHaveText(`D+${targetDay}`);
    };

    // --- TC-02: 受注登録 FG-100 x10 希望D+15（受注タブ） ---
    await gotoTab("受注");
    await main.getByLabel("数量").fill("10");
    await main.getByLabel("希望納期（D+）").fill("15");
    await main.getByRole("button", { name: "受注登録", exact: true }).click();

    const soRow = () => main.locator("table.panel__table tbody tr").first();
    await expect(soRow().locator("td").nth(3)).toHaveText("10"); // 数量
    await expect(soRow().locator("td").nth(4)).toHaveText("D+15"); // 希望納期
    await expect(soRow().locator("td").nth(7)).toHaveText("受付"); // 状態＝RECEIVED

    // --- TC-03: 納期回答 D+15（受注タブ） ---
    await main.getByLabel("回答納期（D+）").fill("15");
    await main.getByRole("button", { name: "納期回答", exact: true }).click();
    await expect(soRow().locator("td").nth(5)).toHaveText("D+15"); // 回答納期
    await expect(soRow().locator("td").nth(7)).toHaveText("回答済"); // 状態＝CONFIRMED

    // --- TC-04: MRP実行（計画タブ） ---
    await gotoTab("計画");
    await main.getByRole("button", { name: "MRPを実行", exact: true }).click();
    const planningRows = main.locator("table.panel__table tbody tr");
    await expect(planningRows).toHaveCount(5); // FG-100/SA-200/RM-300/PT-400/PT-500の5件

    // --- TC-05: 全計画オーダを確定（計画タブ） ---
    await main.getByRole("button", { name: /^計画オーダを確定/ }).click();
    await expect(main.getByText("計画オーダはありません。MRPを実行してください。")).toBeVisible();

    // --- TC-07: 仕入先納期回答（希望どおり）（発注タブ） ---
    await gotoTab("発注");
    const procurementRows = main.locator("table.panel__table tbody tr");
    await expect(procurementRows).toHaveCount(3); // RM-300・PT-400・PT-500の3件
    for (let i = 0; i < 3; i++) {
      await procurementRows.nth(i).getByRole("button", { name: "納期回答", exact: true }).click();
      await expect(procurementRows.nth(i).locator("td").nth(9)).toHaveText("納期回答済");
    }

    // --- TC-08: D+12まで進め、RM-300を入荷計上（発注タブ・時計操作） ---
    await advanceDayTo(12);
    // purchaseOrdersはfirmAllPlannedOrders時点でRM-300→PT-400→PT-500の順に生成されるため、
    // 発注一覧の1行目がRM-300（木板）になる
    const rmPoRow = procurementRows.nth(0);
    await expect(rmPoRow).toContainText("木板");
    await rmPoRow.getByRole("button", { name: "入荷計上", exact: true }).click();
    await expect(rmPoRow.locator("td").nth(8)).toHaveText("10"); // 入荷済数
    await expect(rmPoRow.locator("td").nth(9)).toHaveText("入庫完了"); // 状態＝CLOSED

    // --- TC-09: SA-200 着手→完了（良品10・不良0）（工程タブ） ---
    await gotoTab("工程");
    const saGroup = main.locator(".panel__group", { hasText: "座面ASSY" });
    await saGroup.getByRole("button", { name: "リリース", exact: true }).click();
    await saGroup.getByRole("button", { name: "着手", exact: true }).click();
    // 投入数=10に対する既定値（良品=投入数、不良=0）がTC-09の期待値と一致するため、
    // 入力欄は変更せずそのまま完了する
    await saGroup.getByRole("button", { name: "完了", exact: true }).click();
    await expect(saGroup).toContainText("状態 完了");

    // --- TC-10: D+14まで進め、PT-400・PT-500を入荷計上（発注タブ・時計操作） ---
    await gotoTab("発注");
    await advanceDayTo(14);
    const ptLegPoRow = procurementRows.nth(1);
    const ptScrewPoRow = procurementRows.nth(2);
    await expect(ptLegPoRow).toContainText("脚");
    await expect(ptScrewPoRow).toContainText("ネジ");
    await ptLegPoRow.getByRole("button", { name: "入荷計上", exact: true }).click();
    await expect(ptLegPoRow.locator("td").nth(8)).toHaveText("40");
    await expect(ptLegPoRow.locator("td").nth(9)).toHaveText("入庫完了");
    await ptScrewPoRow.getByRole("button", { name: "入荷計上", exact: true }).click();
    await expect(ptScrewPoRow.locator("td").nth(8)).toHaveText("80");
    await expect(ptScrewPoRow.locator("td").nth(9)).toHaveText("入庫完了");

    // --- TC-11: FG-100 着手→工程10 組立完了（良品10・不良0）（工程タブ） ---
    await gotoTab("工程");
    const fgGroup = main.locator(".panel__group", { hasText: "木製イス" });
    await fgGroup.getByRole("button", { name: "リリース", exact: true }).click();
    await fgGroup.getByRole("button", { name: "着手", exact: true }).click(); // 工程10 組立
    // 工程10も投入数=10に対する既定値（良品10・不良0）がTC-11の期待値と一致する
    await fgGroup.getByRole("button", { name: "完了", exact: true }).click();
    const step10Row = fgGroup.locator("table.panel__table tbody tr").nth(0);
    await expect(step10Row.locator("td").nth(7)).toHaveText("完了");
    await expect(step10Row.locator("td").nth(3)).toHaveText("10"); // 良品数

    // --- TC-12: 工程20 検査完了（良品9・不良1）（工程タブ） ---
    await fgGroup.getByRole("button", { name: "着手", exact: true }).click(); // 工程20 検査
    await fgGroup.getByLabel("良品").fill("9");
    await fgGroup.getByLabel("不良").fill("1");
    await fgGroup.getByRole("button", { name: "完了", exact: true }).click();
    const step20Row = fgGroup.locator("table.panel__table tbody tr").nth(1);
    await expect(step20Row.locator("td").nth(3)).toHaveText("9"); // 良品数
    await expect(step20Row.locator("td").nth(4)).toHaveText("1"); // 不良数
    await expect(fgGroup).toContainText("状態 完了");

    // --- TC-15: 出荷指示9個を作成（出荷タブ） ---
    await gotoTab("出荷");
    const shipmentTables = main.locator("table.panel__table");
    const allocationTable = shipmentTables.nth(0);
    const shipmentTable = shipmentTables.nth(1);
    await allocationTable.locator("tbody tr").first().getByRole("button", { name: "引当", exact: true }).click();
    const shipmentRow = shipmentTable.locator("tbody tr").first();
    await expect(shipmentTable.locator("tbody tr")).toHaveCount(1);
    await expect(shipmentRow.locator("td").nth(3)).toHaveText("9"); // 数量
    await expect(shipmentRow.locator("td").nth(6)).toHaveText("引当済"); // 状態＝ALLOCATED

    // --- TC-16: D+15で出荷実績登録（出荷タブ） ---
    await advanceDayTo(15);
    await shipmentRow.getByRole("button", { name: "出荷実績登録", exact: true }).click();
    await expect(shipmentRow.locator("td").nth(6)).toHaveText("出荷済"); // 状態＝SHIPPED

    // 出荷後の受注状態（一部出荷）と在庫（出荷可能量0）を最終確認する
    await gotoTab("受注");
    await expect(soRow().locator("td").nth(6)).toHaveText("9"); // 出荷済
    await expect(soRow().locator("td").nth(7)).toHaveText("一部出荷"); // 状態＝PARTIAL

    await gotoTab("在庫");
    const fgInventoryRow = main.locator("table.panel__table tbody tr", { hasText: "木製イス" });
    await expect(fgInventoryRow.locator("td").nth(2)).toHaveText("0"); // 現在庫
    await expect(fgInventoryRow.locator("td").nth(4)).toHaveText("0"); // 出荷可能量
  });
});
