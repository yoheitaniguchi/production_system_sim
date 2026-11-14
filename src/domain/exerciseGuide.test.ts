import { describe, expect, it } from "vitest";
import { BICYCLE_PRESET, BIKE_ITEM_IDS, ITEM_IDS } from "../data/masterData";
import { buildGuideContext, computeGuideProgress, computeGuideSummary, currentGuideStep } from "./exerciseGuide";
import { parseMasterSnapshot } from "./masterIO";
import { createInitialState, simulationReducer, type SimulationAction } from "./reducer";
import { createTestState } from "./testUtils";
import type { MasterSnapshot, SimulationState } from "../types";

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

/** Issue #65以前の固定文言。木製イスのプリセットでは、マスタから組み立てた文言がこれと一致する（既存回帰） */
const CHAIR_TEXTS: [string, string, string, string][] = [
  ["TC-01", "マスタ初期化の確認", "マスタタブで品目5件・BOM4行・工順3行が揃っていることを確認する", "ITEM 5行 / BOM_LINE 4行 / ROUTING_STEP 3行"],
  ["TC-02", "受注登録", "受注タブで「木製イス」を数量10、希望納期D+15で登録する", "SALES_ORDER 1行 / SO_LINE 1行（status=RECEIVED）"],
  ["TC-03", "納期回答", "登録した受注の納期回答をD+15で確定する", "SO_LINE status=CONFIRMED"],
  ["TC-04", "MRP実行", "計画タブで「MRPを実行」する", "PLANNED_ORDER 5行"],
  ["TC-05", "計画オーダ確定", "計画タブで「計画オーダを確定」する", "MFG_ORDER 2行 / PURCHASE_ORDER 3行 / WORK_INSTRUCTION 3行"],
  ["TC-06", "MRP再実行で重複が無いことを確認", "計画タブでもう一度「MRPを実行」し、計画オーダが0件になることを確認する", "PLANNED_ORDER 0行（確定済オーダが供給に算入されるため）"],
  ["TC-07", "購買オーダの納期回答", "発注タブで3件の購買オーダすべてに納期回答する", "PURCHASE_ORDER status=ACKED（3件とも）"],
  ["TC-08", "木板の入荷計上", "D+12まで日を進め、木板（RM-300）を入荷計上する", "STOCK_TXN +1（RCV）/ PO status=CLOSED"],
  ["TC-09", "座面ASSYの製造", "工程タブで座面ASSYの製造オーダをリリース・着手・完了（良品10・不良0）する", "STOCK_TXN +2（ISS 木板 / PRD 座面ASSY）"],
  ["TC-10", "脚・ネジの入荷計上", "D+14まで日を進め、脚（PT-400）・ネジ（PT-500）を入荷計上する", "STOCK_TXN +2（RCV）"],
  ["TC-11", "木製イス 工程10（組立）完了", "工程タブで木製イスの製造オーダをリリース・着手し、工程10（組立）を完了する（良品10・不良0）", "STOCK_TXN +3（ISS 座面ASSY / 脚 / ネジ）"],
  ["TC-12", "木製イス 工程20（検査）完了", "工程20（検査）を完了する（例：良品9・不良1）", "STOCK_TXN +1（PRD 木製イス）/ MFG_ORDER status=DONE"],
  ["TC-13", "未充足需要の確認", "警告バーで「未充足需要」の表示を確認する（不良が出ていれば不足数量が表示される）", "不足数量が表示される（不良が無ければ表示は無く、それで問題無い）"],
  ["TC-14", "MRP再実行（不足分の補充）", "計画タブで再度「MRPを実行」し、不足分の計画オーダが生成されることを確認する", "PLANNED_ORDER 生成（不足がある場合のみ）"],
  ["TC-15", "出荷指示（引当）", "出荷タブで受注を引き当てる", "SHIPMENT 1行（ALLOCATED）"],
  ["TC-16", "出荷実績登録", "D+15で出荷実績を登録する", "STOCK_TXN +1（SHP）/ SO_LINE status=PARTIALまたはCLOSED"],
  ["TC-17", "KPI確認", "KPIタブで納期遵守率・直行率・計画達成率・受注残を確認する", "各指標が算出される"],
  ["TC-18", "引当元追跡", "引当元追跡タブで受注から製造・購買オーダまでの繋がりを確認する", "MFG_ORDER・PURCHASE_ORDER・STOCK_TXNの繋がりが表示される"],
];

/** masterIO.tsのJSON取り込み（parseMasterSnapshot→MASTER_IMPORT）で、初期状態のマスタを差し替える */
function importMaster(snapshot: MasterSnapshot): SimulationState {
  const parsed = parseMasterSnapshot(JSON.stringify(snapshot));
  return dispatch(createInitialState(), { type: "MASTER_IMPORT", payload: { snapshot: parsed } });
}

