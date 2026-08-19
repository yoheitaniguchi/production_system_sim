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
    // originalQtyは消費されても変化しない元数量（在庫モデルの厳密化検討で追加。design.md EXT-18）
    expect(rmLot.originalQty).toBe(10);
    expect(state.lots.find((l) => l.lotNo === rmLot.lotNo)?.originalQty).toBe(10);
  });
});

// 在庫モデルの厳密化検討（design.md EXT-18追記）：STOCKの主キー変更（品目+ロット複合キー化）という
// 破壊的変更をせずに済ませられる根拠として、実運用（reducer経由の操作のみ）では常に
// 「品目ごとのLot.qty合計 === Stock.onHand」が成り立つことを検証する。
function lotBackedOnHand(state: SimulationState, itemId: string): number {
  return state.lots.filter((l) => l.itemId === itemId).reduce((sum, l) => sum + l.qty, 0);
}

function assertLotStockConsistency(state: SimulationState) {
  for (const stock of state.stocks) {
    expect(lotBackedOnHand(state, stock.itemId)).toBe(stock.onHand);
  }
}

describe("STOCK.onHandとLOT残数量合計の整合性（在庫モデルの厳密化検討、design.md EXT-18追記）", () => {
  it("v5-spec.md §9.1のTC-01〜18を一通り流しても、各チェックポイントで品目ごとのonHandとロット残数量合計が一致する", () => {
    let state = createInitialState();
    assertLotStockConsistency(state);

    state = dispatch(state, {
      type: "SO_CREATE",
      payload: { customerId: "CUST-A", itemId: ITEM_IDS.FG_CHAIR, qty: 10, requestDay: 15 },
    });
    const soNo = state.soLines[0].soNo;
    state = dispatch(state, { type: "SO_CONFIRM_DELIVERY", payload: { soNo, confirmDay: 15 } });
    state = dispatch(state, { type: "MRP_RUN" });
    state = dispatch(state, { type: "PLANNED_ORDERS_FIRM" });
    assertLotStockConsistency(state);

    for (const po of state.purchaseOrders) {
      state = dispatch(state, { type: "PO_ACK", payload: { poNo: po.poNo, confirmDay: po.dueDay } });
    }

    state = { ...state, day: 12 };
    const rmPo = state.purchaseOrders.find((p) => p.itemId === ITEM_IDS.RM_BOARD)!;
    state = dispatch(state, { type: "PO_RECEIVE", payload: { poNo: rmPo.poNo } });
    assertLotStockConsistency(state);

    const saOrder = state.mfgOrders.find((mo) => mo.itemId === ITEM_IDS.SA_SEAT)!;
    state = dispatch(state, { type: "MFG_RELEASE", payload: { moNo: saOrder.moNo } });
    state = dispatch(state, { type: "WI_START", payload: { moNo: saOrder.moNo, stepNo: 10 } });
    state = dispatch(state, {
      type: "WI_COMPLETE",
      payload: { moNo: saOrder.moNo, stepNo: 10, goodQty: 10, scrapQty: 0 },
    });
    assertLotStockConsistency(state); // 部品消費（ISS）と完成入庫（PRD）の両方を経た直後

    state = { ...state, day: 14 };
    const legPo = state.purchaseOrders.find((p) => p.itemId === ITEM_IDS.PT_LEG)!;
    const screwPo = state.purchaseOrders.find((p) => p.itemId === ITEM_IDS.PT_SCREW)!;
    state = dispatch(state, { type: "PO_RECEIVE", payload: { poNo: legPo.poNo } });
    state = dispatch(state, { type: "PO_RECEIVE", payload: { poNo: screwPo.poNo } });
    assertLotStockConsistency(state);

    const fgOrder = state.mfgOrders.find((mo) => mo.itemId === ITEM_IDS.FG_CHAIR)!;
    state = dispatch(state, { type: "MFG_RELEASE", payload: { moNo: fgOrder.moNo } });
    state = dispatch(state, { type: "WI_START", payload: { moNo: fgOrder.moNo, stepNo: 10 } });
    state = dispatch(state, {
      type: "WI_COMPLETE",
      payload: { moNo: fgOrder.moNo, stepNo: 10, goodQty: 10, scrapQty: 0 },
    });
    assertLotStockConsistency(state);

    state = dispatch(state, { type: "WI_START", payload: { moNo: fgOrder.moNo, stepNo: 20 } });
    state = dispatch(state, {
      type: "WI_COMPLETE",
      payload: { moNo: fgOrder.moNo, stepNo: 20, goodQty: 9, scrapQty: 1 },
    }); // 不良1個。不良分は完成入庫されないため、この後もonHandとロット残数量合計は一致し続けるはず
    assertLotStockConsistency(state);

    state = dispatch(state, { type: "MRP_RUN" });
    assertLotStockConsistency(state);

    state = { ...state, day: 15 };
    state = dispatch(state, { type: "SHIPMENT_ALLOCATE", payload: { soNo, lineNo: 1 } });
    assertLotStockConsistency(state); // 引当（allocated）はonHandを変えないため一致するはず

    const shipNo = state.shipments[0].shipNo;
    state = dispatch(state, { type: "SHIPMENT_SHIP", payload: { shipNo } });
    assertLotStockConsistency(state); // 出荷実績（SHP）後も一致し続ける

    // TC-16の期待値（出荷可能量が受注残9個に満たないため9個の一部出荷になる）が
    // ロット消費と整合していることも合わせて確認する
    const fgLotTotal = lotBackedOnHand(state, ITEM_IDS.FG_CHAIR);
    expect(fgLotTotal).toBe(0);
    expect(state.stocks.find((s) => s.itemId === ITEM_IDS.FG_CHAIR)?.onHand).toBe(0);
  });

  it("部品消費が複数ロットにまたがる場合、生成ロットの系譜に消費した全ロットが記録される", () => {
    let state = createInitialState();
    state = dispatch(state, {
      type: "SO_CREATE",
      payload: { customerId: "CUST-A", itemId: ITEM_IDS.FG_CHAIR, qty: 10, requestDay: 30 },
    });
    const soNo = state.soLines[0].soNo;
    state = dispatch(state, { type: "SO_CONFIRM_DELIVERY", payload: { soNo, confirmDay: 30 } });
    state = dispatch(state, { type: "MRP_RUN" });
    state = dispatch(state, { type: "PLANNED_ORDERS_FIRM" }); // SA-200 x10、木板(RM-300) x10所要のMFG/PO一式

    // 木板の入荷を待たず、棚卸調整（UC-17、実際のドメイン関数を経由する操作）で2回に分けて
    // 同数量(10)を計上し、意図的に木板ロットを2件（6個・4個）に分散させる
    adjustStock(state, ITEM_IDS.RM_BOARD, 6, 1);
    adjustStock(state, ITEM_IDS.RM_BOARD, 4, 2);
    const rmLots = state.lots.filter((l) => l.itemId === ITEM_IDS.RM_BOARD);
    expect(rmLots).toHaveLength(2);

    const saOrder = state.mfgOrders.find((mo) => mo.itemId === ITEM_IDS.SA_SEAT)!;
    state = dispatch(state, { type: "MFG_RELEASE", payload: { moNo: saOrder.moNo } });
    state = dispatch(state, { type: "WI_START", payload: { moNo: saOrder.moNo, stepNo: 10 } });
    state = dispatch(state, {
      type: "WI_COMPLETE",
      payload: { moNo: saOrder.moNo, stepNo: 10, goodQty: 10, scrapQty: 0 },
    });

    const saLot = state.lots.find((l) => l.itemId === ITEM_IDS.SA_SEAT)!;
    const genealogy = state.lotGenealogy.filter((g) => g.childLot === saLot.lotNo);
    // 消費した2ロットの両方が、単一の生成ロットの系譜として記録されている（片方だけを拾って
    // 「実際に何を使ったか」が欠落する、という事故が起きていないことの確認）
    expect(genealogy).toHaveLength(2);
    expect(genealogy.map((g) => g.consumedQty).sort((a, b) => a - b)).toEqual([4, 6]);
    expect(genealogy.reduce((sum, g) => sum + g.consumedQty, 0)).toBe(10);
    expect(new Set(genealogy.map((g) => g.parentLot))).toEqual(new Set(rmLots.map((l) => l.lotNo)));
    assertLotStockConsistency(state);
  });
});
