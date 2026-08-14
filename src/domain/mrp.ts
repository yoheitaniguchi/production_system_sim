// MRP展開・計画オーダ確定（v5-spec.md §7.1、design.md EXT-1・EXT-6・EXT-9・EXT-19・EXT-22）
import type { BomLine, ItemMaster, MfgOrder, PlannedOrder, PurchaseOrder, SimulationState } from "../types";
import { MAX_BOM_DEPTH } from "./masterIntegrity";
import { pegKey } from "./pegging";

export class MrpError extends Error {}

function pad3(n: number): string {
  return String(n).padStart(3, "0");
}

function firstStep(state: SimulationState, itemId: string): number | undefined {
  const steps = state.routingSteps.filter((s) => s.itemId === itemId);
  return steps.length > 0 ? Math.min(...steps.map((s) => s.stepNo)) : undefined;
}

/** 品目別の供給量（現在庫＋注文残＋仕掛残）。design.md EXT-6によりHOLDのMFG_ORDERも算入する */
export function computeSupply(state: SimulationState): Record<string, number> {
  const supply: Record<string, number> = {};
  for (const item of state.items) {
    const onHand = state.stocks.find((s) => s.itemId === item.itemId)?.onHand ?? 0;
    const openPo = state.purchaseOrders
      .filter((po) => po.itemId === item.itemId && po.status !== "CLOSED" && po.status !== "CANCELED")
      .reduce((sum, po) => sum + (po.qty - po.receivedQty), 0);
    const openMo = state.mfgOrders
      .filter((mo) => mo.itemId === item.itemId && mo.status !== "DONE" && mo.status !== "CANCELED")
      .reduce((sum, mo) => sum + (mo.planQty - mo.goodQty), 0);
    supply[item.itemId] = onHand + openPo + openMo;
  }
  return supply;
}

function explode(
  itemId: string,
  grossQty: number,
  dueDay: number,
  pegTo: string,
  level: number,
  ctx: {
    items: ItemMaster[];
    bom: BomLine[];
    supply: Record<string, number>;
    ploSeq: number;
    plannedOrders: PlannedOrder[];
    /** 現在の展開経路上にある品目。BOM循環を検出して無限再帰を防ぐ（design.md EXT-19） */
    path: Set<string>;
  },
): void {
  const item = ctx.items.find((i) => i.itemId === itemId);
  if (!item) return;

  // マスタ登録時の循環チェック（masterIntegrity.wouldCreateBomCycle）をすり抜けたデータへの保険。
  // ここを抜けると再帰が止まらずブラウザごと固まるため、必ず例外にする
  if (ctx.path.has(itemId)) {
    throw new MrpError(`BOMが循環しているためMRPを実行できません: ${[...ctx.path, itemId].join(" -> ")}`);
  }
  if (level >= MAX_BOM_DEPTH) {
    throw new MrpError(`BOMの階層が深すぎます（上限${MAX_BOM_DEPTH}階層）: ${itemId}`);
  }

  const available = ctx.supply[itemId] ?? 0;
  const use = Math.min(available, grossQty);
  ctx.supply[itemId] = available - use;
  const netQty = grossQty - use;
  if (netQty <= 0) return;

  const startDay = dueDay - item.leadTimeDays;
  const ploNo = `PLO-${pad3(ctx.ploSeq)}`;
  ctx.ploSeq += 1;
  ctx.plannedOrders.push({
    ploNo,
    itemId,
    qty: netQty,
    dueDay,
    startDay,
    orderType: item.makeBuy,
    pegTo,
    bomLevel: level,
  });

  if (item.makeBuy === "MAKE") {
    ctx.path.add(itemId);
    for (const line of ctx.bom.filter((b) => b.parentItemId === itemId)) {
      explode(line.childItemId, netQty * line.qtyPer, startDay, ploNo, level + 1, ctx);
    }
    ctx.path.delete(itemId);
  }
}

/**
 * MRP実行（v5-spec.md §7.1 runMRP）。PLANNED_ORDERを全削除して再生成する。
 * design.md EXT-1：需要は必要日（confirmDay ?? requestDay）昇順、同着は受注番号昇順で展開する。
 */
