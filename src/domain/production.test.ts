import { describe, expect, it } from "vitest";
import { ITEM_IDS } from "../data/masterData";
import { confirmDelivery, createSalesOrder } from "./salesOrder";
import { firmAllPlannedOrders, runMRP } from "./mrp";
import { ackPurchaseOrder } from "./procurement";
import { completeStep, ProductionError, releaseMfgOrder, startStep } from "./production";
import { checkSchedule } from "./schedule";
import { createTestState } from "./testUtils";
import type { SimulationState } from "../types";

function setupFirmOrder(qty: number): { state: SimulationState; soNo: string } {
  const state = createTestState(0);
  const soNo = createSalesOrder(state, { customerId: "CUST-A", itemId: ITEM_IDS.FG_CHAIR, qty, requestDay: 15 }, 0);
  confirmDelivery(state, soNo, 15);
  runMRP(state);
  firmAllPlannedOrders(state, 0);
  return { state, soNo };
}

describe("startStep / completeStep（v5-spec.md §7.3）", () => {
  it("リリース前の製造オーダは第1工程を着手できない", () => {
    const { state } = setupFirmOrder(10);
    const saOrder = state.mfgOrders.find((mo) => mo.itemId === ITEM_IDS.SA_SEAT)!;
    expect(() => startStep(state, saOrder.moNo, 10, 12)).toThrow(ProductionError);
  });

  it("TC-09: 部品が十分ならバックフラッシュで消費し完成入庫する（良品のみ）", () => {
    const { state } = setupFirmOrder(10);
    const saOrder = state.mfgOrders.find((mo) => mo.itemId === ITEM_IDS.SA_SEAT)!;
    state.stocks.push({ itemId: ITEM_IDS.RM_BOARD, onHand: 10, allocated: 0 });

    releaseMfgOrder(state, saOrder.moNo);
    startStep(state, saOrder.moNo, 10, 12);
    completeStep(state, saOrder.moNo, 10, 10, 0, 13);

    expect(state.stocks.find((s) => s.itemId === ITEM_IDS.RM_BOARD)?.onHand).toBe(0);
    expect(state.stocks.find((s) => s.itemId === ITEM_IDS.SA_SEAT)?.onHand).toBe(10);
    const updated = state.mfgOrders.find((mo) => mo.moNo === saOrder.moNo)!;
    expect(updated.status).toBe("DONE");
    expect(updated.goodQty).toBe(10);
    expect(state.stockTxns.map((t) => t.txnType)).toEqual(expect.arrayContaining(["ISS", "PRD"]));
  });

  it("部品不足時はHOLDになり、部品充足後に同じ操作を再実行すると復帰する（design.md EXT-10）", () => {
    const { state } = setupFirmOrder(10);
    const saOrder = state.mfgOrders.find((mo) => mo.itemId === ITEM_IDS.SA_SEAT)!;
    state.stocks.push({ itemId: ITEM_IDS.RM_BOARD, onHand: 5, allocated: 0 });

    releaseMfgOrder(state, saOrder.moNo);
    startStep(state, saOrder.moNo, 10, 12);

    expect(() => completeStep(state, saOrder.moNo, 10, 10, 0, 13)).toThrow(ProductionError);
    expect(state.mfgOrders.find((mo) => mo.moNo === saOrder.moNo)?.status).toBe("HOLD");
    const wi = state.workInstructions.find((w) => w.moNo === saOrder.moNo && w.stepNo === 10)!;
    expect(wi.status).toBe("WIP"); // 消費前にガードするため、着手状態のまま

    state.stocks.find((s) => s.itemId === ITEM_IDS.RM_BOARD)!.onHand = 10;
    completeStep(state, saOrder.moNo, 10, 10, 0, 14);

    expect(state.mfgOrders.find((mo) => mo.moNo === saOrder.moNo)?.status).toBe("DONE");
  });

  it("TC-11〜12: 良品数と不良数を分けて登録し、不良分は完成入庫されない。次工程の投入数は前工程の良品数", () => {
    const { state } = setupFirmOrder(10);
    // 下位階層（SA-200・PT-400・PT-500）をあらかじめ在庫として用意する
    state.stocks.push(
      { itemId: ITEM_IDS.SA_SEAT, onHand: 10, allocated: 0 },
      { itemId: ITEM_IDS.PT_LEG, onHand: 40, allocated: 0 },
      { itemId: ITEM_IDS.PT_SCREW, onHand: 80, allocated: 0 },
    );
    const fgOrder = state.mfgOrders.find((mo) => mo.itemId === ITEM_IDS.FG_CHAIR)!;

    releaseMfgOrder(state, fgOrder.moNo);
    startStep(state, fgOrder.moNo, 10, 13);
    completeStep(state, fgOrder.moNo, 10, 10, 0, 14); // 工程10 組立：良品10・不良0

    expect(state.stocks.find((s) => s.itemId === ITEM_IDS.SA_SEAT)?.onHand).toBe(0);
    expect(state.stocks.find((s) => s.itemId === ITEM_IDS.PT_LEG)?.onHand).toBe(0);
    expect(state.stocks.find((s) => s.itemId === ITEM_IDS.PT_SCREW)?.onHand).toBe(0);
    const step20 = state.workInstructions.find((wi) => wi.moNo === fgOrder.moNo && wi.stepNo === 20)!;
    expect(step20.inputQty).toBe(10);

    startStep(state, fgOrder.moNo, 20, 14);
    completeStep(state, fgOrder.moNo, 20, 9, 1, 14); // 工程20 検査：良品9・不良1

    expect(state.stocks.find((s) => s.itemId === ITEM_IDS.FG_CHAIR)?.onHand).toBe(9);
    const updatedFg = state.mfgOrders.find((mo) => mo.moNo === fgOrder.moNo)!;
    expect(updatedFg).toMatchObject({ status: "DONE", goodQty: 9, scrapQty: 1 });
  });

  it("良品数＋不良数が投入数と一致しない場合は完了できない", () => {
    const { state } = setupFirmOrder(10);
    const saOrder = state.mfgOrders.find((mo) => mo.itemId === ITEM_IDS.SA_SEAT)!;
    state.stocks.push({ itemId: ITEM_IDS.RM_BOARD, onHand: 10, allocated: 0 });
    releaseMfgOrder(state, saOrder.moNo);
    startStep(state, saOrder.moNo, 10, 12);
    expect(() => completeStep(state, saOrder.moNo, 10, 8, 1, 13)).toThrow(ProductionError);
  });

  it("前工程が完了していないと次工程には着手できない（未完了のまま投入数0で完成入庫されるのを防ぐ）", () => {
    const { state } = setupFirmOrder(10);
    state.stocks.push(
      { itemId: ITEM_IDS.SA_SEAT, onHand: 10, allocated: 0 },
      { itemId: ITEM_IDS.PT_LEG, onHand: 40, allocated: 0 },
      { itemId: ITEM_IDS.PT_SCREW, onHand: 80, allocated: 0 },
    );
    const fgOrder = state.mfgOrders.find((mo) => mo.itemId === ITEM_IDS.FG_CHAIR)!;
    releaseMfgOrder(state, fgOrder.moNo);
    startStep(state, fgOrder.moNo, 10, 13);
    // 工程10がWIPのまま、工程20（投入数0）へ先に着手しようとするとエラーになる
    expect(() => startStep(state, fgOrder.moNo, 20, 13)).toThrow(ProductionError);
    const step20 = state.workInstructions.find((wi) => wi.moNo === fgOrder.moNo && wi.stepNo === 20)!;
    expect(step20.status).toBe("WAIT");
  });

  it("TC-E1〜E3: 木板の納期回答が遅れて警告が出たまま製造着手を試みると、部品が無いためHOLDになる", () => {
    const { state } = setupFirmOrder(10);
    const rmPo = state.purchaseOrders.find((p) => p.itemId === ITEM_IDS.RM_BOARD)!;
    ackPurchaseOrder(state, rmPo.poNo, 14); // TC-E1：D+12の希望に対しD+14回答（2日遅延）
    expect(checkSchedule(state)).toHaveLength(1); // TC-E2：日程整合チェックで警告1件

    // TC-E3：警告を確認しないまま（木板が未入荷＝在庫0のまま）製造着手を試みる
    const saOrder = state.mfgOrders.find((mo) => mo.itemId === ITEM_IDS.SA_SEAT)!;
    releaseMfgOrder(state, saOrder.moNo);
    startStep(state, saOrder.moNo, 10, 12);

    expect(() => completeStep(state, saOrder.moNo, 10, 10, 0, 12)).toThrow(ProductionError);
    expect(state.mfgOrders.find((mo) => mo.moNo === saOrder.moNo)?.status).toBe("HOLD");
  });
});
