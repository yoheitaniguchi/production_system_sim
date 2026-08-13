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
  it("品目5、BOM行4、工順3行を持つ（v5-spec.md §1.1）", () => {
    expect(initialItems).toHaveLength(5);
    expect(initialBom).toHaveLength(4);
    expect(initialRoutingSteps).toHaveLength(3);
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

  it("BUY品目それぞれに仕入先が1つ以上、顧客は複数受注演習のため2件以上存在する", () => {
    expect(initialSuppliers.length).toBeGreaterThanOrEqual(3);
    expect(initialCustomers.length).toBeGreaterThanOrEqual(2);
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
