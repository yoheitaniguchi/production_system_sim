// 引当・出荷可否判定・出荷実績（v5-spec.md §7.2、design.md EXT-5・DEV-3）
import type { SimulationState } from "../types";
import { consumeFifo } from "./lot";

export class ShipmentError extends Error {}

/** 出荷可能量（v5-spec.md §7.2 shippableQty）。現在庫 − 引当済 */
export function shippableQty(state: SimulationState, itemId: string): number {
  const stock = state.stocks.find((s) => s.itemId === itemId);
  if (!stock) return 0;
  return stock.onHand - stock.allocated;
}

/**
 * 出荷指示（引当）（v5-spec.md UC-18）。design.md DEV-3により、受注残数量を一括で引き当てる
 * （分割出荷の数量指定はしない）。
 */
export function allocateShipment(state: SimulationState, soNo: string, lineNo: number, day: number): void {
  const line = state.soLines.find((l) => l.soNo === soNo && l.lineNo === lineNo);
  if (!line) throw new ShipmentError(`受注明細が見つかりません: ${soNo}-${lineNo}`);
  if (line.status !== "CONFIRMED" && line.status !== "PARTIAL") {
    throw new ShipmentError(`納期回答済（CONFIRMED）以降でなければ引当できません: ${soNo}-${lineNo}`);
  }

  const remaining = line.qty - line.shippedQty;
  const available = shippableQty(state, line.itemId);
  if (available <= 0) {
    throw new ShipmentError(`出荷可能量がありません: ${line.itemId}`);
  }
  // design.md DEV-3：数量入力は行わず、受注残と出荷可能量の少ない方を自動的に一括で引き当てる
  // （不良等で受注残に満たない場合は、その時点の出荷可能量までの部分出荷になる。v5-spec.md TC-15参照）
  const qty = Math.min(remaining, available);

  const stock = state.stocks.find((s) => s.itemId === line.itemId);
  if (stock) stock.allocated += qty;

  state.shipments.push({
    shipNo: `SHIP-${String(state.nextShipSeq).padStart(3, "0")}`,
    soNo,
    lineNo,
    qty,
    planDay: day,
    actualDay: null,
    status: "ALLOCATED",
  });
  state.nextShipSeq += 1;
}

/** 出荷実績登録（v5-spec.md UC-19）。design.md EXT-5により日付ガードは設けない */
export function shipOut(state: SimulationState, shipNo: string, day: number): void {
  const shipment = state.shipments.find((s) => s.shipNo === shipNo);
  if (!shipment) throw new ShipmentError(`出荷指示が見つかりません: ${shipNo}`);
  if (shipment.status !== "ALLOCATED") {
    throw new ShipmentError(`引当済（ALLOCATED）以外は出荷実績登録できません: ${shipNo}`);
  }

  const line = state.soLines.find((l) => l.soNo === shipment.soNo && l.lineNo === shipment.lineNo);
  if (!line) throw new ShipmentError(`受注明細が見つかりません: ${shipment.soNo}-${shipment.lineNo}`);

  const stock = state.stocks.find((s) => s.itemId === line.itemId);
  if (stock) {
    stock.onHand -= shipment.qty;
    stock.allocated -= shipment.qty;
  }

  // FIFOでロットを選択して消費する。複数ロットにまたがる場合は分割してTXNを起票する
  // （v5-spec.md §11.3 Phase 2-B）
  for (const consumed of consumeFifo(state, line.itemId, shipment.qty)) {
    state.stockTxns.push({
      txnId: `TXN-${String(state.nextTxnSeq).padStart(4, "0")}`,
      itemId: line.itemId,
      txnType: "SHP",
      qty: -consumed.qty,
      txnDay: day,
      refNo: shipment.shipNo,
      lotNo: consumed.lotNo,
    });
    state.nextTxnSeq += 1;
  }

  line.shippedQty += shipment.qty;
  line.status = line.shippedQty === line.qty ? "CLOSED" : "PARTIAL";
  shipment.status = "SHIPPED";
  shipment.actualDay = day;
}

/** 引当解除（v5-spec.md §6.6 SHIPMENT: ALLOCATED → CANCELED） */
export function cancelShipmentAllocation(state: SimulationState, shipNo: string): void {
  const shipment = state.shipments.find((s) => s.shipNo === shipNo);
  if (!shipment) throw new ShipmentError(`出荷指示が見つかりません: ${shipNo}`);
  if (shipment.status !== "ALLOCATED") {
    throw new ShipmentError(`引当済（ALLOCATED）以外は引当解除できません: ${shipNo}`);
  }
  const line = state.soLines.find((l) => l.soNo === shipment.soNo && l.lineNo === shipment.lineNo);
  const stock = line ? state.stocks.find((s) => s.itemId === line.itemId) : undefined;
  if (stock) stock.allocated -= shipment.qty;
  shipment.status = "CANCELED";
}
