// 原価計算（v5-spec.md §11.2 Phase 2-A：最小設計）
import type { SimulationState } from "../types";

export class CostError extends Error {}

export interface ItemCost {
  material: number;
  labor: number;
  standardCost: number;
}

/**
 * 標準原価の積上げ（v5-spec.md §11.2 rollupCost疑似コードそのまま）。
 * BUY品目は購入単価を材料費として使い、加工費は0。MAKE品目はBOMの子品目の標準原価×員数を材料費、
 * 工順の標準時間×作業区の賃率を加工費として積み上げる。
 */
export function rollupCost(state: SimulationState, itemId: string): ItemCost {
  const item = state.items.find((i) => i.itemId === itemId);
  if (!item) throw new CostError(`品目が見つかりません: ${itemId}`);

  if (item.makeBuy === "BUY") {
    const material = item.purchasePrice ?? 0;
    return { material, labor: 0, standardCost: material };
  }

  const bomLines = state.bom.filter((b) => b.parentItemId === itemId);
  const material = bomLines.reduce((sum, line) => sum + rollupCost(state, line.childItemId).standardCost * line.qtyPer, 0);

  const steps = state.routingSteps.filter((s) => s.itemId === itemId);
  const labor = steps.reduce((sum, step) => {
    const wc = state.workCenters.find((w) => w.workCenter === step.workCenter);
    const ratePerHour = wc?.ratePerHour ?? 0;
    return sum + (step.stdTimeMin / 60) * ratePerHour;
  }, 0);

  return { material, labor, standardCost: material + labor };
}

/** 全品目の標準原価一覧（マスタ表示用） */
export function computeAllItemCosts(state: SimulationState): Array<{ itemId: string } & ItemCost> {
  return state.items.map((item) => ({ itemId: item.itemId, ...rollupCost(state, item.itemId) }));
}

export interface MfgOrderCost {
  moNo: string;
  /** 投入材料費（第1工程完了で消費した子品目の標準原価合計。未消費なら0） */
  inputMaterial: number;
  /** 投入加工費（第1工程完了で発生した自品目の加工費。未消費なら0） */
  inputLabor: number;
  /** 完成品振替額（最終工程完了で入庫した良品分の標準原価。未完了なら0） */
  outputStandard: number;
  /** 原価差異（投入合計 − 完成品振替額）。不良・仕損の分だけプラスになる */
  variance: number;
}

/**
 * 製造オーダ別の原価差異（v5-spec.md §11.2の「原価差異の可視化」計算例と同じロジック）。
 * 投入は第1工程（バックフラッシュのタイミング）完了時点の投入数（＝planQty）を基準にし、
 * 完成品振替は最終工程完了時点の良品数を基準にする。production.tsのバックフラッシュ・完成入庫の
 * タイミングと同じ条件（第1/最終工程がDONEかどうか）で判定し、状態を独自に再解釈しない。
 */
export function computeMfgOrderCost(state: SimulationState, moNo: string): MfgOrderCost {
  const mo = state.mfgOrders.find((m) => m.moNo === moNo);
  if (!mo) throw new CostError(`製造オーダが見つかりません: ${moNo}`);

  const steps = state.workInstructions
    .filter((wi) => wi.moNo === moNo)
    .sort((a, b) => a.stepNo - b.stepNo);
  const firstStep = steps[0];
  const lastStep = steps[steps.length - 1];

  const unitCost = rollupCost(state, mo.itemId);

  const inputMaterial = firstStep?.status === "DONE" ? unitCost.material * mo.planQty : 0;
  const inputLabor = firstStep?.status === "DONE" ? unitCost.labor * mo.planQty : 0;
  const outputStandard = lastStep?.status === "DONE" ? unitCost.standardCost * mo.goodQty : 0;

  return {
    moNo,
    inputMaterial,
    inputLabor,
    outputStandard,
    variance: inputMaterial + inputLabor - outputStandard,
  };
}

/** 在庫金額（全品目の現在庫数量×標準原価の合計。v5-spec.md §11.2「在庫数量→在庫金額」） */
export function inventoryValue(state: SimulationState): number {
  return state.stocks.reduce((sum, stock) => sum + stock.onHand * rollupCost(state, stock.itemId).standardCost, 0);
}

/** 受注残高（金額）（未出荷の受注残数量×売価の合計。v5-spec.md §11.2「受注残→受注残高（金額）」） */
export function backlogValue(state: SimulationState): number {
  return state.soLines
    .filter((l) => l.status === "CONFIRMED" || l.status === "PARTIAL")
    .reduce((sum, line) => {
      const item = state.items.find((i) => i.itemId === line.itemId);
      const salesPrice = item?.salesPrice ?? 0;
      return sum + (line.qty - line.shippedQty) * salesPrice;
    }, 0);
}

/** 不良損失額（全製造オーダの不良数量×標準原価の合計。v5-spec.md §11.2「不良数→不良損失額」） */
export function scrapLossValue(state: SimulationState): number {
  return state.mfgOrders.reduce((sum, mo) => sum + mo.scrapQty * rollupCost(state, mo.itemId).standardCost, 0);
}
