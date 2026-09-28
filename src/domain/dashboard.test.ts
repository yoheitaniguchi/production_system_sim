// ダッシュボード用の日次スナップショット計算（受注残・計画残・発注残・製造残・出荷残・在庫のバーンダウン、
// KPI/アラート件数）。cost.ts側の標準原価計算をそのまま正としてクロスチェックする。
import { describe, expect, it } from "vitest";
import { ITEM_IDS } from "../data/masterData";
import { rollupCost } from "./cost";
import { computeDashboardSnapshot, extractKpiSeries } from "./dashboard";
import { firmAllPlannedOrders, runMRP } from "./mrp";
import { ackPurchaseOrder, receivePurchaseOrder } from "./procurement";
import { confirmDelivery, createSalesOrder } from "./salesOrder";
import { createTestState } from "./testUtils";
import type { DashboardKpiHighlights, DashboardSnapshot } from "../types";

describe("computeDashboardSnapshot", () => {
  it("受注も操作もない初期状態では全ての残高が0、KPIハイライトはnull", () => {
    const state = createTestState(0);
    const snap = computeDashboardSnapshot(state);

    expect(snap.day).toBe(0);
    expect(snap.backlog).toEqual({
      order: { qty: 0, amount: 0 },
      planned: { qty: 0, amount: 0 },
      purchase: { qty: 0, amount: 0 },
      production: { qty: 0, amount: 0 },
      shipment: { qty: 0, amount: 0 },
      inventory: { qty: 0, amount: 0 },
    });
    expect(snap.alertCounts).toEqual({ schedule: 0, unmetDemand: 0, masterIssue: 0, capacityOverload: 0 });
    // Issue #60（design.md EXT-38）：kpiHighlightsはcomputeKpi()の12指標と同一の形になる
    expect(snap.kpiHighlights).toEqual({
      deliveryComplianceRate: null,
      confirmDateComplianceRate: null,
      orderBacklogQty: 0,
      planAchievementRate: null,
      firstPassYieldRate: null,
      wipQty: 0,
      avgProductionLeadTimeDays: null,
      inventoryTurnover: null,
      supplierDeliveryComplianceRate: null,
      stockoutEventCount: 0,
      physicalInventoryVarianceRate: null,
      scheduleAlertCount: 0,
    });
  });

  it("MRP実行直後は計画残に正味所要量が乗り、確定後は発注残・製造残へ振り替わる", () => {
    const state = createTestState(0);
    const soNo = createSalesOrder(state, { customerId: "CUST-A", itemId: ITEM_IDS.FG_CHAIR, qty: 10, requestDay: 15 }, 0);
    confirmDelivery(state, soNo, 15);

    runMRP(state);
    const afterMrp = computeDashboardSnapshot(state);
    expect(afterMrp.backlog.planned.qty).toBe(state.plannedOrders.reduce((s, p) => s + p.qty, 0));
    expect(afterMrp.backlog.planned.qty).toBeGreaterThan(0);
    expect(afterMrp.backlog.purchase.qty).toBe(0);
    expect(afterMrp.backlog.production.qty).toBe(0);

    firmAllPlannedOrders(state, 0);
    const afterFirm = computeDashboardSnapshot(state);
    // 計画オーダは確定でPLANNED_ORDER配列から消える揮発データなので、計画残は0に戻る
    expect(afterFirm.backlog.planned.qty).toBe(0);

    const expectedPurchaseQty = state.purchaseOrders.reduce((s, po) => s + (po.qty - po.receivedQty), 0);
    const expectedProductionQty = state.mfgOrders
      .filter((mo) => mo.status !== "DONE" && mo.status !== "CANCELED")
      .reduce((s, mo) => s + (mo.planQty - mo.goodQty - mo.scrapQty), 0);
    expect(afterFirm.backlog.purchase.qty).toBe(expectedPurchaseQty);
    expect(afterFirm.backlog.production.qty).toBe(expectedProductionQty);
    expect(afterFirm.backlog.purchase.qty).toBeGreaterThan(0);
    expect(afterFirm.backlog.production.qty).toBeGreaterThan(0);

    const expectedPurchaseAmount = state.purchaseOrders.reduce(
      (s, po) => s + (po.qty - po.receivedQty) * rollupCost(state, po.itemId).standardCost,
      0,
    );
    const expectedProductionAmount = state.mfgOrders
      .filter((mo) => mo.status !== "DONE" && mo.status !== "CANCELED")
      .reduce((s, mo) => s + (mo.planQty - mo.goodQty - mo.scrapQty) * rollupCost(state, mo.itemId).standardCost, 0);
    expect(afterFirm.backlog.purchase.amount).toBeCloseTo(expectedPurchaseAmount);
    expect(afterFirm.backlog.production.amount).toBeCloseTo(expectedProductionAmount);

    // 受注残：数量10、金額は売価(design.mdの木製イス=6000円)×10
    expect(afterFirm.backlog.order).toEqual({ qty: 10, amount: 60000 });
  });

  it("入荷計上すると発注残が減り、在庫金額（inventoryValue相当）が増える", () => {
    const state = createTestState(0);
    const soNo = createSalesOrder(state, { customerId: "CUST-A", itemId: ITEM_IDS.FG_CHAIR, qty: 10, requestDay: 15 }, 0);
    confirmDelivery(state, soNo, 15);
    runMRP(state);
    firmAllPlannedOrders(state, 0);

    const rmPo = state.purchaseOrders.find((po) => po.itemId === ITEM_IDS.RM_BOARD)!;
    const beforeReceive = computeDashboardSnapshot(state).backlog.purchase.qty;

    ackPurchaseOrder(state, rmPo.poNo, rmPo.dueDay);
    receivePurchaseOrder(state, rmPo.poNo, rmPo.dueDay);

    const snap = computeDashboardSnapshot(state);
    expect(snap.backlog.purchase.qty).toBe(beforeReceive - rmPo.qty);
    expect(snap.backlog.inventory.qty).toBe(state.stocks.reduce((s, x) => s + x.onHand, 0));
    expect(snap.backlog.inventory.qty).toBeGreaterThan(0);
    expect(snap.backlog.inventory.amount).toBeGreaterThan(0);
  });
});

