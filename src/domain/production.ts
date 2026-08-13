// 工程着手・完了・バックフラッシュ（v5-spec.md §7.3・§6.3・§6.4、design.md EXT-10）
import type { SimulationState } from "../types";
import { shippableQty } from "./shipment";

export class ProductionError extends Error {}

function stepsOf(state: SimulationState, itemId: string): number[] {
  return state.routingSteps
    .filter((s) => s.itemId === itemId)
    .map((s) => s.stepNo)
    .sort((a, b) => a - b);
}

function firstStepNo(state: SimulationState, itemId: string): number | undefined {
  return stepsOf(state, itemId)[0];
}

function lastStepNo(state: SimulationState, itemId: string): number | undefined {
  const steps = stepsOf(state, itemId);
  return steps[steps.length - 1];
}

function nextStepNo(state: SimulationState, itemId: string, stepNo: number): number | undefined {
  return stepsOf(state, itemId).find((s) => s > stepNo);
}

/** 製造オーダのリリース（v5-spec.md UC-12） */
export function releaseMfgOrder(state: SimulationState, moNo: string): void {
  const mo = state.mfgOrders.find((m) => m.moNo === moNo);
  if (!mo) throw new ProductionError(`製造オーダが見つかりません: ${moNo}`);
  if (mo.status !== "FIRM") throw new ProductionError(`確定（FIRM）以外はリリースできません: ${moNo}`);
  mo.status = "RELEASED";
}

/** 工程着手（v5-spec.md §7.3 startStep） */
export function startStep(state: SimulationState, moNo: string, stepNo: number, day: number): void {
  const mo = state.mfgOrders.find((m) => m.moNo === moNo);
  if (!mo) throw new ProductionError(`製造オーダが見つかりません: ${moNo}`);
  const wi = state.workInstructions.find((w) => w.moNo === moNo && w.stepNo === stepNo);
  if (!wi) throw new ProductionError(`作業指示が見つかりません: ${moNo} 工程${stepNo}`);
  if (wi.status !== "WAIT") throw new ProductionError(`未着手（WAIT）以外は着手できません: ${moNo} 工程${stepNo}`);

  if (stepNo === firstStepNo(state, mo.itemId)) {
    if (mo.status !== "RELEASED") {
      throw new ProductionError(`発行済（RELEASED）以外は第1工程を着手できません: ${moNo}`);
    }
    mo.status = "WIP";
  }

  wi.status = "WIP";
  wi.actualStartDay = day;
}

/**
 * 工程完了（v5-spec.md §7.3 completeStep）。第1工程完了時に「員数×投入数」を一括消費する
 * （バックフラッシュ、投入数ベース）。design.md EXT-10：HOLD中でも同じ操作を再実行すれば復帰を試みる。
 */
export function completeStep(
  state: SimulationState,
  moNo: string,
  stepNo: number,
  goodQty: number,
  scrapQty: number,
  day: number,
): void {
  const mo = state.mfgOrders.find((m) => m.moNo === moNo);
  if (!mo) throw new ProductionError(`製造オーダが見つかりません: ${moNo}`);
  const wi = state.workInstructions.find((w) => w.moNo === moNo && w.stepNo === stepNo);
  if (!wi) throw new ProductionError(`作業指示が見つかりません: ${moNo} 工程${stepNo}`);

  // design.md EXT-10：HOLDのまま再度この操作を呼べば復帰を試みる
  if (mo.status === "HOLD") mo.status = "WIP";

  if (wi.status !== "WIP") throw new ProductionError(`着手済（WIP）以外は完了できません: ${moNo} 工程${stepNo}`);
  if (goodQty + scrapQty !== wi.inputQty) {
    throw new ProductionError(`良品数＋不良数は投入数と一致する必要があります: ${moNo} 工程${stepNo}`);
  }

  const first = firstStepNo(state, mo.itemId);
  const last = lastStepNo(state, mo.itemId);

  if (stepNo === first) {
    const bomLines = state.bom.filter((b) => b.parentItemId === mo.itemId);
    for (const line of bomLines) {
      const required = line.qtyPer * wi.inputQty;
      const available = shippableQty(state, line.childItemId);
      if (available < required) {
        mo.status = "HOLD";
        throw new ProductionError(
          `部品不足のため保留（HOLD）にしました: ${line.childItemId} 不足数 ${required - available}`,
        );
      }
    }
    for (const line of bomLines) {
      const required = line.qtyPer * wi.inputQty;
      const stock = state.stocks.find((s) => s.itemId === line.childItemId);
      if (stock) stock.onHand -= required;
      state.stockTxns.push({
        txnId: `TXN-${String(state.nextTxnSeq).padStart(4, "0")}`,
        itemId: line.childItemId,
        txnType: "ISS",
        qty: -required,
        txnDay: day,
        refNo: moNo,
      });
      state.nextTxnSeq += 1;
    }
  }

  wi.goodQty = goodQty;
  wi.scrapQty = scrapQty;
  wi.status = "DONE";
  wi.actualEndDay = day;

  if (stepNo === last) {
    const stock = state.stocks.find((s) => s.itemId === mo.itemId);
    if (stock) {
      stock.onHand += goodQty;
    } else {
      state.stocks.push({ itemId: mo.itemId, onHand: goodQty, allocated: 0 });
    }
    state.stockTxns.push({
      txnId: `TXN-${String(state.nextTxnSeq).padStart(4, "0")}`,
      itemId: mo.itemId,
      txnType: "PRD",
      qty: goodQty,
      txnDay: day,
      refNo: moNo,
    });
    state.nextTxnSeq += 1;

    mo.goodQty = goodQty;
    mo.scrapQty = state.workInstructions
      .filter((w) => w.moNo === moNo)
      .reduce((sum, w) => sum + w.scrapQty, 0);
    mo.status = "DONE";
  } else {
    const next = nextStepNo(state, mo.itemId, stepNo);
    const nextWi = state.workInstructions.find((w) => w.moNo === moNo && w.stepNo === next);
    if (nextWi) nextWi.inputQty = goodQty;
  }
}
