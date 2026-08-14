import { describe, expect, it } from "vitest";
import { ITEM_IDS } from "../data/masterData";
import { confirmDelivery, createSalesOrder } from "./salesOrder";
import { firmAllPlannedOrders, runMRP } from "./mrp";
import { completeStep, releaseMfgOrder, startStep } from "./production";
import {
  backlogValue,
  computeAllItemCosts,
  computeMfgOrderCost,
  inventoryValue,
  rollupCost,
  scrapLossValue,
} from "./cost";
import { createTestState } from "./testUtils";

describe("rollupCost（v5-spec.md §11.2の計算例どおりの標準原価積上げ）", () => {
  it("BUY品目は購入単価がそのまま材料費・標準原価になる", () => {
    const state = createTestState(0);
    expect(rollupCost(state, ITEM_IDS.RM_BOARD)).toEqual({ material: 800, labor: 0, standardCost: 800 });
    expect(rollupCost(state, ITEM_IDS.PT_LEG)).toEqual({ material: 250, labor: 0, standardCost: 250 });
    expect(rollupCost(state, ITEM_IDS.PT_SCREW)).toEqual({ material: 20, labor: 0, standardCost: 20 });
  });

  it("MAKE品目はBOM×子品目原価が材料費、工順×賃率が加工費になる（座面ASSY）", () => {
    const state = createTestState(0);
    expect(rollupCost(state, ITEM_IDS.SA_SEAT)).toEqual({ material: 800, labor: 600, standardCost: 1400 });
  });

  it("木製イスは §11.2 の例のとおり材料費2,560・加工費1,400・標準原価3,960になる", () => {
    const state = createTestState(0);
    expect(rollupCost(state, ITEM_IDS.FG_CHAIR)).toEqual({ material: 2560, labor: 1400, standardCost: 3960 });
  });

  it("computeAllItemCostsは全品目分をitemId付きで返す", () => {
    const state = createTestState(0);
    const costs = computeAllItemCosts(state);
    expect(costs).toHaveLength(5);
    expect(costs.find((c) => c.itemId === ITEM_IDS.FG_CHAIR)).toMatchObject({ standardCost: 3960 });
  });
});

describe("computeMfgOrderCost（v5-spec.md §11.2「原価差異の可視化」の不良1個の例）", () => {
  it("第1工程完了直後は投入額のみ計上され、完成振替は0（未完了）", () => {
    const state = createTestState(0);
    const soNo = createSalesOrder(state, { customerId: "CUST-A", itemId: ITEM_IDS.FG_CHAIR, qty: 10, requestDay: 15 }, 0);
    confirmDelivery(state, soNo, 15);
    runMRP(state);
    firmAllPlannedOrders(state, 0);
    state.stocks.push(
      { itemId: ITEM_IDS.SA_SEAT, onHand: 10, allocated: 0 },
      { itemId: ITEM_IDS.PT_LEG, onHand: 40, allocated: 0 },
      { itemId: ITEM_IDS.PT_SCREW, onHand: 80, allocated: 0 },
    );
    const fgOrder = state.mfgOrders.find((mo) => mo.itemId === ITEM_IDS.FG_CHAIR)!;

    releaseMfgOrder(state, fgOrder.moNo);
    startStep(state, fgOrder.moNo, 10, 13);
    completeStep(state, fgOrder.moNo, 10, 10, 0, 13);

    expect(computeMfgOrderCost(state, fgOrder.moNo)).toEqual({
      moNo: fgOrder.moNo,
      inputMaterial: 25600,
      inputLabor: 14000,
      outputStandard: 0,
      variance: 39600,
    });
  });

  it("最終工程で不良1個が出ると、原価差異は3,960円（＝標準原価×不良数）になる", () => {
    const state = createTestState(0);
    const soNo = createSalesOrder(state, { customerId: "CUST-A", itemId: ITEM_IDS.FG_CHAIR, qty: 10, requestDay: 15 }, 0);
    confirmDelivery(state, soNo, 15);
    runMRP(state);
    firmAllPlannedOrders(state, 0);
    state.stocks.push(
      { itemId: ITEM_IDS.SA_SEAT, onHand: 10, allocated: 0 },
      { itemId: ITEM_IDS.PT_LEG, onHand: 40, allocated: 0 },
      { itemId: ITEM_IDS.PT_SCREW, onHand: 80, allocated: 0 },
    );
    const fgOrder = state.mfgOrders.find((mo) => mo.itemId === ITEM_IDS.FG_CHAIR)!;

    releaseMfgOrder(state, fgOrder.moNo);
    startStep(state, fgOrder.moNo, 10, 13);
    completeStep(state, fgOrder.moNo, 10, 10, 0, 13);
    startStep(state, fgOrder.moNo, 20, 14);
    completeStep(state, fgOrder.moNo, 20, 9, 1, 14);

    const cost = computeMfgOrderCost(state, fgOrder.moNo);
    expect(cost.outputStandard).toBe(3960 * 9);
    expect(cost.variance).toBe(3960);
  });
});

describe("inventoryValue / backlogValue / scrapLossValue", () => {
  it("在庫が無ければ在庫金額は0", () => {
    const state = createTestState(0);
    expect(inventoryValue(state)).toBe(0);
  });

  it("在庫金額は現在庫数量×標準原価の合計になる", () => {
    const state = createTestState(0);
    state.stocks.push({ itemId: ITEM_IDS.RM_BOARD, onHand: 5, allocated: 0 });
    expect(inventoryValue(state)).toBe(5 * 800);
  });

  it("受注残高（金額）は未出荷の受注残数量×売価の合計になる（RECEIVEDは含めない）", () => {
    const state = createTestState(0);
    const soNo = createSalesOrder(state, { customerId: "CUST-A", itemId: ITEM_IDS.FG_CHAIR, qty: 10, requestDay: 15 }, 0);
    expect(backlogValue(state)).toBe(0); // 納期回答前はCONFIRMEDでないため対象外
    confirmDelivery(state, soNo, 15);
    expect(backlogValue(state)).toBe(10 * 6000);
  });

  it("不良損失額は製造オーダの不良数量×標準原価の合計になる", () => {
    const state = createTestState(0);
    const soNo = createSalesOrder(state, { customerId: "CUST-A", itemId: ITEM_IDS.FG_CHAIR, qty: 10, requestDay: 15 }, 0);
    confirmDelivery(state, soNo, 15);
    runMRP(state);
    firmAllPlannedOrders(state, 0);
    state.stocks.push(
      { itemId: ITEM_IDS.SA_SEAT, onHand: 10, allocated: 0 },
      { itemId: ITEM_IDS.PT_LEG, onHand: 40, allocated: 0 },
      { itemId: ITEM_IDS.PT_SCREW, onHand: 80, allocated: 0 },
    );
    const fgOrder = state.mfgOrders.find((mo) => mo.itemId === ITEM_IDS.FG_CHAIR)!;
    releaseMfgOrder(state, fgOrder.moNo);
    startStep(state, fgOrder.moNo, 10, 13);
    completeStep(state, fgOrder.moNo, 10, 10, 0, 13);
    startStep(state, fgOrder.moNo, 20, 14);
    completeStep(state, fgOrder.moNo, 20, 9, 1, 14);

    expect(scrapLossValue(state)).toBe(3960);
  });
});
