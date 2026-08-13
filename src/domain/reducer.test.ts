import { describe, expect, it } from "vitest";
import { ITEM_IDS } from "../data/masterData";
import { createInitialState, simulationReducer, type SimulationAction } from "./reducer";
import type { SimulationState } from "../types";

function dispatch(state: SimulationState, action: SimulationAction): SimulationState {
  return simulationReducer(state, action);
}

describe("simulationReducer", () => {
  it("元のstateを書き換えず、新しいstateを返す", () => {
    const state = createInitialState();
    const frozen = structuredClone(state);
    const next = dispatch(state, { type: "ADVANCE_DAY" });
    expect(state).toEqual(frozen);
    expect(next).not.toBe(state);
    expect(next.day).toBe(1);
  });

  it("未知のactionはstateをそのまま返す", () => {
    const state = createInitialState();
    // @ts-expect-error 型のガードが機能していることを確認するための意図的な不正値
    const next = dispatch(state, { type: "UNKNOWN_ACTION" });
    expect(next).toBe(state);
  });

  it("ADVANCE_DAYは日付だけを進める", () => {
    const state = createInitialState();
    const next = dispatch(state, { type: "ADVANCE_DAY" });
    expect(next.day).toBe(1);
    expect(next.soLines).toEqual(state.soLines);
  });

  it("SO_CREATE〜SHIPMENT_SHIPまで、一連のactionが対応するドメイン関数へ正しく委譲される", () => {
    let state = createInitialState();
    state = dispatch(state, {
      type: "SO_CREATE",
      payload: { customerId: "CUST-A", itemId: ITEM_IDS.FG_CHAIR, qty: 10, requestDay: 15 },
    });
    const soNo = state.soLines[0].soNo;
    expect(state.soLines[0]).toMatchObject({ status: "RECEIVED", qty: 10 });

    state = dispatch(state, { type: "SO_CONFIRM_DELIVERY", payload: { soNo, confirmDay: 15 } });
    expect(state.soLines[0]).toMatchObject({ confirmDay: 15, status: "CONFIRMED" });

    state = dispatch(state, { type: "MRP_RUN" });
    expect(state.plannedOrders).toHaveLength(5);

    state = dispatch(state, { type: "PLANNED_ORDERS_FIRM" });
    expect(state.plannedOrders).toHaveLength(0);
    expect(state.mfgOrders).toHaveLength(2);
    expect(state.purchaseOrders).toHaveLength(3);

    for (const po of state.purchaseOrders) {
      state = dispatch(state, { type: "PO_ACK", payload: { poNo: po.poNo, confirmDay: po.dueDay } });
    }
    const rmPo = state.purchaseOrders.find((p) => p.itemId === ITEM_IDS.RM_BOARD)!;
    while (state.day < rmPo.dueDay) state = dispatch(state, { type: "ADVANCE_DAY" }); // 入荷予定日まで進める
    state = dispatch(state, { type: "PO_RECEIVE", payload: { poNo: rmPo.poNo } });
    expect(state.stocks.find((s) => s.itemId === ITEM_IDS.RM_BOARD)?.onHand).toBe(10);

    // データ増分ログにEXT-8形式のテーブル差分が記録されている
    const firmLog = state.eventLog.find((e) => e.message.includes("計画オーダ 5 件を確定した"));
    expect(firmLog?.tableDeltas).toEqual(
      expect.arrayContaining(["PLANNED_ORDER -5", "MFG_ORDER +2", "PURCHASE_ORDER +3", "WORK_INSTRUCTION +3"]),
    );
  });

  it("ガード違反はエラーログに記録され、stateはクラッシュせずに返る", () => {
    const state = createInitialState();
    const next = dispatch(state, { type: "SO_CONFIRM_DELIVERY", payload: { soNo: "SO-999", confirmDay: 10 } });
    expect(next.eventLog[0].message).toMatch(/^\[エラー\]/);
  });

  it("RESETはマスタの編集を保持したままトランザクションのみ初期化する", () => {
    let state = createInitialState();
    state = dispatch(state, {
      type: "MASTER_UPDATE_ITEM_LEAD_TIME",
      payload: { itemId: ITEM_IDS.RM_BOARD, leadTimeDays: 3 },
    });
    state = dispatch(state, {
      type: "SO_CREATE",
      payload: { customerId: "CUST-A", itemId: ITEM_IDS.FG_CHAIR, qty: 10, requestDay: 15 },
    });
    state = dispatch(state, { type: "ADVANCE_DAY" });

    const next = dispatch(state, { type: "RESET" });

    expect(next.day).toBe(0);
    expect(next.soLines).toHaveLength(0);
    expect(next.eventLog).toHaveLength(0);
    expect(next.items.find((i) => i.itemId === ITEM_IDS.RM_BOARD)?.leadTimeDays).toBe(3);
  });

  it("MASTER_UPDATE系はBOM員数・工順標準時間・取引先名称を更新できる", () => {
    let state = createInitialState();
    state = dispatch(state, {
      type: "MASTER_UPDATE_BOM_QTY_PER",
      payload: { parentItemId: ITEM_IDS.FG_CHAIR, childItemId: ITEM_IDS.PT_LEG, qtyPer: 5 },
    });
    expect(
      state.bom.find((b) => b.parentItemId === ITEM_IDS.FG_CHAIR && b.childItemId === ITEM_IDS.PT_LEG)?.qtyPer,
    ).toBe(5);

    state = dispatch(state, {
      type: "MASTER_UPDATE_ROUTING_STD_TIME",
      payload: { itemId: ITEM_IDS.FG_CHAIR, stepNo: 10, stdTimeMin: 40 },
    });
    expect(
      state.routingSteps.find((s) => s.itemId === ITEM_IDS.FG_CHAIR && s.stepNo === 10)?.stdTimeMin,
    ).toBe(40);

    state = dispatch(state, {
      type: "MASTER_UPDATE_PARTNER_NAME",
      payload: { partnerType: "CUSTOMER", partnerId: "CUST-A", name: "新得意先A" },
    });
    expect(state.customers.find((c) => c.customerId === "CUST-A")?.name).toBe("新得意先A");
  });
});
