// 受注ごとの進捗ガントチャート用の表示データを計算する純粋関数（design.md §8で予定されていたgantt.ts）。
// 「引当元追跡」（domain/pegging.ts）が受注→確定オーダの系譜をツリーで見せるのに対し、
// こちらは同じ確定オーダ集合を時間軸（計画バー・実績バー）で並べて比較する。
// BOM階層を独自に辿らず、traceFromOrder()が既に解決した確定オーダ集合を並べ替えるだけに留める
// （domain/pegging.tsのロジックを重複させない。PeggingTracePanel.tsxのbuildPegTree()と同じ方針）。
import { traceFromOrder } from "./pegging";
import {
  MFG_ORDER_STATUS_LABELS,
  PURCHASE_ORDER_STATUS_LABELS,
  SHIPMENT_STATUS_LABELS,
  SO_LINE_STATUS_LABELS,
} from "../statusLabels";
import type { SimulationState, SoLineStatus } from "../types";

export type GanttTaskKind = "SO" | "PO" | "MO" | "SHIP";

/**
 * ガント上のバー1本の見た目区分。schedule.tsのcheckSchedule()（MRP計画時点でのペグ先間の
 * 日程整合チェック）とは目的が異なる、このバー単体の「計画終了日に対して今どうなっているか」
 * という単純な視覚表現。既存のScheduleAlertとは別概念として扱う
 */
export type GanttBarState = "PLANNED" | "IN_PROGRESS" | "DELAYED" | "DONE" | "CANCELED";

export interface GanttTask {
  id: string;
  kind: GanttTaskKind;
  label: string;
  itemId?: string;
  qty?: number;
  statusLabel: string;
  planStart: number;
  planEnd: number;
  actualStart: number | null;
  actualEnd: number | null;
  /** actualStartはあるがactualEndが未確定（今日まで実績帯を伸ばして「進行中」を表す） */
  ongoing: boolean;
  barState: GanttBarState;
}

export interface GanttOrderRow {
  soNo: string;
  lineNo: number;
  itemId: string;
  itemName: string;
  customerName: string;
  qty: number;
  status: SoLineStatus;
  summary: GanttTask;
  children: GanttTask[];
}

function classify(
  planEnd: number,
  actualStart: number | null,
  actualEnd: number | null,
  today: number,
  canceled: boolean,
): { ongoing: boolean; barState: GanttBarState } {
  if (canceled) return { ongoing: false, barState: "CANCELED" };
  if (actualStart == null) return { ongoing: false, barState: "PLANNED" };
  if (actualEnd != null) {
    return { ongoing: false, barState: actualEnd > planEnd ? "DELAYED" : "DONE" };
  }
  return { ongoing: true, barState: today > planEnd ? "DELAYED" : "IN_PROGRESS" };
}

function purchaseOrderTask(
  state: SimulationState,
  po: SimulationState["purchaseOrders"][number],
  itemName: (id: string) => string,
  today: number,
): GanttTask {
  const canceled = po.status === "CANCELED";
  const actualStart = po.orderDay;
  // PurchaseOrderは受領日を直接持たないため、入庫実績（RCV）のうち最後のトランザクション日を実績完了日とする
  const lastReceipt = state.stockTxns
    .filter((t) => t.refNo === po.poNo && t.txnType === "RCV")
    .reduce<number | null>((max, t) => (max == null || t.txnDay > max ? t.txnDay : max), null);
  const actualEnd = po.status === "CLOSED" ? lastReceipt : null;
  const { ongoing, barState } = classify(po.dueDay, actualStart, actualEnd, today, canceled);
  return {
    id: po.poNo,
    kind: "PO",
    label: `${po.poNo} ${itemName(po.itemId)}（購買 x${po.qty}）`,
    itemId: po.itemId,
    qty: po.qty,
    statusLabel: PURCHASE_ORDER_STATUS_LABELS[po.status],
    planStart: po.orderDay,
    planEnd: po.dueDay,
    actualStart,
    actualEnd,
    ongoing,
    barState,
  };
}

function mfgOrderTask(
  state: SimulationState,
  mo: SimulationState["mfgOrders"][number],
  itemName: (id: string) => string,
  today: number,
): GanttTask {
  const canceled = mo.status === "CANCELED";
  const steps = state.workInstructions.filter((wi) => wi.moNo === mo.moNo);
  const actualStart = steps.reduce<number | null>(
    (min, wi) => (wi.actualStartDay != null && (min == null || wi.actualStartDay < min) ? wi.actualStartDay : min),
    null,
  );
  const actualEnd =
    mo.status === "DONE"
      ? steps.reduce<number | null>(
          (max, wi) => (wi.actualEndDay != null && (max == null || wi.actualEndDay > max) ? wi.actualEndDay : max),
          null,
        )
      : null;
  const { ongoing, barState } = classify(mo.dueDay, actualStart, actualEnd, today, canceled);
  return {
    id: mo.moNo,
    kind: "MO",
    label: `${mo.moNo} ${itemName(mo.itemId)}（製造 x${mo.planQty}）`,
    itemId: mo.itemId,
    qty: mo.planQty,
    statusLabel: MFG_ORDER_STATUS_LABELS[mo.status],
    planStart: mo.startDay,
    planEnd: mo.dueDay,
    actualStart,
    actualEnd,
    ongoing,
    barState,
  };
}