export function runMRP(state: SimulationState): void {
  state.plannedOrders = [];
  const supply = computeSupply(state);

  const demands = state.soLines
    .filter((line) => line.status !== "CLOSED" && line.status !== "CANCELED" && line.qty - line.shippedQty > 0)
    .map((line) => ({
      itemId: line.itemId,
      qty: line.qty - line.shippedQty,
      due: line.confirmDay ?? line.requestDay,
      pegTo: pegKey(line.soNo, line.lineNo),
      soNo: line.soNo,
    }))
    .sort((a, b) => a.due - b.due || a.soNo.localeCompare(b.soNo));

  const ctx = {
    items: state.items,
    bom: state.bom,
    supply,
    ploSeq: 1,
    plannedOrders: state.plannedOrders,
    path: new Set<string>(),
  };
  for (const demand of demands) {
    explode(demand.itemId, demand.qty, demand.due, demand.pegTo, 0, ctx);
  }
}

/**
 * 計画オーダの一括確定（v5-spec.md UC-07）。MAKEはMFG_ORDER＋工順分のWORK_INSTRUCTION、
 * BUYはPURCHASE_ORDERへ転記し、PLANNED_ORDERは全削除する。
 */
export function firmAllPlannedOrders(state: SimulationState, day: number): void {
  // 確定してしまうと復旧できない不整合（完了不能な製造オーダ／発注先不明の購買オーダ）を
  // 事前に全件検査し、1件でも該当すれば何も確定しない（design.md EXT-22）
  for (const plo of state.plannedOrders) {
    if (plo.orderType === "MAKE") {
      if (!state.routingSteps.some((s) => s.itemId === plo.itemId)) {
        throw new MrpError(
          `工順が1行も無いため製造オーダを起票できません（作業指示が作られず完了できなくなります）: ${plo.itemId}`,
        );
      }
    } else {
      const item = state.items.find((i) => i.itemId === plo.itemId);
      if (!item?.defaultSupplierId) {
        throw new MrpError(`既定仕入先が未設定のため購買オーダを起票できません: ${plo.itemId}`);
      }
      if (!state.suppliers.some((s) => s.supplierId === item.defaultSupplierId)) {
        throw new MrpError(`既定仕入先が仕入先マスタに存在しません: ${plo.itemId} -> ${item.defaultSupplierId}`);
      }
    }
  }

  for (const plo of state.plannedOrders) {
    if (plo.orderType === "MAKE") {
      const moNo = `MO-${pad3(state.nextMoSeq)}`;
      state.nextMoSeq += 1;
      const mo: MfgOrder = {
        moNo,
        ploNo: plo.ploNo,
        pegTo: plo.pegTo,
        itemId: plo.itemId,
        planQty: plo.qty,
        goodQty: 0,
        scrapQty: 0,
        startDay: plo.startDay,
        dueDay: plo.dueDay,
        status: "FIRM",
      };
      state.mfgOrders.push(mo);

      const first = firstStep(state, plo.itemId);
      for (const step of state.routingSteps.filter((s) => s.itemId === plo.itemId)) {
        state.workInstructions.push({
          moNo,
          stepNo: step.stepNo,
          workCenter: step.workCenter,
          inputQty: step.stepNo === first ? mo.planQty : 0,
          goodQty: 0,
          scrapQty: 0,
          actualStartDay: null,
          actualEndDay: null,
          status: "WAIT",
        });
      }
    } else {
      const item = state.items.find((i) => i.itemId === plo.itemId);
      const poNo = `PO-${pad3(state.nextPoSeq)}`;
      state.nextPoSeq += 1;
      const po: PurchaseOrder = {
        poNo,
        ploNo: plo.ploNo,
        pegTo: plo.pegTo,
        supplierId: item?.defaultSupplierId ?? "",
        itemId: plo.itemId,
        qty: plo.qty,
        orderDay: day,
        dueDay: plo.dueDay,
        confirmDay: null,
        receivedQty: 0,
        status: "ORDERED",
      };
      state.purchaseOrders.push(po);
    }
  }
  state.plannedOrders = [];
}
