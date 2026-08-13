// ペギング追跡（v5-spec.md §7.4）
import type { MfgOrder, PurchaseOrder, SimulationState, StockTxn } from "../types";

/** "SO-001-1" 形式のペグキー（v5-spec.md §7.4） */
export function pegKey(soNo: string, lineNo: number): string {
  return `${soNo}-${lineNo}`;
}

export interface PeggedOrders {
  mfgOrders: MfgOrder[];
  purchaseOrders: PurchaseOrder[];
}

/**
 * pegTo鎖を1階層だけたどり、直接ペグしているMFG_ORDER/PURCHASE_ORDERを返す。
 * PLANNED_ORDERは確定時に削除されるため、ここでは確定後のオーダのみを対象にする。
 */
function findDirectlyPegged(state: SimulationState, keys: Set<string>): PeggedOrders {
  return {
    mfgOrders: state.mfgOrders.filter((mo) => keys.has(mo.pegTo)),
    purchaseOrders: state.purchaseOrders.filter((po) => keys.has(po.pegTo)),
  };
}

/**
 * 受注明細から辿れる全ての確定オーダ（MFG_ORDER・PURCHASE_ORDER）とその在庫トランザクションを返す。
 * v5-spec.md §7.4 traceFromOrder() のTypeScript実装。
 */
export function traceFromOrder(
  state: SimulationState,
  soNo: string,
  lineNo: number,
): { mfgOrders: MfgOrder[]; purchaseOrders: PurchaseOrder[]; stockTxns: StockTxn[] } {
  const mfgOrders: MfgOrder[] = [];
  const purchaseOrders: PurchaseOrder[] = [];

  let frontier = new Set([pegKey(soNo, lineNo)]);
  while (frontier.size > 0) {
    const hit = findDirectlyPegged(state, frontier);
    mfgOrders.push(...hit.mfgOrders);
    purchaseOrders.push(...hit.purchaseOrders);
    // 次の階層は「このオーダ自身の由来PLO番号（ploNo）」をpegToに持つオーダ（v5-spec.md §7.4）。
    // 自分の採番（moNo/poNo）ではない点に注意。
    frontier = new Set([...hit.mfgOrders.map((mo) => mo.ploNo), ...hit.purchaseOrders.map((po) => po.ploNo)]);
  }

  const orderNos = new Set([...mfgOrders.map((mo) => mo.moNo), ...purchaseOrders.map((po) => po.poNo)]);
  const stockTxns = state.stockTxns.filter((txn) => orderNos.has(txn.refNo));

  return { mfgOrders, purchaseOrders, stockTxns };
}

/**
 * pegTo鎖を、受注のペグキー（"SO-xxx-n"形式）に到達するまで遡る。PLANNED_ORDER（確定前）・
 * MFG_ORDER/PURCHASE_ORDER（確定後）のいずれの段階でも、各オーダが持つ「自身のploNo」を
 * 手がかりに1階層ずつ親へたどる（v5-spec.md §7.4）。
 */
export function resolveRootPegKey(state: SimulationState, pegTo: string): string {
  if (pegTo.startsWith("SO-")) return pegTo;
  const plo = state.plannedOrders.find((p) => p.ploNo === pegTo);
  if (plo) return resolveRootPegKey(state, plo.pegTo);
  const mo = state.mfgOrders.find((m) => m.ploNo === pegTo);
  if (mo) return resolveRootPegKey(state, mo.pegTo);
  const po = state.purchaseOrders.find((p) => p.ploNo === pegTo);
  if (po) return resolveRootPegKey(state, po.pegTo);
  return pegTo;
}
