// シナリオ（SimulationState全体）のJSON入出力（Issue #61、design.md EXT-40）
import { describe, expect, it } from "vitest";
import { ITEM_IDS } from "../data/masterData";
import { serializeMasterSnapshot } from "./masterIO";
import { createInitialState, simulationReducer, type SimulationAction } from "./reducer";
import { parseScenario, ScenarioIOError, SCENARIO_KIND, SCENARIO_VERSION, serializeScenario } from "./scenarioIO";
import type { SimulationState } from "../types";

function run(state: SimulationState, ...actions: SimulationAction[]): SimulationState {
  return actions.reduce(simulationReducer, state);
}

/**
 * 全テーブルに行が入るまで実際の操作（reducer経由）で進めた状態。出荷済みの受注1件（FG-100 x2）に加え、
 * null値（未回答の納期・未着手の作業指示・未回答の購買オーダ）を持つ行や、確定していない計画オーダも残す。
 * 出荷引当の直後（ALLOCATED、実出荷日がnull）の状態も別に返す。
 */
function buildScenarioStates(): { allocated: SimulationState; final: SimulationState } {
  let state = createInitialState();
  state = run(
    state,
    { type: "MASTER_UPDATE_CUSTOMER_PRIORITY_RANK", payload: { customerId: "CUST-B", priorityRank: 5 } },
    { type: "SO_CREATE", payload: { customerId: "CUST-A", itemId: ITEM_IDS.FG_CHAIR, qty: 2, requestDay: 15 } },
    { type: "SO_CONFIRM_DELIVERY", payload: { soNo: "SO-001", confirmDay: 15 } },
    { type: "MRP_RUN" },
    { type: "PLANNED_ORDERS_FIRM" },
  );
  for (const po of state.purchaseOrders) {
    state = run(state, { type: "PO_ACK", payload: { poNo: po.poNo, confirmDay: po.dueDay } });
  }
  for (let i = 0; i < 13; i++) state = run(state, { type: "ADVANCE_DAY" });
  for (const po of state.purchaseOrders) state = run(state, { type: "PO_RECEIVE", payload: { poNo: po.poNo } });

  const saOrder = state.mfgOrders.find((mo) => mo.itemId === ITEM_IDS.SA_SEAT)!;
  const fgOrder = state.mfgOrders.find((mo) => mo.itemId === ITEM_IDS.FG_CHAIR)!;
  state = run(
    state,
    { type: "MFG_RELEASE", payload: { moNo: saOrder.moNo } },
    { type: "WI_START", payload: { moNo: saOrder.moNo, stepNo: 10 } },
    { type: "WI_COMPLETE", payload: { moNo: saOrder.moNo, stepNo: 10, goodQty: 2, scrapQty: 0 } },
    { type: "MFG_RELEASE", payload: { moNo: fgOrder.moNo } },
    { type: "WI_START", payload: { moNo: fgOrder.moNo, stepNo: 10 } },
    { type: "WI_COMPLETE", payload: { moNo: fgOrder.moNo, stepNo: 10, goodQty: 2, scrapQty: 0 } },
    { type: "WI_START", payload: { moNo: fgOrder.moNo, stepNo: 20 } },
    { type: "WI_COMPLETE", payload: { moNo: fgOrder.moNo, stepNo: 20, goodQty: 2, scrapQty: 0 } },
    { type: "SHIPMENT_ALLOCATE", payload: { soNo: "SO-001", lineNo: 1 } },
  );
  const allocated = state;
  const shipNo = state.shipments[0].shipNo;
  state = run(
    state,
    { type: "SHIPMENT_SHIP", payload: { shipNo } },
    // SO-002：確定してオーダ化（未着手の作業指示・未回答の購買オーダが残る）
    { type: "SO_CREATE", payload: { customerId: "CUST-B", itemId: ITEM_IDS.FG_CHAIR, qty: 3, requestDay: 30 } },
    { type: "SO_CONFIRM_DELIVERY", payload: { soNo: "SO-002", confirmDay: 30 } },
    { type: "MRP_RUN" },
    { type: "PLANNED_ORDERS_FIRM" },
    // SO-003：納期未回答のまま計画オーダだけ展開した状態
    { type: "SO_CREATE", payload: { customerId: "CUST-A", itemId: ITEM_IDS.FG_CHAIR, qty: 1, requestDay: 40 } },
    { type: "MRP_RUN" },
    { type: "ADVANCE_DAY" },
  );
  return { allocated, final: state };
}

