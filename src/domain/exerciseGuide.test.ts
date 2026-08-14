import { describe, expect, it } from "vitest";
import { ITEM_IDS } from "../data/masterData";
import { computeGuideProgress, currentGuideStep } from "./exerciseGuide";
import { createInitialState, simulationReducer, type SimulationAction } from "./reducer";
import { createTestState } from "./testUtils";
import type { SimulationState } from "../types";

function dispatch(state: SimulationState, action: SimulationAction): SimulationState {
  return simulationReducer(state, action);
}

function doneTcs(state: SimulationState): string[] {
  return computeGuideProgress(state)
    .filter((s) => s.done)
    .map((s) => s.tc);
}

describe("演習ガイド（v5-spec.md §9.3のTC-01〜TC-18を自動判定する、design.md DEV-4）", () => {
  it("初期状態ではTC-01のみ完了している", () => {
    const state = createTestState(0);
    expect(doneTcs(state)).toEqual(["TC-01"]);
    expect(currentGuideStep(state)?.tc).toBe("TC-02");
  });

  it("v5-spec.md §9.1の正常系シーケンスをreducer経由で一通り流すと全ステップが完了する", () => {
    let state = createInitialState();

    state = dispatch(state, {
      type: "SO_CREATE",
      payload: { customerId: "CUST-A", itemId: ITEM_IDS.FG_CHAIR, qty: 10, requestDay: 15 },
    });
    const soNo = state.soLines[0].soNo;
    expect(doneTcs(state)).toContain("TC-02");

    state = dispatch(state, { type: "SO_CONFIRM_DELIVERY", payload: { soNo, confirmDay: 15 } });
    expect(doneTcs(state)).toContain("TC-03");

    state = dispatch(state, { type: "MRP_RUN" }); // TC-04
    expect(doneTcs(state)).toContain("TC-04");

    state = dispatch(state, { type: "PLANNED_ORDERS_FIRM" }); // TC-05
    expect(doneTcs(state)).toContain("TC-05");

    state = dispatch(state, { type: "MRP_RUN" }); // TC-06：確定分が供給に算入されPLANNED_ORDER 0件になる
    expect(doneTcs(state)).toContain("TC-06");
    expect(state.plannedOrders).toHaveLength(0);

    for (const po of state.purchaseOrders) {
      state = dispatch(state, { type: "PO_ACK", payload: { poNo: po.poNo, confirmDay: po.dueDay } }); // TC-07
    }
    expect(doneTcs(state)).toContain("TC-07");

    state = { ...state, day: 12 };
    const rmPo = state.purchaseOrders.find((p) => p.itemId === ITEM_IDS.RM_BOARD)!;
    state = dispatch(state, { type: "PO_RECEIVE", payload: { poNo: rmPo.poNo } }); // TC-08
    expect(doneTcs(state)).toContain("TC-08");

    const saOrder = state.mfgOrders.find((mo) => mo.itemId === ITEM_IDS.SA_SEAT)!;
    state = dispatch(state, { type: "MFG_RELEASE", payload: { moNo: saOrder.moNo } });
    state = dispatch(state, { type: "WI_START", payload: { moNo: saOrder.moNo, stepNo: 10 } });
    state = dispatch(state, {
      type: "WI_COMPLETE",
      payload: { moNo: saOrder.moNo, stepNo: 10, goodQty: 10, scrapQty: 0 },
    }); // TC-09
    expect(doneTcs(state)).toContain("TC-09");

    state = { ...state, day: 14 };
    const legPo = state.purchaseOrders.find((p) => p.itemId === ITEM_IDS.PT_LEG)!;
    const screwPo = state.purchaseOrders.find((p) => p.itemId === ITEM_IDS.PT_SCREW)!;
    state = dispatch(state, { type: "PO_RECEIVE", payload: { poNo: legPo.poNo } });
    state = dispatch(state, { type: "PO_RECEIVE", payload: { poNo: screwPo.poNo } }); // TC-10
    expect(doneTcs(state)).toContain("TC-10");

    const fgOrder = state.mfgOrders.find((mo) => mo.itemId === ITEM_IDS.FG_CHAIR)!;
    state = dispatch(state, { type: "MFG_RELEASE", payload: { moNo: fgOrder.moNo } });
    state = dispatch(state, { type: "WI_START", payload: { moNo: fgOrder.moNo, stepNo: 10 } });
    state = dispatch(state, {
      type: "WI_COMPLETE",
      payload: { moNo: fgOrder.moNo, stepNo: 10, goodQty: 10, scrapQty: 0 },
    }); // TC-11
    expect(doneTcs(state)).toContain("TC-11");
    expect(doneTcs(state)).not.toContain("TC-12");

    state = dispatch(state, { type: "WI_START", payload: { moNo: fgOrder.moNo, stepNo: 20 } });
    state = dispatch(state, {
      type: "WI_COMPLETE",
      payload: { moNo: fgOrder.moNo, stepNo: 20, goodQty: 9, scrapQty: 1 },
    }); // TC-12（不良1個）
    expect(doneTcs(state)).toContain("TC-12");
    expect(doneTcs(state)).toContain("TC-13"); // 未充足需要の確認はTC-12と同時に可能になる

    state = dispatch(state, { type: "MRP_RUN" }); // TC-14：3回目のMRP実行
    expect(doneTcs(state)).toContain("TC-14");
    expect(state.plannedOrders.length).toBeGreaterThan(0); // 不足分の計画オーダが生成される

    state = { ...state, day: 15 };
    state = dispatch(state, { type: "SHIPMENT_ALLOCATE", payload: { soNo, lineNo: 1 } }); // TC-15
    expect(doneTcs(state)).toContain("TC-15");

    const shipNo = state.shipments[0].shipNo;
    state = dispatch(state, { type: "SHIPMENT_SHIP", payload: { shipNo } }); // TC-16
    expect(doneTcs(state)).toContain("TC-16");
    expect(doneTcs(state)).toContain("TC-17"); // KPI確認・ペギング追跡は出荷実績と同時に確認可能になる
    expect(doneTcs(state)).toContain("TC-18");

    expect(currentGuideStep(state)).toBeNull();
    expect(doneTcs(state)).toHaveLength(18);
  });
});
