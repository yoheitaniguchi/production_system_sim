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
 * 作業区×日の山積み（計画負荷・実績負荷・能力）を計算する（design.md §9.4の疑似コードに、EXT-41で段取り時間の項を加えたもの）。
 *
 * 1件の作業指示（WORK_INSTRUCTION）は、着手済みか否かで計画負荷・実績負荷のどちらか一方にのみ
 * 計上される（二重計上は起きない）。未着手工程の数量には`wi.inputQty`ではなく`mo.planQty`を使う
 * ——第1工程以外は前工程が完了するまで`inputQty`が0のままで、計画負荷が常に0になってしまうため
 * （design.md §9.6 C2-1）。MRP本体も歩留まり100%前提であり、一貫した前提である。
 *
 * 各工程の負荷は「数量×標準時間＋段取り時間」。段取り時間（RoutingStep.setupMin、省略時0）は数量に
 * 比例させず、作業指示1件につき1回だけ加算する（design.md EXT-41、Issue #66）。
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

    // 段取り時間は数量に比例させず、作業指示1件（＝当該工程の1回の段取り）につき1回だけ加算する
    // （design.md EXT-41）。計画負荷・実績負荷は着手済みか否かで排他的に分岐するため、二重に乗ることもない
    const setupMin = step.setupMin ?? 0;
    if (wi.actualStartDay != null) {
      bucketOf(wi.workCenter, wi.actualStartDay).actualMin += wi.inputQty * step.stdTimeMin + setupMin;
    } else if (mo.status !== "DONE" && mo.status !== "CANCELED") {
      bucketOf(wi.workCenter, mo.startDay).plannedMin += mo.planQty * step.stdTimeMin + setupMin;
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

/** 慢性的なボトルネックと判定する連続超過日数の既定閾値（Issue #59、design.md EXT-37） */
export const CHRONIC_BOTTLENECK_THRESHOLD_DAYS = 3;

export interface ChronicBottleneck {
  workCenter: string;
  startDay: number;
  endDay: number;
  consecutiveDays: number;
}

/**
 * 同一作業区が閾値日数以上連続して山積み超過している「慢性的なボトルネック」を検出する（Issue #59）。
 * computeCapacityLoad()が1回の呼び出しで複数日ぶんの計画/実績負荷を返す性質を利用し、
 * dashboardHistoryやDashboardSnapshot型の変更を必要としない（現在時点のstateから都度導出する）。
 * 超過していない日・エントリ自体が存在しない日（＝負荷0）はいずれも連続を途切れさせる。
 */
export function computeChronicBottlenecks(
  state: SimulationState,
  thresholdDays: number = CHRONIC_BOTTLENECK_THRESHOLD_DAYS,
): ChronicBottleneck[] {
  const byWorkCenter = new Map<string, CapacityLoadEntry[]>();
  for (const entry of computeCapacityLoad(state)) {
    let list = byWorkCenter.get(entry.workCenter);
    if (!list) {
      list = [];
      byWorkCenter.set(entry.workCenter, list);
    }
    list.push(entry);
  }

  const results: ChronicBottleneck[] = [];
  for (const [workCenter, entries] of byWorkCenter) {
    entries.sort((a, b) => a.day - b.day);

    let streak: { start: number; prev: number } | null = null;
    const flush = () => {
      if (streak && streak.prev - streak.start + 1 >= thresholdDays) {
        results.push({ workCenter, startDay: streak.start, endDay: streak.prev, consecutiveDays: streak.prev - streak.start + 1 });
      }
      streak = null;
    };

    for (const entry of entries) {
      const overloaded = entry.plannedMin > entry.capacityMin || entry.actualMin > entry.capacityMin;
      if (!overloaded) {
        flush();
        continue;
      }
      if (streak && entry.day === streak.prev + 1) {
        streak.prev = entry.day;
      } else {
        flush();
        streak = { start: entry.day, prev: entry.day };
      }
    }
    flush();
  }

  return results.sort((a, b) => a.workCenter.localeCompare(b.workCenter) || a.startDay - b.startDay);
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
      // 計画オーダ1件は確定すると製造オーダ1件（＝各工程の作業指示1件ずつ）になるため、段取り時間も
      // 確定済み負荷と同じく1オーダ1工程につき1回だけ加算する（design.md EXT-41）
      byDay.set(plo.startDay, (byDay.get(plo.startDay) ?? 0) + plo.qty * step.stdTimeMin + (step.setupMin ?? 0));
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

export interface CapacityChartCell {
  day: number;
  plannedMin: number;
  actualMin: number;
  /** 計画負荷・実績負荷のうち大きい方が能力を超えた分（分）。超過していなければ0（表の「超過（N分）」と同じ定義） */
  overloadMin: number;
}

export interface CapacityChartRow {
  workCenter: string;
  capacityMin: number;
  /** この作業区で負荷のある日だけ（日昇順） */
  cells: CapacityChartCell[];
}

export interface CapacityChartModel {
  /** どれかの作業区に負荷のある日の和集合（昇順）。全作業区で共通の横軸になる */
  days: number[];
  /** 作業区コード順 */
  rows: CapacityChartRow[];
  /** 縦軸の上限（分）。全作業区で共通の目盛りにして作業区間を比較できるよう、能力・計画・実績の最大値をとる */
  maxMin: number;
}

/**
 * 山積みバーグラフ（Issue #67、design.md EXT-42）用の表示データを、computeCapacityLoad()の結果から整形する。
 * 状態を持たない導出値で、表（CapacityPanel.tsx）と同じ元データ・同じ超過の定義を使うため、
 * グラフと表の判定が食い違うことはない。負荷が1件も無ければ空のモデル（rows/daysとも空、maxMin=0）を返す。
 */
export function buildCapacityChartModel(entries: CapacityLoadEntry[]): CapacityChartModel {
  const byWorkCenter = new Map<string, CapacityChartRow>();
  const daySet = new Set<number>();
  let maxMin = 0;

  for (const entry of entries) {
    let row = byWorkCenter.get(entry.workCenter);
    if (!row) {
      row = { workCenter: entry.workCenter, capacityMin: entry.capacityMin, cells: [] };
      byWorkCenter.set(entry.workCenter, row);
    }
    const required = Math.max(entry.plannedMin, entry.actualMin);
    row.cells.push({
      day: entry.day,
      plannedMin: entry.plannedMin,
      actualMin: entry.actualMin,
      overloadMin: Math.max(0, required - entry.capacityMin),
    });
    daySet.add(entry.day);
    maxMin = Math.max(maxMin, entry.capacityMin, required);
  }

  const rows = [...byWorkCenter.values()].sort((a, b) => a.workCenter.localeCompare(b.workCenter));
  for (const row of rows) row.cells.sort((a, b) => a.day - b.day);
  return { days: [...daySet].sort((a, b) => a - b), rows, maxMin };
}
