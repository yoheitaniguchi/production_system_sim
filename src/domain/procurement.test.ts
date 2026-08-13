import { describe, expect, it } from "vitest";
import { ITEM_IDS } from "../data/masterData";
import { confirmDelivery, createSalesOrder } from "./salesOrder";
import { firmAllPlannedOrders, runMRP } from "./mrp";
import { ackPurchaseOrder, ProcurementError, receivePurchaseOrder } from "./procurement";
import { createTestState } from "./testUtils";

function setupPurchaseOrder(): { state: ReturnType<typeof createTestState> } {
  const state = createTestState(0);
  const soNo = createSalesOrder(state, { customerId: "CUST-A", itemId: ITEM_IDS.FG_CHAIR, qty: 10, requestDay: 15 }, 0);
  confirmDelivery(state, soNo, 15);
  runMRP(state);
  firmAllPlannedOrders(state, 0);
  return { state };
}

describe("ackPurchaseOrder / receivePurchaseOrder（v5-spec.md §6.5）", () => {
  it("TC-07: 納期回答を登録するとACKEDになる", () => {
    const { state } = setupPurchaseOrder();
    const po = state.purchaseOrders.find((p) => p.itemId === ITEM_IDS.RM_BOARD)!;
    ackPurchaseOrder(state, po.poNo, po.dueDay);
    expect(state.purchaseOrders.find((p) => p.poNo === po.poNo)).toMatchObject({
      status: "ACKED",
      confirmDay: po.dueDay,
    });
  });

  it("design.md EXT-4: 入荷予定日より前は入荷計上できない", () => {
    const { state } = setupPurchaseOrder();
    const po = state.purchaseOrders.find((p) => p.itemId === ITEM_IDS.RM_BOARD)!;
    ackPurchaseOrder(state, po.poNo, po.dueDay);
    expect(() => receivePurchaseOrder(state, po.poNo, po.dueDay - 1)).toThrow(ProcurementError);
  });

  it("TC-08: 入荷予定日以降に入荷計上するとRCVトランザクションが起票され在庫が増える", () => {
    const { state } = setupPurchaseOrder();
    const po = state.purchaseOrders.find((p) => p.itemId === ITEM_IDS.RM_BOARD)!;
    ackPurchaseOrder(state, po.poNo, po.dueDay);

    receivePurchaseOrder(state, po.poNo, po.dueDay);

    expect(state.stocks.find((s) => s.itemId === ITEM_IDS.RM_BOARD)?.onHand).toBe(10);
    expect(state.purchaseOrders.find((p) => p.poNo === po.poNo)).toMatchObject({
      status: "CLOSED",
      receivedQty: 10,
    });
    const txn = state.stockTxns.find((t) => t.refNo === po.poNo);
    expect(txn).toMatchObject({ txnType: "RCV", qty: 10, itemId: ITEM_IDS.RM_BOARD });
  });

  it("納期回答前（ORDERED状態）は入荷計上できない", () => {
    const { state } = setupPurchaseOrder();
    const po = state.purchaseOrders.find((p) => p.itemId === ITEM_IDS.RM_BOARD)!;
    expect(() => receivePurchaseOrder(state, po.poNo, po.dueDay)).toThrow(ProcurementError);
  });
});
