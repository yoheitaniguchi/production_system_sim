// useReducer用reducer。actionを各ドメインモジュールへディスパッチする（design.md §7）
import {
  initialBom,
  initialCustomers,
  initialItems,
  initialRoutingSteps,
  initialSuppliers,
} from "../data/masterData";
import type {
  BomLine,
  Customer,
  ItemMaster,
  RoutingStep,
  SimulationState,
  Supplier,
} from "../types";
import { adjustStock } from "./inventory";
import { firmAllPlannedOrders, runMRP } from "./mrp";
import { ackPurchaseOrder, receivePurchaseOrder } from "./procurement";
import { completeStep, releaseMfgOrder, startStep } from "./production";
import { cancelSalesOrder, confirmDelivery, createSalesOrder, type CreateSalesOrderInput } from "./salesOrder";
import { allocateShipment, cancelShipmentAllocation, shipOut } from "./shipment";

export type SimulationAction =
  | { type: "SO_CREATE"; payload: CreateSalesOrderInput }
  | { type: "SO_CONFIRM_DELIVERY"; payload: { soNo: string; confirmDay: number } }
  | { type: "SO_CANCEL"; payload: { soNo: string } }
  | { type: "MRP_RUN" }
  | { type: "PLANNED_ORDERS_FIRM" }
  | { type: "PO_ACK"; payload: { poNo: string; confirmDay: number } }
  | { type: "PO_RECEIVE"; payload: { poNo: string } }
  | { type: "MFG_RELEASE"; payload: { moNo: string } }
  | { type: "WI_START"; payload: { moNo: string; stepNo: number } }
  | { type: "WI_COMPLETE"; payload: { moNo: string; stepNo: number; goodQty: number; scrapQty: number } }
  | { type: "STOCK_ADJUST"; payload: { itemId: string; deltaQty: number } }
  | { type: "SHIPMENT_ALLOCATE"; payload: { soNo: string; lineNo: number } }
  | { type: "SHIPMENT_SHIP"; payload: { shipNo: string } }
  | { type: "SHIPMENT_CANCEL"; payload: { shipNo: string } }
  | { type: "ADVANCE_DAY" }
  | { type: "RESET" }
  | { type: "MASTER_UPDATE_ITEM_LEAD_TIME"; payload: { itemId: string; leadTimeDays: number } }
  | { type: "MASTER_UPDATE_BOM_QTY_PER"; payload: { parentItemId: string; childItemId: string; qtyPer: number } }
  | { type: "MASTER_UPDATE_ROUTING_STD_TIME"; payload: { itemId: string; stepNo: number; stdTimeMin: number } }
  | { type: "MASTER_UPDATE_PARTNER_NAME"; payload: { partnerType: "CUSTOMER" | "SUPPLIER"; partnerId: string; name: string } };

/** データ増分ログ（design.md EXT-8）の対象テーブル。行の追加・削除のみを見る（値の更新は対象外） */
const TABLE_LABELS = {
  salesOrders: "SALES_ORDER",
  soLines: "SO_LINE",
  plannedOrders: "PLANNED_ORDER",
  mfgOrders: "MFG_ORDER",
  workInstructions: "WORK_INSTRUCTION",
  purchaseOrders: "PURCHASE_ORDER",
  stocks: "STOCK",
  stockTxns: "STOCK_TXN",
  shipments: "SHIPMENT",
} as const satisfies Partial<Record<keyof SimulationState, string>>;

type CountedTable = keyof typeof TABLE_LABELS;

function snapshotCounts(state: SimulationState): Record<CountedTable, number> {
  const result = {} as Record<CountedTable, number>;
  for (const key of Object.keys(TABLE_LABELS) as CountedTable[]) {
    result[key] = state[key].length;
  }
  return result;
}

function diffTableDeltas(before: Record<CountedTable, number>, after: SimulationState): string[] {
  const deltas: string[] = [];
  for (const key of Object.keys(TABLE_LABELS) as CountedTable[]) {
    const diff = after[key].length - before[key];
    if (diff !== 0) deltas.push(`${TABLE_LABELS[key]} ${diff > 0 ? "+" : ""}${diff}`);
  }
  return deltas;
}

