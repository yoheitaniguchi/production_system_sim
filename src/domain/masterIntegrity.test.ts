// マスタ整合性の検証（v5-spec.md §3.7 最小機能5、design.md EXT-19〜EXT-22）
import { describe, expect, it } from "vitest";
import { ITEM_IDS, SUPPLIER_IDS, WORK_CENTERS } from "../data/masterData";
import {
  findBomCycles,
  findCustomerReferences,
  findItemReferences,
  findSupplierReferences,
  findWorkCenterReferences,
  openMfgOrdersOf,
  reachesDownward,
  validateMaster,
  wouldCreateBomCycle,
} from "./masterIntegrity";
import { createTestState } from "./testUtils";
import type { BomLine } from "../types";

describe("BOM循環参照チェック（v5-spec.md §3.7 最小機能5）", () => {
  const chain: BomLine[] = [
    { parentItemId: "A", childItemId: "B", qtyPer: 1 },
    { parentItemId: "B", childItemId: "C", qtyPer: 1 },
  ];

  it("自己参照（A -> A）は循環と判定する", () => {
    expect(wouldCreateBomCycle(chain, "A", "A")).toBe(true);
  });

  it("祖先を子にする（C -> A）と循環になる", () => {
    expect(wouldCreateBomCycle(chain, "C", "A")).toBe(true);
  });

  it("孫を直接の子にする（A -> C）のは循環ではない（重複構成だが閉路にはならない）", () => {
    expect(wouldCreateBomCycle(chain, "A", "C")).toBe(false);
  });

  it("無関係な品目の追加は循環にならない", () => {
    expect(wouldCreateBomCycle(chain, "A", "D")).toBe(false);
  });

  it("reachesDownwardは既存BOMが循環していても停止する", () => {
    const cyclic: BomLine[] = [
      { parentItemId: "A", childItemId: "B", qtyPer: 1 },
      { parentItemId: "B", childItemId: "A", qtyPer: 1 },
    ];
    expect(reachesDownward(cyclic, "A", "Z")).toBe(false);
  });

  it("findBomCyclesは循環している品目を列挙する（インポートの一括検査用）", () => {
    const cyclic: BomLine[] = [
      { parentItemId: "A", childItemId: "B", qtyPer: 1 },
      { parentItemId: "B", childItemId: "C", qtyPer: 1 },
      { parentItemId: "C", childItemId: "A", qtyPer: 1 },
      { parentItemId: "X", childItemId: "Y", qtyPer: 1 },
    ];
    expect(findBomCycles(cyclic).length).toBeGreaterThan(0);
    expect(findBomCycles(chain)).toEqual([]);
  });
});

describe("削除ガード（design.md EXT-21：参照中は削除禁止）", () => {
  it("プリセットの品目はBOM・工順から参照されているため削除できない", () => {
    const state = createTestState();
    expect(findItemReferences(state, ITEM_IDS.FG_CHAIR)).not.toEqual([]);
    expect(findItemReferences(state, ITEM_IDS.RM_BOARD)).not.toEqual([]);
  });

  it("どこからも参照されていない品目は削除できる", () => {
    const state = createTestState();
    state.items.push({ itemId: "NEW-1", name: "新品目", makeBuy: "MAKE", leadTimeDays: 1 });
    expect(findItemReferences(state, "NEW-1")).toEqual([]);
  });

  it("残高0・引当0のSTOCK空行は削除の妨げにならない", () => {
    const state = createTestState();
    state.items.push({ itemId: "NEW-1", name: "新品目", makeBuy: "MAKE", leadTimeDays: 1 });
    state.stocks.push({ itemId: "NEW-1", onHand: 0, allocated: 0 });
    expect(findItemReferences(state, "NEW-1")).toEqual([]);

    state.stocks[state.stocks.length - 1].onHand = 5;
    expect(findItemReferences(state, "NEW-1")).not.toEqual([]);
  });

  it("作業区・仕入先・得意先の参照も検出する", () => {
    const state = createTestState();
    expect(findWorkCenterReferences(state, WORK_CENTERS.CUT)).not.toEqual([]);
    expect(findSupplierReferences(state, SUPPLIER_IDS.RM_BOARD)).not.toEqual([]);
    expect(findCustomerReferences(state, "CUST-A")).toEqual([]);

    state.salesOrders.push({ soNo: "SO-001", customerId: "CUST-A", orderedDay: 0 });
    expect(findCustomerReferences(state, "CUST-A")).not.toEqual([]);
  });

  it("openMfgOrdersOfは未完了（DONE/CANCELED以外）の製造オーダのみ返す", () => {
    const state = createTestState();
    const base = {
      ploNo: "PLO-001",
      pegTo: "SO-001-1",
      itemId: ITEM_IDS.FG_CHAIR,
      planQty: 10,
      goodQty: 0,
      scrapQty: 0,
      startDay: 0,
      dueDay: 5,
      bomLevel: 0,
    };
    state.mfgOrders.push({ ...base, moNo: "MO-001", status: "DONE" });
    expect(openMfgOrdersOf(state, ITEM_IDS.FG_CHAIR)).toEqual([]);

    state.mfgOrders.push({ ...base, moNo: "MO-002", status: "WIP" });
    expect(openMfgOrdersOf(state, ITEM_IDS.FG_CHAIR)).toEqual(["MO-002"]);
  });
});

describe("マスタ健全性チェック（design.md EXT-22）", () => {
  it("プリセットは不整合ゼロ", () => {
    expect(validateMaster(createTestState())).toEqual([]);
  });

  it("工順が0行の内製品目をエラーとして検出する", () => {
    const state = createTestState();
    state.routingSteps = state.routingSteps.filter((s) => s.itemId !== ITEM_IDS.SA_SEAT);
    const issues = validateMaster(state);
    expect(issues.some((i) => i.subject === ITEM_IDS.SA_SEAT && i.message.includes("工順が1行もありません"))).toBe(true);
  });

  it("既定仕入先が未設定の購買品目をエラーとして検出する", () => {
    const state = createTestState();
    const item = state.items.find((i) => i.itemId === ITEM_IDS.PT_LEG)!;
    item.defaultSupplierId = undefined;
    const issues = validateMaster(state);
    expect(issues.some((i) => i.subject === ITEM_IDS.PT_LEG && i.message.includes("既定仕入先"))).toBe(true);
  });

  it("存在しない作業区を参照する工順をエラーとして検出する", () => {
    const state = createTestState();
    state.routingSteps[0].workCenter = "WC-NOT-EXIST";
    const issues = validateMaster(state);
    expect(issues.some((i) => i.subject === "WC-NOT-EXIST")).toBe(true);
  });

  it("購入単価の無い購買品目は警告（エラーではない）", () => {
    const state = createTestState();
    const item = state.items.find((i) => i.itemId === ITEM_IDS.PT_SCREW)!;
    item.purchasePrice = undefined;
    const issue = validateMaster(state).find((i) => i.subject === ITEM_IDS.PT_SCREW);
    expect(issue?.level).toBe("警告");
  });
});