// Issue #60：KPIタブ（KpiDashboard.tsx）の推移表示が読む日次系列抽出（design.md EXT-38）
const KPI_HIGHLIGHTS_ZERO: DashboardKpiHighlights = {
  deliveryComplianceRate: null,
  confirmDateComplianceRate: null,
  orderBacklogQty: 0,
  planAchievementRate: null,
  firstPassYieldRate: null,
  wipQty: 0,
  avgProductionLeadTimeDays: null,
  inventoryTurnover: null,
  supplierDeliveryComplianceRate: null,
  stockoutEventCount: 0,
  physicalInventoryVarianceRate: null,
  scheduleAlertCount: 0,
};

function snapshotAt(day: number, kpiHighlights: Partial<DashboardKpiHighlights>): DashboardSnapshot {
  return {
    day,
    backlog: {
      order: { qty: 0, amount: 0 },
      planned: { qty: 0, amount: 0 },
      purchase: { qty: 0, amount: 0 },
      production: { qty: 0, amount: 0 },
      shipment: { qty: 0, amount: 0 },
      inventory: { qty: 0, amount: 0 },
    },
    alertCounts: { schedule: 0, unmetDemand: 0, masterIssue: 0, capacityOverload: 0 },
    kpiHighlights: { ...KPI_HIGHLIGHTS_ZERO, ...kpiHighlights },
  };
}

describe("extractKpiSeries（Issue #60）", () => {
  it("[単体][機能テスト][正常] 複数日分のdashboardHistoryから、指定したキーの値だけを日付順の配列で取り出す", () => {
    const history = [
      snapshotAt(0, { firstPassYieldRate: 0.9 }),
      snapshotAt(1, { firstPassYieldRate: 0.95 }),
      snapshotAt(2, { firstPassYieldRate: 1 }),
    ];

    expect(extractKpiSeries(history, "firstPassYieldRate")).toEqual([0.9, 0.95, 1]);
  });

  it("[単体][機能テスト][境界] 該当日のKPIがnullの場合はnullのまま返す（Sparkline側の「推移データ不足」判定に使う）", () => {
    const history = [snapshotAt(0, { inventoryTurnover: null }), snapshotAt(1, { inventoryTurnover: 2.5 })];

    expect(extractKpiSeries(history, "inventoryTurnover")).toEqual([null, 2.5]);
  });

  it("[単体][機能テスト][境界] 履歴が空配列の場合は空配列を返す", () => {
    expect(extractKpiSeries([], "wipQty")).toEqual([]);
  });

  it("[単体][機能テスト][正常] キーが異なれば同じ履歴からでも別の系列を取り出せる（他指標を混同しない）", () => {
    const history = [
      snapshotAt(0, { wipQty: 3, stockoutEventCount: 1 }),
      snapshotAt(1, { wipQty: 5, stockoutEventCount: 0 }),
    ];

    expect(extractKpiSeries(history, "wipQty")).toEqual([3, 5]);
    expect(extractKpiSeries(history, "stockoutEventCount")).toEqual([1, 0]);
  });
});
