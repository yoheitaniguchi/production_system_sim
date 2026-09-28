// 能力計画（CRP）の山積み計算（design.md §9、EXT-30〜32・EXT-35・EXT-37）
import { describe, expect, it } from "vitest";
import { ITEM_IDS, WORK_CENTERS } from "../data/masterData";
import {
  CHRONIC_BOTTLENECK_THRESHOLD_DAYS,
  buildCapacityChartModel,
  capacityOverloads,
  computeCapacityLoad,
  computeChronicBottlenecks,
  computePlannedOrderLoad,
} from "./capacity";
import { firmAllPlannedOrders, runMRP } from "./mrp";
import { ackPurchaseOrder, receivePurchaseOrder } from "./procurement";
import { completeStep, releaseMfgOrder, splitMfgOrder, startStep } from "./production";
import { cancelSalesOrder, confirmDelivery, createSalesOrder } from "./salesOrder";
import { createTestState } from "./testUtils";
import type { PlannedOrder } from "../types";

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

  // design.md EXT-33：WC-ASMのD+13山積み超過（FG-100 x10、300分 > 240分）を、製造オーダの分割
  // （数量を分けて別の着手日へ振り分ける人による操作）で解消できることを検証する
  it("山積み超過のオーダを分割して別日へ振り分けると、超過が解消される", () => {
    const { state } = firmChairOrder();
    const fgOrder = state.mfgOrders.find((mo) => mo.itemId === ITEM_IDS.FG_CHAIR)!;
    expect(capacityOverloads(state)).toHaveLength(1); // 分割前：WC-ASM D+13が超過

    // x10（300分/D+13）を x6（180分/D+13）＋ x4（120分/D+14）に分割する。
    // D+13：180分 ≤ 240分、D+14：120分 ≤ 240分となり、いずれも能力内に収まる
    splitMfgOrder(state, fgOrder.moNo, 4, 14, 15);

    expect(capacityOverloads(state)).toHaveLength(0);
    const load = computeCapacityLoad(state);
    const byKey = Object.fromEntries(load.map((e) => [`${e.workCenter}@${e.day}`, e]));
    expect(byKey[`${WORK_CENTERS.ASM}@13`]).toMatchObject({ plannedMin: 180, capacityMin: 240 });
    expect(byKey[`${WORK_CENTERS.ASM}@14`]).toMatchObject({ plannedMin: 120, capacityMin: 240 });
  });
});

// Issue #57：確定前（PLANNED_ORDER段階）の山積みプレビュー（design.md EXT-35）
function plannedChairOrder() {
  const state = createTestState(0);
  const soNo = createSalesOrder(state, { customerId: "CUST-A", itemId: ITEM_IDS.FG_CHAIR, qty: 10, requestDay: 15 }, 0);
  confirmDelivery(state, soNo, 15);
  runMRP(state);
  return { state, soNo };
}