/** 製造オーダの全工程をリリース→着手→完了（全数良品）する */
function completeMfgOrder(state: SimulationState, moNo: string, onlyFirstStep = false): SimulationState {
  const mo = state.mfgOrders.find((m) => m.moNo === moNo)!;
  if (mo.status === "FIRM") state = dispatch(state, { type: "MFG_RELEASE", payload: { moNo } });
  const steps = state.workInstructions
    .filter((w) => w.moNo === moNo && w.status === "WAIT")
    .map((w) => w.stepNo)
    .sort((a, b) => a - b);
  for (const stepNo of onlyFirstStep ? steps.slice(0, 1) : steps) {
    const inputQty = state.workInstructions.find((w) => w.moNo === moNo && w.stepNo === stepNo)!.inputQty;
    state = dispatch(state, { type: "WI_START", payload: { moNo, stepNo } });
    state = dispatch(state, { type: "WI_COMPLETE", payload: { moNo, stepNo, goodQty: inputQty || mo.planQty, scrapQty: 0 } });
  }
  return state;
}

function receivePurchaseOrders(state: SimulationState, itemIds: string[]): SimulationState {
  for (const po of state.purchaseOrders.filter((p) => itemIds.includes(p.itemId) && p.status !== "CLOSED")) {
    state = { ...state, day: Math.max(state.day, po.confirmDay ?? po.dueDay) };
    state = dispatch(state, { type: "PO_RECEIVE", payload: { poNo: po.poNo } });
  }
  return state;
}

/**
 * 品目コードを知らずにBOM構造（buildGuideContext）だけを頼りに、受注〜出荷の正常系シーケンスを通す。
 * 木製イス以外のマスタで、各ステップが想定どおりの順に完了することを確かめるための汎用ドライバ。
 */
function runGenericSequence(initial: SimulationState): SequenceCheckpoint[] {
  const checkpoints: SequenceCheckpoint[] = [];
  let state = initial;
  const checkpoint = (tc: string) => checkpoints.push({ tc, state });
  const ctx = buildGuideContext(state);

  state = dispatch(state, {
    type: "SO_CREATE",
    payload: { customerId: state.customers[0].customerId, itemId: ctx.finalItemId!, qty: 10, requestDay: 30 },
  });
  const soNo = state.soLines[0].soNo;
  state = dispatch(state, { type: "SO_CONFIRM_DELIVERY", payload: { soNo, confirmDay: 30 } });
  state = dispatch(state, { type: "MRP_RUN" });
  state = dispatch(state, { type: "PLANNED_ORDERS_FIRM" });
  state = dispatch(state, { type: "MRP_RUN" });
  for (const po of state.purchaseOrders) {
    state = dispatch(state, { type: "PO_ACK", payload: { poNo: po.poNo, confirmDay: po.dueDay } });
  }
  checkpoint("TC-07");

  state = receivePurchaseOrders(state, ctx.intermediateBuyIds);
  checkpoint("TC-08");

  // 中間品は下位（BOMレベルが深い）から順に作る
  const intermediateOrders = state.mfgOrders
    .filter((mo) => ctx.intermediateIds.includes(mo.itemId))
    .sort((a, b) => b.bomLevel - a.bomLevel);
  for (const mo of intermediateOrders) state = completeMfgOrder(state, mo.moNo);
  checkpoint("TC-09");

  state = receivePurchaseOrders(state, ctx.buyIds);
  checkpoint("TC-10");

  const finalOrder = state.mfgOrders.find((mo) => mo.itemId === ctx.finalItemId)!;
  state = completeMfgOrder(state, finalOrder.moNo, true);
  checkpoint("TC-11");
  state = completeMfgOrder(state, finalOrder.moNo);
  checkpoint("TC-12");

  state = dispatch(state, { type: "MRP_RUN" });
  state = { ...state, day: Math.max(state.day, 30) };
  state = dispatch(state, { type: "SHIPMENT_ALLOCATE", payload: { soNo, lineNo: 1 } });
  state = dispatch(state, { type: "SHIPMENT_SHIP", payload: { shipNo: state.shipments[0].shipNo } });
  checkpoint("TC-16");
  return checkpoints;
}

function errorLogs(state: SimulationState): string[] {
  return state.eventLog.filter((e) => e.message.startsWith("[エラー]")).map((e) => e.message);
}

