// マスタのJSON入出力（design.md EXT-26）
import { describe, expect, it } from "vitest";
import { CHAIR_PRESET, ITEM_IDS } from "../data/masterData";
import { exportMasterSnapshot, MasterIOError, parseMasterSnapshot, serializeMasterSnapshot } from "./masterIO";
import { createInitialState, simulationReducer } from "./reducer";
import { createTestState } from "./testUtils";

describe("エクスポート／インポートの往復", () => {
  it("プリセットを書き出して読み直すと同じ内容になる", () => {
    const state = createTestState();
    const parsed = parseMasterSnapshot(serializeMasterSnapshot(state));
    expect(parsed.items).toEqual(exportMasterSnapshot(state).items);
    expect(parsed.bom).toEqual(CHAIR_PRESET.bom);
    expect(parsed.routingSteps).toEqual(CHAIR_PRESET.routingSteps);
  });

  it("エクスポートは現在の状態のコピーであり、後の編集に影響されない", () => {
    const state = createTestState();
    const snapshot = exportMasterSnapshot(state);
    state.items[0].leadTimeDays = 99;
    expect(snapshot.items[0].leadTimeDays).not.toBe(99);
  });
});

describe("スキーマ検証", () => {
  it("JSONとして壊れている入力を拒否する", () => {
    expect(() => parseMasterSnapshot("{")).toThrow(/JSONとして解釈できません/);
  });

  it("versionが異なる入力を拒否する", () => {
    expect(() => parseMasterSnapshot(JSON.stringify({ version: 2 }))).toThrow(/未対応のversion/);
  });

  it("必須フィールドが欠けた行を、位置を示して拒否する", () => {
    const broken = { ...CHAIR_PRESET, items: [{ itemId: "X", makeBuy: "MAKE", leadTimeDays: 1 }] };
    expect(() => parseMasterSnapshot(JSON.stringify(broken))).toThrow(/items\[0\]: name/);
  });

  it("makeBuyが不正な値の行を拒否する", () => {
    const broken = {
      ...CHAIR_PRESET,
      items: [{ itemId: "X", name: "X", makeBuy: "SUBCONTRACT", leadTimeDays: 1 }],
    };
    expect(() => parseMasterSnapshot(JSON.stringify(broken))).toThrow(/makeBuy/);
  });
});

describe("業務的な整合性検証（all-or-nothing）", () => {
  it("主キーが重複する入力を拒否する", () => {
    const broken = { ...CHAIR_PRESET, items: [...CHAIR_PRESET.items, CHAIR_PRESET.items[0]] };
    expect(() => parseMasterSnapshot(JSON.stringify(broken))).toThrow(/品目コードが重複/);
  });

  it("循環したBOMを含む入力を拒否する（登録時チェックの抜け道を塞ぐ）", () => {
    const broken = {
      ...CHAIR_PRESET,
      bom: [...CHAIR_PRESET.bom, { parentItemId: ITEM_IDS.SA_SEAT, childItemId: ITEM_IDS.FG_CHAIR, qtyPer: 1 }],
    };
    expect(() => parseMasterSnapshot(JSON.stringify(broken))).toThrow(/循環/);
  });

  it("工順が0行の内製品目を含む入力を拒否する", () => {
    const broken = {
      ...CHAIR_PRESET,
      routingSteps: CHAIR_PRESET.routingSteps.filter((s) => s.itemId !== ITEM_IDS.SA_SEAT),
    };
    expect(() => parseMasterSnapshot(JSON.stringify(broken))).toThrow(/工順が1行もありません/);
  });

  it("MasterIOErrorとして投げる（呼び出し側が画面に出せる）", () => {
    expect(() => parseMasterSnapshot("{")).toThrow(MasterIOError);
  });
});

describe("reducer経由の取り込み", () => {
  it("MASTER_IMPORTはマスタを差し替え、全トランザクションを初期化する", () => {
    let state = createInitialState();
    state = simulationReducer(state, {
      type: "SO_CREATE",
      payload: { customerId: "CUST-A", itemId: ITEM_IDS.FG_CHAIR, qty: 10, requestDay: 15 },
    });
    state = simulationReducer(state, { type: "ADVANCE_DAY" });
    expect(state.soLines).toHaveLength(1);

    const snapshot = parseMasterSnapshot(
      JSON.stringify({
        version: 1,
        items: [
          { itemId: "P-1", name: "単品", makeBuy: "MAKE", leadTimeDays: 1, salesPrice: 100 },
        ],
        bom: [],
        routingSteps: [{ itemId: "P-1", stepNo: 10, workCenter: "WC-1", stdTimeMin: 6 }],
        workCenters: [{ workCenter: "WC-1", ratePerHour: 1200 }],
        customers: [{ customerId: "C-1", name: "得意先1" }],
        suppliers: [],
      }),
    );

    state = simulationReducer(state, { type: "MASTER_IMPORT", payload: { snapshot } });
    expect(state.items).toHaveLength(1);
    expect(state.soLines).toHaveLength(0);
    expect(state.day).toBe(0);
    expect(state.eventLog.at(-1)?.message).toContain("マスタをインポートした");
  });

  it("MASTER_RESET_TO_PRESETで木製イスへ戻せる", () => {
    let state = createInitialState();
    state = simulationReducer(state, { type: "MASTER_DELETE_BOM_LINE", payload: { parentItemId: ITEM_IDS.FG_CHAIR, childItemId: ITEM_IDS.PT_SCREW } });
    expect(state.bom).toHaveLength(3);

    state = simulationReducer(state, { type: "MASTER_RESET_TO_PRESET" });
    expect(state.bom).toHaveLength(4);
    expect(state.items).toHaveLength(5);
  });

  it("取り込めないスナップショットはエラーログに残り、状態は変わらない", () => {
    const state = createInitialState();
    const next = simulationReducer(state, {
      type: "MASTER_IMPORT",
      payload: {
        snapshot: {
          version: 1,
          items: [{ itemId: "P-1", name: "工順なし", makeBuy: "MAKE", leadTimeDays: 1 }],
          bom: [],
          routingSteps: [],
          workCenters: [],
          customers: [],
          suppliers: [],
        },
      },
    });
    expect(next.items).toHaveLength(5);
    expect(next.eventLog.at(-1)?.message).toMatch(/^\[エラー\]/);
  });
});
