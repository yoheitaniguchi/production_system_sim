// useReducer用reducer。actionを各ドメインモジュールへディスパッチする（design.md §7）
import {
  CHAIR_PRESET,
  initialBom,
  initialCustomers,
  initialItems,
  initialRoutingSteps,
  initialSuppliers,
  initialWorkCenters,
} from "../data/masterData";
import type {
  BomLine,
  Customer,
  ItemMaster,
  MasterSnapshot,
  RoutingStep,
  SimulationState,
  Supplier,
  WorkCenter,
} from "../types";
import { computeDashboardSnapshot } from "./dashboard";
import { adjustStock } from "./inventory";
import {
  addBomLine,
  addItem,
  addPartner,
  addRoutingStep,
  addWorkCenter,
  deleteBomLine,
  deleteItem,
  deletePartner,
  deleteRoutingStep,
  deleteWorkCenter,
  updateBomLine,
  updateItem,
  updatePartnerName,
  updateRoutingStep,
  updateWorkCenter,
  type ItemPatch,
  type PartnerType,
} from "./masterData";
import { assertSnapshotUsable } from "./masterIO";
import { firmAllPlannedOrders, runMRP } from "./mrp";
import { ackPurchaseOrder, receivePurchaseOrder } from "./procurement";
import { completeStep, releaseMfgOrder, splitMfgOrder, startStep } from "./production";
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
  | {
      type: "MFG_SPLIT";
      payload: { moNo: string; splitQty: number; newStartDay: number; newDueDay: number };
    }
  | { type: "WI_START"; payload: { moNo: string; stepNo: number } }
  | { type: "WI_COMPLETE"; payload: { moNo: string; stepNo: number; goodQty: number; scrapQty: number } }
  | { type: "STOCK_ADJUST"; payload: { itemId: string; deltaQty: number } }
  | { type: "SHIPMENT_ALLOCATE"; payload: { soNo: string; lineNo: number } }
  | { type: "SHIPMENT_SHIP"; payload: { shipNo: string } }
  | { type: "SHIPMENT_CANCEL"; payload: { shipNo: string } }
  | { type: "ADVANCE_DAY" }
  | { type: "RESET" }
  // マスタCRUD（design.md §7）。フィールドごとにactionを増やさず、エンティティごとに
  // ADD / UPDATE(patch) / DELETE の3本へ統一する
  | { type: "MASTER_ADD_ITEM"; payload: { item: ItemMaster } }
  | { type: "MASTER_UPDATE_ITEM"; payload: { itemId: string; patch: ItemPatch } }
  | { type: "MASTER_DELETE_ITEM"; payload: { itemId: string } }
  | { type: "MASTER_ADD_BOM_LINE"; payload: { line: BomLine } }
  | { type: "MASTER_UPDATE_BOM_LINE"; payload: { parentItemId: string; childItemId: string; patch: { qtyPer: number } } }
  | { type: "MASTER_DELETE_BOM_LINE"; payload: { parentItemId: string; childItemId: string } }
  | { type: "MASTER_ADD_ROUTING_STEP"; payload: { step: RoutingStep } }
  | {
      type: "MASTER_UPDATE_ROUTING_STEP";
      payload: { itemId: string; stepNo: number; patch: { workCenter?: string; stdTimeMin?: number } };
    }
  | { type: "MASTER_DELETE_ROUTING_STEP"; payload: { itemId: string; stepNo: number } }
  | { type: "MASTER_ADD_WORK_CENTER"; payload: { workCenter: WorkCenter } }
  | {
      type: "MASTER_UPDATE_WORK_CENTER";
      payload: { workCenter: string; patch: { ratePerHour?: number; capacityMinPerDay?: number } };
    }
  | { type: "MASTER_DELETE_WORK_CENTER"; payload: { workCenter: string } }
  | { type: "MASTER_ADD_PARTNER"; payload: { partnerType: PartnerType; partnerId: string; name: string } }
  | { type: "MASTER_UPDATE_PARTNER_NAME"; payload: { partnerType: PartnerType; partnerId: string; name: string } }
  | { type: "MASTER_DELETE_PARTNER"; payload: { partnerType: PartnerType; partnerId: string } }
  | { type: "MASTER_IMPORT"; payload: { snapshot: MasterSnapshot } }
  | { type: "MASTER_RESET_TO_PRESET" };

