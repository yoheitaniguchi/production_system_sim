// KPI算出（v5-spec.md §10、design.md EXT-11）
import type { SimulationState } from "../types";
import { checkSchedule } from "./schedule";

export interface KpiSnapshot {
  /** 納期遵守率：実出荷日 ≤ 回答納期 の件数 ÷ 出荷完了件数 */
  deliveryComplianceRate: number | null;
  /** 回答納期充足率：回答納期 ≤ 希望納期 の件数 ÷ 回答済受注件数 */
  confirmDateComplianceRate: number | null;
  /** 受注残：未完了受注の残数量 */
  orderBacklogQty: number;
  /** 計画達成率：完了オーダの良品数 ÷ 計画数 */
  planAchievementRate: number | null;
  /** 直行率：良品数 ÷ 投入数 */
  firstPassYieldRate: number | null;
  /** 仕掛数量：status = WIPのオーダ数量 */
  wipQty: number;
  /** 製造リードタイム実績：最終工程完了日 − 第1工程着手日（完了オーダの平均） */
  avgProductionLeadTimeDays: number | null;
  /** 在庫回転：出庫数量（ISS+SHP） ÷ 現在の総在庫数量（design.md EXT-11同様、期間平均の代わりに現在値を採用） */
  inventoryTurnover: number | null;
  /** 仕入先納期遵守率：入庫日 ≤ 回答納期 の件数 ÷ 入庫件数 */
  supplierDeliveryComplianceRate: number | null;
  /** 欠品発生件数：design.md EXT-11によりHOLD状態のMFG_ORDER数で近似 */
  stockoutEventCount: number;
  /** 棚卸差異率：ADJ数量の絶対値合計 ÷ 現在の総在庫数量 */
  physicalInventoryVarianceRate: number | null;
  /** 日程警告件数 */
  scheduleAlertCount: number;
}

function totalOnHand(state: SimulationState): number {
  return state.stocks.reduce((sum, s) => sum + s.onHand, 0);
}

export function computeKpi(state: SimulationState): KpiSnapshot {
  // 納期遵守率
  const shipped = state.shipments.filter((s) => s.status === "SHIPPED");
  const onTimeShipments = shipped.filter((s) => {
    const line = state.soLines.find((l) => l.soNo === s.soNo && l.lineNo === s.lineNo);
    return line?.confirmDay != null && s.actualDay != null && s.actualDay <= line.confirmDay;
  });
  const deliveryComplianceRate = shipped.length > 0 ? onTimeShipments.length / shipped.length : null;

  // 回答納期充足率
  const confirmedLines = state.soLines.filter((l) => l.confirmDay != null);
  const withinRequest = confirmedLines.filter((l) => (l.confirmDay as number) <= l.requestDay);
  const confirmDateComplianceRate = confirmedLines.length > 0 ? withinRequest.length / confirmedLines.length : null;

  // 受注残
  const orderBacklogQty = state.soLines
    .filter((l) => l.status !== "CLOSED" && l.status !== "CANCELED")
    .reduce((sum, l) => sum + (l.qty - l.shippedQty), 0);

  // 計画達成率・直行率は末端の受注確定オーダ（pegToが受注のペグキー、= BOMレベル0）に限定する（design.md EXT-12）。
  // 中間のサブアセンブリまで含めて単純合算すると、複数階層の歩留まりが混ざり合ってしまうため。
  const doneMo = state.mfgOrders.filter((mo) => mo.status === "DONE");
  const doneTopLevelMo = doneMo.filter((mo) => mo.pegTo.startsWith("SO-"));

  // 計画達成率
  const planAchievementRate =
    doneTopLevelMo.length > 0
      ? doneTopLevelMo.reduce((sum, mo) => sum + mo.goodQty, 0) /
        doneTopLevelMo.reduce((sum, mo) => sum + mo.planQty, 0)
      : null;

  // 直行率（First Pass Yield）：オーダごとに「最終工程の良品数 ÷ 第1工程の投入数」を求め、
  // 工程をまたいだ累積歩留まりとして集計する（design.md EXT-12）
  const firstPassYields = doneTopLevelMo
    .map((mo) => {
      const steps = state.workInstructions.filter((wi) => wi.moNo === mo.moNo);
      if (steps.length === 0) return null;
      const first = steps.reduce((a, b) => (a.stepNo < b.stepNo ? a : b));
      const last = steps.reduce((a, b) => (a.stepNo > b.stepNo ? a : b));
      return { firstInput: first.inputQty, lastGood: last.goodQty };
    })
    .filter((v): v is { firstInput: number; lastGood: number } => v != null);
  const firstPassYieldRate =
    firstPassYields.length > 0
      ? firstPassYields.reduce((sum, v) => sum + v.lastGood, 0) /
        firstPassYields.reduce((sum, v) => sum + v.firstInput, 0)
      : null;

  // 仕掛数量
  const wipQty = state.mfgOrders.filter((mo) => mo.status === "WIP").reduce((sum, mo) => sum + mo.planQty, 0);

  // 製造リードタイム実績
  const leadTimes = doneMo
    .map((mo) => {
      const wis = state.workInstructions.filter((wi) => wi.moNo === mo.moNo && wi.actualStartDay != null && wi.actualEndDay != null);
      if (wis.length === 0) return null;
      const start = Math.min(...wis.map((wi) => wi.actualStartDay as number));
      const end = Math.max(...wis.map((wi) => wi.actualEndDay as number));
      return end - start;
    })
    .filter((v): v is number => v != null);
  const avgProductionLeadTimeDays =
    leadTimes.length > 0 ? leadTimes.reduce((sum, v) => sum + v, 0) / leadTimes.length : null;

  // 在庫回転
  const issuedAndShipped = state.stockTxns
    .filter((txn) => txn.txnType === "ISS" || txn.txnType === "SHP")
    .reduce((sum, txn) => sum + Math.abs(txn.qty), 0);
  const currentTotal = totalOnHand(state);
  const inventoryTurnover = currentTotal > 0 ? issuedAndShipped / currentTotal : null;

  // 仕入先納期遵守率
  const receipts = state.stockTxns.filter((txn) => txn.txnType === "RCV");
  const onTimeReceipts = receipts.filter((txn) => {
    const po = state.purchaseOrders.find((p) => p.poNo === txn.refNo);
    return po?.confirmDay != null && txn.txnDay <= po.confirmDay;
  });
  const supplierDeliveryComplianceRate = receipts.length > 0 ? onTimeReceipts.length / receipts.length : null;

  // 欠品発生件数（design.md EXT-11）
  const stockoutEventCount = state.mfgOrders.filter((mo) => mo.status === "HOLD").length;

  // 棚卸差異率
  const adjTotal = state.stockTxns
    .filter((txn) => txn.txnType === "ADJ")
    .reduce((sum, txn) => sum + Math.abs(txn.qty), 0);
  const physicalInventoryVarianceRate = currentTotal > 0 ? adjTotal / currentTotal : null;

  // 日程警告件数
  const scheduleAlertCount = checkSchedule(state).length;

  return {
    deliveryComplianceRate,
    confirmDateComplianceRate,
    orderBacklogQty,
    planAchievementRate,
    firstPassYieldRate,
    wipQty,
    avgProductionLeadTimeDays,
    inventoryTurnover,
    supplierDeliveryComplianceRate,
    stockoutEventCount,
    physicalInventoryVarianceRate,
    scheduleAlertCount,
  };
}
