// 受注登録・納期回答・取消（v5-spec.md §6.1、design.md EXT-2・EXT-3・EXT-7）
import type { SimulationState } from "../types";
import { traceFromOrder } from "./pegging";

export class SalesOrderError extends Error {}

export interface CreateSalesOrderInput {
  customerId: string;
  itemId: string;
  qty: number;
  requestDay: number;
}

/** 受注登録（v5-spec.md UC-04）。design.md §4により1受注＝1明細を同時に生成する */
export function createSalesOrder(state: SimulationState, input: CreateSalesOrderInput, day: number): string {
  // マスタが自由に編集できるようになったため、画面の選択値が削除済みの品目・得意先を
  // 指したまま送られてくる可能性がある（design.md EXT-25）
  if (!state.customers.some((c) => c.customerId === input.customerId)) {
    throw new SalesOrderError(`得意先が見つかりません: ${input.customerId}`);
  }
  if (!state.items.some((i) => i.itemId === input.itemId)) {
    throw new SalesOrderError(`品目が見つかりません: ${input.itemId}`);
  }
  if (input.qty <= 0) throw new SalesOrderError("数量は1以上で入力してください");

  const soNo = `SO-${String(state.nextSoSeq).padStart(3, "0")}`;
  state.nextSoSeq += 1;

  state.salesOrders.push({ soNo, customerId: input.customerId, orderedDay: day });
  state.soLines.push({
    soNo,
    lineNo: 1,
    itemId: input.itemId,
    qty: input.qty,
    requestDay: input.requestDay,
    confirmDay: null,
    shippedQty: 0,
    status: "RECEIVED",
  });

  return soNo;
}

/**
 * 納期回答の確定（v5-spec.md UC-05）。design.md EXT-7により、MRP試算に基づく自動計算はせず
 * 呼び出し側が確定した値（多くの場合は希望納期そのまま）をそのまま登録する。
 */
export function confirmDelivery(state: SimulationState, soNo: string, confirmDay: number): void {
  const line = state.soLines.find((l) => l.soNo === soNo && l.lineNo === 1);
  if (!line) throw new SalesOrderError(`受注明細が見つかりません: ${soNo}`);
  if (line.status !== "RECEIVED") {
    throw new SalesOrderError(`受付（RECEIVED）以外は納期回答できません: ${soNo}`);
  }
  line.confirmDay = confirmDay;
  line.status = "CONFIRMED";
}

/**
 * 受注取消（v5-spec.md §6.1、design.md EXT-2・EXT-3）。
 * ペグ先に1件でも実績（着手実績・入荷実績）があれば取消不可（EXT-3）。
 * 取消が成立する場合、ペグ先の未実績なMFG_ORDER/PURCHASE_ORDERを連鎖的にCANCELEDにする（EXT-2）。
 */
export function cancelSalesOrder(state: SimulationState, soNo: string): void {
  const line = state.soLines.find((l) => l.soNo === soNo && l.lineNo === 1);
  if (!line) throw new SalesOrderError(`受注明細が見つかりません: ${soNo}`);
  if (line.status === "CLOSED" || line.status === "CANCELED") {
    throw new SalesOrderError(`完了（CLOSED）・取消済（CANCELED）は取消できません: ${soNo}`);
  }
  if (line.shippedQty > 0) {
    throw new SalesOrderError(`出荷実績がある受注は取消できません: ${soNo}`);
  }

  const pegged = traceFromOrder(state, soNo, 1);
  const hasActuals =
    pegged.mfgOrders.some((mo) =>
      state.workInstructions.some((wi) => wi.moNo === mo.moNo && wi.actualStartDay != null),
    ) || pegged.purchaseOrders.some((po) => po.receivedQty > 0);
  if (hasActuals) {
    throw new SalesOrderError(`着手・入荷実績のあるオーダに紐づく受注は取消できません: ${soNo}`);
  }

  for (const mo of pegged.mfgOrders) {
    if (mo.status !== "DONE" && mo.status !== "CANCELED") mo.status = "CANCELED";
  }
  for (const po of pegged.purchaseOrders) {
    if (po.status !== "CLOSED" && po.status !== "CANCELED") po.status = "CANCELED";
  }
  line.status = "CANCELED";
}
