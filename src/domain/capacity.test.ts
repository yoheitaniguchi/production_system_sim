// 能力計画（CRP）の山積み計算（design.md §9、EXT-30〜32）
import { describe, expect, it } from "vitest";
import { ITEM_IDS, WORK_CENTERS } from "../data/masterData";
import { capacityOverloads, computeCapacityLoad } from "./capacity";
import { firmAllPlannedOrders, runMRP } from "./mrp";
import { ackPurchaseOrder, receivePurchaseOrder } from "./procurement";
import { completeStep, releaseMfgOrder, startStep } from "./production";
import { cancelSalesOrder, confirmDelivery, createSalesOrder } from "./salesOrder";
import { createTestState } from "./testUtils";

// design.md §9.5の計算例：TC-04〜05をそのまま実行するだけで、追加のシナリオ設計なしに
// WC-ASMの山積み超過（D+13、300分 > 240分）が再現できることを検証する。
function firmChairOrder() {
  const state = createTestState(0);
  const soNo = createSalesOrder(state, { customerId: "CUST-A", itemId: ITEM_IDS.FG_CHAIR, qty: 10, requestDay: 15 }, 0);
  confirmDelivery(state, soNo, 15);
  runMRP(state);
  firmAllPlannedOrders(state, 0);
  return { state, soNo };
}

describe("computeCapacityLoad（design.md §9.5の計算例）", () => {
  it("TC-04〜05の確定結果だけで、WC-CUT/WC-INSは能力内・WC-ASMのみ山積み超過になる", () => {
    const { state } = firmChairOrder();

    const load = computeCapacityLoad(state);
    const byKey = Object.fromEntries(load.map((e) => [`${e.workCenter}@${e.day}`, e]));

    // SA-200(x10) 工程10 @ WC-CUT・18分/個 → 180分、D+12（MO自身のstartDay）
    expect(byKey[`${WORK_CENTERS.CUT}@12`]).toMatchObject({ plannedMin: 180, actualMin: 0, capacityMin: 240 });
    // FG-100(x10) 工程10 @ WC-ASM・30分/個 → 300分、D+13。能力240分を60分超過する
    expect(byKey[`${WORK_CENTERS.ASM}@13`]).toMatchObject({ plannedMin: 300, actualMin: 0, capacityMin: 240 });
    // FG-100(x10) 工程20 @ WC-INS・12分/個 → 120分、D+13
    expect(byKey[`${WORK_CENTERS.INS}@13`]).toMatchObject({ plannedMin: 120, actualMin: 0, capacityMin: 240 });

    const overloads = capacityOverloads(state);
    expect(overloads).toHaveLength(1);
    expect(overloads[0]).toMatchObject({ workCenter: WORK_CENTERS.ASM, day: 13, plannedMin: 300, capacityMin: 240 });
  });

  it("design.md C2-1の回帰：未着手の後工程（inputQtyがまだ0）でも計画負荷はmo.planQty基準で計上される", () => {
    const { state } = firmChairOrder();
    const fgOrder = state.mfgOrders.find((mo) => mo.itemId === ITEM_IDS.FG_CHAIR)!;
    const step20 = state.workInstructions.find((wi) => wi.moNo === fgOrder.moNo && wi.stepNo === 20)!;
    // 工程10がまだ完了していないため、投入数はこの時点で0のまま
    expect(step20.inputQty).toBe(0);

    const load = computeCapacityLoad(state);
    const insEntry = load.find((e) => e.workCenter === WORK_CENTERS.INS);
    // inputQty(0)ではなくplanQty(10)基準で計上されるため、0にはならない
    expect(insEntry?.plannedMin).toBe(120);
  });

  it("着手した工程は計画負荷ではなく実績負荷（実着手日）へ移り、二重計上されない", () => {
    const { state } = firmChairOrder();
    const saOrder = state.mfgOrders.find((mo) => mo.itemId === ITEM_IDS.SA_SEAT)!;

    releaseMfgOrder(state, saOrder.moNo);
    startStep(state, saOrder.moNo, 10, 12);

    const load = computeCapacityLoad(state);
    const cutEntry = load.find((e) => e.workCenter === WORK_CENTERS.CUT && e.day === 12)!;
    expect(cutEntry).toMatchObject({ plannedMin: 0, actualMin: 180 });
  });

  it("完了（DONE）後も実績負荷は実着手日に残り続ける", () => {
    const { state } = firmChairOrder();
    const rmPo = state.purchaseOrders.find((po) => po.itemId === ITEM_IDS.RM_BOARD)!;
    ackPurchaseOrder(state, rmPo.poNo, rmPo.dueDay);
    receivePurchaseOrder(state, rmPo.poNo, rmPo.dueDay);

    const saOrder = state.mfgOrders.find((mo) => mo.itemId === ITEM_IDS.SA_SEAT)!;
    releaseMfgOrder(state, saOrder.moNo);
    startStep(state, saOrder.moNo, 10, 12);
    completeStep(state, saOrder.moNo, 10, 10, 0, 13);

    const load = computeCapacityLoad(state);
    const cutEntry = load.find((e) => e.workCenter === WORK_CENTERS.CUT && e.day === 12)!;
    expect(cutEntry).toMatchObject({ plannedMin: 0, actualMin: 180 });
  });

  it("取消（CANCELED）された製造オーダは計画負荷に算入されない", () => {
    const { state, soNo } = firmChairOrder();
    cancelSalesOrder(state, soNo);

    expect(state.mfgOrders.every((mo) => mo.status === "CANCELED")).toBe(true);
    expect(computeCapacityLoad(state)).toHaveLength(0);
  });
});
