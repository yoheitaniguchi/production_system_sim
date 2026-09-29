import { describe, expect, it } from "vitest";
import { parseScenario, SCENARIO_KIND, SCENARIO_VERSION } from "./scenarioIO";

// SEC-002（docs/security/reports参照）：parseScenario()はTABLE_SPECSで宣言された既知のフィールドの
// 型だけを検査し、行や最上位stateオブジェクトに付いた「未知の余分なキー」（`__proto__`という名前の
// キーを含む）を拒否も除去もしない。戻り値も`raw.state as unknown as SimulationState`（JSON.parse結果
// そのもの）であり、masterIO.tsのparseMasterSnapshot（フィールドを個別に取り出して新規オブジェクトを
// 組み立てる安全な作り）と異なり、素通りしてしまう。
//
// 現時点のリポジトリには、素通りしたオブジェクトをObject.assignやfor-inで別オブジェクトへ書き写す
// ようなコードが無いため（grep確認済み）、実際にObject.prototypeが汚染される経路は今のところ無いが、
// 未知のキーを拒否することは安価な多層防御であり、将来そうした書き写しコードが追加された場合の
// 保険にもなる。安全な実装は、行・stateの両方で未知キーを検出したらScenarioIOErrorを投げること
// （現状は投げないため、このテストは失敗する＝指摘の顕在化）。
function validScenarioState() {
  return {
    day: 0,
    items: [],
    bom: [],
    routingSteps: [],
    workCenters: [],
    customers: [],
    suppliers: [],
    salesOrders: [],
    soLines: [],
    plannedOrders: [],
    mfgOrders: [],
    workInstructions: [],
    purchaseOrders: [],
    stocks: [],
    stockTxns: [],
    shipments: [],
    lots: [],
    lotGenealogy: [],
    eventLog: [],
    dashboardHistory: [],
    nextSoSeq: 1,
    nextMoSeq: 1,
    nextPoSeq: 1,
    nextTxnSeq: 1,
    nextShipSeq: 1,
    nextLotSeq: 1,
  };
}

function toJson(state: unknown): string {
  return JSON.stringify({ kind: SCENARIO_KIND, version: SCENARIO_VERSION, state });
}

describe("parseScenario（SEC-002: 未知キーの拒否）", () => {
  it("[@security][異常] 最上位stateに__proto__という名前の余分なキーがあると取り込みを拒否する", () => {
    const state = { ...validScenarioState(), __proto__: { polluted: "yes" } } as Record<string, unknown>;
    // オブジェクトリテラルの__proto__はプロトタイプ指定として解釈されるため、JSON.parse相当の
    // 「__proto__という名前のown property」を再現するにはdefineProperty経由で明示的に持たせる
    Object.defineProperty(state, "__proto__", { value: { polluted: "yes" }, enumerable: true, configurable: true });
    expect(() => parseScenario(toJson(state))).toThrow();
  });

  it("[@security][異常] 行オブジェクトに未知の余分なキーがあると取り込みを拒否する", () => {
    const state = { ...validScenarioState(), suppliers: [{ supplierId: "SUP-1", name: "テスト仕入先" }] };
    // makeBuy: "BUY"（工順不要）＋defaultSupplierId設定済みにして、他の業務ルール違反ではなく
    // 「余分なキー」だけを問う
    const itemWithExtraKey = {
      itemId: "RM-999",
      name: "不正な余分キー付き品目",
      makeBuy: "BUY",
      leadTimeDays: 0,
      defaultSupplierId: "SUP-1",
      unexpectedField: "invaded",
    };
    // 比較対照：余分なキーを除けば取り込めることを確認しておく（業務ルール由来の失敗でないことの裏付け）
    const { unexpectedField: _unused, ...cleanItem } = itemWithExtraKey;
    expect(() => parseScenario(toJson({ ...state, items: [cleanItem] }))).not.toThrow();
    expect(() => parseScenario(toJson({ ...state, items: [itemWithExtraKey] }))).toThrow();
  });

  it("[@security][正常] 未知キーの無い正規のシナリオは引き続き取り込める", () => {
    expect(() => parseScenario(toJson(validScenarioState()))).not.toThrow();
  });
});
