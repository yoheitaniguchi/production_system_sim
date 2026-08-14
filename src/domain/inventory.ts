// 棚卸調整（v5-spec.md §3.5 UC-17）
import type { SimulationState } from "../types";
import { consumeFifo, createLot } from "./lot";

/**
 * 棚卸調整。差異（符号付き）をそのままonHandに反映し、ADJトランザクションを起票する。
 * プラス方向は新規ロットを1件採番し、マイナス方向はFIFOでロットを消費する
 * （v5-spec.md §11.3 Phase 2-B。複数ロットにまたがる場合は分割してTXNを起票する）。
 */
export function adjustStock(state: SimulationState, itemId: string, deltaQty: number, day: number): void {
  const stock = state.stocks.find((s) => s.itemId === itemId);
  if (stock) {
    stock.onHand += deltaQty;
  } else {
    state.stocks.push({ itemId, onHand: deltaQty, allocated: 0 });
  }

  if (deltaQty > 0) {
    const lot = createLot(state, itemId, deltaQty, day, "ADJ");
    state.stockTxns.push({
      txnId: `TXN-${String(state.nextTxnSeq).padStart(4, "0")}`,
      itemId,
      txnType: "ADJ",
      qty: deltaQty,
      txnDay: day,
      refNo: "ADJ",
      lotNo: lot.lotNo,
    });
    state.nextTxnSeq += 1;
  } else if (deltaQty < 0) {
    for (const consumed of consumeFifo(state, itemId, -deltaQty)) {
      state.stockTxns.push({
        txnId: `TXN-${String(state.nextTxnSeq).padStart(4, "0")}`,
        itemId,
        txnType: "ADJ",
        qty: -consumed.qty,
        txnDay: day,
        refNo: "ADJ",
        lotNo: consumed.lotNo,
      });
      state.nextTxnSeq += 1;
    }
  }
}