/** データ増分ログ（design.md EXT-8）の対象テーブル。行の追加・削除のみを見る（値の更新は対象外） */
const TABLE_LABELS = {
  items: "ITEM",
  bom: "BOM_LINE",
  routingSteps: "ROUTING_STEP",
  workCenters: "WORK_CENTER",
  customers: "CUSTOMER",
  suppliers: "SUPPLIER",
  salesOrders: "SALES_ORDER",
  soLines: "SO_LINE",
  plannedOrders: "PLANNED_ORDER",
  mfgOrders: "MFG_ORDER",
  workInstructions: "WORK_INSTRUCTION",
  purchaseOrders: "PURCHASE_ORDER",
  stocks: "STOCK",
  stockTxns: "STOCK_TXN",
  shipments: "SHIPMENT",
  lots: "LOT",
  lotGenealogy: "LOT_GENEALOGY",
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
  upsertDashboardSnapshot(next);
  return next;
}

/**
 * stateの現在日（state.day）分のダッシュボードスナップショットを記録する。同じ日の記録が既にあれば
 * 上書きし（1日のうちに複数操作しても履歴が1日1件のまま最新値を反映する）、日を跨いだら追記する。
 */
function upsertDashboardSnapshot(state: SimulationState): void {
  const snapshot = computeDashboardSnapshot(state);
  const last = state.dashboardHistory[state.dashboardHistory.length - 1];
  if (last && last.day === snapshot.day) {
    state.dashboardHistory[state.dashboardHistory.length - 1] = snapshot;
  } else {
    state.dashboardHistory.push(snapshot);
  }
}

function emptyStateWithMasters(
  items: ItemMaster[],
  bom: BomLine[],
  routingSteps: RoutingStep[],
  customers: Customer[],
  suppliers: Supplier[],
  workCenters: WorkCenter[],
): SimulationState {
  const state: SimulationState = {
    day: 0,
    items,
    bom,
    routingSteps,
    customers,
    suppliers,
    workCenters,
    salesOrders: [],
    soLines: [],
    plannedOrders: [],
    mfgOrders: [],
    workInstructions: [],
    purchaseOrders: [],
    stocks: [],
    stockTxns: [],
    shipments: [],
    lots: [],
    lotGenealogy: [],
    eventLog: [],
    dashboardHistory: [],
    nextSoSeq: 1,
    nextMoSeq: 1,
    nextPoSeq: 1,
    nextTxnSeq: 1,
    nextShipSeq: 1,
    nextLotSeq: 1,
  };
  upsertDashboardSnapshot(state);
  return state;
}