/**
 * stateをクローンした上でfnを実行し、成功時は業務メッセージ、失敗時はエラーメッセージを
 * データ増分ログ（EXT-8）として記録する。fnの実行中に一部の更新が既に行われていても
 * （例：バックフラッシュの部品不足でHOLDへ遷移した後に例外を投げる場合）、その変更は保持する。
 */
function applyAction(state: SimulationState, fn: (next: SimulationState) => string): SimulationState {
  const next = structuredClone(state);
  const before = snapshotCounts(next);
  try {
    const message = fn(next);
    next.eventLog.push({ day: next.day, message, tableDeltas: diffTableDeltas(before, next) });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    next.eventLog.push({ day: next.day, message: `[エラー] ${message}`, tableDeltas: diffTableDeltas(before, next) });
  }
  return next;
}

function emptyStateWithMasters(
  items: ItemMaster[],
  bom: BomLine[],
  routingSteps: RoutingStep[],
  customers: Customer[],
  suppliers: Supplier[],
): SimulationState {
  return {
    day: 0,
    items,
    bom,
    routingSteps,
    customers,
    suppliers,
    salesOrders: [],
    soLines: [],
    plannedOrders: [],
    mfgOrders: [],
    workInstructions: [],
    purchaseOrders: [],
    stocks: [],
    stockTxns: [],
    shipments: [],
    eventLog: [],
    nextSoSeq: 1,
    nextMoSeq: 1,
    nextPoSeq: 1,
    nextTxnSeq: 1,
    nextShipSeq: 1,
  };
}

export function createInitialState(): SimulationState {
  return emptyStateWithMasters(
    structuredClone(initialItems),
    structuredClone(initialBom),
    structuredClone(initialRoutingSteps),
    structuredClone(initialCustomers),
    structuredClone(initialSuppliers),
  );
}

