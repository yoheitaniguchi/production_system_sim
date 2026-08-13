import { describe, expect, it } from "vitest";
import { ITEM_IDS } from "../data/masterData";
import { confirmDelivery, createSalesOrder } from "./salesOrder";
import { firmAllPlannedOrders, runMRP } from "./mrp";
import { createTestState } from "./testUtils";

// v5-spec.md §9.3 TC-02〜TC-06 に対応する単体テスト。
describe("runMRP / firmAllPlannedOrders", () => {
  it("TC-04: 受注 FG-100 x10 / 回答納期 D+15 を展開すると5件の計画オーダが期待どおりの値で生成される", () => {
    const state = createTestState(0);
    const soNo = createSalesOrder(state, { customerId: "CUST-A", itemId: ITEM_IDS.FG_CHAIR, qty: 10, requestDay: 15 }, 0);
    confirmDelivery(state, soNo, 15);

    runMRP(state);

    expect(state.plannedOrders).toHaveLength(5);
    const byItem = Object.fromEntries(state.plannedOrders.map((p) => [p.itemId, p]));

    expect(byItem[ITEM_IDS.FG_CHAIR]).toMatchObject({
      ploNo: "PLO-001",
      qty: 10,
      dueDay: 15,
      startDay: 13,
      orderType: "MAKE",
      pegTo: `${soNo}-1`,
      bomLevel: 0,
    });
    expect(byItem[ITEM_IDS.SA_SEAT]).toMatchObject({
      ploNo: "PLO-002",
      qty: 10,
      dueDay: 13,
      startDay: 12,
      orderType: "MAKE",
      pegTo: "PLO-001",
      bomLevel: 1,
    });
    expect(byItem[ITEM_IDS.RM_BOARD]).toMatchObject({
      ploNo: "PLO-003",
      qty: 10,
      dueDay: 12,
      startDay: 7,
      orderType: "BUY",
      pegTo: "PLO-002",
      bomLevel: 2,
    });
    expect(byItem[ITEM_IDS.PT_LEG]).toMatchObject({
      ploNo: "PLO-004",
      qty: 40,
      dueDay: 13,
      startDay: 10,
      orderType: "BUY",
      pegTo: "PLO-001",
      bomLevel: 1,
    });
    expect(byItem[ITEM_IDS.PT_SCREW]).toMatchObject({
      ploNo: "PLO-005",
      qty: 80,
      dueDay: 13,
      startDay: 10,
      orderType: "BUY",
      pegTo: "PLO-001",
      bomLevel: 1,
    });
  });

  it("TC-05〜06: 確定するとPLANNED_ORDERは実体化し、再実行しても確定オーダの分は再計画されない", () => {
    const state = createTestState(0);
    const soNo = createSalesOrder(state, { customerId: "CUST-A", itemId: ITEM_IDS.FG_CHAIR, qty: 10, requestDay: 15 }, 0);
    confirmDelivery(state, soNo, 15);
    runMRP(state);

    firmAllPlannedOrders(state, 0);

    expect(state.plannedOrders).toHaveLength(0);
    expect(state.mfgOrders).toHaveLength(2);
    expect(state.purchaseOrders).toHaveLength(3);
    expect(state.workInstructions).toHaveLength(3);
    // MFG_ORDERはploNoを保持し続ける（ペギング追跡のため、v5-spec.md §7.4）
    const fgOrder = state.mfgOrders.find((mo) => mo.itemId === ITEM_IDS.FG_CHAIR);
    expect(fgOrder).toMatchObject({ ploNo: "PLO-001", pegTo: `${soNo}-1`, status: "FIRM" });

    runMRP(state);
    expect(state.plannedOrders).toHaveLength(0);
  });

  it("木製イスの工順どおりWORK_INSTRUCTIONが生成される（第1工程の投入数のみ確定済み）", () => {
    const state = createTestState(0);
    const soNo = createSalesOrder(state, { customerId: "CUST-A", itemId: ITEM_IDS.FG_CHAIR, qty: 10, requestDay: 15 }, 0);
    confirmDelivery(state, soNo, 15);
    runMRP(state);
    firmAllPlannedOrders(state, 0);

    const saOrder = state.mfgOrders.find((mo) => mo.itemId === ITEM_IDS.SA_SEAT)!;
    const saSteps = state.workInstructions.filter((wi) => wi.moNo === saOrder.moNo);
    expect(saSteps).toHaveLength(1);
    expect(saSteps[0]).toMatchObject({ stepNo: 10, workCenter: "WC-CUT", inputQty: 10, status: "WAIT" });

    const fgOrder = state.mfgOrders.find((mo) => mo.itemId === ITEM_IDS.FG_CHAIR)!;
    const fgSteps = state.workInstructions.filter((wi) => wi.moNo === fgOrder.moNo).sort((a, b) => a.stepNo - b.stepNo);
    expect(fgSteps.map((s) => s.stepNo)).toEqual([10, 20]);
    expect(fgSteps[0]).toMatchObject({ inputQty: 10, status: "WAIT" });
    expect(fgSteps[1]).toMatchObject({ inputQty: 0, status: "WAIT" });
  });
});