/** 木製イスと品目コード・BOM構成が異なる3階層の題材（本棚）。最終製品の工順は1行だけ */
const BOOKSHELF_MASTER: MasterSnapshot = {
  version: 1,
  items: [
    { itemId: "BK-1", name: "本棚", makeBuy: "MAKE", leadTimeDays: 2, salesPrice: 9000 },
    { itemId: "SB-1", name: "棚板ASSY", makeBuy: "MAKE", leadTimeDays: 1 },
    { itemId: "PLY-1", name: "合板", makeBuy: "BUY", leadTimeDays: 4, defaultSupplierId: "SUP-1", purchasePrice: 500 },
    { itemId: "BLT-1", name: "ボルト", makeBuy: "BUY", leadTimeDays: 2, defaultSupplierId: "SUP-2", purchasePrice: 10 },
  ],
  bom: [
    { parentItemId: "BK-1", childItemId: "SB-1", qtyPer: 3 },
    { parentItemId: "BK-1", childItemId: "BLT-1", qtyPer: 8 },
    { parentItemId: "SB-1", childItemId: "PLY-1", qtyPer: 1 },
  ],
  routingSteps: [
    { itemId: "SB-1", stepNo: 10, workCenter: "WC-1", stdTimeMin: 10 },
    { itemId: "BK-1", stepNo: 10, workCenter: "WC-1", stdTimeMin: 30 },
  ],
  workCenters: [{ workCenter: "WC-1", ratePerHour: 2400, capacityMinPerDay: 4800 }],
  customers: [{ customerId: "CUST-X", name: "得意先X" }],
  suppliers: [
    { supplierId: "SUP-1", name: "合板仕入先" },
    { supplierId: "SUP-2", name: "ボルト仕入先" },
  ],
};

/** 中間品を持たない2階層の題材（踏み台）。TC-08・TC-09は「該当なし」になる */
const STEP_STOOL_MASTER: MasterSnapshot = {
  version: 1,
  items: [
    { itemId: "ST-1", name: "踏み台", makeBuy: "MAKE", leadTimeDays: 1, salesPrice: 3000 },
    { itemId: "BD-1", name: "板", makeBuy: "BUY", leadTimeDays: 2, defaultSupplierId: "SUP-1", purchasePrice: 300 },
  ],
  bom: [{ parentItemId: "ST-1", childItemId: "BD-1", qtyPer: 2 }],
  routingSteps: [{ itemId: "ST-1", stepNo: 10, workCenter: "WC-1", stdTimeMin: 20 }],
  workCenters: [{ workCenter: "WC-1", ratePerHour: 2400, capacityMinPerDay: 4800 }],
  customers: [{ customerId: "CUST-X", name: "得意先X" }],
  suppliers: [{ supplierId: "SUP-1", name: "板仕入先" }],
};

