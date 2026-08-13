import { describe, expect, it } from "vitest";
import { ITEM_IDS } from "../data/masterData";
import { confirmDelivery, createSalesOrder } from "./salesOrder";
import { allocateShipment, cancelShipmentAllocation, shipOut, ShipmentError, shippableQty } from "./shipment";
import { createTestState } from "./testUtils";

describe("allocateShipment / shipOut（v5-spec.md §7.2）", () => {
  it("出荷可能量が無ければ引当できない", () => {
    const state = createTestState(0);
    const soNo = createSalesOrder(state, { customerId: "CUST-A", itemId: ITEM_IDS.FG_CHAIR, qty: 10, requestDay: 15 }, 0);
    confirmDelivery(state, soNo, 15);
    expect(() => allocateShipment(state, soNo, 1, 15)).toThrow(ShipmentError);
  });

  it("TC-15〜16: 受注残(10)に出荷可能量(9)が満たない場合、出荷可能な分だけ一部出荷として引き当てる（design.md DEV-3）", () => {
    const state = createTestState(0);
    const soNo = createSalesOrder(state, { customerId: "CUST-A", itemId: ITEM_IDS.FG_CHAIR, qty: 10, requestDay: 15 }, 0);
    confirmDelivery(state, soNo, 15);
    state.stocks.push({ itemId: ITEM_IDS.FG_CHAIR, onHand: 9, allocated: 0 });

    allocateShipment(state, soNo, 1, 15);

    expect(shippableQty(state, ITEM_IDS.FG_CHAIR)).toBe(0);
    const shipment = state.shipments[0];
    expect(shipment).toMatchObject({ status: "ALLOCATED", qty: 9 });

    shipOut(state, shipment.shipNo, 15);
    expect(state.stocks.find((s) => s.itemId === ITEM_IDS.FG_CHAIR)?.onHand).toBe(0);
    expect(state.soLines.find((l) => l.soNo === soNo)).toMatchObject({ shippedQty: 9, status: "PARTIAL" });
    const txn = state.stockTxns.find((t) => t.refNo === shipment.shipNo);
    expect(txn).toMatchObject({ txnType: "SHP", qty: -9 });
  });

  it("受注残と出荷可能量が一致すればCLOSEDになる", () => {
    const state = createTestState(0);
    const soNo = createSalesOrder(state, { customerId: "CUST-A", itemId: ITEM_IDS.FG_CHAIR, qty: 9, requestDay: 15 }, 0);
    confirmDelivery(state, soNo, 15);
    state.stocks.push({ itemId: ITEM_IDS.FG_CHAIR, onHand: 9, allocated: 0 });

    allocateShipment(state, soNo, 1, 15);
    shipOut(state, state.shipments[0].shipNo, 15);

    expect(state.soLines.find((l) => l.soNo === soNo)).toMatchObject({ shippedQty: 9, status: "CLOSED" });
  });

  it("引当を解除すると引当済数量が戻る", () => {
    const state = createTestState(0);
    const soNo = createSalesOrder(state, { customerId: "CUST-A", itemId: ITEM_IDS.FG_CHAIR, qty: 5, requestDay: 15 }, 0);
    confirmDelivery(state, soNo, 15);
    state.stocks.push({ itemId: ITEM_IDS.FG_CHAIR, onHand: 5, allocated: 0 });

    allocateShipment(state, soNo, 1, 15);
    const shipment = state.shipments[0];
    cancelShipmentAllocation(state, shipment.shipNo);

    expect(state.stocks.find((s) => s.itemId === ITEM_IDS.FG_CHAIR)?.allocated).toBe(0);
    expect(state.shipments[0].status).toBe("CANCELED");
  });
});
