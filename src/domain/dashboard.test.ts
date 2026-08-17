// ダッシュボード用の日次スナップショット計算（受注残・計画残・発注残・製造残・出荷残・在庫のバーンダウン、
// KPI/アラート件数）。cost.ts側の標準原価計算をそのまま正としてクロスチェックする。
import { describe, expect, it } from "vitest";
import { ITEM_IDS } from "../data/masterData";
import { rollupCost } from "./cost";
import { computeDashboardSnapshot } from "./dashboard";
import { firmAllPlannedOrders, runMRP } from "./mrp";
import { ackPurchaseOrder, receivePurchaseOrder } from "./procurement";
import { confirmDelivery, createSalesOrder } from "./salesOrder";
import { createTestState } from "./testUtils";

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
    expect(snap.kpiHighlights).toEqual({
      deliveryComplianceRate: null,
      planAchievementRate: null,
      firstPassYieldRate: null,
      inventoryTurnover: null,
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
