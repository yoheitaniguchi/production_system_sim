// 自転車プリセット（design.md EXT-34、Issue #56）の通し演習
//
// 木製イス（CHAIR_PRESET、2階層BOM）とは別業種・4階層BOMの第2プリセット（BICYCLE_PRESET）に
// マスタ全体を切り替え、受注〜出荷までの一連の操作が木製イスと同じドメインロジックだけで通ることを検証する。
// multiLevelBom.test.tsは4階層BOMをマスタ操作だけで一から組み立てる通し演習だったが、
// こちらはあらかじめ用意された第2プリセットへ「切り替える」操作（MASTER_RESET_TO_PRESET）そのものを検証する。
import { describe, expect, it } from "vitest";
import { BICYCLE_PRESET, BIKE_ITEM_IDS } from "../data/masterData";
import { traceFromOrder } from "./pegging";
import { createInitialState, simulationReducer, type SimulationAction } from "./reducer";
import type { SimulationState } from "../types";

function dispatch(state: SimulationState, action: SimulationAction): SimulationState {
  const next = simulationReducer(state, action);
  const last = next.eventLog[next.eventLog.length - 1];
  // マスタ操作・業務操作のいずれもガード違反はエラーログとして残るだけで例外にならないため、
  // 通し演習では1件でもエラーが出たら即座にテストを失敗させる（multiLevelBom.test.tsと同じ方針）
  if (last?.message.startsWith("[エラー]")) throw new Error(`${action.type}: ${last.message}`);
  return next;
}

function switchToBicyclePreset(): SimulationState {
  return dispatch(createInitialState(), { type: "MASTER_RESET_TO_PRESET", payload: { presetId: "BICYCLE" } });
}

/** 指定品目のFIRM製造オーダを、リリース→工順どおりに着手/完了させて完成入庫まで一気に流す（全量良品） */
function produceAllSteps(state: SimulationState, itemId: string, expectedGoodQty: number): SimulationState {
  const mo = state.mfgOrders.find((m) => m.itemId === itemId && m.status === "FIRM");
  expect(mo, `${itemId} の製造オーダが見つからない`).toBeDefined();
  const moNo = mo!.moNo;

  let next = dispatch(state, { type: "MFG_RELEASE", payload: { moNo } });
  const stepNos = next.routingSteps
    .filter((s) => s.itemId === itemId)
    .map((s) => s.stepNo)
    .sort((a, b) => a - b);
  for (const stepNo of stepNos) {
    next = dispatch(next, { type: "WI_START", payload: { moNo, stepNo } });
    next = dispatch(next, {
      type: "WI_COMPLETE",
      payload: { moNo, stepNo, goodQty: expectedGoodQty, scrapQty: 0 },
    });
  }
  return next;
}

describe("自転車プリセット（BICYCLE_PRESET）へ切り替える", () => {
  it("品目・BOM・工順・作業区・取引先がすべて自転車プリセットの内容に置き換わる", () => {
    const state = switchToBicyclePreset();

    expect(state.items).toEqual(BICYCLE_PRESET.items);
    expect(state.bom).toEqual(BICYCLE_PRESET.bom);
    expect(state.routingSteps).toEqual(BICYCLE_PRESET.routingSteps);
    expect(state.workCenters).toEqual(BICYCLE_PRESET.workCenters);
    expect(state.customers).toEqual(BICYCLE_PRESET.customers);
    expect(state.suppliers).toEqual(BICYCLE_PRESET.suppliers);

    // 木製イスの品目コードはもう残っていない（マスタ一式が差し替わっている）
    expect(state.items.some((i) => i.itemId === "FG-100")).toBe(false);
    expect(state.items.find((i) => i.itemId === BIKE_ITEM_IDS.FG_BIKE)?.name).toBe("自転車");
  });
});

describe("自転車プリセットで4階層BOMのMRPを展開する", () => {
  it("数量・BOMレベル・日程が階層どおりに逆算される", () => {
    let state = switchToBicyclePreset();

    state = dispatch(state, {
      type: "SO_CREATE",
      payload: { customerId: "CUST-1", itemId: BIKE_ITEM_IDS.FG_BIKE, qty: 2, requestDay: 10 },
    });
    state = dispatch(state, { type: "SO_CONFIRM_DELIVERY", payload: { soNo: "SO-001", confirmDay: 10 } });
    state = dispatch(state, { type: "MRP_RUN" });

    const byItem = Object.fromEntries(state.plannedOrders.map((p) => [p.itemId, p]));
    expect(state.plannedOrders).toHaveLength(5);

    expect(byItem[BIKE_ITEM_IDS.FG_BIKE]).toMatchObject({ qty: 2, bomLevel: 0, dueDay: 10, startDay: 8, orderType: "MAKE" });
    expect(byItem[BIKE_ITEM_IDS.SA_WHEEL]).toMatchObject({ qty: 4, bomLevel: 1, dueDay: 8, startDay: 7, orderType: "MAKE" });
    expect(byItem[BIKE_ITEM_IDS.PT_FRAME]).toMatchObject({ qty: 2, bomLevel: 1, dueDay: 8, startDay: 5, orderType: "BUY" });
    expect(byItem[BIKE_ITEM_IDS.SA_RIM]).toMatchObject({ qty: 4, bomLevel: 2, dueDay: 7, startDay: 6, orderType: "MAKE" });
    expect(byItem[BIKE_ITEM_IDS.RM_ALUM]).toMatchObject({ qty: 4, bomLevel: 3, dueDay: 6, startDay: 3, orderType: "BUY" });
  });
});

