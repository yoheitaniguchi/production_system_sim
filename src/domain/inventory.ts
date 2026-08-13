// 棚卸調整（v5-spec.md §3.5 UC-17）
import type { SimulationState } from "../types";

/** 棚卸調整。差異（符号付き）をそのままonHandに反映し、ADJトランザクションを起票する */
export function adjustStock(state: SimulationState, itemId: string, deltaQty: number, day: number): void {
  const stock = state.stocks.find((s) => s.itemId === itemId);
  if (stock) {
    stock.onHand += deltaQty;
  } else {
    state.stocks.push({ itemId, onHand: deltaQty, allocated: 0 });
  }

  state.stockTxns.push({
    txnId: `TXN-${String(state.nextTxnSeq).padStart(4, "0")}`,
    itemId,
    txnType: "ADJ",
    qty: deltaQty,
    txnDay: day,
    refNo: "ADJ",
  });
  state.nextTxnSeq += 1;
}
