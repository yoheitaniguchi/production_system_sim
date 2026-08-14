// 発注・仕入先納期回答・入荷計上（v5-spec.md §6.5、design.md EXT-4・DEV-3）
import type { SimulationState } from "../types";
import { createLot } from "./lot";

export class ProcurementError extends Error {}

/** 仕入先納期回答の登録（v5-spec.md UC-10） */
export function ackPurchaseOrder(state: SimulationState, poNo: string, confirmDay: number): void {
  const po = state.purchaseOrders.find((p) => p.poNo === poNo);
  if (!po) throw new ProcurementError(`購買オーダが見つかりません: ${poNo}`);
  if (po.status !== "ORDERED") {
    throw new ProcurementError(`発注済（ORDERED）以外は納期回答できません: ${poNo}`);
  }
  po.confirmDay = confirmDay;
  po.status = "ACKED";
}

/**
 * 入荷計上（v5-spec.md UC-11）。design.md DEV-3により分割入荷は扱わず、注文残を一括で入荷させる。
 * design.md EXT-4：現在日が（回答納期 ?? 希望納期）に達していなければ実行できない。
 */
export function receivePurchaseOrder(state: SimulationState, poNo: string, day: number): void {
  const po = state.purchaseOrders.find((p) => p.poNo === poNo);
  if (!po) throw new ProcurementError(`購買オーダが見つかりません: ${poNo}`);
  if (po.status !== "ACKED" && po.status !== "PARTIAL") {
    throw new ProcurementError(`納期回答済（ACKED）以外は入荷計上できません: ${poNo}`);
  }
  const promisedDay = po.confirmDay ?? po.dueDay;
  if (day < promisedDay) {
    throw new ProcurementError(`入荷予定日（${promisedDay}）より前には入荷計上できません: ${poNo}`);
  }

  const receiveQty = po.qty - po.receivedQty;
  po.receivedQty += receiveQty;
  po.status = "CLOSED";

  const stock = state.stocks.find((s) => s.itemId === po.itemId);
  if (stock) {
    stock.onHand += receiveQty;
  } else {
    state.stocks.push({ itemId: po.itemId, onHand: receiveQty, allocated: 0 });
  }

  // 入庫のたびに1ロット採番する（v5-spec.md §11.3 Phase 2-B）
  const lot = createLot(state, po.itemId, receiveQty, day, po.poNo);

  state.stockTxns.push({
    txnId: `TXN-${String(state.nextTxnSeq).padStart(4, "0")}`,
    itemId: po.itemId,
    txnType: "RCV",
    qty: receiveQty,
    txnDay: day,
    refNo: po.poNo,
    lotNo: lot.lotNo,
  });
  state.nextTxnSeq += 1;
}