function buildRichState(): SimulationState {
  return buildScenarioStates().final;
}

// 型に合わない壊れたJSONを作るためのテスト専用の緩い型
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseDoc = { kind: unknown; version: unknown; state: any };

/** シリアライズ済みJSONを一度オブジェクトへ戻し、fnで壊してから再度文字列にする */
function tamper(state: SimulationState, fn: (doc: LooseDoc) => void): string {
  const doc = JSON.parse(serializeScenario(state));
  fn(doc);
  return JSON.stringify(doc);
}

function expectRejected(json: string, messagePart: string): void {
  let error: unknown;
  try {
    parseScenario(json);
  } catch (err) {
    error = err;
  }
  expect(error).toBeInstanceOf(ScenarioIOError);
  expect((error as ScenarioIOError).message).toContain(messagePart);
}

describe("シナリオのエクスポート→インポートの往復（Issue #61）", () => {
  it("[結合][機能テスト][正常] 全テーブルに行がある状態を書き出して読み戻すと、配列順序を含め値が完全に一致する", () => {
    const state = buildRichState();
    // フィクスチャの前提：主要テーブルが全て空でないこと（空のまま往復しても何も検証できないため）
    for (const key of [
      "salesOrders",
      "soLines",
      "plannedOrders",
      "mfgOrders",
      "workInstructions",
      "purchaseOrders",
      "stocks",
      "stockTxns",
      "shipments",
      "lots",
      "lotGenealogy",
      "eventLog",
      "dashboardHistory",
    ] as const) {
      expect(state[key].length, key).toBeGreaterThan(0);
    }
    expect(state.customers.find((c) => c.customerId === "CUST-B")?.priorityRank).toBe(5);
    // null値の往復も検証できるよう、nullを持つ行が実際にあること
    expect(state.soLines.some((l) => l.confirmDay === null)).toBe(true);
    expect(state.workInstructions.some((w) => w.actualStartDay === null)).toBe(true);
    expect(state.purchaseOrders.some((p) => p.confirmDay === null)).toBe(true);

    const restored = parseScenario(serializeScenario(state));

    expect(restored).toEqual(state);
    expect(restored.eventLog.map((e) => e.message)).toEqual(state.eventLog.map((e) => e.message));
    expect(restored.stockTxns.map((t) => t.txnId)).toEqual(state.stockTxns.map((t) => t.txnId));
  });

  it("[結合][機能テスト][境界] 出荷引当直後（ALLOCATED・実出荷日null）の状態も往復で一致する", () => {
    const { allocated } = buildScenarioStates();
    expect(allocated.shipments.some((s) => s.status === "ALLOCATED" && s.actualDay === null)).toBe(true);
    expect(parseScenario(serializeScenario(allocated))).toEqual(allocated);
  });

  it("[単体][機能テスト][境界] 初期状態（トランザクションが空）も往復で一致する", () => {
    const state = createInitialState();
    expect(parseScenario(serializeScenario(state))).toEqual(state);
  });

  it("[結合][機能テスト][正常] 取り込んだ状態でそのまま操作を続けても、採番が既存の番号と衝突しない", () => {
    const restored = parseScenario(serializeScenario(buildRichState()));
    const next = run(
      restored,
      { type: "SO_CREATE", payload: { customerId: "CUST-A", itemId: ITEM_IDS.FG_CHAIR, qty: 1, requestDay: 40 } },
    );
    const soNos = next.salesOrders.map((o) => o.soNo);
    expect(new Set(soNos).size).toBe(soNos.length);
    expect(soNos.at(-1)).toBe("SO-004");
  });
});