describe("computePlannedOrderLoad（Issue #57：計画オーダ段階での山積みプレビュー）", () => {
  it("[単体][機能テスト][正常] 確定前の計画オーダだけでも、design.md §9.5と同じWC-ASM超過が見込み負荷として検知される", () => {
    const { state } = plannedChairOrder();
    expect(state.workInstructions).toHaveLength(0); // 未確定であることの前提確認

    const load = computePlannedOrderLoad(state);
    const byKey = Object.fromEntries(load.map((e) => [`${e.workCenter}@${e.day}`, e]));

    expect(byKey[`${WORK_CENTERS.CUT}@12`]).toMatchObject({ previewMin: 180, capacityMin: 240 });
    expect(byKey[`${WORK_CENTERS.ASM}@13`]).toMatchObject({ previewMin: 300, capacityMin: 240 });
    expect(byKey[`${WORK_CENTERS.INS}@13`]).toMatchObject({ previewMin: 120, capacityMin: 240 });
  });

  it("[単体][機能テスト][境界] orderType===BUYの計画オーダは工程を持たないため見込み負荷に計上されない", () => {
    const { state } = plannedChairOrder();
    // マスタ上BUY品目は工順を持たないため、あえてMAKE品目(FG-100)のitemIdをBUYとして持つ
    // 架空の計画オーダを追加し、orderTypeの分岐そのものが効いていることを直接確認する
    const fakeBuyOrder: PlannedOrder = {
      ploNo: "PLO-TEST-BUY",
      itemId: ITEM_IDS.FG_CHAIR,
      qty: 5,
      dueDay: 25,
      startDay: 20,
      orderType: "BUY",
      pegTo: "PLO-TEST-BUY",
      bomLevel: 0,
    };
    state.plannedOrders.push(fakeBuyOrder);

    const load = computePlannedOrderLoad(state);
    expect(load.some((e) => e.day === 20)).toBe(false); // BUY扱いのD+20分は計上されない
  });

  it("[結合][機能テスト][境界] 確定済みオーダと未確定の計画オーダが混在しても二重計上されない", () => {
    const { state } = firmChairOrder(); // 1件目：確定済み（WORK_INSTRUCTION化）
    const soNo2 = createSalesOrder(
      state,
      { customerId: "CUST-B", itemId: ITEM_IDS.FG_CHAIR, qty: 10, requestDay: 25 },
      0,
    );
    confirmDelivery(state, soNo2, 25);
    runMRP(state); // 2件目由来の需要だけ新規PLANNED_ORDERとして展開される

    expect(state.workInstructions.length).toBeGreaterThan(0); // 1件目由来の確定済み作業指示が残っている
    expect(state.plannedOrders.length).toBeGreaterThan(0); // 2件目由来の未確定の計画オーダがある

    const confirmedLoad = computeCapacityLoad(state);
    const previewLoad = computePlannedOrderLoad(state);

    const confirmedKeys = new Set(confirmedLoad.map((e) => `${e.workCenter}@${e.day}`));
    const previewKeys = new Set(previewLoad.map((e) => `${e.workCenter}@${e.day}`));
    // ある需要はstate.plannedOrders（未確定）とstate.mfgOrders/workInstructions（確定済み）の
    // どちらか一方にしか存在し得ない（runMRP()は毎回plannedOrdersを全消去して再構築し、
    // firmAllPlannedOrders()は全件を転記した後plannedOrdersを空にするため）。
    // よって両者は構造的に排他であり、同一の作業区×日が両方に現れることはない
    expect([...confirmedKeys].some((k) => previewKeys.has(k))).toBe(false);

    // 1件目分（確定済み）・2件目分（見込み）がそれぞれ独立に計上され、合算されていないことを確認する
    const asmConfirmed = confirmedLoad.find((e) => e.workCenter === WORK_CENTERS.ASM);
    const asmPreview = previewLoad.find((e) => e.workCenter === WORK_CENTERS.ASM);
    expect(asmConfirmed?.plannedMin).toBe(300);
    expect(asmPreview?.previewMin).toBe(300);
  });
});

// Issue #66：段取り時間（design.md EXT-41）。RoutingStep.setupMinを、作業指示1件（＝製造オーダ1件の当該工程）
// につき数量に関係なく1回だけ山積みへ加算する。CHAIR_PRESETは段取り未設定（0扱い）のため、
// 上のdescribe群（design.md §9.5の期待値）は無変更で通る
function setSetup(state: ReturnType<typeof createTestState>, itemId: string, stepNo: number, setupMin: number) {
  const step = state.routingSteps.find((s) => s.itemId === itemId && s.stepNo === stepNo)!;
  step.setupMin = setupMin;
}