describe("演習ガイドのマスタ非依存化（design.md EXT-43、Issue #65）", () => {
  it("[単体][機能テスト][正常] 木製イスのプリセットでは、マスタから組み立てた文言がIssue #65以前の固定文言と一致する", () => {
    const steps = computeGuideProgress(createTestState(0));
    expect(steps.map((s) => [s.tc, s.title, s.instruction, s.expected])).toEqual(CHAIR_TEXTS);
    expect(steps.every((s) => s.status !== "notApplicable")).toBe(true);
  });

  it("[単体][機能テスト][正常] 木製イスでは、最終製品・中間品・中間品の材料・購買品が従来の判定対象と一致する", () => {
    const ctx = buildGuideContext(createTestState(0));
    expect(ctx.finalItemId).toBe(ITEM_IDS.FG_CHAIR);
    expect(ctx.intermediateIds).toEqual([ITEM_IDS.SA_SEAT]);
    expect(ctx.intermediateBuyIds).toEqual([ITEM_IDS.RM_BOARD]);
    expect(ctx.buyIds).toEqual([ITEM_IDS.RM_BOARD, ITEM_IDS.PT_LEG, ITEM_IDS.PT_SCREW]);
    expect([ctx.finalFirstStepNo, ctx.finalLastStepNo]).toEqual([10, 20]);
  });

  it("[総合][機能テスト][正常] 自転車（4階層BOM）をJSON取り込みすると、中間品2つ・購買品2つで全ステップが順に完了する", () => {
    const initial = importMaster(BICYCLE_PRESET);
    const ctx = buildGuideContext(initial);
    expect(ctx.finalItemId).toBe(BIKE_ITEM_IDS.FG_BIKE);
    expect(ctx.intermediateIds).toEqual([BIKE_ITEM_IDS.SA_WHEEL, BIKE_ITEM_IDS.SA_RIM]);
    expect(ctx.intermediateBuyIds).toEqual([BIKE_ITEM_IDS.RM_ALUM]);

    const checkpoints = runGenericSequence(initial);
    const at = (tc: string) => checkpoints.find((c) => c.tc === tc)!.state;
    expect(doneTcs(at("TC-07"))).toContain("TC-07");
    expect(doneTcs(at("TC-07"))).not.toContain("TC-08");
    expect(doneTcs(at("TC-08"))).toContain("TC-08");
    expect(doneTcs(at("TC-08"))).not.toContain("TC-09");
    expect(doneTcs(at("TC-09"))).toContain("TC-09");
    expect(doneTcs(at("TC-09"))).not.toContain("TC-10"); // フレームは未入荷
    expect(doneTcs(at("TC-10"))).toContain("TC-10");
    expect(doneTcs(at("TC-11"))).toContain("TC-11");
    expect(doneTcs(at("TC-11"))).not.toContain("TC-12"); // 工程20（検査）が残っている
    expect(doneTcs(at("TC-12"))).toEqual(expect.arrayContaining(["TC-12", "TC-13"]));

    const finalState = checkpoints[checkpoints.length - 1].state;
    expect(errorLogs(finalState)).toEqual([]);
    expect(currentGuideStep(finalState)).toBeNull();
    expect(computeGuideProgress(finalState).every((s) => s.status === "done")).toBe(true);
  });

  it("[総合][機能テスト][正常] 品目コードが異なる本棚のマスタでも、初回入荷・中間品完成・最終製品完成が判定される", () => {
    const checkpoints = runGenericSequence(importMaster(BOOKSHELF_MASTER));
    const at = (tc: string) => checkpoints.find((c) => c.tc === tc)!.state;
    expect(doneTcs(at("TC-07"))).not.toContain("TC-08");
    expect(doneTcs(at("TC-08"))).toContain("TC-08"); // 合板の入荷
    expect(doneTcs(at("TC-08"))).not.toContain("TC-09");
    expect(doneTcs(at("TC-09"))).toContain("TC-09"); // 棚板ASSYのPRD
    expect(doneTcs(at("TC-09"))).not.toContain("TC-10"); // ボルトは未入荷
    expect(doneTcs(at("TC-10"))).toContain("TC-10");
    expect(doneTcs(at("TC-10"))).not.toContain("TC-11");
    // 工順が1行だけなので、最初の工程の完了と製造オーダの完了が同時に満たされる
    expect(doneTcs(at("TC-11"))).toEqual(expect.arrayContaining(["TC-11", "TC-12", "TC-13"]));

    const finalState = checkpoints[checkpoints.length - 1].state;
    expect(errorLogs(finalState)).toEqual([]);
    expect(currentGuideStep(finalState)).toBeNull();
  });

  it("[単体][機能テスト][正常] 本棚のマスタでは、文言に品目名・件数が差し込まれ、木製イス固有の日付は出ない", () => {
    const steps = computeGuideProgress(importMaster(BOOKSHELF_MASTER));
    const byTc = (tc: string) => steps.find((s) => s.tc === tc)!;
    expect(byTc("TC-01").expected).toBe("ITEM 4行 / BOM_LINE 3行 / ROUTING_STEP 2行");
    expect(byTc("TC-02").instruction).toBe("受注タブで「本棚」を登録する（数量・希望納期は任意）");
    expect(byTc("TC-05").expected).toBe("MFG_ORDER 2行 / PURCHASE_ORDER 2行 / WORK_INSTRUCTION 2行");
    expect(byTc("TC-08").title).toBe("合板の入荷計上");
    expect(byTc("TC-08").instruction).toBe("入荷予定日まで日を進め、合板（PLY-1）を入荷計上する");
    expect(byTc("TC-10").title).toBe("ボルトの入荷計上");
    expect(byTc("TC-12").title).toBe("本棚 製造オーダ完了");
    expect(steps.some((s) => /D\+\d/.test(s.instruction))).toBe(false);
  });

  it("[単体][機能テスト][正常] 中間品の無いマスタでは、TC-08・TC-09が「該当なし」になり次のステップの案内で飛ばされる", () => {
    let state = importMaster(STEP_STOOL_MASTER);
    const naTcs = (s: SimulationState) =>
      computeGuideProgress(s)
        .filter((step) => step.status === "notApplicable")
        .map((step) => step.tc);
    expect(naTcs(state)).toEqual(["TC-08", "TC-09"]);

    const checkpoints = runGenericSequence(state);
    expect(currentGuideStep(checkpoints.find((c) => c.tc === "TC-07")!.state)?.tc).toBe("TC-10");
    state = checkpoints[checkpoints.length - 1].state;
    expect(errorLogs(state)).toEqual([]);
    expect(currentGuideStep(state)).toBeNull();
  });

  it("[単体][機能テスト][異常] BOMが循環していても、最終製品のBOM探索は停止する", () => {
    const state = dispatch(createTestState(0), {
      type: "SO_CREATE",
      payload: { customerId: "CUST-A", itemId: ITEM_IDS.FG_CHAIR, qty: 10, requestDay: 15 },
    });
    state.bom.push({ parentItemId: ITEM_IDS.SA_SEAT, childItemId: ITEM_IDS.FG_CHAIR, qtyPer: 1 });
    const ctx = buildGuideContext(state);
    expect(ctx.treeItemIds).toHaveLength(5);
  });
});
