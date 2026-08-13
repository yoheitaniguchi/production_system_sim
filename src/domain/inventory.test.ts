import { describe, expect, it } from "vitest";
import { ITEM_IDS } from "../data/masterData";
import { adjustStock } from "./inventory";
import { createTestState } from "./testUtils";

describe("adjustStock（v5-spec.md UC-17）", () => {
  it("在庫が無い品目でも新規に計上でき、ADJトランザクションが起票される", () => {
    const state = createTestState(0);
    adjustStock(state, ITEM_IDS.RM_BOARD, 3, 5);
    expect(state.stocks.find((s) => s.itemId === ITEM_IDS.RM_BOARD)?.onHand).toBe(3);
    expect(state.stockTxns[0]).toMatchObject({ txnType: "ADJ", qty: 3, itemId: ITEM_IDS.RM_BOARD, txnDay: 5 });
  });

  it("マイナス方向の調整もできる", () => {
    const state = createTestState(0);
    state.stocks.push({ itemId: ITEM_IDS.RM_BOARD, onHand: 10, allocated: 0 });
    adjustStock(state, ITEM_IDS.RM_BOARD, -2, 5);
    expect(state.stocks.find((s) => s.itemId === ITEM_IDS.RM_BOARD)?.onHand).toBe(8);
  });
});
