import { describe, expect, it } from "vitest";
import { ITEM_IDS } from "../data/masterData";
import { confirmDelivery, createSalesOrder } from "./salesOrder";
import { ackPurchaseOrder } from "./procurement";
import { firmAllPlannedOrders, runMRP } from "./mrp";
import { checkSchedule, sortAlertsByDelay, unmetDemand } from "./schedule";
import type { ScheduleAlert } from "./schedule";
import { createTestState } from "./testUtils";

describe("checkSchedule（v5-spec.md §7.5）", () => {
  it("[UC-08][単体][機能テスト][正常] TC-07: 希望どおりの納期回答なら警告は出ない", () => {
    const state = createTestState(0);
    const soNo = createSalesOrder(state, { customerId: "CUST-A", itemId: ITEM_IDS.FG_CHAIR, qty: 10, requestDay: 15 }, 0);
    confirmDelivery(state, soNo, 15);
    runMRP(state);
    firmAllPlannedOrders(state, 0);
    for (const po of state.purchaseOrders) ackPurchaseOrder(state, po.poNo, po.dueDay);

    expect(checkSchedule(state)).toHaveLength(0);
  });

  it("[UC-08/UC-21][単体][機能テスト][異常] TC-E1〜E2: 木板の納期回答が遅れると、親（座面ASSY）の着手日に対する遅延警告が出て受注まで辿れる", () => {
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

describe("sortAlertsByDelay（ダッシュボード：遅延ランキング）", () => {
  function makeAlert(source: string, delayDays: number): ScheduleAlert {
    return { level: "遅延", source, target: "MO-parent", delayDays, affectedSoLine: "SO-001-1" };
  }

  it("[単体][機能テスト][正常] 遅延日数の降順（8→5→2）に並べ替える", () => {
    const alerts = [makeAlert("PO-A", 5), makeAlert("PO-B", 8), makeAlert("PO-C", 2)];

    expect(sortAlertsByDelay(alerts).map((a) => a.source)).toEqual(["PO-B", "PO-A", "PO-C"]);
  });

  it("[単体][機能テスト][境界] 遅延日数が同値の場合は元の順序を保つ", () => {
    const alerts = [makeAlert("PO-A", 5), makeAlert("PO-B", 5), makeAlert("PO-C", 5)];

    expect(sortAlertsByDelay(alerts).map((a) => a.source)).toEqual(["PO-A", "PO-B", "PO-C"]);
  });

  it("[単体][機能テスト][異常] 空配列を渡すと空配列を返す", () => {
    expect(sortAlertsByDelay([])).toEqual([]);
  });

  it("[単体][機能テスト] 引数の配列を破壊的に変更しない", () => {
    const alerts = [makeAlert("PO-A", 2), makeAlert("PO-B", 8)];
    const original = [...alerts];

    sortAlertsByDelay(alerts);

    expect(alerts).toEqual(original);
  });
});

describe("unmetDemand（v5-spec.md §7.5）", () => {
  it("[UC-09][単体][機能テスト][異常] TC-13: 完成数が受注数量に満たない場合、不足数量を返す", () => {
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
