import { describe, expect, it } from "vitest";
import { ITEM_IDS } from "../data/masterData";
import { computeActiveFlows } from "./processFlow";
import { createInitialState, simulationReducer, type SimulationAction } from "./reducer";
import type { SimulationState } from "../types";

function dispatch(state: SimulationState, action: SimulationAction): SimulationState {
  return simulationReducer(state, action);
}

describe("computeActiveFlows", () => {
  it("まだ何も操作していなければ何もハイライトしない", () => {
    const state = createInitialState();
    const result = computeActiveFlows(state);
    expect(result.lastMessage).toBeNull();
    expect(result.flowIds.size).toBe(0);
    expect(result.activeDomains.size).toBe(0);
  });

  it("受注登録は受注ドメインのみをハイライトする", () => {
    let state = createInitialState();
    state = dispatch(state, {
      type: "SO_CREATE",
      payload: { customerId: "CUST-A", itemId: ITEM_IDS.FG_CHAIR, qty: 10, requestDay: 15 },
    });
    const result = computeActiveFlows(state);
    expect(result.activeDomains).toEqual(new Set(["salesOrder"]));
    expect(result.flowIds.size).toBe(0);
  });

  it("MRP実行は受注・在庫・発注・工程から計画への4本をハイライトする", () => {
    let state = createInitialState();
    state = dispatch(state, { type: "MRP_RUN" });
    const result = computeActiveFlows(state);
    expect(result.flowIds).toEqual(
      new Set(["salesOrder-planning", "inventory-planning", "procurement-planning", "production-planning"]),
    );
    expect(result.activeDomains).toEqual(new Set(["salesOrder", "inventory", "procurement", "production", "planning"]));
  });

  it("計画オーダ確定は実際に生成されたテーブルに応じて計画→発注／計画→工程をハイライトする", () => {
    let state = createInitialState();
    state = dispatch(state, {
      type: "SO_CREATE",
      payload: { customerId: "CUST-A", itemId: ITEM_IDS.FG_CHAIR, qty: 10, requestDay: 15 },
    });
    const soNo = state.soLines[0].soNo;
    state = dispatch(state, { type: "SO_CONFIRM_DELIVERY", payload: { soNo, confirmDay: 15 } });
    state = dispatch(state, { type: "MRP_RUN" });
    state = dispatch(state, { type: "PLANNED_ORDERS_FIRM" });

    const result = computeActiveFlows(state);
    expect(result.flowIds).toEqual(new Set(["planning-production", "planning-procurement"]));
  });

  it("入荷計上は発注→在庫をハイライトする", () => {
    let state = createInitialState();
    state = dispatch(state, {
      type: "SO_CREATE",
      payload: { customerId: "CUST-A", itemId: ITEM_IDS.FG_CHAIR, qty: 10, requestDay: 15 },
    });
    const soNo = state.soLines[0].soNo;
    state = dispatch(state, { type: "SO_CONFIRM_DELIVERY", payload: { soNo, confirmDay: 15 } });
    state = dispatch(state, { type: "MRP_RUN" });
    state = dispatch(state, { type: "PLANNED_ORDERS_FIRM" });
    const po = state.purchaseOrders.find((p) => p.itemId === ITEM_IDS.RM_BOARD)!;
    state = dispatch(state, { type: "PO_ACK", payload: { poNo: po.poNo, confirmDay: po.dueDay } });
    while (state.day < po.dueDay) state = dispatch(state, { type: "ADVANCE_DAY" });
    state = dispatch(state, { type: "PO_RECEIVE", payload: { poNo: po.poNo } });

    const result = computeActiveFlows(state);
    expect(result.flowIds).toEqual(new Set(["procurement-inventory"]));
  });

  it("工程完了は工程→在庫をハイライトする", () => {
    let state = createInitialState();
    state = dispatch(state, {
      type: "SO_CREATE",
      payload: { customerId: "CUST-A", itemId: ITEM_IDS.FG_CHAIR, qty: 10, requestDay: 15 },
    });
    const soNo = state.soLines[0].soNo;
    state = dispatch(state, { type: "SO_CONFIRM_DELIVERY", payload: { soNo, confirmDay: 15 } });
    state = dispatch(state, { type: "MRP_RUN" });
    state = dispatch(state, { type: "PLANNED_ORDERS_FIRM" });
    const rmPo = state.purchaseOrders.find((p) => p.itemId === ITEM_IDS.RM_BOARD)!;
    state = dispatch(state, { type: "PO_ACK", payload: { poNo: rmPo.poNo, confirmDay: rmPo.dueDay } });
    while (state.day < rmPo.dueDay) state = dispatch(state, { type: "ADVANCE_DAY" });
    state = dispatch(state, { type: "PO_RECEIVE", payload: { poNo: rmPo.poNo } });
    const saOrder = state.mfgOrders.find((mo) => mo.itemId === ITEM_IDS.SA_SEAT)!;
    state = dispatch(state, { type: "MFG_RELEASE", payload: { moNo: saOrder.moNo } });
    state = dispatch(state, { type: "WI_START", payload: { moNo: saOrder.moNo, stepNo: 10 } });
    state = dispatch(state, { type: "WI_COMPLETE", payload: { moNo: saOrder.moNo, stepNo: 10, goodQty: 10, scrapQty: 0 } });

    const result = computeActiveFlows(state);
    expect(result.flowIds).toEqual(new Set(["production-inventory"]));
  });

  it("マスタ変更はマスタドメインのみをハイライトし、フローは動かさない", () => {
    let state = createInitialState();
    state = dispatch(state, {
      type: "MASTER_UPDATE_ITEM_LEAD_TIME",
      payload: { itemId: ITEM_IDS.RM_BOARD, leadTimeDays: 3 },
    });
    const result = computeActiveFlows(state);
    expect(result.activeDomains).toEqual(new Set(["master"]));
    expect(result.flowIds.size).toBe(0);
  });

  it("エラーログはハイライトしない", () => {
    let state = createInitialState();
    state = dispatch(state, { type: "SO_CONFIRM_DELIVERY", payload: { soNo: "SO-999", confirmDay: 10 } });
    expect(state.eventLog[0].message).toMatch(/^\[エラー\]/);

    const result = computeActiveFlows(state);
    expect(result.flowIds.size).toBe(0);
    expect(result.activeDomains.size).toBe(0);
  });
});
