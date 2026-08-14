import { describe, expect, it } from "vitest";
import { ITEM_IDS } from "../data/masterData";
import { adjustStock } from "./inventory";
import { consumeFifo, createLot, traceBackward, traceForward } from "./lot";
import { createInitialState, simulationReducer, type SimulationAction } from "./reducer";
import { createTestState } from "./testUtils";
import type { SimulationState } from "../types";

function dispatch(state: SimulationState, action: SimulationAction): SimulationState {
  return simulationReducer(state, action);
}

describe("createLot / consumeFifo（v5-spec.md §11.3 Phase 2-B）", () => {
  it("ロットが無い品目を消費しても、lotNo未設定の1件としてエラーにならない（design.md EXT-18）", () => {
    const state = createTestState(0);
    const result = consumeFifo(state, ITEM_IDS.RM_BOARD, 5);
    expect(result).toEqual([{ lotNo: undefined, qty: 5 }]);
  });

  it("複数ロットにまたがる場合、作成日が古い順（FIFO）に分割して消費する", () => {
    const state = createTestState(0);
    const lot1 = createLot(state, ITEM_IDS.RM_BOARD, 3, 1, "PO-001");
    const lot2 = createLot(state, ITEM_IDS.RM_BOARD, 5, 2, "PO-002");

    const result = consumeFifo(state, ITEM_IDS.RM_BOARD, 6);

    expect(result).toEqual([
      { lotNo: lot1.lotNo, qty: 3 },
      { lotNo: lot2.lotNo, qty: 3 },
    ]);
    expect(state.lots.find((l) => l.lotNo === lot1.lotNo)?.qty).toBe(0);
    expect(state.lots.find((l) => l.lotNo === lot2.lotNo)?.qty).toBe(2);
  });

  it("ロット台帳の残数量で不足する分はlotNo未設定として扱う（不足分もエラーにしない）", () => {
    const state = createTestState(0);
    const lot1 = createLot(state, ITEM_IDS.RM_BOARD, 2, 1, "PO-001");

    const result = consumeFifo(state, ITEM_IDS.RM_BOARD, 5);

    expect(result).toEqual([
      { lotNo: lot1.lotNo, qty: 2 },
      { lotNo: undefined, qty: 3 },
    ]);
  });
});

describe("adjustStock経由のロット生成・FIFO消費・分割TXN起票", () => {
  it("プラス調整はロットを1件生成し、マイナス調整はFIFOで消費して複数ロットにまたがればTXNを分割する", () => {
    const state = createTestState(0);
    adjustStock(state, ITEM_IDS.RM_BOARD, 3, 1);
    adjustStock(state, ITEM_IDS.RM_BOARD, 5, 2);
    expect(state.lots).toHaveLength(2);

    adjustStock(state, ITEM_IDS.RM_BOARD, -6, 3);

    const adjTxns = state.stockTxns.filter((t) => t.txnDay === 3 && t.txnType === "ADJ");
    expect(adjTxns).toHaveLength(2);
    expect(adjTxns.map((t) => t.qty)).toEqual([-3, -3]);
    expect(adjTxns.every((t) => t.lotNo != null)).toBe(true);
    expect(state.stocks.find((s) => s.itemId === ITEM_IDS.RM_BOARD)?.onHand).toBe(2);
    expect(state.lots.reduce((sum, l) => sum + l.qty, 0)).toBe(2);
  });
});

describe("生産・出荷を通したロット系譜の記録と追跡（v5-spec.md §11.3の後方/前方追跡）", () => {
  it("入荷→製造→出荷の一連の流れで、後方追跡は消費した部品ロットを、前方追跡は生成した製品ロットを返す", () => {
    let state = createInitialState();
    state = dispatch(state, {
      type: "SO_CREATE",
      payload: { customerId: "CUST-A", itemId: ITEM_IDS.FG_CHAIR, qty: 10, requestDay: 15 },
    });
    const soNo = state.soLines[0].soNo;
    state = dispatch(state, { type: "SO_CONFIRM_DELIVERY", payload: { soNo, confirmDay: 15 } });
    state = dispatch(state, { type: "MRP_RUN" });
    state = dispatch(state, { type: "PLANNED_ORDERS_FIRM" });

    for (const po of state.purchaseOrders) {
      state = dispatch(state, { type: "PO_ACK", payload: { poNo: po.poNo, confirmDay: po.dueDay } });
    }
    const rmPo = state.purchaseOrders.find((p) => p.itemId === ITEM_IDS.RM_BOARD)!;
    while (state.day < rmPo.dueDay) state = dispatch(state, { type: "ADVANCE_DAY" });
    state = dispatch(state, { type: "PO_RECEIVE", payload: { poNo: rmPo.poNo } });
    const rmLot = state.lots.find((l) => l.itemId === ITEM_IDS.RM_BOARD)!;
    expect(rmLot).toMatchObject({ qty: 10, sourceRef: rmPo.poNo });

    const saOrder = state.mfgOrders.find((mo) => mo.itemId === ITEM_IDS.SA_SEAT)!;
    state = dispatch(state, { type: "MFG_RELEASE", payload: { moNo: saOrder.moNo } });
    state = dispatch(state, { type: "WI_START", payload: { moNo: saOrder.moNo, stepNo: 10 } });
    state = dispatch(state, {
      type: "WI_COMPLETE",
      payload: { moNo: saOrder.moNo, stepNo: 10, goodQty: 10, scrapQty: 0 },
    });

    const saLot = state.lots.find((l) => l.itemId === ITEM_IDS.SA_SEAT)!;
    expect(saLot).toMatchObject({ qty: 10, sourceRef: saOrder.moNo });

    // 後方追跡：座面ASSYロットは木板ロットを消費して作られた
    const backward = traceBackward(state, saLot.lotNo);
    expect(backward).toHaveLength(1);
    expect(backward[0].genealogy).toMatchObject({
      parentLot: rmLot.lotNo,
      childLot: saLot.lotNo,
      moNo: saOrder.moNo,
      consumedQty: 10,
    });

    // 前方追跡：木板ロットは座面ASSYロットになった
    const forward = traceForward(state, rmLot.lotNo);
    expect(forward).toHaveLength(1);
    expect(forward[0].genealogy.childLot).toBe(saLot.lotNo);

    // 木板ロットの残数量は完全に消費されて0になっている
    expect(state.lots.find((l) => l.lotNo === rmLot.lotNo)?.qty).toBe(0);
  });
});
