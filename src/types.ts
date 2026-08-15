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
  /** 購入単価（BUY品目のみ。v5-spec.md §11.2の原価積上げで材料費として使う） */
  purchasePrice?: number;
  /** 売価（受注される品目のみ。v5-spec.md §11.2の受注残高（金額）換算で使う） */
  salesPrice?: number;
}

/** 作業区マスタ（v5-spec.md §11.2）。原価積上げの加工費計算に使う賃率を持つ */
export interface WorkCenter {
  workCenter: string;
  ratePerHour: number;
  /**
   * 1日あたり稼働可能時間（分）。stdTimeMinと単位を揃え、能力計画（CRP、design.md §9・EXT-30〜32）の
   * 山積み計算で使う
   */
  capacityMinPerDay: number;
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
  /** 由来の計画オーダのBOMレベル（受注起点の真の階層深度）。確定後もEXT-28の再展開で使うため保持する */
  bomLevel: number;
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
  /**
   * 消費・生成したロット番号（v5-spec.md §11.3 Phase 2-B）。ロット台帳（LOT）に基づかない在庫
   * （テストコードが`stocks`へ直接注入した在庫等、design.md EXT-18参照）を消費した場合はundefined
   */
  lotNo?: string;
}

/** ロットの実体（v5-spec.md §11.3 Phase 2-B）。qtyはFIFO消費のたびに減る残数量 */
export interface Lot {
  lotNo: string;
  itemId: string;
  qty: number;
  createdDay: number;
  /** 入庫元PO番号／完成入庫元MO番号／棚卸調整なら"ADJ" */
  sourceRef: string;
}

/** 消費ロットと生成ロットの親子関係（v5-spec.md §11.3 Phase 2-B） */
export interface LotGenealogy {
  parentLot: string;
  childLot: string;
  moNo: string;
  consumedQty: number;
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

/**
 * マスタ一式のスナップショット（design.md EXT-26）。JSON入出力とプリセット定義に使う。
 * トランザクションは含まない（取り込み時は全トランザクションを初期化するため）。
 */
export interface MasterSnapshot {
  version: 1;
  items: ItemMaster[];
  bom: BomLine[];
  routingSteps: RoutingStep[];
  workCenters: WorkCenter[];
  customers: Customer[];
  suppliers: Supplier[];
}

export interface SimulationState {
  day: number;

  // マスタ
  items: ItemMaster[];
  bom: BomLine[];
  routingSteps: RoutingStep[];
  customers: Customer[];
  suppliers: Supplier[];
  workCenters: WorkCenter[];

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
  lots: Lot[];
  lotGenealogy: LotGenealogy[];

  eventLog: EventLogEntry[];

  // 採番用シーケンス。PLANNED_ORDERはMRP実行のたびに全削除・全再生成される揮発データ
  // （v5-spec.md §6.2）であり、番号もrunMRP()内でPLO-001から採番し直すため、ここには持たない
  nextSoSeq: number;
  nextMoSeq: number;
  nextPoSeq: number;
  nextTxnSeq: number;
  nextShipSeq: number;
  nextLotSeq: number;
}
