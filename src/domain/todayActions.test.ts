import { describe, expect, it } from "vitest";
import { ITEM_IDS } from "../data/masterData";
import { confirmDelivery, createSalesOrder } from "./salesOrder";
import { firmAllPlannedOrders, runMRP } from "./mrp";
import { ackPurchaseOrder, receivePurchaseOrder } from "./procurement";
import { releaseMfgOrder, startStep } from "./production";
import { allocateShipment } from "./shipment";
import { computeTodayActions } from "./todayActions";
import { createTestState } from "./testUtils";

describe("computeTodayActions（design.md DEV-2：自動再生の軽量代替案）", () => {
  it("初期状態では実行可能な操作は無い", () => {
    const state = createTestState(0);
    expect(computeTodayActions(state)).toHaveLength(0);
  });

  it("受注登録直後は「納期回答待ちの受注」のみ", () => {
    const state = createTestState(0);
    createSalesOrder(state, { customerId: "CUST-A", itemId: ITEM_IDS.FG_CHAIR, qty: 10, requestDay: 15 }, 0);

    expect(computeTodayActions(state)).toEqual([
      { domain: "sales-order", label: "納期回答待ちの受注", count: 1 },
    ]);
  });

  it("納期回答後、MRP実行前は「計画オーダ確定待ち」が出ない（計画オーダが無いため）", () => {
    const state = createTestState(0);
    const soNo = createSalesOrder(state, { customerId: "CUST-A", itemId: ITEM_IDS.FG_CHAIR, qty: 10, requestDay: 15 }, 0);
    confirmDelivery(state, soNo, 15);

    expect(computeTodayActions(state)).toHaveLength(0);
  });

  it("MRP実行後は「計画オーダ確定待ち」、確定後は購買・製造の着手系操作が並ぶ", () => {
    const state = createTestState(0);
    const soNo = createSalesOrder(state, { customerId: "CUST-A", itemId: ITEM_IDS.FG_CHAIR, qty: 10, requestDay: 15 }, 0);
    confirmDelivery(state, soNo, 15);
    runMRP(state);

    expect(computeTodayActions(state)).toContainEqual({
      domain: "planning",
      label: "計画オーダ確定待ち",
      count: state.plannedOrders.length,
    });

    firmAllPlannedOrders(state, 0);
    const actions = computeTodayActions(state);
    expect(actions).toContainEqual({ domain: "procurement", label: "納期回答待ちの購買オーダ", count: 3 });
    expect(actions).toContainEqual({ domain: "production", label: "リリース可能な製造オーダ", count: 2 });
    expect(actions.some((a) => a.label === "計画オーダ確定待ち")).toBe(false);
  });

  it("購買オーダの回答納期に達するまでは「入荷計上可能」に数えない", () => {
    const state = createTestState(0);
    const soNo = createSalesOrder(state, { customerId: "CUST-A", itemId: ITEM_IDS.FG_CHAIR, qty: 10, requestDay: 15 }, 0);
    confirmDelivery(state, soNo, 15);
    runMRP(state);
    firmAllPlannedOrders(state, 0);
    const rmPo = state.purchaseOrders.find((p) => p.itemId === ITEM_IDS.RM_BOARD)!;
    ackPurchaseOrder(state, rmPo.poNo, 12);

    const before = computeTodayActions(state);
    expect(before.some((a) => a.label === "入荷計上可能な購買オーダ")).toBe(false);

    state.day = 12;
    const after = computeTodayActions(state);
    expect(after).toContainEqual({ domain: "procurement", label: "入荷計上可能な購買オーダ", count: 1 });
  });

  it("製造オーダをリリースすると第1工程が「着手可能な工程」に、着手するとその工程が「完了入力待ち」に移る", () => {
    const state = createTestState(0);
    const soNo = createSalesOrder(state, { customerId: "CUST-A", itemId: ITEM_IDS.FG_CHAIR, qty: 10, requestDay: 15 }, 0);
    confirmDelivery(state, soNo, 15);
    runMRP(state);
    firmAllPlannedOrders(state, 0);
    const saOrder = state.mfgOrders.find((mo) => mo.itemId === ITEM_IDS.SA_SEAT)!;

    releaseMfgOrder(state, saOrder.moNo);
    expect(computeTodayActions(state)).toContainEqual({ domain: "production", label: "着手可能な工程", count: 1 });

    startStep(state, saOrder.moNo, 10, 12);
    const actions = computeTodayActions(state);
    expect(actions).toContainEqual({ domain: "production", label: "完了入力待ちの工程", count: 1 });
    expect(actions.some((a) => a.label === "着手可能な工程")).toBe(false);
  });

  it("完成品が入庫し受注残があれば「引当可能な受注」、引当後は「出荷実績登録待ちの出荷指示」になる", () => {
    const state = createTestState(0);
    const soNo = createSalesOrder(state, { customerId: "CUST-A", itemId: ITEM_IDS.FG_CHAIR, qty: 10, requestDay: 15 }, 0);
    confirmDelivery(state, soNo, 15);
    state.stocks.push({ itemId: ITEM_IDS.FG_CHAIR, onHand: 10, allocated: 0 });

    expect(computeTodayActions(state)).toContainEqual({ domain: "shipment", label: "引当可能な受注", count: 1 });

    allocateShipment(state, soNo, 1, 15);
    const actions = computeTodayActions(state);
    expect(actions).toContainEqual({
      domain: "shipment",
      label: "出荷実績登録待ちの出荷指示",
      count: 1,
    });
    expect(actions.some((a) => a.label === "引当可能な受注")).toBe(false);
  });

  it("receivePurchaseOrder後は当該購買オーダがCLOSEDになり入荷計上対象から外れる", () => {
    const state = createTestState(0);
    const soNo = createSalesOrder(state, { customerId: "CUST-A", itemId: ITEM_IDS.FG_CHAIR, qty: 10, requestDay: 15 }, 0);
    confirmDelivery(state, soNo, 15);
    runMRP(state);
    firmAllPlannedOrders(state, 0);
    const rmPo = state.purchaseOrders.find((p) => p.itemId === ITEM_IDS.RM_BOARD)!;
    ackPurchaseOrder(state, rmPo.poNo, 12);
    state.day = 12;
    receivePurchaseOrder(state, rmPo.poNo, 12);

    expect(computeTodayActions(state).some((a) => a.label === "入荷計上可能な購買オーダ")).toBe(false);
  });
});
