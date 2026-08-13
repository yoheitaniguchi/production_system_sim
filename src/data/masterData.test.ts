import { describe, expect, it } from "vitest";
import {
  initialBom,
  initialCustomers,
  initialItems,
  initialRoutingSteps,
  initialSuppliers,
  ITEM_IDS,
} from "./masterData";

describe("初期マスタデータ（v5-spec.md §1.1：木製イス）", () => {
  it("TC-01: 品目5・BOM行4・工順3行。取引先は顧客2件+仕入先3件（design.md DEV-1によりPARTNER3行ではなく分離）", () => {
    // v5-spec.md TC-01は「ITEM 5行 / BOM_LINE 4行 / ROUTING_STEP 3行 / PARTNER 3行」を期待するが、
    // design.md DEV-1によりPARTNERはCustomer/Supplierに分離しているため、本実装では
    // 「顧客2件（複数受注演習用）＋仕入先3件（BUY品目ごとに1件）」の計5件が対応する期待値になる
    expect(initialItems).toHaveLength(5);
    expect(initialBom).toHaveLength(4);
    expect(initialRoutingSteps).toHaveLength(3);
    expect(initialCustomers).toHaveLength(2);
    expect(initialSuppliers).toHaveLength(3);
  });

  it("BOMの親子はすべて実在する品目を参照する", () => {
    const itemIds = new Set(initialItems.map((item) => item.itemId));
    for (const line of initialBom) {
      expect(itemIds.has(line.parentItemId)).toBe(true);
      expect(itemIds.has(line.childItemId)).toBe(true);
    }
  });

  it("BOMに循環参照が無い（v5-spec.md §3.7）", () => {
    const childrenOf = new Map<string, string[]>();
    for (const line of initialBom) {
      childrenOf.set(line.parentItemId, [...(childrenOf.get(line.parentItemId) ?? []), line.childItemId]);
    }
    const visit = (itemId: string, ancestors: Set<string>) => {
      expect(ancestors.has(itemId)).toBe(false);
      const nextAncestors = new Set(ancestors).add(itemId);
      for (const child of childrenOf.get(itemId) ?? []) {
        visit(child, nextAncestors);
      }
    };
    for (const item of initialItems) {
      visit(item.itemId, new Set());
    }
  });

  it("工順を持つのはMAKE品目（FG-100・SA-200）のみ", () => {
    const makeItemIds = new Set(
      initialItems.filter((item) => item.makeBuy === "MAKE").map((item) => item.itemId),
    );
    for (const step of initialRoutingSteps) {
      expect(makeItemIds.has(step.itemId)).toBe(true);
    }
  });

  it("木製イスの完成には座面ASSY x1・脚 x4・ネジ x8・木板(座面経由) x1が必要", () => {
    const qtyPer = (parent: string, child: string) =>
      initialBom.find((line) => line.parentItemId === parent && line.childItemId === child)?.qtyPer;
    expect(qtyPer(ITEM_IDS.FG_CHAIR, ITEM_IDS.SA_SEAT)).toBe(1);
    expect(qtyPer(ITEM_IDS.FG_CHAIR, ITEM_IDS.PT_LEG)).toBe(4);
    expect(qtyPer(ITEM_IDS.FG_CHAIR, ITEM_IDS.PT_SCREW)).toBe(8);
    expect(qtyPer(ITEM_IDS.SA_SEAT, ITEM_IDS.RM_BOARD)).toBe(1);
  });
});
