import { describe, expect, it } from "vitest";
import { ITEM_IDS } from "../data/masterData";
import { confirmDelivery, createSalesOrder } from "./salesOrder";
import { ackPurchaseOrder } from "./procurement";
import { firmAllPlannedOrders, runMRP } from "./mrp";
import { checkSchedule, unmetDemand } from "./schedule";
import { createTestState } from "./testUtils";

describe("checkSchedule（v5-spec.md §7.5）", () => {
  it("TC-07: 希望どおりの納期回答なら警告は出ない", () => {
    const state = createTestState(0);
    const soNo = createSalesOrder(state, { customerId: "CUST-A", itemId: ITEM_IDS.FG_CHAIR, qty: 10, requestDay: 15 }, 0);
    confirmDelivery(state, soNo, 15);
    runMRP(state);
    firmAllPlannedOrders(state, 0);
    for (const po of state.purchaseOrders) ackPurchaseOrder(state, po.poNo, po.dueDay);

    expect(checkSchedule(state)).toHaveLength(0);
  });

  it("TC-E1〜E2: 木板の納期回答が遅れると、親（座面ASSY）の着手日に対する遅延警告が出て受注まで辿れる", () => {
    const state = createTestState(0);
    const soNo = createSalesOrder(state, { customerId: "CUST-A", itemId: ITEM_IDS.FG_CHAIR, qty: 10, requestDay: 15 }, 0);
    confirmDelivery(state, soNo, 15);
    runMRP(state);
    firmAllPlannedOrders(state, 0);
    const rmPo = state.purchaseOrders.find((p) => p.itemId === ITEM_IDS.RM_BOARD)!;
    // v5-spec.md TC-E1: RM-300の納期回答を D+12 → D+14 に変更
    ackPurchaseOrder(state, rmPo.poNo, 14);

    const alerts = checkSchedule(state);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ source: rmPo.poNo, delayDays: 2, affectedSoLine: `${soNo}-1` });
  });
});

describe("unmetDemand（v5-spec.md §7.5）", () => {
  it("TC-13: 完成数が受注数量に満たない場合、不足数量を返す", () => {
    const state = createTestState(0);
    const soNo = createSalesOrder(state, { customerId: "CUST-A", itemId: ITEM_IDS.FG_CHAIR, qty: 10, requestDay: 15 }, 0);
    confirmDelivery(state, soNo, 15);
    state.stocks.push({ itemId: ITEM_IDS.FG_CHAIR, onHand: 9, allocated: 0 });

    const result = unmetDemand(state);
    expect(result).toEqual([{ itemId: ITEM_IDS.FG_CHAIR, shortage: 1 }]);
  });

  it("需要を満たしていれば空配列を返す", () => {
    const state = createTestState(0);
    const soNo = createSalesOrder(state, { customerId: "CUST-A", itemId: ITEM_IDS.FG_CHAIR, qty: 10, requestDay: 15 }, 0);
    confirmDelivery(state, soNo, 15);
    state.stocks.push({ itemId: ITEM_IDS.FG_CHAIR, onHand: 10, allocated: 0 });

    expect(unmetDemand(state)).toHaveLength(0);
  });
});
