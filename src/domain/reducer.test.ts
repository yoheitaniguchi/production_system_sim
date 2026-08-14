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

    // 座面ASSY：リリース→着手→完了（バックフラッシュ）までreducer経由で進める
    const saOrder = state.mfgOrders.find((mo) => mo.itemId === ITEM_IDS.SA_SEAT)!;
    state = dispatch(state, { type: "MFG_RELEASE", payload: { moNo: saOrder.moNo } });
    expect(state.mfgOrders.find((mo) => mo.moNo === saOrder.moNo)?.status).toBe("RELEASED");
    state = dispatch(state, { type: "WI_START", payload: { moNo: saOrder.moNo, stepNo: 10 } });
    expect(state.workInstructions.find((wi) => wi.moNo === saOrder.moNo)?.status).toBe("WIP");
    state = dispatch(state, { type: "WI_COMPLETE", payload: { moNo: saOrder.moNo, stepNo: 10, goodQty: 10, scrapQty: 0 } });
    expect(state.mfgOrders.find((mo) => mo.moNo === saOrder.moNo)).toMatchObject({ status: "DONE", goodQty: 10 });
    expect(state.stocks.find((s) => s.itemId === ITEM_IDS.RM_BOARD)?.onHand).toBe(0);

    // 脚・ネジも入荷予定日まで進めてから入荷計上し、木製イス本体を組立・検査まで進める（良品9・不良1）
    const ptLegPo = state.purchaseOrders.find((p) => p.itemId === ITEM_IDS.PT_LEG)!;
    while (state.day < ptLegPo.dueDay) state = dispatch(state, { type: "ADVANCE_DAY" });
    for (const item of [ITEM_IDS.PT_LEG, ITEM_IDS.PT_SCREW]) {
      const po = state.purchaseOrders.find((p) => p.itemId === item)!;
      state = dispatch(state, { type: "PO_RECEIVE", payload: { poNo: po.poNo } });
    }
    const fgOrder = state.mfgOrders.find((mo) => mo.itemId === ITEM_IDS.FG_CHAIR)!;
    state = dispatch(state, { type: "MFG_RELEASE", payload: { moNo: fgOrder.moNo } });
    state = dispatch(state, { type: "WI_START", payload: { moNo: fgOrder.moNo, stepNo: 10 } });
    state = dispatch(state, { type: "WI_COMPLETE", payload: { moNo: fgOrder.moNo, stepNo: 10, goodQty: 10, scrapQty: 0 } });
    state = dispatch(state, { type: "WI_START", payload: { moNo: fgOrder.moNo, stepNo: 20 } });
    state = dispatch(state, { type: "WI_COMPLETE", payload: { moNo: fgOrder.moNo, stepNo: 20, goodQty: 9, scrapQty: 1 } });
    expect(state.stocks.find((s) => s.itemId === ITEM_IDS.FG_CHAIR)?.onHand).toBe(9);

    // 出荷：引当→引当解除→再引当→出荷実績登録
    state = dispatch(state, { type: "SHIPMENT_ALLOCATE", payload: { soNo, lineNo: 1 } });
    const firstShipment = state.shipments[0];
    expect(firstShipment).toMatchObject({ status: "ALLOCATED", qty: 9 });
    state = dispatch(state, { type: "SHIPMENT_CANCEL", payload: { shipNo: firstShipment.shipNo } });
    expect(state.shipments[0].status).toBe("CANCELED");
    expect(state.stocks.find((s) => s.itemId === ITEM_IDS.FG_CHAIR)?.allocated).toBe(0);

    state = dispatch(state, { type: "SHIPMENT_ALLOCATE", payload: { soNo, lineNo: 1 } });
    const secondShipment = state.shipments[1];
    state = dispatch(state, { type: "SHIPMENT_SHIP", payload: { shipNo: secondShipment.shipNo } });
    expect(state.soLines[0]).toMatchObject({ shippedQty: 9, status: "PARTIAL" });

    // 棚卸調整
    state = dispatch(state, { type: "STOCK_ADJUST", payload: { itemId: ITEM_IDS.PT_SCREW, deltaQty: -2 } });
    const adjTxn = state.stockTxns.find((t) => t.txnType === "ADJ");
    expect(adjTxn).toMatchObject({ itemId: ITEM_IDS.PT_SCREW, qty: -2 });
  });

  it("SO_CANCELは実績の無い受注のペグ先オーダを連鎖的に取消する（design.md EXT-2）", () => {
    let state = createInitialState();
    state = dispatch(state, {
      type: "SO_CREATE",
      payload: { customerId: "CUST-A", itemId: ITEM_IDS.FG_CHAIR, qty: 10, requestDay: 15 },
    });
    const soNo = state.soLines[0].soNo;
    state = dispatch(state, { type: "SO_CONFIRM_DELIVERY", payload: { soNo, confirmDay: 15 } });
    state = dispatch(state, { type: "MRP_RUN" });
    state = dispatch(state, { type: "PLANNED_ORDERS_FIRM" });

    state = dispatch(state, { type: "SO_CANCEL", payload: { soNo } });

    expect(state.soLines[0].status).toBe("CANCELED");
    expect(state.mfgOrders.every((mo) => mo.status === "CANCELED")).toBe(true);
    expect(state.purchaseOrders.every((po) => po.status === "CANCELED")).toBe(true);
  });

  it("ガード違反はエラーログに記録され、stateはクラッシュせずに返る", () => {
    const state = createInitialState();
    const next = dispatch(state, { type: "SO_CONFIRM_DELIVERY", payload: { soNo: "SO-999", confirmDay: 10 } });
    expect(next.eventLog[0].message).toMatch(/^\[エラー\]/);
  });

  it("RESETはマスタの編集を保持したままトランザクションのみ初期化する", () => {
    let state = createInitialState();
    state = dispatch(state, {
      type: "MASTER_UPDATE_ITEM",
      payload: { itemId: ITEM_IDS.RM_BOARD, patch: { leadTimeDays: 3 } },
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
      type: "MASTER_UPDATE_BOM_LINE",
      payload: { parentItemId: ITEM_IDS.FG_CHAIR, childItemId: ITEM_IDS.PT_LEG, patch: { qtyPer: 5 } },
    });
    expect(
      state.bom.find((b) => b.parentItemId === ITEM_IDS.FG_CHAIR && b.childItemId === ITEM_IDS.PT_LEG)?.qtyPer,
    ).toBe(5);

    state = dispatch(state, {
      type: "MASTER_UPDATE_ROUTING_STEP",
      payload: { itemId: ITEM_IDS.FG_CHAIR, stepNo: 10, patch: { stdTimeMin: 40 } },
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