describe("段取り時間の山積みへの反映（Issue #66）", () => {
  it("[単体][機能テスト][正常] 計画負荷は「数量×標準時間＋段取り時間」で、段取りは1オーダ1工程につき1回だけ加算される", () => {
    const { state } = firmChairOrder();
    setSetup(state, ITEM_IDS.SA_SEAT, 10, 15); // WC-CUT
    setSetup(state, ITEM_IDS.FG_CHAIR, 10, 20); // WC-ASM
    // FG-100の工程20（WC-INS）は段取り未設定のまま

    const byKey = Object.fromEntries(computeCapacityLoad(state).map((e) => [`${e.workCenter}@${e.day}`, e]));
    expect(byKey[`${WORK_CENTERS.CUT}@12`].plannedMin).toBe(10 * 18 + 15); // 195
    expect(byKey[`${WORK_CENTERS.ASM}@13`].plannedMin).toBe(10 * 30 + 20); // 320
    expect(byKey[`${WORK_CENTERS.INS}@13`].plannedMin).toBe(10 * 12); // 120（段取り0＝従来どおり）
  });

  it("[単体][機能テスト][境界] 段取り時間は数量に比例しない：数量が2倍でも段取り分は増えない", () => {
    const small = createTestState(0);
    const large = createTestState(0);
    for (const [state, qty] of [[small, 5], [large, 10]] as const) {
      const soNo = createSalesOrder(state, { customerId: "CUST-A", itemId: ITEM_IDS.FG_CHAIR, qty, requestDay: 15 }, 0);
      confirmDelivery(state, soNo, 15);
      runMRP(state);
      firmAllPlannedOrders(state, 0);
      setSetup(state, ITEM_IDS.FG_CHAIR, 10, 20);
    }
    const asm = (state: typeof small) =>
      computeCapacityLoad(state).find((e) => e.workCenter === WORK_CENTERS.ASM && e.day === 13)!.plannedMin;

    expect(asm(small)).toBe(5 * 30 + 20); // 170
    expect(asm(large)).toBe(10 * 30 + 20); // 320。差は数量差ぶん（150）だけで、段取り（20）は両方に1回ずつ
    expect(asm(large) - asm(small)).toBe(5 * 30);
  });

  it("[結合][機能テスト][境界] 製造オーダを分割すると、オーダごとに1回ずつ段取りが加算される（分割の代償）", () => {
    const { state } = firmChairOrder();
    setSetup(state, ITEM_IDS.FG_CHAIR, 10, 20);
    const fgOrder = state.mfgOrders.find((mo) => mo.itemId === ITEM_IDS.FG_CHAIR)!;

    splitMfgOrder(state, fgOrder.moNo, 4, 14, 15);

    const byKey = Object.fromEntries(computeCapacityLoad(state).map((e) => [`${e.workCenter}@${e.day}`, e]));
    expect(byKey[`${WORK_CENTERS.ASM}@13`].plannedMin).toBe(6 * 30 + 20); // 200
    expect(byKey[`${WORK_CENTERS.ASM}@14`].plannedMin).toBe(4 * 30 + 20); // 140
  });

  it("[結合][機能テスト][正常] 着手済みの工程は実績負荷へ段取り時間込みで移り、計画負荷には二重に乗らない", () => {
    const { state } = firmChairOrder();
    setSetup(state, ITEM_IDS.SA_SEAT, 10, 15);
    const saOrder = state.mfgOrders.find((mo) => mo.itemId === ITEM_IDS.SA_SEAT)!;

    releaseMfgOrder(state, saOrder.moNo);
    startStep(state, saOrder.moNo, 10, 12);

    const cutEntry = computeCapacityLoad(state).find((e) => e.workCenter === WORK_CENTERS.CUT && e.day === 12)!;
    expect(cutEntry).toMatchObject({ plannedMin: 0, actualMin: 10 * 18 + 15 });
  });

  it("[結合][機能テスト][正常] 完了（DONE）後も、段取り込みの実績負荷が実着手日に残り続ける", () => {
    const { state } = firmChairOrder();
    setSetup(state, ITEM_IDS.SA_SEAT, 10, 15);
    const rmPo = state.purchaseOrders.find((po) => po.itemId === ITEM_IDS.RM_BOARD)!;
    ackPurchaseOrder(state, rmPo.poNo, rmPo.dueDay);
    receivePurchaseOrder(state, rmPo.poNo, rmPo.dueDay);
    const saOrder = state.mfgOrders.find((mo) => mo.itemId === ITEM_IDS.SA_SEAT)!;
    releaseMfgOrder(state, saOrder.moNo);
    startStep(state, saOrder.moNo, 10, 12);
    completeStep(state, saOrder.moNo, 10, 10, 0, 13);

    const cutEntry = computeCapacityLoad(state).find((e) => e.workCenter === WORK_CENTERS.CUT && e.day === 12)!;
    expect(cutEntry).toMatchObject({ plannedMin: 0, actualMin: 195 });
  });

  it("[結合][機能テスト][境界] 取消（CANCELED）されたオーダは、段取り時間があっても計画負荷に算入されない", () => {
    const { state, soNo } = firmChairOrder();
    setSetup(state, ITEM_IDS.FG_CHAIR, 10, 20);
    cancelSalesOrder(state, soNo);

    expect(computeCapacityLoad(state)).toHaveLength(0);
  });

  it("[単体][機能テスト][境界] 段取り時間の加算で能力ちょうど（超過しない）と1分超過の境目が変わる", () => {
    const { state } = firmChairOrder();
    // WC-INS：10個×12分=120分。段取り120分でちょうど能力（240分）→超過しない、121分で1分超過
    setSetup(state, ITEM_IDS.FG_CHAIR, 20, 120);
    expect(capacityOverloads(state).some((e) => e.workCenter === WORK_CENTERS.INS)).toBe(false);

    setSetup(state, ITEM_IDS.FG_CHAIR, 20, 121);
    const ins = capacityOverloads(state).find((e) => e.workCenter === WORK_CENTERS.INS)!;
    expect(ins).toMatchObject({ day: 13, plannedMin: 241, capacityMin: 240 });
  });

  it("[単体][機能テスト][境界] 段取り時間が明示的に0でも未設定と同じ結果になる（省略時は0扱い）", () => {
    const { state: withoutSetup } = firmChairOrder();
    const { state: zeroSetup } = firmChairOrder();
    for (const step of zeroSetup.routingSteps) step.setupMin = 0;

    expect(computeCapacityLoad(zeroSetup)).toEqual(computeCapacityLoad(withoutSetup));
  });

  it("[単体][機能テスト][正常] 計画オーダの見込み負荷（確定前プレビュー）にも、1計画オーダにつき1回だけ段取りが加算される", () => {
    const { state } = plannedChairOrder();
    setSetup(state, ITEM_IDS.SA_SEAT, 10, 15);
    setSetup(state, ITEM_IDS.FG_CHAIR, 10, 20);

    const byKey = Object.fromEntries(computePlannedOrderLoad(state).map((e) => [`${e.workCenter}@${e.day}`, e]));
    expect(byKey[`${WORK_CENTERS.CUT}@12`].previewMin).toBe(195);
    expect(byKey[`${WORK_CENTERS.ASM}@13`].previewMin).toBe(320);
    expect(byKey[`${WORK_CENTERS.INS}@13`].previewMin).toBe(120);
  });

  it("[結合][機能テスト][正常] 確定前プレビューの見込み負荷は、確定後の計画負荷と段取り込みで一致する", () => {
    const preview = plannedChairOrder().state;
    const confirmed = firmChairOrder().state;
    for (const state of [preview, confirmed]) {
      setSetup(state, ITEM_IDS.SA_SEAT, 10, 15);
      setSetup(state, ITEM_IDS.FG_CHAIR, 10, 20);
      setSetup(state, ITEM_IDS.FG_CHAIR, 20, 5);
    }

    const previewByKey = Object.fromEntries(computePlannedOrderLoad(preview).map((e) => [`${e.workCenter}@${e.day}`, e.previewMin]));
    const confirmedByKey = Object.fromEntries(computeCapacityLoad(confirmed).map((e) => [`${e.workCenter}@${e.day}`, e.plannedMin]));
    expect(previewByKey).toEqual(confirmedByKey);
    // 比較だけだと両関数が同じ誤りをしても通るため、絶対値も固定する
    expect(previewByKey).toEqual({ "WC-CUT@12": 195, "WC-ASM@13": 320, "WC-INS@13": 125 });
  });

  it("[単体][機能テスト][境界] 同じ作業区・同じ日に計画オーダが2件重なると、段取りはオーダごとに2回加算される", () => {
    const { state } = plannedChairOrder();
    const soNo2 = createSalesOrder(
      state,
      { customerId: "CUST-B", itemId: ITEM_IDS.FG_CHAIR, qty: 10, requestDay: 15 },
      0,
    );
    confirmDelivery(state, soNo2, 15);
    runMRP(state);
    setSetup(state, ITEM_IDS.FG_CHAIR, 10, 20);

    const asm = computePlannedOrderLoad(state).find((e) => e.workCenter === WORK_CENTERS.ASM && e.day === 13)!;
    const fgPlos = state.plannedOrders.filter((p) => p.itemId === ITEM_IDS.FG_CHAIR && p.orderType === "MAKE");
    expect(fgPlos).toHaveLength(2); // 前提：受注ごとに別々の計画オーダになる
    expect(asm.previewMin).toBe(2 * (10 * 30 + 20)); // 640。段取り20分が2回
  });

  it("[結合][機能テスト][境界] 同じ日への分割でも、分割後のオーダごとに1回ずつ段取りが加算される", () => {
    const { state } = firmChairOrder();
    setSetup(state, ITEM_IDS.FG_CHAIR, 10, 20);
    const fgOrder = state.mfgOrders.find((mo) => mo.itemId === ITEM_IDS.FG_CHAIR)!;

    splitMfgOrder(state, fgOrder.moNo, 4, 13, 15); // 分割後の新オーダも同じ着手日（D+13）

    const asm = computeCapacityLoad(state).find((e) => e.workCenter === WORK_CENTERS.ASM && e.day === 13)!;
    expect(asm.plannedMin).toBe(6 * 30 + 20 + (4 * 30 + 20)); // 340＝標準時間300＋段取り20×2回
  });

  it("[単体][機能テスト][境界] 同一オーダで工程10が着手済み・工程20が未着手なら、実績と計画へ段取りが1回ずつ別々に計上される", () => {
    const { state } = firmChairOrder();
    setSetup(state, ITEM_IDS.FG_CHAIR, 10, 20); // WC-ASM
    setSetup(state, ITEM_IDS.FG_CHAIR, 20, 5); // WC-INS
    const fgOrder = state.mfgOrders.find((mo) => mo.itemId === ITEM_IDS.FG_CHAIR)!;
    // 部品を揃える手間を省くため、着手した状態を直接作る（capacity.tsは状態から導出するだけの関数）
    const wi10 = state.workInstructions.find((w) => w.moNo === fgOrder.moNo && w.stepNo === 10)!;
    wi10.actualStartDay = 13;
    wi10.inputQty = 10;

    const byKey = Object.fromEntries(computeCapacityLoad(state).map((e) => [`${e.workCenter}@${e.day}`, e]));
    expect(byKey[`${WORK_CENTERS.ASM}@13`]).toMatchObject({ plannedMin: 0, actualMin: 10 * 30 + 20 });
    expect(byKey[`${WORK_CENTERS.INS}@13`]).toMatchObject({ plannedMin: 10 * 12 + 5, actualMin: 0 });
  });

  it("[単体][機能テスト][境界] 投入数0でも着手済みの作業指示には段取りが実績負荷として計上される（全数不良後の後工程）", () => {
    const { state } = firmChairOrder();
    setSetup(state, ITEM_IDS.FG_CHAIR, 20, 5); // WC-INS
    const fgOrder = state.mfgOrders.find((mo) => mo.itemId === ITEM_IDS.FG_CHAIR)!;
    // 工程10を全数不良で完了→工程20のinputQtyが0のまま人が着手した、という状態を直接作る
    const wi20 = state.workInstructions.find((w) => w.moNo === fgOrder.moNo && w.stepNo === 20)!;
    wi20.actualStartDay = 14;
    wi20.inputQty = 0;

    const ins = computeCapacityLoad(state).find((e) => e.workCenter === WORK_CENTERS.INS && e.day === 14)!;
    expect(ins).toMatchObject({ plannedMin: 0, actualMin: 5 }); // 0個×12分＋段取り5分
  });
});

