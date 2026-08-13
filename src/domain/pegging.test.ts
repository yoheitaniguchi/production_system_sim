import { describe, expect, it } from "vitest";
import { ITEM_IDS } from "../data/masterData";
import { confirmDelivery, createSalesOrder } from "./salesOrder";
import { firmAllPlannedOrders, runMRP } from "./mrp";
import { pegKey, traceFromOrder } from "./pegging";
import { createTestState } from "./testUtils";

describe("traceFromOrder（v5-spec.md §7.4）", () => {
  it("TC-18: 受注確定後、全階層の確定オーダ（MFG_ORDER2件・PURCHASE_ORDER3件）を辿れる", () => {
    const state = createTestState(0);
    const soNo = createSalesOrder(state, { customerId: "CUST-A", itemId: ITEM_IDS.FG_CHAIR, qty: 10, requestDay: 15 }, 0);
    confirmDelivery(state, soNo, 15);
    runMRP(state);
    firmAllPlannedOrders(state, 0);

    const result = traceFromOrder(state, soNo, 1);

    expect(result.mfgOrders).toHaveLength(2);
    expect(result.purchaseOrders).toHaveLength(3);
    expect(result.mfgOrders.map((mo) => mo.itemId).sort()).toEqual([ITEM_IDS.FG_CHAIR, ITEM_IDS.SA_SEAT].sort());
    expect(result.purchaseOrders.map((po) => po.itemId).sort()).toEqual(
      [ITEM_IDS.RM_BOARD, ITEM_IDS.PT_LEG, ITEM_IDS.PT_SCREW].sort(),
    );
  });

  it("pegKeyは'SO番号-明細番号'形式", () => {
    expect(pegKey("SO-001", 1)).toBe("SO-001-1");
  });

  it("何もペグされていない受注はtraceFromOrderが空を返す", () => {
    const state = createTestState(0);
    const soNo = createSalesOrder(state, { customerId: "CUST-A", itemId: ITEM_IDS.FG_CHAIR, qty: 10, requestDay: 15 }, 0);
    const result = traceFromOrder(state, soNo, 1);
    expect(result.mfgOrders).toHaveLength(0);
    expect(result.purchaseOrders).toHaveLength(0);
    expect(result.stockTxns).toHaveLength(0);
  });
});
