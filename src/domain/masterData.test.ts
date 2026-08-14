// マスタCRUD（v5-spec.md §3.7、design.md EXT-19〜EXT-24）
import { describe, expect, it } from "vitest";
import { ITEM_IDS, SUPPLIER_IDS, WORK_CENTERS } from "../data/masterData";
import {
  addBomLine,
  addItem,
  addPartner,
  addRoutingStep,
  addWorkCenter,
  deleteBomLine,
  deleteItem,
  deletePartner,
  deleteRoutingStep,
  deleteWorkCenter,
  MasterDataError,
  updateItem,
  updateRoutingStep,
} from "./masterData";
import { createTestState } from "./testUtils";
import type { SimulationState } from "../types";

function withOpenMfgOrder(state: SimulationState, itemId: string): void {
  state.mfgOrders.push({
    moNo: "MO-001",
    ploNo: "PLO-001",
    pegTo: "SO-001-1",
    itemId,
    planQty: 10,
    goodQty: 0,
    scrapQty: 0,
    startDay: 0,
    dueDay: 5,
    status: "RELEASED",
  });
}

describe("品目のCRUD", () => {
  it("内製品目を追加でき、工順が必要な旨が業務メッセージに出る", () => {
    const state = createTestState();
    const message = addItem(state, { itemId: "FG-200", name: "木製テーブル", makeBuy: "MAKE", leadTimeDays: 3 });
    expect(state.items).toHaveLength(6);
    expect(message).toContain("工順を1行以上");
  });

  it("品目コードの重複・空文字は拒否する", () => {
    const state = createTestState();
    expect(() => addItem(state, { itemId: ITEM_IDS.FG_CHAIR, name: "重複", makeBuy: "MAKE", leadTimeDays: 1 })).toThrow(
      MasterDataError,
    );
    expect(() => addItem(state, { itemId: "  ", name: "空", makeBuy: "MAKE", leadTimeDays: 1 })).toThrow(MasterDataError);
  });

  it("購買品目は既定仕入先が必須（v5仕様書がITEM-PARTNERの対応を欠く点への追加決定 EXT-9の帰結）", () => {
    const state = createTestState();
    expect(() => addItem(state, { itemId: "PT-600", name: "座金", makeBuy: "BUY", leadTimeDays: 2 })).toThrow(
      /既定仕入先/,
    );
    expect(() =>
      addItem(state, {
        itemId: "PT-600",
        name: "座金",
        makeBuy: "BUY",
        leadTimeDays: 2,
        defaultSupplierId: "SUP-NOT-EXIST",
      }),
    ).toThrow(/仕入先が見つかりません/);

    addItem(state, {
      itemId: "PT-600",
      name: "座金",
      makeBuy: "BUY",
      leadTimeDays: 2,
      defaultSupplierId: SUPPLIER_IDS.PT_SCREW,
      purchasePrice: 5,
    });
    expect(state.items.find((i) => i.itemId === "PT-600")?.defaultSupplierId).toBe(SUPPLIER_IDS.PT_SCREW);
  });

  it("スカラー値はpatchで部分更新できる", () => {
    const state = createTestState();
    updateItem(state, ITEM_IDS.RM_BOARD, { leadTimeDays: 3, purchasePrice: 900 });
    const item = state.items.find((i) => i.itemId === ITEM_IDS.RM_BOARD)!;
    expect(item.leadTimeDays).toBe(3);
    expect(item.purchasePrice).toBe(900);
    expect(item.name).toBe("木板");
  });

  it("内製品目に購入単価・既定仕入先は設定できない", () => {
    const state = createTestState();
    expect(() => updateItem(state, ITEM_IDS.FG_CHAIR, { purchasePrice: 100 })).toThrow(MasterDataError);
    expect(() => updateItem(state, ITEM_IDS.FG_CHAIR, { defaultSupplierId: SUPPLIER_IDS.PT_LEG })).toThrow(
      MasterDataError,
    );
  });

  it("区分の変更はBOM子行・工順が残っている間は拒否する（design.md EXT-20）", () => {
    const state = createTestState();
    expect(() => updateItem(state, ITEM_IDS.FG_CHAIR, { makeBuy: "BUY" })).toThrow(/BOM子行/);

    // 子行と工順を消せばBUYへ変更できる
    for (const line of state.bom.filter((b) => b.parentItemId === ITEM_IDS.FG_CHAIR)) {
      deleteBomLine(state, line.parentItemId, line.childItemId);
    }
    expect(() => updateItem(state, ITEM_IDS.FG_CHAIR, { makeBuy: "BUY" })).toThrow(/工順/);

    for (const step of state.routingSteps.filter((s) => s.itemId === ITEM_IDS.FG_CHAIR)) {
      deleteRoutingStep(state, step.itemId, step.stepNo);
    }
    addPartner(state, "SUPPLIER", "SUP-FG", "完成品仕入先");
    updateItem(state, ITEM_IDS.FG_CHAIR, { makeBuy: "BUY", defaultSupplierId: "SUP-FG" });
    expect(state.items.find((i) => i.itemId === ITEM_IDS.FG_CHAIR)?.makeBuy).toBe("BUY");
  });

  it("既定仕入先を指定せずに購買へ変更しようとすると、何も変更せずに拒否する", () => {
    const state = createTestState();
    for (const line of state.bom.filter((b) => b.parentItemId === ITEM_IDS.SA_SEAT)) {
      deleteBomLine(state, line.parentItemId, line.childItemId);
    }
    for (const step of state.routingSteps.filter((s) => s.itemId === ITEM_IDS.SA_SEAT)) {
      deleteRoutingStep(state, step.itemId, step.stepNo);
    }

    expect(() => updateItem(state, ITEM_IDS.SA_SEAT, { makeBuy: "BUY" })).toThrow(/既定仕入先/);
    // 区分は内製のまま。中途半端な「既定仕入先の無い購買品目」を残さない
    expect(state.items.find((i) => i.itemId === ITEM_IDS.SA_SEAT)?.makeBuy).toBe("MAKE");

    updateItem(state, ITEM_IDS.SA_SEAT, { makeBuy: "BUY", defaultSupplierId: SUPPLIER_IDS.RM_BOARD });
    expect(state.items.find((i) => i.itemId === ITEM_IDS.SA_SEAT)?.makeBuy).toBe("BUY");
  });

  it("未完了の製造オーダがある品目は区分を変更できない", () => {
    const state = createTestState();
    withOpenMfgOrder(state, ITEM_IDS.SA_SEAT);
    expect(() => updateItem(state, ITEM_IDS.SA_SEAT, { makeBuy: "BUY" })).toThrow(/未完了の製造オーダ/);
  });

  it("参照されている品目は削除できず、参照が無くなれば削除できる", () => {
    const state = createTestState();
    expect(() => deleteItem(state, ITEM_IDS.PT_SCREW)).toThrow(/参照されているため削除できません/);

    deleteBomLine(state, ITEM_IDS.FG_CHAIR, ITEM_IDS.PT_SCREW);
    deleteItem(state, ITEM_IDS.PT_SCREW);
    expect(state.items.some((i) => i.itemId === ITEM_IDS.PT_SCREW)).toBe(false);
  });
});

