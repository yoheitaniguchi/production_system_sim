// 多階層BOMの通し演習（design.md EXT-19〜EXT-26）
//
// 木製イスのプリセット（2階層）を捨て、4階層のBOMをマスタ操作だけで一から組み立てて、
// 受注 → MRP → 計画オーダ確定 → 入荷 → 工程（下位から順に3本）→ 出荷まで通す。
// 「ドメインロジックがマスタの形に依存していない」ことを実証するのがこのテストの目的であり、
// v5-spec.md §9のTC群（木製イス固定）とは別軸の検証にあたる。
//
//   FG-X（内製・LT2・売価20,000）
//     ├─ SA-A（内製・LT1）×2
//     │    └─ SA-B（内製・LT1）×2
//     │         └─ RM-1（購買・LT3・単価100）×1
//     └─ PT-Z（購買・LT2・単価50）×3
import { describe, expect, it } from "vitest";
import { rollupCost } from "./cost";
import { runMRP } from "./mrp";
import { traceFromOrder } from "./pegging";
import { createInitialState, simulationReducer, type SimulationAction } from "./reducer";
import type { SimulationState } from "../types";

function dispatch(state: SimulationState, action: SimulationAction): SimulationState {
  const next = simulationReducer(state, action);
  const last = next.eventLog[next.eventLog.length - 1];
  // マスタ操作・業務操作のいずれもガード違反はエラーログとして残るだけで例外にならないため、
  // 通し演習では1件でもエラーが出たら即座にテストを失敗させる
  if (last?.message.startsWith("[エラー]")) throw new Error(`${action.type}: ${last.message}`);
  return next;
}

/** プリセットを一掃し、4階層のマスタをマスタ操作だけで組み立てる */
function buildFourLevelMaster(): SimulationState {
  let state = createInitialState();

  state = dispatch(state, {
    type: "MASTER_IMPORT",
    payload: {
      snapshot: {
        version: 1,
        items: [],
        bom: [],
        routingSteps: [],
        workCenters: [],
        customers: [],
        suppliers: [],
      },
    },
  });
  expect(state.items).toHaveLength(0);

  // 依存される側（作業区・仕入先・得意先）から順に登録する
  state = dispatch(state, { type: "MASTER_ADD_WORK_CENTER", payload: { workCenter: { workCenter: "WC-1", ratePerHour: 2000 } } });
  state = dispatch(state, { type: "MASTER_ADD_PARTNER", payload: { partnerType: "SUPPLIER", partnerId: "SUP-1", name: "仕入先1" } });
  state = dispatch(state, { type: "MASTER_ADD_PARTNER", payload: { partnerType: "CUSTOMER", partnerId: "CUST-X", name: "得意先X" } });

  for (const item of [
    { itemId: "FG-X", name: "完成品X", makeBuy: "MAKE" as const, leadTimeDays: 2, salesPrice: 20000 },
    { itemId: "SA-A", name: "中間A", makeBuy: "MAKE" as const, leadTimeDays: 1 },
    { itemId: "SA-B", name: "中間B", makeBuy: "MAKE" as const, leadTimeDays: 1 },
    { itemId: "RM-1", name: "原材料1", makeBuy: "BUY" as const, leadTimeDays: 3, defaultSupplierId: "SUP-1", purchasePrice: 100 },
    { itemId: "PT-Z", name: "部品Z", makeBuy: "BUY" as const, leadTimeDays: 2, defaultSupplierId: "SUP-1", purchasePrice: 50 },
  ]) {
    state = dispatch(state, { type: "MASTER_ADD_ITEM", payload: { item } });
  }

  for (const line of [
    { parentItemId: "FG-X", childItemId: "SA-A", qtyPer: 2 },
    { parentItemId: "FG-X", childItemId: "PT-Z", qtyPer: 3 },
    { parentItemId: "SA-A", childItemId: "SA-B", qtyPer: 2 },
    { parentItemId: "SA-B", childItemId: "RM-1", qtyPer: 1 },
  ]) {
    state = dispatch(state, { type: "MASTER_ADD_BOM_LINE", payload: { line } });
  }

  for (const step of [
    { itemId: "FG-X", stepNo: 10, workCenter: "WC-1", stdTimeMin: 60 },
    { itemId: "SA-A", stepNo: 10, workCenter: "WC-1", stdTimeMin: 30 },
    { itemId: "SA-B", stepNo: 10, workCenter: "WC-1", stdTimeMin: 30 },
  ]) {
    state = dispatch(state, { type: "MASTER_ADD_ROUTING_STEP", payload: { step } });
  }

  return state;
}