export function simulationReducer(state: SimulationState, action: SimulationAction): SimulationState {
  switch (action.type) {
    case "RESET":
      // v5-spec.md UC-23：全トランザクションを初期化する。マスタ（編集済みの値を含む）は保持する
      return emptyStateWithMasters(
        structuredClone(state.items),
        structuredClone(state.bom),
        structuredClone(state.routingSteps),
        structuredClone(state.customers),
        structuredClone(state.suppliers),
      );

    case "ADVANCE_DAY": {
      const next = structuredClone(state);
      next.day += 1;
      return next;
    }

    case "SO_CREATE":
      return applyAction(state, (next) => {
        const soNo = createSalesOrder(next, action.payload, next.day);
        return `${soNo} を受注登録した（${action.payload.itemId} x${action.payload.qty}、希望納期 D+${action.payload.requestDay}）`;
      });

    case "SO_CONFIRM_DELIVERY":
      return applyAction(state, (next) => {
        confirmDelivery(next, action.payload.soNo, action.payload.confirmDay);
        return `${action.payload.soNo} の納期を D+${action.payload.confirmDay} で回答した`;
      });

    case "SO_CANCEL":
      return applyAction(state, (next) => {
        cancelSalesOrder(next, action.payload.soNo);
        return `${action.payload.soNo} を取消した`;
      });

    case "MRP_RUN":
      return applyAction(state, (next) => {
        runMRP(next);
        return `MRPを実行した（計画オーダ ${next.plannedOrders.length} 件）`;
      });

    case "PLANNED_ORDERS_FIRM":
      return applyAction(state, (next) => {
        const count = next.plannedOrders.length;
        firmAllPlannedOrders(next, next.day);
        return `計画オーダ ${count} 件を確定した`;
      });

    case "PO_ACK":
      return applyAction(state, (next) => {
        ackPurchaseOrder(next, action.payload.poNo, action.payload.confirmDay);
        return `${action.payload.poNo} の納期回答を D+${action.payload.confirmDay} で登録した`;
      });

    case "PO_RECEIVE":
      return applyAction(state, (next) => {
        receivePurchaseOrder(next, action.payload.poNo, next.day);
        return `${action.payload.poNo} の入荷を計上した`;
      });

    case "MFG_RELEASE":
      return applyAction(state, (next) => {
        releaseMfgOrder(next, action.payload.moNo);
        return `${action.payload.moNo} をリリースした`;
      });

    case "WI_START":
      return applyAction(state, (next) => {
        startStep(next, action.payload.moNo, action.payload.stepNo, next.day);
        return `${action.payload.moNo} 工程${action.payload.stepNo} に着手した`;
      });

    case "WI_COMPLETE":
      return applyAction(state, (next) => {
        completeStep(next, action.payload.moNo, action.payload.stepNo, action.payload.goodQty, action.payload.scrapQty, next.day);
        return `${action.payload.moNo} 工程${action.payload.stepNo} を完了した（良品${action.payload.goodQty}・不良${action.payload.scrapQty}）`;
      });

    case "STOCK_ADJUST":
      return applyAction(state, (next) => {
        adjustStock(next, action.payload.itemId, action.payload.deltaQty, next.day);
        return `${action.payload.itemId} の在庫を ${action.payload.deltaQty >= 0 ? "+" : ""}${action.payload.deltaQty} 調整した`;
      });

    case "SHIPMENT_ALLOCATE":
      return applyAction(state, (next) => {
        const before = next.shipments.length;
        allocateShipment(next, action.payload.soNo, action.payload.lineNo, next.day);
        const shipment = next.shipments[before];
        return `${action.payload.soNo}-${action.payload.lineNo} を ${shipment.qty} 個引き当てた（${shipment.shipNo}）`;
      });

    case "SHIPMENT_SHIP":
      return applyAction(state, (next) => {
        shipOut(next, action.payload.shipNo, next.day);
        return `${action.payload.shipNo} の出荷実績を登録した`;
      });

    case "SHIPMENT_CANCEL":
      return applyAction(state, (next) => {
        cancelShipmentAllocation(next, action.payload.shipNo);
        return `${action.payload.shipNo} の引当を解除した`;
      });

    case "MASTER_UPDATE_ITEM_LEAD_TIME":
      return applyAction(state, (next) => {
        const item = next.items.find((i) => i.itemId === action.payload.itemId);
        if (!item) throw new Error(`品目が見つかりません: ${action.payload.itemId}`);
        item.leadTimeDays = action.payload.leadTimeDays;
        return `${item.itemId} の標準リードタイムを ${action.payload.leadTimeDays} 日に変更した`;
      });

    case "MASTER_UPDATE_BOM_QTY_PER":
      return applyAction(state, (next) => {
        const line = next.bom.find(
          (b) => b.parentItemId === action.payload.parentItemId && b.childItemId === action.payload.childItemId,
        );
        if (!line) throw new Error(`BOM行が見つかりません: ${action.payload.parentItemId} -> ${action.payload.childItemId}`);
        line.qtyPer = action.payload.qtyPer;
        return `BOM ${line.parentItemId} -> ${line.childItemId} の員数を ${action.payload.qtyPer} に変更した`;
      });

    case "MASTER_UPDATE_ROUTING_STD_TIME":
      return applyAction(state, (next) => {
        const step = next.routingSteps.find(
          (s) => s.itemId === action.payload.itemId && s.stepNo === action.payload.stepNo,
        );
        if (!step) throw new Error(`工順が見つかりません: ${action.payload.itemId} 工程${action.payload.stepNo}`);
        step.stdTimeMin = action.payload.stdTimeMin;
        return `${step.itemId} 工程${step.stepNo} の標準時間を ${action.payload.stdTimeMin} 分に変更した`;
      });

    case "MASTER_UPDATE_PARTNER_NAME":
      return applyAction(state, (next) => {
        if (action.payload.partnerType === "CUSTOMER") {
          const customer = next.customers.find((c) => c.customerId === action.payload.partnerId);
          if (!customer) throw new Error(`顧客が見つかりません: ${action.payload.partnerId}`);
          customer.name = action.payload.name;
        } else {
          const supplier = next.suppliers.find((s) => s.supplierId === action.payload.partnerId);
          if (!supplier) throw new Error(`仕入先が見つかりません: ${action.payload.partnerId}`);
          supplier.name = action.payload.name;
        }
        return `${action.payload.partnerId} の名称を「${action.payload.name}」に変更した`;
      });

    default:
      return state;
  }
}
