// ダッシュボード用の日次スナップショット計算（受注残・計画残・発注残・製造残・出荷残・在庫の
// バーンダウンチャート、KPI/アラート件数の可視化）。
//
// 金額換算はdomain/cost.tsの標準原価積上げ（standardCostLookup）・売価（ItemMaster.salesPrice）に
// 統一する（原価タブの算出方法と食い違わないようにするため）。状態を変更しない導出値だが、日次推移を
// 残すためreducer.tsがSimulationState.dashboardHistoryにこのスナップショットを都度記録する。
import { backlogValue, inventoryValue, standardCostLookup } from "./cost";
import { capacityOverloads } from "./capacity";
import { computeKpi } from "./kpi";
import { validateMaster } from "./masterIntegrity";
import { checkSchedule, unmetDemand } from "./schedule";
import type { BacklogMetric, DashboardSnapshot, SimulationState } from "../types";

function sumBy<T>(items: T[], fn: (item: T) => BacklogMetric): BacklogMetric {
  return items.reduce<BacklogMetric>(
    (acc, item) => {
      const m = fn(item);
      acc.qty += m.qty;
      acc.amount += m.amount;
      return acc;
    },
    { qty: 0, amount: 0 },
  );
}

/** 受注残・計画残・発注残・製造残・出荷残・在庫の残高（数量・金額）とKPI/アラート件数を1回で計算する */
export function computeDashboardSnapshot(state: SimulationState): DashboardSnapshot {
  const kpi = computeKpi(state);
  const costOf = standardCostLookup(state);

  // 計画残：MRP実行のたびに全削除・再生成される揮発データ（design.md §6.2）の、現時点の残数量
  const planned = sumBy(state.plannedOrders, (po) => ({ qty: po.qty, amount: po.qty * costOf(po.itemId) }));

  // 発注残：未クローズ・未取消のPOの未入荷数量
  const purchase = sumBy(
    state.purchaseOrders.filter((po) => po.status !== "CLOSED" && po.status !== "CANCELED"),
    (po) => {
      const remaining = po.qty - po.receivedQty;
      return { qty: remaining, amount: remaining * costOf(po.itemId) };
    },
  );

  // 製造残：未完了・未取消のMOの残数量（計画数−良品数−不良数）
  const production = sumBy(
    state.mfgOrders.filter((mo) => mo.status !== "DONE" && mo.status !== "CANCELED"),
    (mo) => {
      const remaining = mo.planQty - mo.goodQty - mo.scrapQty;
      return { qty: remaining, amount: remaining * costOf(mo.itemId) };
    },
  );

  // 出荷残：引当済みだが未出荷（ALLOCATED）の数量。金額は出荷先受注明細の品目売価で換算する
  const shipment = sumBy(
    state.shipments.filter((s) => s.status === "ALLOCATED"),
    (s) => {
      const line = state.soLines.find((l) => l.soNo === s.soNo && l.lineNo === s.lineNo);
      const item = line ? state.items.find((i) => i.itemId === line.itemId) : undefined;
      return { qty: s.qty, amount: s.qty * (item?.salesPrice ?? 0) };
    },
  );

  const inventory: BacklogMetric = {
    qty: state.stocks.reduce((sum, s) => sum + s.onHand, 0),
    amount: inventoryValue(state),
  };

  return {
    day: state.day,
    backlog: {
      order: { qty: kpi.orderBacklogQty, amount: backlogValue(state) },
      planned,
      purchase,
      production,
      shipment,
      inventory,
    },
    alertCounts: {
      schedule: checkSchedule(state).length,
      unmetDemand: unmetDemand(state).length,
      masterIssue: validateMaster(state).length,
      capacityOverload: capacityOverloads(state).length,
    },
    kpiHighlights: {
      deliveryComplianceRate: kpi.deliveryComplianceRate,
      planAchievementRate: kpi.planAchievementRate,
      firstPassYieldRate: kpi.firstPassYieldRate,
      inventoryTurnover: kpi.inventoryTurnover,
    },
  };
}