function shipmentTask(shipment: SimulationState["shipments"][number], today: number): GanttTask {
  const canceled = shipment.status === "CANCELED";
  const { ongoing, barState } = classify(shipment.planDay, shipment.planDay, shipment.actualDay, today, canceled);
  return {
    id: shipment.shipNo,
    kind: "SHIP",
    label: `${shipment.shipNo}（出荷 x${shipment.qty}）`,
    qty: shipment.qty,
    statusLabel: SHIPMENT_STATUS_LABELS[shipment.status],
    // SHIPは一点のイベント（出荷指示日）として扱う。UI側はkind==="SHIP"を目印に区間バーではなく
    // マイルストーン（ダイヤ型マーカー）として描画する
    planStart: shipment.planDay,
    planEnd: shipment.planDay,
    actualStart: shipment.planDay,
    actualEnd: shipment.actualDay,
    ongoing,
    barState,
  };
}

/**
 * 受注明細1件分のガント行を計算する。予定はSO_LINEの希望/回答納期、実績は出荷実績日（全量出荷でCLOSEDの
 * ときのみ確定）とする。design.md EXT-2・EXT-3により取消（CANCELED）は実績が一切無い状態でのみ成立するため、
 * 取消済み行は常にCANCELED表示で良い（実績分岐を考慮する必要がない）
 */
function orderRow(
  state: SimulationState,
  line: SimulationState["soLines"][number],
  itemName: (id: string) => string,
  customerName: (id: string) => string,
  today: number,
): GanttOrderRow {
  const order = state.salesOrders.find((o) => o.soNo === line.soNo);
  const orderedDay = order?.orderedDay ?? line.requestDay;
  const planEnd = line.confirmDay ?? line.requestDay;
  const canceled = line.status === "CANCELED";

  const shipments = state.shipments.filter((s) => s.soNo === line.soNo && s.lineNo === line.lineNo);
  const lastShipDay = shipments.reduce<number | null>(
    (max, s) => (s.actualDay != null && (max == null || s.actualDay > max) ? s.actualDay : max),
    null,
  );
  const actualStart = canceled ? null : orderedDay;
  const actualEnd = line.status === "CLOSED" ? lastShipDay : null;
  const { ongoing, barState } = classify(planEnd, actualStart, actualEnd, today, canceled);

  const summary: GanttTask = {
    id: `${line.soNo}-${line.lineNo}`,
    kind: "SO",
    label: `${line.soNo}-${line.lineNo} ${itemName(line.itemId)} x${line.qty}（${customerName(order?.customerId ?? "")}）`,
    itemId: line.itemId,
    qty: line.qty,
    statusLabel: SO_LINE_STATUS_LABELS[line.status],
    planStart: orderedDay,
    planEnd,
    actualStart,
    actualEnd,
    ongoing,
    barState,
  };

  const traced = traceFromOrder(state, line.soNo, line.lineNo);
  const children = [
    ...traced.purchaseOrders.map((po) => purchaseOrderTask(state, po, itemName, today)),
    ...traced.mfgOrders.map((mo) => mfgOrderTask(state, mo, itemName, today)),
    ...shipments.map((s) => shipmentTask(s, today)),
  ].sort((a, b) => a.planStart - b.planStart || a.id.localeCompare(b.id));

  return {
    soNo: line.soNo,
    lineNo: line.lineNo,
    itemId: line.itemId,
    itemName: itemName(line.itemId),
    customerName: customerName(order?.customerId ?? ""),
    qty: line.qty,
    status: line.status,
    summary,
    children,
  };
}

/** 全受注明細のガント行を、受注日（古い順）で計算する */
export function computeGanttRows(state: SimulationState): GanttOrderRow[] {
  const itemName = (id: string) => state.items.find((i) => i.itemId === id)?.name ?? id;
  const customerName = (id: string) => state.customers.find((c) => c.customerId === id)?.name ?? id;

  return [...state.soLines]
    .sort((a, b) => {
      const orderA = state.salesOrders.find((o) => o.soNo === a.soNo)?.orderedDay ?? 0;
      const orderB = state.salesOrders.find((o) => o.soNo === b.soNo)?.orderedDay ?? 0;
      return orderA - orderB || a.soNo.localeCompare(b.soNo);
    })
    .map((line) => orderRow(state, line, itemName, customerName, state.day));
}

/** チャートの横軸レンジ（表示対象行の計画/実績の最小〜最大日、今日を含む）。行が0件ならnull */
export function ganttDayRange(rows: GanttOrderRow[], today: number): { minDay: number; maxDay: number } | null {
  if (rows.length === 0) return null;
  let minDay = today;
  let maxDay = today;
  const consider = (task: GanttTask) => {
    const end = task.ongoing ? today : (task.actualEnd ?? task.planEnd);
    minDay = Math.min(minDay, task.planStart, task.actualStart ?? task.planStart);
    maxDay = Math.max(maxDay, task.planEnd, end);
  };
  for (const row of rows) {
    consider(row.summary);
    for (const child of row.children) consider(child);
  }
  return { minDay, maxDay };
}
