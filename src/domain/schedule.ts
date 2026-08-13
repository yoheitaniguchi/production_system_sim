// 日程整合チェック・未充足需要（v5-spec.md §7.5）。いずれも状態を変更しない導出値。
import type { SimulationState } from "../types";
import { computeSupply } from "./mrp";
import { resolveRootPegKey } from "./pegging";

export interface ScheduleAlert {
  level: "遅延";
  /** 遅延の発生源（購買オーダ or 子の製造オーダ） */
  source: string;
  /** 影響を受ける親の製造オーダ */
  target: string;
  delayDays: number;
  /** 辿り着いた受注のペグキー（"SO-001-1"形式） */
  affectedSoLine: string;
}

/**
 * 日程整合チェック（v5-spec.md §7.5 checkSchedule）。自動リスケジュールは行わず、警告のみ返す。
 */
export function checkSchedule(state: SimulationState): ScheduleAlert[] {
  const alerts: ScheduleAlert[] = [];

  for (const po of state.purchaseOrders) {
    if (po.status === "CLOSED" || po.status === "CANCELED") continue;
    const parent = state.mfgOrders.find((mo) => mo.ploNo === po.pegTo);
    if (!parent) continue;
    const arrival = po.confirmDay ?? po.dueDay;
    if (arrival > parent.startDay) {
      alerts.push({
        level: "遅延",
        source: po.poNo,
        target: parent.moNo,
        delayDays: arrival - parent.startDay,
        affectedSoLine: resolveRootPegKey(state, po.pegTo),
      });
    }
  }

  for (const mo of state.mfgOrders) {
    if (mo.status === "DONE" || mo.status === "CANCELED") continue;
    const parent = state.mfgOrders.find((p) => p.ploNo === mo.pegTo);
    if (!parent) continue;
    if (mo.dueDay > parent.startDay) {
      alerts.push({
        level: "遅延",
        source: mo.moNo,
        target: parent.moNo,
        delayDays: mo.dueDay - parent.startDay,
        affectedSoLine: resolveRootPegKey(state, mo.pegTo),
      });
    }
  }

  return alerts;
}

export interface UnmetDemand {
  itemId: string;
  shortage: number;
}

/**
 * 未充足需要の検知（v5-spec.md §7.5 unmetDemand）。独立需要（SO_LINEで直接受注されている品目）のみを
 * 対象とする（従属需要の品目はMRP再実行で判断するため、ここでは見ない）。
 */
export function unmetDemand(state: SimulationState): UnmetDemand[] {
  const demandByItem = new Map<string, number>();
  for (const line of state.soLines) {
    if (line.status === "CLOSED" || line.status === "CANCELED") continue;
    const remaining = line.qty - line.shippedQty;
    if (remaining <= 0) continue;
    demandByItem.set(line.itemId, (demandByItem.get(line.itemId) ?? 0) + remaining);
  }

  const supply = computeSupply(state);
  const result: UnmetDemand[] = [];
  for (const [itemId, demand] of demandByItem) {
    const available = supply[itemId] ?? 0;
    if (demand > available) {
      result.push({ itemId, shortage: demand - available });
    }
  }
  return result;
}