// Issue #67：山積みバーグラフ用の表示データ（design.md EXT-42）
describe("buildCapacityChartModel（Issue #67：山積みバーグラフ用の表示データ）", () => {
  it("[単体][機能テスト][正常] design.md §9.5の確定結果から、作業区ごとの帯・共通の日軸・超過分が組み立てられる", () => {
    const { state } = firmChairOrder();

    const model = buildCapacityChartModel(computeCapacityLoad(state));

    expect(model.days).toEqual([12, 13]);
    expect(model.maxMin).toBe(300); // 能力240・最大負荷300のうち大きい方
    expect(model.rows.map((r) => r.workCenter)).toEqual([WORK_CENTERS.ASM, WORK_CENTERS.CUT, WORK_CENTERS.INS]);
    const asm = model.rows.find((r) => r.workCenter === WORK_CENTERS.ASM)!;
    expect(asm).toMatchObject({ capacityMin: 240 });
    expect(asm.cells).toEqual([{ day: 13, plannedMin: 300, actualMin: 0, overloadMin: 60 }]);
    // 超過しているのはWC-ASMだけで、表の「超過（N分）」・capacityOverloads()と同じ判定になる
    const overloaded = model.rows.flatMap((r) => r.cells.filter((c) => c.overloadMin > 0).map((c) => `${r.workCenter}@${c.day}`));
    expect(overloaded).toEqual(capacityOverloads(state).map((e) => `${e.workCenter}@${e.day}`));
  });

  it("[単体][機能テスト][境界] 超過分は計画負荷と実績負荷のうち大きい方を基準にする（表の判定と同じ）", () => {
    const model = buildCapacityChartModel([
      { workCenter: "WC-X", day: 3, plannedMin: 100, actualMin: 300, capacityMin: 240 },
      { workCenter: "WC-X", day: 4, plannedMin: 240, actualMin: 0, capacityMin: 240 }, // ちょうど能力＝超過ではない
    ]);

    expect(model.rows[0].cells.map((c) => c.overloadMin)).toEqual([60, 0]);
    expect(model.maxMin).toBe(300);
  });

  it("[単体][機能テスト][境界] 作業区ごとに負荷のある日が違っても、日軸は和集合になり各セルは自分の日だけを持つ", () => {
    const model = buildCapacityChartModel([
      { workCenter: "WC-B", day: 20, plannedMin: 50, actualMin: 0, capacityMin: 100 },
      { workCenter: "WC-A", day: 12, plannedMin: 10, actualMin: 0, capacityMin: 100 },
      { workCenter: "WC-A", day: 30, plannedMin: 20, actualMin: 0, capacityMin: 100 },
    ]);

    expect(model.days).toEqual([12, 20, 30]);
    expect(model.rows.map((r) => [r.workCenter, r.cells.map((c) => c.day)])).toEqual([
      ["WC-A", [12, 30]],
      ["WC-B", [20]],
    ]);
  });

  it("[単体][機能テスト][境界] 負荷が1件も無ければ空のモデルを返す", () => {
    expect(buildCapacityChartModel([])).toEqual({ days: [], rows: [], maxMin: 0 });
  });
});