/** 指定品目の製造オーダを、リリース → 着手 → 完了（全量良品）まで一気に流す */
function produce(state: SimulationState, itemId: string, expectedGoodQty: number): SimulationState {
  const mo = state.mfgOrders.find((m) => m.itemId === itemId && m.status === "FIRM");
  expect(mo, `${itemId} の製造オーダが見つからない`).toBeDefined();
  const moNo = mo!.moNo;

  let next = dispatch(state, { type: "MFG_RELEASE", payload: { moNo } });
  next = dispatch(next, { type: "WI_START", payload: { moNo, stepNo: 10 } });
  next = dispatch(next, {
    type: "WI_COMPLETE",
    payload: { moNo, stepNo: 10, goodQty: expectedGoodQty, scrapQty: 0 },
  });
  return next;
}

describe("4階層BOMをマスタ操作だけで組み立てて通す", () => {
  it("MRPは4階層すべてを展開し、BOMレベルと日程を階層どおりに逆算する", () => {
    let state = buildFourLevelMaster();

    state = dispatch(state, {
      type: "SO_CREATE",
      payload: { customerId: "CUST-X", itemId: "FG-X", qty: 2, requestDay: 10 },
    });
    state = dispatch(state, { type: "SO_CONFIRM_DELIVERY", payload: { soNo: "SO-001", confirmDay: 10 } });
    state = dispatch(state, { type: "MRP_RUN" });

    const byItem = Object.fromEntries(state.plannedOrders.map((p) => [p.itemId, p]));
    expect(state.plannedOrders).toHaveLength(5);

    // 数量：員数が階層をまたいで掛け算されること
    expect(byItem["FG-X"]).toMatchObject({ qty: 2, bomLevel: 0, dueDay: 10, startDay: 8, orderType: "MAKE" });
    expect(byItem["SA-A"]).toMatchObject({ qty: 4, bomLevel: 1, dueDay: 8, startDay: 7, orderType: "MAKE" });
    expect(byItem["SA-B"]).toMatchObject({ qty: 8, bomLevel: 2, dueDay: 7, startDay: 6, orderType: "MAKE" });
    expect(byItem["RM-1"]).toMatchObject({ qty: 8, bomLevel: 3, dueDay: 6, startDay: 3, orderType: "BUY" });
    // PT-ZはFG-Xの直下なのでレベル1、着手日8から2日前倒しで発注
    expect(byItem["PT-Z"]).toMatchObject({ qty: 6, bomLevel: 1, dueDay: 8, startDay: 6, orderType: "BUY" });
  });

  it("標準原価を4階層にわたって積み上げる", () => {
    const state = buildFourLevelMaster();

    // RM-1（購買）100
    expect(rollupCost(state, "RM-1").standardCost).toBe(100);
    // SA-B = RM-1×1(100) + 30分×2000円/時(1,000) = 1,100
    expect(rollupCost(state, "SA-B")).toEqual({ material: 100, labor: 1000, standardCost: 1100 });
    // SA-A = SA-B×2(2,200) + 1,000 = 3,200
    expect(rollupCost(state, "SA-A")).toEqual({ material: 2200, labor: 1000, standardCost: 3200 });
    // FG-X = SA-A×2(6,400) + PT-Z×3(150) + 60分×2000円/時(2,000) = 8,550
    expect(rollupCost(state, "FG-X")).toEqual({ material: 6550, labor: 2000, standardCost: 8550 });
  });

  it("受注から出荷までを通し、在庫・ペギング・受注状態が整合する", () => {
    let state = buildFourLevelMaster();

    state = dispatch(state, {
      type: "SO_CREATE",
      payload: { customerId: "CUST-X", itemId: "FG-X", qty: 2, requestDay: 10 },
    });
    state = dispatch(state, { type: "SO_CONFIRM_DELIVERY", payload: { soNo: "SO-001", confirmDay: 10 } });
    state = dispatch(state, { type: "MRP_RUN" });
    state = dispatch(state, { type: "PLANNED_ORDERS_FIRM" });

    // 内製3品目それぞれに製造オーダと作業指示が起票される
    expect(state.mfgOrders).toHaveLength(3);
    expect(state.workInstructions).toHaveLength(3);
    expect(state.purchaseOrders).toHaveLength(2);

    // 購買2件の納期回答 → 入荷（EXT-4：現在日 >= 回答納期 が必要）
    for (const po of state.purchaseOrders) {
      state = dispatch(state, { type: "PO_ACK", payload: { poNo: po.poNo, confirmDay: po.dueDay } });
    }
    state.day = 8;
    for (const po of state.purchaseOrders) {
      state = dispatch(state, { type: "PO_RECEIVE", payload: { poNo: po.poNo } });
    }
    expect(state.stocks.find((s) => s.itemId === "RM-1")?.onHand).toBe(8);
    expect(state.stocks.find((s) => s.itemId === "PT-Z")?.onHand).toBe(6);

    // 下位から順に作る。バックフラッシュが階層をまたいで正しく消費されることを都度確認する
    state = produce(state, "SA-B", 8);
    expect(state.stocks.find((s) => s.itemId === "RM-1")?.onHand).toBe(0);
    expect(state.stocks.find((s) => s.itemId === "SA-B")?.onHand).toBe(8);

    state = produce(state, "SA-A", 4);
    expect(state.stocks.find((s) => s.itemId === "SA-B")?.onHand).toBe(0);
    expect(state.stocks.find((s) => s.itemId === "SA-A")?.onHand).toBe(4);

    state = produce(state, "FG-X", 2);
    expect(state.stocks.find((s) => s.itemId === "SA-A")?.onHand).toBe(0);
    expect(state.stocks.find((s) => s.itemId === "PT-Z")?.onHand).toBe(0);
    expect(state.stocks.find((s) => s.itemId === "FG-X")?.onHand).toBe(2);

    // 引当 → 出荷
    state = dispatch(state, { type: "SHIPMENT_ALLOCATE", payload: { soNo: "SO-001", lineNo: 1 } });
    state.day = 10;
    state = dispatch(state, { type: "SHIPMENT_SHIP", payload: { shipNo: state.shipments[0].shipNo } });

    expect(state.soLines[0]).toMatchObject({ shippedQty: 2, status: "CLOSED" });
    expect(state.stocks.find((s) => s.itemId === "FG-X")?.onHand).toBe(0);

    // ペギング：受注1件から4階層分の確定オーダ（製造3・購買2）がすべて辿れる
    const trace = traceFromOrder(state, "SO-001", 1);
    expect(trace.mfgOrders.map((m) => m.itemId).sort()).toEqual(["FG-X", "SA-A", "SA-B"]);
    expect(trace.purchaseOrders.map((p) => p.itemId).sort()).toEqual(["PT-Z", "RM-1"]);
  });
});