describe("SCENARIO_IMPORT（reducer）", () => {
  it("[結合][機能テスト][正常] 現在の状態を丸ごと置き換え、取り込んだ状態をそのまま（イベントログも追記せず）復元する", () => {
    const exported = buildRichState();
    const other = run(
      createInitialState(),
      { type: "SO_CREATE", payload: { customerId: "CUST-A", itemId: ITEM_IDS.FG_CHAIR, qty: 9, requestDay: 5 } },
    );

    const imported = simulationReducer(other, { type: "SCENARIO_IMPORT", payload: { state: parseScenario(serializeScenario(exported)) } });

    expect(imported).toEqual(exported);
    expect(imported.salesOrders.some((o) => o.soNo === "SO-001" && o.customerId === "CUST-A")).toBe(true);
    // 呼び出し側の入力オブジェクトと参照を共有しない
    expect(imported).not.toBe(exported);
  });
});

describe("取り込みの拒否（all-or-nothing）", () => {
  const state = buildRichState();

  it("[単体][異常系][異常] JSONとして解釈できない文字列は拒否する", () => {
    expectRejected("{not json", "JSONとして解釈できません");
  });

  it("[単体][異常系][異常] マスタのJSON（masterIO）を選んだ場合は、取り違えだと分かる専用の案内で拒否する", () => {
    expectRejected(serializeMasterSnapshot(state), "マスタのJSONです");
  });

  it("[単体][異常系][異常] kindが違うJSON・未対応のversionは拒否する", () => {
    expectRejected(tamper(state, (d) => (d.kind = "other")), "kindが一致しません");
    expectRejected(tamper(state, (d) => (d.version = 2)), "未対応のversion");
    expect(SCENARIO_KIND).toBe("production-system-sim-scenario");
    expect(SCENARIO_VERSION).toBe(1);
  });

  it("[単体][異常系][異常] テーブル（配列）が欠けている・型が違う場合は、該当のキーと行番号を示して拒否する", () => {
    expectRejected(tamper(state, (d) => delete d.state.shipments), "state.shipments: 配列が必要です");
    expectRejected(tamper(state, (d) => (d.state.soLines[0].qty = "10")), "state.soLines[0].qty: 数値が必要です");
    expectRejected(
      tamper(state, (d) => (d.state.mfgOrders[0].status = "DONE!")),
      "state.mfgOrders[0].status: 次のいずれかが必要です",
    );
    expectRejected(tamper(state, (d) => (d.state.day = 1.5)), "state.day: 0以上の整数が必要です");
    expectRejected(
      tamper(state, (d) => delete d.state.dashboardHistory[0].kpiHighlights.wipQty),
      "state.dashboardHistory[0].kpiHighlights: wipQty: 数値が必要です",
    );
  });

  it("[単体][異常系][境界] 任意項目（優先度ランク等）は無くてもよいが、あるなら型が合っている必要がある", () => {
    expect(() => parseScenario(tamper(state, (d) => delete d.state.customers[1].priorityRank))).not.toThrow();
    expectRejected(
      tamper(state, (d) => (d.state.customers[1].priorityRank = "high")),
      "state.customers[1].priorityRank: 数値が必要です",
    );
  });

  it("[単体][異常系][異常] マスタ整合性エラー（BOMの循環）を含むJSONは拒否する", () => {
    expectRejected(
      tamper(state, (d) =>
        d.state.bom.push({ parentItemId: ITEM_IDS.SA_SEAT, childItemId: ITEM_IDS.FG_CHAIR, qtyPer: 1 }),
      ),
      "循環",
    );
  });

  it("[単体][異常系][異常] 採番用シーケンスが既存の最大番号以下だと拒否する（次の採番が既存と重複するため）", () => {
    expectRejected(tamper(state, (d) => (d.state.nextSoSeq = 1)), "nextSoSeq（1）が既存の受注番号の最大値（SO-3）以下");
    // 最大番号ちょうど（次に採番される番号が既存と同じ）も拒否し、最大+1は受け入れる
    expectRejected(tamper(state, (d) => (d.state.nextSoSeq = 3)), "nextSoSeq");
    expect(() => parseScenario(tamper(state, (d) => (d.state.nextSoSeq = 4)))).not.toThrow();
    expectRejected(tamper(state, (d) => (d.state.nextMoSeq = 1)), "nextMoSeq");
    expectRejected(tamper(state, (d) => (d.state.nextTxnSeq = 1)), "nextTxnSeq");
    expectRejected(tamper(state, (d) => (d.state.nextLotSeq = 1)), "nextLotSeq");
    expectRejected(tamper(state, (d) => (d.state.nextShipSeq = 1)), "nextShipSeq");
    expectRejected(tamper(state, (d) => (d.state.nextPoSeq = 1)), "nextPoSeq");
    expectRejected(tamper(state, (d) => (d.state.nextSoSeq = 0)), "state.nextSoSeq: 1以上の整数が必要です");
  });

  it("[単体][異常系][境界] 番号の形式に合わない主キーが混ざっても、数字の主キーの最大値は正しく検出される", () => {
    // 形式外の主キー（LOT-MANUAL）を無視せず数値化するとNaNが最大値の計算を汚染し、nextLotSeq=1が素通りしてしまう
    const json = tamper(state, (d) => {
      d.state.lots[0].lotNo = "LOT-MANUAL";
      d.state.nextLotSeq = 1;
    });
    expectRejected(json, "nextLotSeq");
    // 形式外の主キーだけなら採番と衝突しないため、シーケンスが1でも受け入れる
    const onlyManual = tamper(state, (d) => {
      d.state.lots.forEach((lot: { lotNo: string }, i: number) => (lot.lotNo = `LOT-MANUAL-${i}`));
      d.state.stockTxns.forEach((t: { lotNo?: string }) => delete t.lotNo);
      d.state.lotGenealogy = [];
      d.state.nextLotSeq = 1;
    });
    expect(() => parseScenario(onlyManual)).not.toThrow();
  });

  it("[単体][異常系][異常] マスタの値域（CRUDと同じ強さ）を外れる値は、型が合っていても拒否する", () => {
    expectRejected(tamper(state, (d) => (d.state.bom[0].qtyPer = -1)), "qtyPer");
    expectRejected(tamper(state, (d) => (d.state.items[0].leadTimeDays = -3)), "leadTimeDays");
    expectRejected(tamper(state, (d) => (d.state.routingSteps[0].stepNo = 0)), "stepNo");
    expectRejected(tamper(state, (d) => (d.state.workCenters[0].ratePerHour = -1)), "ratePerHour");
    expectRejected(tamper(state, (d) => (d.state.customers[0].name = "")), "name");
  });

  it("[単体][異常系][異常] dashboardHistoryの不変条件（day昇順・重複なし・現在日以前）が崩れていたら拒否する", () => {
    expectRejected(
      tamper(state, (d) => (d.state.dashboardHistory[1].day = d.state.dashboardHistory[0].day)),
      "日の昇順（重複なし）",
    );
    expectRejected(tamper(state, (d) => (d.state.dashboardHistory.at(-1).day = d.state.day + 5)), "現在日");
  });

  it("[単体][異常系][境界] エラーが多数あっても一覧は上限で打ち切り、残りの件数を示す", () => {
    const json = tamper(state, (d) => {
      for (const row of d.state.stockTxns) row.qty = "x";
      for (const row of d.state.eventLog) row.day = "x";
    });
    expectRejected(json, "…ほか");
  });
});
