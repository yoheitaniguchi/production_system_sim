// 能力計画（CRP）の山積み計算（v5-spec.md §11.1ロードマップ Phase 3、design.md §9・EXT-30〜32）
//
// checkSchedule()/unmetDemand()と同じく状態を変更しない導出値であり、SimulationStateには保存しない。
// 有限能力スケジューリング（山崩し・自動リスケジュール）は行わない。あくまで「見せる」機能であり、
// 確定・リリース・着手などの既存操作は一切ブロックしない（design.md §9.2、EXT-31）。
import type { SimulationState } from "../types";

export interface CapacityLoadEntry {
  workCenter: string;
  day: number;
  /** 計画負荷：未着手の作業指示をオーダの着手日へ一括計上する近似（design.md §9.4） */
  plannedMin: number;
  /** 実績負荷：実際に着手した作業指示を実着手日へ計上する（DONEになった後も残り続ける） */
  actualMin: number;
  /** その作業区の1日あたり能力（分） */
  capacityMin: number;
}

interface LoadBucket {
  plannedMin: number;
  actualMin: number;
}

/**
 * 作業区×日の山積み（計画負荷・実績負荷・能力）を計算する（design.md §9.4の疑似コードそのまま）。
 *
 * 1件の作業指示（WORK_INSTRUCTION）は、着手済みか否かで計画負荷・実績負荷のどちらか一方にのみ
 * 計上される（二重計上は起きない）。未着手工程の数量には`wi.inputQty`ではなく`mo.planQty`を使う
 * ——第1工程以外は前工程が完了するまで`inputQty`が0のままで、計画負荷が常に0になってしまうため
 * （design.md §9.6 C2-1）。MRP本体も歩留まり100%前提であり、一貫した前提である。
 */
export function computeCapacityLoad(state: SimulationState): CapacityLoadEntry[] {
  const buckets = new Map<string, Map<number, LoadBucket>>();

  const bucketOf = (workCenter: string, day: number): LoadBucket => {
    let byDay = buckets.get(workCenter);
    if (!byDay) {
      byDay = new Map<number, LoadBucket>();
      buckets.set(workCenter, byDay);
    }
    let bucket = byDay.get(day);
    if (!bucket) {
      bucket = { plannedMin: 0, actualMin: 0 };
      byDay.set(day, bucket);
    }
    return bucket;
  };

  for (const wi of state.workInstructions) {
    const mo = state.mfgOrders.find((m) => m.moNo === wi.moNo);
    if (!mo) continue;
    const step = state.routingSteps.find((s) => s.itemId === mo.itemId && s.stepNo === wi.stepNo);
    if (!step) continue;

    if (wi.actualStartDay != null) {
      bucketOf(wi.workCenter, wi.actualStartDay).actualMin += wi.inputQty * step.stdTimeMin;
    } else if (mo.status !== "DONE" && mo.status !== "CANCELED") {
      bucketOf(wi.workCenter, mo.startDay).plannedMin += mo.planQty * step.stdTimeMin;
    }
  }

  const capacityOf = (workCenter: string): number =>
    state.workCenters.find((w) => w.workCenter === workCenter)?.capacityMinPerDay ?? 0;

  const entries: CapacityLoadEntry[] = [];
  for (const [workCenter, byDay] of buckets) {
    for (const [day, bucket] of byDay) {
      entries.push({ workCenter, day, plannedMin: bucket.plannedMin, actualMin: bucket.actualMin, capacityMin: capacityOf(workCenter) });
    }
  }

  return entries.sort((a, b) => a.day - b.day || a.workCenter.localeCompare(b.workCenter));
}

/** 山積み超過（計画負荷または実績負荷が能力を超えている作業区×日）だけを返す（design.md EXT-31：警告のみ） */
export function capacityOverloads(state: SimulationState): CapacityLoadEntry[] {
  return computeCapacityLoad(state).filter((e) => e.plannedMin > e.capacityMin || e.actualMin > e.capacityMin);
}

export interface PlannedOrderLoadEntry {
  workCenter: string;
  day: number;
  /** 未確定の計画オーダ（PLANNED_ORDER）による見込み負荷 */
  previewMin: number;
  capacityMin: number;
}

/**
 * 確定前の計画オーダ（PLANNED_ORDER）による見込み負荷を作業区×日へ計上する（design.md EXT-35、Issue #57）。
 * WORK_INSTRUCTIONがまだ存在しない段階の負荷であり、computeCapacityLoad()とは別の計算経路・別フィールド
 * （previewMin）に計上する。計画オーダは確定（firmAllPlannedOrders）されるとMFG_ORDER/WORK_INSTRUCTIONへ
 * 差し替わり state.plannedOrders から消えるため、両者が同一オーダを指して二重計上することは構造上起きない。
 *
 * 集計粒度はcomputeCapacityLoad()の計画負荷と同じく「オーダ全工程をオーダのstartDayへ一括計上」に揃える
 * （design.md L-C1の近似を踏襲）。orderType==="BUY"の計画オーダは工程を持たないため対象外（負荷0）。
 */
export function computePlannedOrderLoad(state: SimulationState): PlannedOrderLoadEntry[] {
  const buckets = new Map<string, Map<number, number>>();

  for (const plo of state.plannedOrders) {
    if (plo.orderType !== "MAKE") continue;
    for (const step of state.routingSteps) {
      if (step.itemId !== plo.itemId) continue;
      let byDay = buckets.get(step.workCenter);
      if (!byDay) {
        byDay = new Map<number, number>();
        buckets.set(step.workCenter, byDay);
      }
      byDay.set(plo.startDay, (byDay.get(plo.startDay) ?? 0) + plo.qty * step.stdTimeMin);
    }
  }

  const capacityOf = (workCenter: string): number =>
    state.workCenters.find((w) => w.workCenter === workCenter)?.capacityMinPerDay ?? 0;

  const entries: PlannedOrderLoadEntry[] = [];
  for (const [workCenter, byDay] of buckets) {
    for (const [day, previewMin] of byDay) {
      entries.push({ workCenter, day, previewMin, capacityMin: capacityOf(workCenter) });
    }
  }

  return entries.sort((a, b) => a.day - b.day || a.workCenter.localeCompare(b.workCenter));
}