describe("自転車プリセットで受注から出荷までを通す", () => {
  it("在庫・ペギング・受注状態が整合したまま出荷まで完了する", () => {
    let state = switchToBicyclePreset();

    state = dispatch(state, {
      type: "SO_CREATE",
      payload: { customerId: "CUST-1", itemId: BIKE_ITEM_IDS.FG_BIKE, qty: 2, requestDay: 10 },
    });
    state = dispatch(state, { type: "SO_CONFIRM_DELIVERY", payload: { soNo: "SO-001", confirmDay: 10 } });
    state = dispatch(state, { type: "MRP_RUN" });
    state = dispatch(state, { type: "PLANNED_ORDERS_FIRM" });

    // 内製3品目（自転車・車輪ASSY・リムASSY）に製造オーダ、購買2品目（フレーム・アルミリム材）に購買オーダ
    expect(state.mfgOrders).toHaveLength(3);
    expect(state.purchaseOrders).toHaveLength(2);
    // 作業指示は工順行数の合計（自転車2行＋車輪ASSY1行＋リムASSY1行）
    expect(state.workInstructions).toHaveLength(4);

    // 購買2件の納期回答 → 入荷（EXT-4：現在日 >= 回答納期 が必要）
    for (const po of state.purchaseOrders) {
      state = dispatch(state, { type: "PO_ACK", payload: { poNo: po.poNo, confirmDay: po.dueDay } });
    }
    state.day = 8;
    for (const po of state.purchaseOrders) {
      state = dispatch(state, { type: "PO_RECEIVE", payload: { poNo: po.poNo } });
    }
    expect(state.stocks.find((s) => s.itemId === BIKE_ITEM_IDS.RM_ALUM)?.onHand).toBe(4);
    expect(state.stocks.find((s) => s.itemId === BIKE_ITEM_IDS.PT_FRAME)?.onHand).toBe(2);

    // 下位から順に作る。バックフラッシュが階層をまたいで正しく消費されることを都度確認する
    state = produceAllSteps(state, BIKE_ITEM_IDS.SA_RIM, 4);
    expect(state.stocks.find((s) => s.itemId === BIKE_ITEM_IDS.RM_ALUM)?.onHand).toBe(0);
    expect(state.stocks.find((s) => s.itemId === BIKE_ITEM_IDS.SA_RIM)?.onHand).toBe(4);

    state = produceAllSteps(state, BIKE_ITEM_IDS.SA_WHEEL, 4);
    expect(state.stocks.find((s) => s.itemId === BIKE_ITEM_IDS.SA_RIM)?.onHand).toBe(0);
    expect(state.stocks.find((s) => s.itemId === BIKE_ITEM_IDS.SA_WHEEL)?.onHand).toBe(4);

    state = produceAllSteps(state, BIKE_ITEM_IDS.FG_BIKE, 2);
    expect(state.stocks.find((s) => s.itemId === BIKE_ITEM_IDS.SA_WHEEL)?.onHand).toBe(0);
    expect(state.stocks.find((s) => s.itemId === BIKE_ITEM_IDS.PT_FRAME)?.onHand).toBe(0);
    expect(state.stocks.find((s) => s.itemId === BIKE_ITEM_IDS.FG_BIKE)?.onHand).toBe(2);

    // 引当 → 出荷
    state = dispatch(state, { type: "SHIPMENT_ALLOCATE", payload: { soNo: "SO-001", lineNo: 1 } });
    state.day = 10;
    state = dispatch(state, { type: "SHIPMENT_SHIP", payload: { shipNo: state.shipments[0].shipNo } });

    expect(state.soLines[0]).toMatchObject({ shippedQty: 2, status: "CLOSED" });
    expect(state.stocks.find((s) => s.itemId === BIKE_ITEM_IDS.FG_BIKE)?.onHand).toBe(0);

    // ペギング：受注1件から4階層分の確定オーダ（製造3・購買2）がすべて辿れる
    const trace = traceFromOrder(state, "SO-001", 1);
    expect(trace.mfgOrders.map((m) => m.itemId).sort()).toEqual(
      [BIKE_ITEM_IDS.FG_BIKE, BIKE_ITEM_IDS.SA_RIM, BIKE_ITEM_IDS.SA_WHEEL].sort(),
    );
    expect(trace.purchaseOrders.map((p) => p.itemId).sort()).toEqual(
      [BIKE_ITEM_IDS.PT_FRAME, BIKE_ITEM_IDS.RM_ALUM].sort(),
    );
  });
});
