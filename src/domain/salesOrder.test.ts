import { describe, expect, it } from "vitest";
import { ITEM_IDS } from "../data/masterData";
import { firmAllPlannedOrders, runMRP } from "./mrp";
import { startStep } from "./production";
import { cancelSalesOrder, confirmDelivery, createSalesOrder, SalesOrderError } from "./salesOrder";
import { createTestState } from "./testUtils";

describe("createSalesOrder / confirmDelivery / cancelSalesOrder（v5-spec.md §6.1）", () => {
  it("TC-02〜03: 受注登録すると1受注1明細（RECEIVED）が作られ、納期回答するとCONFIRMEDになる", () => {
    const state = createTestState(0);
    const soNo = createSalesOrder(state, { customerId: "CUST-A", itemId: ITEM_IDS.FG_CHAIR, qty: 10, requestDay: 15 }, 0);

    expect(state.salesOrders).toHaveLength(1);
    expect(state.soLines).toEqual([
      expect.objectContaining({ soNo, lineNo: 1, itemId: ITEM_IDS.FG_CHAIR, qty: 10, requestDay: 15, confirmDay: null, status: "RECEIVED" }),
    ]);

    confirmDelivery(state, soNo, 15);
    expect(state.soLines[0]).toMatchObject({ confirmDay: 15, status: "CONFIRMED" });
  });

  it("着手実績・入荷実績が無ければ取消でき、ペグ先のオーダも連鎖的にCANCELEDになる（design.md EXT-2）", () => {
    const state = createTestState(0);
    const soNo = createSalesOrder(state, { customerId: "CUST-A", itemId: ITEM_IDS.FG_CHAIR, qty: 10, requestDay: 15 }, 0);
    confirmDelivery(state, soNo, 15);
    runMRP(state);
    firmAllPlannedOrders(state, 0);

    cancelSalesOrder(state, soNo);

    expect(state.soLines[0].status).toBe("CANCELED");
    expect(state.mfgOrders.every((mo) => mo.status === "CANCELED")).toBe(true);
    expect(state.purchaseOrders.every((po) => po.status === "CANCELED")).toBe(true);
  });

  it("design.md EXT-3: 1件でも着手実績があれば取消できない", () => {
    const state = createTestState(0);
    const soNo = createSalesOrder(state, { customerId: "CUST-A", itemId: ITEM_IDS.FG_CHAIR, qty: 10, requestDay: 15 }, 0);
    confirmDelivery(state, soNo, 15);
    runMRP(state);
    firmAllPlannedOrders(state, 0);
    const saOrder = state.mfgOrders.find((mo) => mo.itemId === ITEM_IDS.SA_SEAT)!;
    // FIRM→RELEASEDを経ずに着手実績だけを見る単体テストのため、状態を直接調整する
    saOrder.status = "RELEASED";
    startStep(state, saOrder.moNo, 10, 12);

    expect(() => cancelSalesOrder(state, soNo)).toThrow(SalesOrderError);
  });

  it("受付（RECEIVED）以外は納期回答できない", () => {
    const state = createTestState(0);
    const soNo = createSalesOrder(state, { customerId: "CUST-A", itemId: ITEM_IDS.FG_CHAIR, qty: 10, requestDay: 15 }, 0);
    confirmDelivery(state, soNo, 15);
    expect(() => confirmDelivery(state, soNo, 16)).toThrow(SalesOrderError);
  });
});