describe("BOMのCRUD", () => {
  it("循環する構成は登録時に拒否する（v5-spec.md §3.7 最小機能5）", () => {
    const state = createTestState();
    // FG-100 -> SA-200 -> RM-300 の下に FG-100 をぶら下げようとする
    expect(() => addBomLine(state, { parentItemId: ITEM_IDS.SA_SEAT, childItemId: ITEM_IDS.FG_CHAIR, qtyPer: 1 })).toThrow(
      /循環/,
    );
    // 自己参照も同様
    expect(() => addBomLine(state, { parentItemId: ITEM_IDS.FG_CHAIR, childItemId: ITEM_IDS.FG_CHAIR, qtyPer: 1 })).toThrow(
      /循環/,
    );
  });

  it("BOMの親にできるのは内製品目だけ", () => {
    const state = createTestState();
    expect(() => addBomLine(state, { parentItemId: ITEM_IDS.PT_LEG, childItemId: ITEM_IDS.PT_SCREW, qtyPer: 1 })).toThrow(
      /内製品目だけ/,
    );
  });

  it("同じ親子の重複行・員数0は拒否する", () => {
    const state = createTestState();
    expect(() => addBomLine(state, { parentItemId: ITEM_IDS.FG_CHAIR, childItemId: ITEM_IDS.PT_LEG, qtyPer: 2 })).toThrow(
      /既にあります/,
    );
    expect(() => addBomLine(state, { parentItemId: ITEM_IDS.SA_SEAT, childItemId: ITEM_IDS.PT_LEG, qtyPer: 0 })).toThrow(
      /員数/,
    );
  });

  it("仕掛中オーダがある品目のBOM編集は禁止せず警告する（design.md EXT-23）", () => {
    const state = createTestState();
    withOpenMfgOrder(state, ITEM_IDS.FG_CHAIR);
    const message = deleteBomLine(state, ITEM_IDS.FG_CHAIR, ITEM_IDS.PT_SCREW);
    expect(message).toContain("［注意］");
    expect(state.bom.some((b) => b.childItemId === ITEM_IDS.PT_SCREW)).toBe(false);
  });
});

