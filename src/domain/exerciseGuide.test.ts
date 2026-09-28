import { describe, expect, it } from "vitest";
import { ITEM_IDS } from "../data/masterData";
import { computeGuideProgress, computeGuideSummary, currentGuideStep } from "./exerciseGuide";
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

interface SequenceCheckpoint {
  tc: string;
  state: SimulationState;
}

/**
 * v5-spec.md §9.1の正常系シーケンスをreducer経由で一通り流し、各TC完了直後の状態をチェックポイントとして
 * 記録する（TC-01〜18が全完了した最終状態はcheckpoints末尾）。中間状態の検証（元のTC単位テスト）と
 * 完了後の演習完了レポート検証（Issue #53）の両方がこの同じシーケンスを参照できるようにするための、
 * 唯一の実装箇所（重複を避ける）。
 */
function runFullExerciseSequence(): SequenceCheckpoint[] {
  const checkpoints: SequenceCheckpoint[] = [];
  let state = createInitialState();
  const checkpoint = (tc: string) => checkpoints.push({ tc, state });

  state = dispatch(state, {
    type: "SO_CREATE",
    payload: { customerId: "CUST-A", itemId: ITEM_IDS.FG_CHAIR, qty: 10, requestDay: 15 },
  });
  const soNo = state.soLines[0].soNo;
  checkpoint("TC-02");

  state = dispatch(state, { type: "SO_CONFIRM_DELIVERY", payload: { soNo, confirmDay: 15 } });
  checkpoint("TC-03");

  state = dispatch(state, { type: "MRP_RUN" });
  checkpoint("TC-04");

  state = dispatch(state, { type: "PLANNED_ORDERS_FIRM" });
  checkpoint("TC-05");

  state = dispatch(state, { type: "MRP_RUN" }); // 確定分が供給に算入されPLANNED_ORDER 0件になる
  checkpoint("TC-06");

  for (const po of state.purchaseOrders) {
    state = dispatch(state, { type: "PO_ACK", payload: { poNo: po.poNo, confirmDay: po.dueDay } });
  }
  checkpoint("TC-07");

  state = { ...state, day: 12 };
  const rmPo = state.purchaseOrders.find((p) => p.itemId === ITEM_IDS.RM_BOARD)!;
  state = dispatch(state, { type: "PO_RECEIVE", payload: { poNo: rmPo.poNo } });
  checkpoint("TC-08");

  const saOrder = state.mfgOrders.find((mo) => mo.itemId === ITEM_IDS.SA_SEAT)!;
  state = dispatch(state, { type: "MFG_RELEASE", payload: { moNo: saOrder.moNo } });
  state = dispatch(state, { type: "WI_START", payload: { moNo: saOrder.moNo, stepNo: 10 } });
  state = dispatch(state, {
    type: "WI_COMPLETE",
    payload: { moNo: saOrder.moNo, stepNo: 10, goodQty: 10, scrapQty: 0 },
  });
  checkpoint("TC-09");

  state = { ...state, day: 14 };
  const legPo = state.purchaseOrders.find((p) => p.itemId === ITEM_IDS.PT_LEG)!;
  const screwPo = state.purchaseOrders.find((p) => p.itemId === ITEM_IDS.PT_SCREW)!;
  state = dispatch(state, { type: "PO_RECEIVE", payload: { poNo: legPo.poNo } });
  state = dispatch(state, { type: "PO_RECEIVE", payload: { poNo: screwPo.poNo } });
  checkpoint("TC-10");

  const fgOrder = state.mfgOrders.find((mo) => mo.itemId === ITEM_IDS.FG_CHAIR)!;
  state = dispatch(state, { type: "MFG_RELEASE", payload: { moNo: fgOrder.moNo } });
  state = dispatch(state, { type: "WI_START", payload: { moNo: fgOrder.moNo, stepNo: 10 } });
  state = dispatch(state, {
    type: "WI_COMPLETE",
    payload: { moNo: fgOrder.moNo, stepNo: 10, goodQty: 10, scrapQty: 0 },
  });
  checkpoint("TC-11");

  state = dispatch(state, { type: "WI_START", payload: { moNo: fgOrder.moNo, stepNo: 20 } });
  state = dispatch(state, {
    type: "WI_COMPLETE",
    payload: { moNo: fgOrder.moNo, stepNo: 20, goodQty: 9, scrapQty: 1 },
  }); // 不良1個。TC-13（未充足需要の確認）も同時に可能になる
  checkpoint("TC-12");

  state = dispatch(state, { type: "MRP_RUN" }); // 3回目のMRP実行（不足分の計画オーダが生成される）
  checkpoint("TC-14");

  state = { ...state, day: 15 };
  state = dispatch(state, { type: "SHIPMENT_ALLOCATE", payload: { soNo, lineNo: 1 } });
  checkpoint("TC-15");

  const shipNo = state.shipments[0].shipNo;
  state = dispatch(state, { type: "SHIPMENT_SHIP", payload: { shipNo } }); // TC-17・TC-18も同時に可能になる
  checkpoint("TC-16");

  return checkpoints;
}

