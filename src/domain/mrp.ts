// MRP展開・計画オーダ確定（v5-spec.md §7.1、design.md EXT-1・EXT-6・EXT-9）
import type { BomLine, ItemMaster, MfgOrder, PlannedOrder, PurchaseOrder, SimulationState } from "../types";
import { pegKey } from "./pegging";

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
  ctx: { items: ItemMaster[]; bom: BomLine[]; supply: Record<string, number>; ploSeq: number; plannedOrders: PlannedOrder[] },
): void {
  const item = ctx.items.find((i) => i.itemId === itemId);
  if (!item) return;

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
    for (const line of ctx.bom.filter((b) => b.parentItemId === itemId)) {
      explode(line.childItemId, netQty * line.qtyPer, startDay, ploNo, level + 1, ctx);
    }
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

  const ctx = { items: state.items, bom: state.bom, supply, ploSeq: 1, plannedOrders: state.plannedOrders };
  for (const demand of demands) {
    explode(demand.itemId, demand.qty, demand.due, demand.pegTo, 0, ctx);
  }
}

/**
 * 計画オーダの一括確定（v5-spec.md UC-07）。MAKEはMFG_ORDER＋工順分のWORK_INSTRUCTION、
 * BUYはPURCHASE_ORDERへ転記し、PLANNED_ORDERは全削除する。
 */
export function firmAllPlannedOrders(state: SimulationState, day: number): void {
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
