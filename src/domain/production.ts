// 工程着手・完了・バックフラッシュ（v5-spec.md §7.3・§6.3・§6.4、design.md EXT-10・EXT-33）
import type { MfgOrder, SimulationState } from "../types";
import { consumeFifo, createLot } from "./lot";
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

/**
 * 製造オーダの分割（design.md EXT-33）。能力超過（山積み）を解消するため、未リリースの製造オーダを
 * 数量で2件に分け、分割先を別の着手日／完了予定日へ振り分けられるようにする人による判断操作。
 * 有限能力スケジューリング（自動リスケジュール）ではなく、あくまで人が手動で発動する操作であり、
 * capacity.ts側の山積み計算・AlertBarの警告表示は状態を保持しない導出値のため、分割後は自動的に
 * 再計算されて警告が消える（design.md §9.2の「見せるだけ」という方針とは矛盾しない）。
 * FIRM（未リリース）のオーダのみ対象とする。リリース後は作業指示の投入数・実績が積み上がり始め、
 * 分割時の再配分ルールが自明でなくなるため対象外とする。
 */
export function splitMfgOrder(
  state: SimulationState,
  moNo: string,
  splitQty: number,
  newStartDay: number,
  newDueDay: number,
): string {
  const mo = state.mfgOrders.find((m) => m.moNo === moNo);
  if (!mo) throw new ProductionError(`製造オーダが見つかりません: ${moNo}`);
  if (mo.status !== "FIRM") throw new ProductionError(`確定（FIRM）以外は分割できません: ${moNo}`);
  if (!Number.isInteger(splitQty) || splitQty <= 0 || splitQty >= mo.planQty) {
    throw new ProductionError(`分割数量は1以上${mo.planQty - 1}以下の整数で指定してください: ${moNo}`);
  }
  if (!Number.isInteger(newStartDay) || !Number.isInteger(newDueDay) || newStartDay < 0 || newDueDay < newStartDay) {
    throw new ProductionError(`分割後の着手日・完了予定日を正しく指定してください: ${moNo}`);
  }

  mo.planQty -= splitQty;
  const first = firstStepNo(state, mo.itemId);
  const firstWi = state.workInstructions.find((w) => w.moNo === moNo && w.stepNo === first);
  if (firstWi) firstWi.inputQty = mo.planQty;

  const newMoNo = `MO-${String(state.nextMoSeq).padStart(3, "0")}`;
  state.nextMoSeq += 1;
  const newMo: MfgOrder = {
    moNo: newMoNo,
    ploNo: mo.ploNo,
    pegTo: mo.pegTo,
    itemId: mo.itemId,
    planQty: splitQty,
    goodQty: 0,
    scrapQty: 0,
    startDay: newStartDay,
    dueDay: newDueDay,
    status: "FIRM",
    bomLevel: mo.bomLevel,
  };
  state.mfgOrders.push(newMo);

  for (const step of state.routingSteps.filter((s) => s.itemId === mo.itemId)) {
    state.workInstructions.push({
      moNo: newMoNo,
      stepNo: step.stepNo,
      workCenter: step.workCenter,
      inputQty: step.stepNo === first ? splitQty : 0,
      goodQty: 0,
      scrapQty: 0,
      actualStartDay: null,
      actualEndDay: null,
      status: "WAIT",
    });
  }

  return newMoNo;
}

/**
 * 着手可能かどうかの判定（startStepと同じガード条件を副作用無しで再利用する。
 * 工順の順序探索ロジックをUI側・todayActions.tsで重複させないための集約）
 */
export function canStartStep(state: SimulationState, moNo: string, stepNo: number): boolean {
  const mo = state.mfgOrders.find((m) => m.moNo === moNo);
  if (!mo) return false;
  const wi = state.workInstructions.find((w) => w.moNo === moNo && w.stepNo === stepNo);
  if (!wi || wi.status !== "WAIT") return false;

  const steps = stepsOf(state, mo.itemId);
  const stepIdx = steps.indexOf(stepNo);
  if (stepIdx > 0) {
    const prevStepNo = steps[stepIdx - 1];
    const prevWi = state.workInstructions.find((w) => w.moNo === moNo && w.stepNo === prevStepNo);
    return prevWi?.status === "DONE";
  }
  return mo.status === "RELEASED";
}

/** 工程着手（v5-spec.md §7.3 startStep） */
export function startStep(state: SimulationState, moNo: string, stepNo: number, day: number): void {
  const mo = state.mfgOrders.find((m) => m.moNo === moNo);
  if (!mo) throw new ProductionError(`製造オーダが見つかりません: ${moNo}`);
  const wi = state.workInstructions.find((w) => w.moNo === moNo && w.stepNo === stepNo);
  if (!wi) throw new ProductionError(`作業指示が見つかりません: ${moNo} 工程${stepNo}`);
  if (wi.status !== "WAIT") throw new ProductionError(`未着手（WAIT）以外は着手できません: ${moNo} 工程${stepNo}`);

  // 前工程が完了していないと投入数が確定しない（v5-spec.md §7.3 投入数の決定ルール）ため、
  // 工順の順序どおりにしか着手できないようにガードする
  const steps = stepsOf(state, mo.itemId);
  const stepIdx = steps.indexOf(stepNo);
  if (stepIdx > 0) {
    const prevStepNo = steps[stepIdx - 1];
    const prevWi = state.workInstructions.find((w) => w.moNo === moNo && w.stepNo === prevStepNo);
    if (!prevWi || prevWi.status !== "DONE") {
      throw new ProductionError(`前工程（工程${prevStepNo}）が完了するまで着手できません: ${moNo} 工程${stepNo}`);
    }
  }

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
      // FIFO（作成日昇順）でロットを選択して消費する。複数ロットにまたがる場合は分割してTXNを
      // 起票する（v5-spec.md §11.3 Phase 2-B）
      for (const consumed of consumeFifo(state, line.childItemId, required)) {
        state.stockTxns.push({
          txnId: `TXN-${String(state.nextTxnSeq).padStart(4, "0")}`,
          itemId: line.childItemId,
          txnType: "ISS",
          qty: -consumed.qty,
          txnDay: day,
          refNo: moNo,
          lotNo: consumed.lotNo,
        });
        state.nextTxnSeq += 1;
      }
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

    // 完成入庫のたびに1ロット採番し、第1工程で消費したロットとのLOT_GENEALOGYを記録する
    // （v5-spec.md §11.3 Phase 2-B：「実際に何を使ったか」の系譜。ペギングとは別レイヤ）
    let producedLotNo: string | undefined;
    if (goodQty > 0) {
      const producedLot = createLot(state, mo.itemId, goodQty, day, moNo);
      producedLotNo = producedLot.lotNo;
      const consumedLots = state.stockTxns.filter(
        (t) => t.refNo === moNo && t.txnType === "ISS" && t.lotNo != null,
      );
      for (const consumed of consumedLots) {
        state.lotGenealogy.push({
          parentLot: consumed.lotNo!,
          childLot: producedLot.lotNo,
          moNo,
          consumedQty: Math.abs(consumed.qty),
        });
      }
    }

    state.stockTxns.push({
      txnId: `TXN-${String(state.nextTxnSeq).padStart(4, "0")}`,
      itemId: mo.itemId,
      txnType: "PRD",
      qty: goodQty,
      txnDay: day,
      refNo: moNo,
      lotNo: producedLotNo,
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
