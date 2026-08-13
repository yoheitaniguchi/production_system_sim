// ドメインの型定義（docs/design.md §4：v5仕様書（docs/v5-spec.md）の13テーブルとの対応）
//
// 日数フィールドはすべて D0 からの経過日数（整数、v5-spec.md §4後注）。
// SALES_ORDER : SO_LINE は design.md §4 の決定により常に1:1（1受注＝1明細固定）。

export type MakeBuy = "MAKE" | "BUY";

export interface ItemMaster {
  itemId: string;
  name: string;
  makeBuy: MakeBuy;
  /** 標準リードタイム（日数）。MAKEなら製造、BUYなら調達のリードタイムとして扱う */
  leadTimeDays: number;
  /** 発注先の仕入先（BUY品目のみ。design.md EXT-9：v5仕様書はITEMとPARTNERの対応を規定していない） */
  defaultSupplierId?: string;
}

/** BOMの親子関係。1行 = 親品目1つに対する子品目1つとその員数 */
export interface BomLine {
  parentItemId: string;
  childItemId: string;
  qtyPer: number;
}

/** 工順マスタ（v5-spec.md §1.1）。MAKE品目のみが持つ */
export interface RoutingStep {
  itemId: string;
  stepNo: number;
  workCenter: string;
  stdTimeMin: number;
}

export interface Customer {
  customerId: string;
  name: string;
}

export interface Supplier {
  supplierId: string;
  name: string;
}

/** SO_LINEの状態遷移（v5-spec.md §6.1） */
export type SoLineStatus = "RECEIVED" | "CONFIRMED" | "PARTIAL" | "CLOSED" | "CANCELED";

export interface SalesOrder {
  soNo: string;
  customerId: string;
  orderedDay: number;
}

export interface SoLine {
  soNo: string;
  /** design.md §4により常に1（1受注＝1明細固定） */
  lineNo: number;
  itemId: string;
  qty: number;
  /** 希望納期 */
  requestDay: number;
  /** 回答納期。納期回答前はnull（design.md EXT-7：MRP試算に基づく自動計算はせず、人が確定する） */
  confirmDay: number | null;
  shippedQty: number;
  status: SoLineStatus;
}

/**
 * 計画オーダ（v5-spec.md §6.2）。状態を持たない揮発データで、MRP実行のたびに全削除・全再生成される。
 * pegTo は親PLO番号（内製の子展開時）または受注のペグキー（"SO-001-1"形式、v5-spec.md §7.4）。
 */
export interface PlannedOrder {
  ploNo: string;
  itemId: string;
  /** 正味所要量 */
  qty: number;
  dueDay: number;
  /** 着手日（MAKE）または発注日（BUY） */
  startDay: number;
  orderType: MakeBuy;
  pegTo: string;
  bomLevel: number;
}

/** 製造オーダの状態遷移（v5-spec.md §6.3） */
export type MfgOrderStatus = "FIRM" | "RELEASED" | "WIP" | "HOLD" | "DONE" | "CANCELED";

export interface MfgOrder {
  moNo: string;
  /** 由来の計画オーダ番号。確定後もペギング追跡のため保持する（v5-spec.md §7.4） */
  ploNo: string;
  pegTo: string;
  itemId: string;
  planQty: number;
  goodQty: number;
  scrapQty: number;
  startDay: number;
  dueDay: number;
  status: MfgOrderStatus;
}

/** 作業指示の状態遷移（v5-spec.md §6.4） */
export type WorkInstructionStatus = "WAIT" | "WIP" | "DONE";

export interface WorkInstruction {
  moNo: string;
  stepNo: number;
  workCenter: string;
  /** 投入数。第1工程はMFG_ORDER.planQty、以降は前工程のgoodQty（v5-spec.md §6.4） */
  inputQty: number;
  goodQty: number;
  scrapQty: number;
  actualStartDay: number | null;
  actualEndDay: number | null;
  status: WorkInstructionStatus;
}

/** 購買オーダの状態遷移（v5-spec.md §6.5） */
export type PurchaseOrderStatus = "ORDERED" | "ACKED" | "PARTIAL" | "CLOSED" | "CANCELED";

export interface PurchaseOrder {
  poNo: string;
  ploNo: string;
  pegTo: string;
  supplierId: string;
  itemId: string;
  qty: number;
  orderDay: number;
  /** 希望納期 */
  dueDay: number;
  /** 仕入先の回答納期。回答前はnull */
  confirmDay: number | null;
  receivedQty: number;
  status: PurchaseOrderStatus;
}

/** 品目単位のfungibleな在庫残高（design.md §4：受注ごとのペグ管理はしない） */
export interface Stock {
  itemId: string;
  onHand: number;
  allocated: number;
}

export type StockTxnType = "RCV" | "ISS" | "PRD" | "SHP" | "ADJ";

export interface StockTxn {
  txnId: string;
  itemId: string;
  txnType: StockTxnType;
  /** 符号付き数量（v5-spec.md §4） */
  qty: number;
  txnDay: number;
  /** 起票元オーダ番号（MO/PO/SHIPMENT/棚卸操作） */
  refNo: string;
}

export type ShipmentStatus = "ALLOCATED" | "SHIPPED" | "CANCELED";

export interface Shipment {
  shipNo: string;
  soNo: string;
  lineNo: number;
  qty: number;
  planDay: number;
  actualDay: number | null;
  status: ShipmentStatus;
}

/** データ増分ログ（design.md EXT-8：業務メッセージ＋テーブル別行数差分を1操作＝1エントリで記録） */
export interface EventLogEntry {
  day: number;
  message: string;
  /** 例：["PLANNED_ORDER -5", "MFG_ORDER +2", "PURCHASE_ORDER +3", "WORK_INSTRUCTION +3"] */
  tableDeltas: string[];
}

export interface SimulationState {
  day: number;

  // マスタ
  items: ItemMaster[];
  bom: BomLine[];
  routingSteps: RoutingStep[];
  customers: Customer[];
  suppliers: Supplier[];

  // トランザクション・状態を持つテーブル
  salesOrders: SalesOrder[];
  soLines: SoLine[];
  plannedOrders: PlannedOrder[];
  mfgOrders: MfgOrder[];
  workInstructions: WorkInstruction[];
  purchaseOrders: PurchaseOrder[];
  stocks: Stock[];
  stockTxns: StockTxn[];
  shipments: Shipment[];

  eventLog: EventLogEntry[];

  // 採番用シーケンス。PLANNED_ORDERはMRP実行のたびに全削除・全再生成される揮発データ
  // （v5-spec.md §6.2）であり、番号もrunMRP()内でPLO-001から採番し直すため、ここには持たない
  nextSoSeq: number;
  nextMoSeq: number;
  nextPoSeq: number;
  nextTxnSeq: number;
  nextShipSeq: number;
}