describe("工順（BOP）のCRUD", () => {
  it("内製品目にのみ工順を持てる", () => {
    const state = createTestState();
    expect(() =>
      addRoutingStep(state, { itemId: ITEM_IDS.PT_LEG, stepNo: 10, workCenter: WORK_CENTERS.CUT, stdTimeMin: 5 }),
    ).toThrow(/内製品目だけ/);
  });

  it("存在しない作業区・重複する工程順序は拒否する", () => {
    const state = createTestState();
    expect(() =>
      addRoutingStep(state, { itemId: ITEM_IDS.SA_SEAT, stepNo: 20, workCenter: "WC-NOT-EXIST", stdTimeMin: 5 }),
    ).toThrow(/作業区が見つかりません/);
    expect(() =>
      addRoutingStep(state, { itemId: ITEM_IDS.SA_SEAT, stepNo: 10, workCenter: WORK_CENTERS.ASM, stdTimeMin: 5 }),
    ).toThrow(/同じ工程順序/);
  });

  it("未完了オーダがある品目は工順の構造変更を禁止し、標準時間・作業区の変更は許可する（design.md EXT-20）", () => {
    const state = createTestState();
    withOpenMfgOrder(state, ITEM_IDS.FG_CHAIR);

    expect(() =>
      addRoutingStep(state, { itemId: ITEM_IDS.FG_CHAIR, stepNo: 30, workCenter: WORK_CENTERS.CUT, stdTimeMin: 5 }),
    ).toThrow(/工順の追加・削除はできません/);
    expect(() => deleteRoutingStep(state, ITEM_IDS.FG_CHAIR, 20)).toThrow(/工順の追加・削除はできません/);

    updateRoutingStep(state, ITEM_IDS.FG_CHAIR, 20, { stdTimeMin: 15, workCenter: WORK_CENTERS.CUT });
    const step = state.routingSteps.find((s) => s.itemId === ITEM_IDS.FG_CHAIR && s.stepNo === 20)!;
    expect(step.stdTimeMin).toBe(15);
    expect(step.workCenter).toBe(WORK_CENTERS.CUT);
  });

  it("最後の1行を消すと、完了できなくなる旨を業務メッセージで知らせる", () => {
    const state = createTestState();
    const message = deleteRoutingStep(state, ITEM_IDS.SA_SEAT, 10);
    expect(message).toContain("工順が0行になりました");
  });
});

describe("作業区・取引先のCRUD", () => {
  it("作業区を追加でき、工順から参照されている作業区は削除できない", () => {
    const state = createTestState();
    addWorkCenter(state, { workCenter: "WC-PNT", ratePerHour: 1800 });
    expect(state.workCenters).toHaveLength(4);

    expect(() => deleteWorkCenter(state, WORK_CENTERS.CUT)).toThrow(/参照されているため削除できません/);
    deleteWorkCenter(state, "WC-PNT");
    expect(state.workCenters).toHaveLength(3);
  });

  it("得意先・仕入先を追加でき、参照中は削除できない", () => {
    const state = createTestState();
    addPartner(state, "CUSTOMER", "CUST-C", "得意先C");
    expect(state.customers).toHaveLength(3);
    deletePartner(state, "CUSTOMER", "CUST-C");
    expect(state.customers).toHaveLength(2);

    // 仕入先RM-300は品目の既定仕入先として参照されている
    expect(() => deletePartner(state, "SUPPLIER", SUPPLIER_IDS.RM_BOARD)).toThrow(/参照されているため削除できません/);
  });

  it("取引先番号の重複は拒否する", () => {
    const state = createTestState();
    expect(() => addPartner(state, "CUSTOMER", "CUST-A", "重複")).toThrow(/重複/);
    expect(() => addPartner(state, "SUPPLIER", SUPPLIER_IDS.PT_LEG, "重複")).toThrow(/重複/);
  });
});