describe("マスタが壊れているときエンジンが黙って壊れない（design.md EXT-19・EXT-22）", () => {
  it("循環BOMを直接注入してMRPを実行すると、無限再帰ではなく例外になる", () => {
    const state = buildFourLevelMaster();
    // 登録時チェックは通らないので、壊れたデータを直接注入して保険側のガードを検証する
    state.bom.push({ parentItemId: "SA-B", childItemId: "FG-X", qtyPer: 1 });
    state.soLines.push({
      soNo: "SO-001",
      lineNo: 1,
      itemId: "FG-X",
      qty: 1,
      requestDay: 10,
      confirmDay: 10,
      shippedQty: 0,
      status: "CONFIRMED",
    });

    expect(() => runMRP(state)).toThrow(/循環/);
    expect(() => rollupCost(state, "FG-X")).toThrow(/循環/);
  });

  it("工順が0行の内製品目は計画オーダを確定できない（完了不能な製造オーダを作らない）", () => {
    let state = buildFourLevelMaster();
    state = dispatch(state, { type: "MASTER_DELETE_ROUTING_STEP", payload: { itemId: "SA-B", stepNo: 10 } });
    state = dispatch(state, {
      type: "SO_CREATE",
      payload: { customerId: "CUST-X", itemId: "FG-X", qty: 2, requestDay: 10 },
    });
    state = dispatch(state, { type: "SO_CONFIRM_DELIVERY", payload: { soNo: "SO-001", confirmDay: 10 } });
    state = dispatch(state, { type: "MRP_RUN" });

    const next = simulationReducer(state, { type: "PLANNED_ORDERS_FIRM" });
    expect(next.eventLog.at(-1)?.message).toMatch(/^\[エラー\].*工順が1行も無い/);
    // 1件も確定していない（部分的に壊れた状態を残さない）
    expect(next.mfgOrders).toHaveLength(0);
    expect(next.purchaseOrders).toHaveLength(0);
  });
});