export function createInitialState(): SimulationState {
  return emptyStateWithMasters(
    structuredClone(initialItems),
    structuredClone(initialBom),
    structuredClone(initialRoutingSteps),
    structuredClone(initialCustomers),
    structuredClone(initialSuppliers),
    structuredClone(initialWorkCenters),
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
        structuredClone(state.workCenters),
      );

    case "ADVANCE_DAY": {
      const next = structuredClone(state);
      next.day += 1;
      upsertDashboardSnapshot(next);
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

    case "MFG_SPLIT":
      return applyAction(state, (next) => {
        const newMoNo = splitMfgOrder(
          next,
          action.payload.moNo,
          action.payload.splitQty,
          action.payload.newStartDay,
          action.payload.newDueDay,
        );
        return `${action.payload.moNo} を分割し ${newMoNo}（x${action.payload.splitQty}、着手日 D+${action.payload.newStartDay}）を新設した`;
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

    case "MASTER_ADD_ITEM":
      return applyAction(state, (next) => addItem(next, action.payload.item));

    case "MASTER_UPDATE_ITEM":
      return applyAction(state, (next) => updateItem(next, action.payload.itemId, action.payload.patch));

    case "MASTER_DELETE_ITEM":
      return applyAction(state, (next) => deleteItem(next, action.payload.itemId));

    case "MASTER_ADD_BOM_LINE":
      return applyAction(state, (next) => addBomLine(next, action.payload.line));

    case "MASTER_UPDATE_BOM_LINE":
      return applyAction(state, (next) =>
        updateBomLine(next, action.payload.parentItemId, action.payload.childItemId, action.payload.patch),
      );

    case "MASTER_DELETE_BOM_LINE":
      return applyAction(state, (next) =>
        deleteBomLine(next, action.payload.parentItemId, action.payload.childItemId),
      );

    case "MASTER_ADD_ROUTING_STEP":
      return applyAction(state, (next) => addRoutingStep(next, action.payload.step));

    case "MASTER_UPDATE_ROUTING_STEP":
      return applyAction(state, (next) =>
        updateRoutingStep(next, action.payload.itemId, action.payload.stepNo, action.payload.patch),
      );

    case "MASTER_DELETE_ROUTING_STEP":
      return applyAction(state, (next) => deleteRoutingStep(next, action.payload.itemId, action.payload.stepNo));

    case "MASTER_ADD_WORK_CENTER":
      return applyAction(state, (next) => addWorkCenter(next, action.payload.workCenter));

    case "MASTER_UPDATE_WORK_CENTER":
      return applyAction(state, (next) => updateWorkCenter(next, action.payload.workCenter, action.payload.patch));

    case "MASTER_DELETE_WORK_CENTER":
      return applyAction(state, (next) => deleteWorkCenter(next, action.payload.workCenter));

    case "MASTER_ADD_PARTNER":
      return applyAction(state, (next) =>
        addPartner(next, action.payload.partnerType, action.payload.partnerId, action.payload.name),
      );

    case "MASTER_UPDATE_PARTNER_NAME":
      return applyAction(state, (next) =>
        updatePartnerName(next, action.payload.partnerType, action.payload.partnerId, action.payload.name),
      );

    case "MASTER_DELETE_PARTNER":
      return applyAction(state, (next) => deletePartner(next, action.payload.partnerType, action.payload.partnerId));

    case "MASTER_IMPORT":
      return applyMasterSnapshot(state, action.payload.snapshot, "マスタをインポートした");

    case "MASTER_RESET_TO_PRESET":
      return applyMasterSnapshot(state, CHAIR_PRESET, "マスタを既定プリセット（木製イス）に戻した");

    default:
      return state;
  }
}

/**
 * マスタ一式を差し替える（MASTER_IMPORT / MASTER_RESET_TO_PRESET）。
 * 既存トランザクションの品目コードが新しいマスタと一致する保証がないため、
 * RESETと同じく全トランザクションを初期化する（design.md EXT-26）。
 */
function applyMasterSnapshot(state: SimulationState, snapshot: MasterSnapshot, message: string): SimulationState {
  try {
    assertSnapshotUsable(snapshot);
  } catch (err) {
    const next = structuredClone(state);
    next.eventLog.push({
      day: next.day,
      message: `[エラー] ${err instanceof Error ? err.message : String(err)}`,
      tableDeltas: [],
    });
    return next;
  }

  const next = emptyStateWithMasters(
    structuredClone(snapshot.items),
    structuredClone(snapshot.bom),
    structuredClone(snapshot.routingSteps),
    structuredClone(snapshot.customers),
    structuredClone(snapshot.suppliers),
    structuredClone(snapshot.workCenters),
  );
  next.eventLog.push({
    day: 0,
    message: `${message}（全トランザクションを初期化しました）`,
    tableDeltas: [
      `ITEM ${next.items.length}`,
      `BOM_LINE ${next.bom.length}`,
      `ROUTING_STEP ${next.routingSteps.length}`,
    ],
  });
  return next;
}