// Issue #59：慢性的なボトルネック作業区の検知（design.md EXT-37）
// design.md §9.5の計算例（受注1件・回答納期D+15でWC-ASMがD+13に300分/240分で山積み超過）を、
// 複数受注が回答納期をずらして重なることで「同一作業区が3日以上連続で超過する」状態へ拡張する。
function firmChairOrders(requestDays: number[]) {
  const state = createTestState(0);
  const soNos = requestDays.map((requestDay, i) => {
    const soNo = createSalesOrder(
      state,
      { customerId: i % 2 === 0 ? "CUST-A" : "CUST-B", itemId: ITEM_IDS.FG_CHAIR, qty: 10, requestDay },
      0,
    );
    confirmDelivery(state, soNo, requestDay);
    return soNo;
  });
  runMRP(state);
  firmAllPlannedOrders(state, 0);
  return { state, soNos };
}

describe("computeChronicBottlenecks（Issue #59：慢性的なボトルネック作業区の検知）", () => {
  it("[結合][機能テスト][正常] WC-ASMが3日連続（D+13〜D+15）で山積み超過している状態をボトルネックとして検知する", () => {
    // 回答納期D+15/16/17の3受注 → FG-100(WC-ASM工程)のstartDayがD+13/14/15と3日連続で並ぶ
    const { state } = firmChairOrders([15, 16, 17]);

    const overloads = capacityOverloads(state);
    const asmOverloadDays = overloads.filter((o) => o.workCenter === WORK_CENTERS.ASM).map((o) => o.day);
    expect(asmOverloadDays.sort((a, b) => a - b)).toEqual([13, 14, 15]);

    const bottlenecks = computeChronicBottlenecks(state);
    expect(bottlenecks).toEqual([
      { workCenter: WORK_CENTERS.ASM, startDay: 13, endDay: 15, consecutiveDays: 3 },
    ]);
    // WC-CUT・WC-INSは各日とも能力内（180分・120分 ≤ 240分）のため検知されない
    expect(bottlenecks.some((b) => b.workCenter === WORK_CENTERS.CUT || b.workCenter === WORK_CENTERS.INS)).toBe(false);
  });

  it("[単体][機能テスト][境界] 連続超過が2日（閾値未満）ではボトルネックとして検知されない", () => {
    // 回答納期D+15/16の2受注 → WC-ASMの超過はD+13〜D+14の2日のみ
    const { state } = firmChairOrders([15, 16]);

    const overloads = capacityOverloads(state);
    expect(overloads.filter((o) => o.workCenter === WORK_CENTERS.ASM)).toHaveLength(2);

    expect(computeChronicBottlenecks(state)).toEqual([]);
  });

  it("[単体][機能テスト][境界] 閾値を明示的に2へ引き下げると、2日連続の超過も検知される", () => {
    const { state } = firmChairOrders([15, 16]);

    const bottlenecks = computeChronicBottlenecks(state, 2);
    expect(bottlenecks).toEqual([
      { workCenter: WORK_CENTERS.ASM, startDay: 13, endDay: 14, consecutiveDays: 2 },
    ]);
  });

  it("[単体][機能テスト][正常] 既定の閾値定数はdesign.md §9.5のシナリオに合わせて3である", () => {
    expect(CHRONIC_BOTTLENECK_THRESHOLD_DAYS).toBe(3);
  });
});