describe("演習ガイド（v5-spec.md §9.3のTC-01〜TC-18を自動判定する、design.md DEV-4）", () => {
  it("[単体][機能テスト][正常] 初期状態ではTC-01のみ完了している", () => {
    const state = createTestState(0);
    expect(doneTcs(state)).toEqual(["TC-01"]);
    expect(currentGuideStep(state)?.tc).toBe("TC-02");
  });

  it("[総合][機能テスト][正常] v5-spec.md §9.1の正常系シーケンスをreducer経由で一通り流すと全ステップが完了する", () => {
    const checkpoints = runFullExerciseSequence();
    const at = (tc: string) => checkpoints.find((c) => c.tc === tc)!.state;

    expect(doneTcs(at("TC-02"))).toContain("TC-02");
    expect(doneTcs(at("TC-03"))).toContain("TC-03");
    expect(doneTcs(at("TC-04"))).toContain("TC-04");
    expect(doneTcs(at("TC-05"))).toContain("TC-05");
    expect(doneTcs(at("TC-06"))).toContain("TC-06");
    expect(at("TC-06").plannedOrders).toHaveLength(0);
    expect(doneTcs(at("TC-07"))).toContain("TC-07");
    expect(doneTcs(at("TC-08"))).toContain("TC-08");
    expect(doneTcs(at("TC-09"))).toContain("TC-09");
    expect(doneTcs(at("TC-10"))).toContain("TC-10");
    expect(doneTcs(at("TC-11"))).toContain("TC-11");
    expect(doneTcs(at("TC-11"))).not.toContain("TC-12");
    expect(doneTcs(at("TC-12"))).toContain("TC-12");
    expect(doneTcs(at("TC-12"))).toContain("TC-13"); // 未充足需要の確認はTC-12と同時に可能になる
    expect(doneTcs(at("TC-14"))).toContain("TC-14");
    expect(at("TC-14").plannedOrders.length).toBeGreaterThan(0); // 不足分の計画オーダが生成される
    expect(doneTcs(at("TC-15"))).toContain("TC-15");
    expect(doneTcs(at("TC-16"))).toContain("TC-16");
    expect(doneTcs(at("TC-16"))).toContain("TC-17"); // KPI確認・ペギング追跡は出荷実績と同時に確認可能になる
    expect(doneTcs(at("TC-16"))).toContain("TC-18");

    const finalState = checkpoints[checkpoints.length - 1].state;
    expect(currentGuideStep(finalState)).toBeNull();
    expect(doneTcs(finalState)).toHaveLength(18);
  });
});

describe("computeGuideSummary（Issue #53：演習完了レポート）", () => {
  it("[総合][機能テスト][正常] TC-01〜18完了後、所要日数・警告件数（延べ）・KPI最終値が期待どおり算出される", () => {
    const checkpoints = runFullExerciseSequence();
    const state = checkpoints[checkpoints.length - 1].state;
    expect(currentGuideStep(state)).toBeNull();

    const summary = computeGuideSummary(state);

    expect(summary.durationDays).toBe(state.day - state.eventLog[0].day);

    const expectedTotalAlertCount = state.dashboardHistory.reduce((sum, snap) => {
      const c = snap.alertCounts;
      return sum + c.schedule + c.unmetDemand + c.masterIssue + c.capacityOverload;
    }, 0);
    expect(summary.totalAlertCount).toBe(expectedTotalAlertCount);

    const lastSnapshot = state.dashboardHistory[state.dashboardHistory.length - 1];
    expect(summary.kpiHighlights).toEqual(lastSnapshot.kpiHighlights);
  });
});
