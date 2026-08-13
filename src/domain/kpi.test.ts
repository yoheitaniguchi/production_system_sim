import { describe, expect, it } from "vitest";
import { ITEM_IDS } from "../data/masterData";
import { confirmDelivery, createSalesOrder } from "./salesOrder";
import { firmAllPlannedOrders, runMRP } from "./mrp";
import { ackPurchaseOrder, receivePurchaseOrder } from "./procurement";
import { completeStep, releaseMfgOrder, startStep } from "./production";
import { allocateShipment, shipOut } from "./shipment";
import { computeKpi } from "./kpi";
import { createTestState } from "./testUtils";

// v5-spec.md §9.3 TC-01〜17 を通しで再現し、TC-17のKPI期待値
// （納期遵守率100%・直行率90%・計画達成率90%・受注残1個）を検証する。
describe("computeKpi（v5-spec.md §10）", () => {
  it("TC-17: 不良1個を含む通し演習の結果、期待どおりのKPIになる", () => {
    const state = createTestState(0);

    const soNo = createSalesOrder(state, { customerId: "CUST-A", itemId: ITEM_IDS.FG_CHAIR, qty: 10, requestDay: 15 }, 0);
    confirmDelivery(state, soNo, 15);
    runMRP(state);
    firmAllPlannedOrders(state, 0);

    for (const po of state.purchaseOrders) {
      ackPurchaseOrder(state, po.poNo, po.dueDay); // 希望どおりの回答（オンタイム）
    }
    const rmPo = state.purchaseOrders.find((p) => p.itemId === ITEM_IDS.RM_BOARD)!;
    receivePurchaseOrder(state, rmPo.poNo, rmPo.dueDay); // D+12

    const saOrder = state.mfgOrders.find((mo) => mo.itemId === ITEM_IDS.SA_SEAT)!;
    releaseMfgOrder(state, saOrder.moNo);
    startStep(state, saOrder.moNo, 10, 12);
    completeStep(state, saOrder.moNo, 10, 10, 0, 13); // TC-09：良品10・不良0

    const ptLegPo = state.purchaseOrders.find((p) => p.itemId === ITEM_IDS.PT_LEG)!;
    const ptScrewPo = state.purchaseOrders.find((p) => p.itemId === ITEM_IDS.PT_SCREW)!;
    receivePurchaseOrder(state, ptLegPo.poNo, ptLegPo.dueDay); // D+14相当（TC-10）
    receivePurchaseOrder(state, ptScrewPo.poNo, ptScrewPo.dueDay);

    const fgOrder = state.mfgOrders.find((mo) => mo.itemId === ITEM_IDS.FG_CHAIR)!;
    releaseMfgOrder(state, fgOrder.moNo);
    startStep(state, fgOrder.moNo, 10, 14);
    completeStep(state, fgOrder.moNo, 10, 10, 0, 14); // TC-11：組立 良品10・不良0
    startStep(state, fgOrder.moNo, 20, 14);
    completeStep(state, fgOrder.moNo, 20, 9, 1, 14); // TC-12：検査 良品9・不良1

    allocateShipment(state, soNo, 1, 15); // TC-15：出荷可能量9のみ引当
    shipOut(state, state.shipments[0].shipNo, 15); // TC-16：D+15で出荷実績登録

    const kpi = computeKpi(state);

    expect(kpi.deliveryComplianceRate).toBe(1); // 納期遵守率100%
    expect(kpi.firstPassYieldRate).toBeCloseTo(0.9); // 直行率90%
    expect(kpi.planAchievementRate).toBeCloseTo(0.9); // 計画達成率90%
    expect(kpi.orderBacklogQty).toBe(1); // 受注残1個
    // 在庫回転（design.md EXT-13）：シナリオ終了時点では全品目が入荷・消費・出荷済みで手元在庫が
    // 無い（分母が0）ため、算出不能としてnullを返す
    expect(kpi.inventoryTurnover).toBeNull();
  });

  it("design.md EXT-13: 在庫回転は現在の総在庫数量を分母とした近似値になる", () => {
    const state = createTestState(0);
    const soNo = createSalesOrder(state, { customerId: "CUST-A", itemId: ITEM_IDS.FG_CHAIR, qty: 10, requestDay: 15 }, 0);
    confirmDelivery(state, soNo, 15);
    runMRP(state);
    firmAllPlannedOrders(state, 0);

    const rmPo = state.purchaseOrders.find((p) => p.itemId === ITEM_IDS.RM_BOARD)!;
    ackPurchaseOrder(state, rmPo.poNo, rmPo.dueDay);
    receivePurchaseOrder(state, rmPo.poNo, rmPo.dueDay);

    const saOrder = state.mfgOrders.find((mo) => mo.itemId === ITEM_IDS.SA_SEAT)!;
    releaseMfgOrder(state, saOrder.moNo);
    startStep(state, saOrder.moNo, 10, 12);
    completeStep(state, saOrder.moNo, 10, 10, 0, 13);
    // この時点：RM-300 onHand=0（ISS -10）、SA-200 onHand=10（PRD +10）
    // 出庫数量(ISS)=10、現在の総在庫=10 → 在庫回転=10/10=1

    const kpi = computeKpi(state);
    expect(kpi.inventoryTurnover).toBeCloseTo(1);
  });

  it("何も起きていない初期状態では大半のKPIがnullまたは0になる", () => {
    const state = createTestState(0);
    const kpi = computeKpi(state);
    expect(kpi.deliveryComplianceRate).toBeNull();
    expect(kpi.planAchievementRate).toBeNull();
    expect(kpi.firstPassYieldRate).toBeNull();
    expect(kpi.orderBacklogQty).toBe(0);
    expect(kpi.wipQty).toBe(0);
    expect(kpi.stockoutEventCount).toBe(0);
    expect(kpi.scheduleAlertCount).toBe(0);
  });
});
