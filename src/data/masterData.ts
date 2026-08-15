// 初期マスタデータ（docs/v5-spec.md §1.1：木製イス）
//
// マスタが自由に登録できるようになった後も、この木製イスは「既定プリセット」として維持する
// （design.md EXT-26）。v5-spec.md §9のTC-01〜18・演習ガイド・既存の自動テストはすべて
// このプリセットを前提にしており、createInitialState()の戻り値は従来どおりである。
import type { BomLine, Customer, ItemMaster, MasterSnapshot, RoutingStep, Supplier, WorkCenter } from "../types";

export const ITEM_IDS = {
  FG_CHAIR: "FG-100",
  SA_SEAT: "SA-200",
  RM_BOARD: "RM-300",
  PT_LEG: "PT-400",
  PT_SCREW: "PT-500",
} as const;

export const WORK_CENTERS = {
  CUT: "WC-CUT",
  ASM: "WC-ASM",
  INS: "WC-INS",
} as const;

export const SUPPLIER_IDS = {
  RM_BOARD: "SUP-RM300",
  PT_LEG: "SUP-PT400",
  PT_SCREW: "SUP-PT500",
} as const;

// defaultSupplierId は design.md EXT-9（v5仕様書はITEMとPARTNERの対応を規定していない）に基づく追加項目。
// purchasePrice・salesPriceは design.md EXT-15（v5-spec.md §11.2の原価積上げ例と一致する値を採用）に基づく追加項目
export const initialItems: ItemMaster[] = [
  { itemId: ITEM_IDS.FG_CHAIR, name: "木製イス", makeBuy: "MAKE", leadTimeDays: 2, salesPrice: 6000 },
  { itemId: ITEM_IDS.SA_SEAT, name: "座面ASSY", makeBuy: "MAKE", leadTimeDays: 1 },
  {
    itemId: ITEM_IDS.RM_BOARD,
    name: "木板",
    makeBuy: "BUY",
    leadTimeDays: 5,
    defaultSupplierId: SUPPLIER_IDS.RM_BOARD,
    purchasePrice: 800,
  },
  {
    itemId: ITEM_IDS.PT_LEG,
    name: "脚",
    makeBuy: "BUY",
    leadTimeDays: 3,
    defaultSupplierId: SUPPLIER_IDS.PT_LEG,
    purchasePrice: 250,
  },
  {
    itemId: ITEM_IDS.PT_SCREW,
    name: "ネジ",
    makeBuy: "BUY",
    leadTimeDays: 3,
    defaultSupplierId: SUPPLIER_IDS.PT_SCREW,
    purchasePrice: 20,
  },
];

export const initialBom: BomLine[] = [
  { parentItemId: ITEM_IDS.FG_CHAIR, childItemId: ITEM_IDS.SA_SEAT, qtyPer: 1 },
  { parentItemId: ITEM_IDS.FG_CHAIR, childItemId: ITEM_IDS.PT_LEG, qtyPer: 4 },
  { parentItemId: ITEM_IDS.FG_CHAIR, childItemId: ITEM_IDS.PT_SCREW, qtyPer: 8 },
  { parentItemId: ITEM_IDS.SA_SEAT, childItemId: ITEM_IDS.RM_BOARD, qtyPer: 1 },
];

// 標準時間はv5-spec.md §1.1の h/個 表記から分に換算（0.3h=18分、0.5h=30分、0.2h=12分）
export const initialRoutingSteps: RoutingStep[] = [
  { itemId: ITEM_IDS.SA_SEAT, stepNo: 10, workCenter: WORK_CENTERS.CUT, stdTimeMin: 18 },
  { itemId: ITEM_IDS.FG_CHAIR, stepNo: 10, workCenter: WORK_CENTERS.ASM, stdTimeMin: 30 },
  { itemId: ITEM_IDS.FG_CHAIR, stepNo: 20, workCenter: WORK_CENTERS.INS, stdTimeMin: 12 },
];

// v5-spec.md §9の受入テストケースは単一受注（SO-001-1）のみを対象とするが、
// design.md §6の複数受注演習（TC-M1〜）のために2顧客を用意する
export const initialCustomers: Customer[] = [
  { customerId: "CUST-A", name: "得意先A" },
  { customerId: "CUST-B", name: "得意先B" },
];

export const initialSuppliers: Supplier[] = [
  { supplierId: SUPPLIER_IDS.RM_BOARD, name: "木板仕入先" },
  { supplierId: SUPPLIER_IDS.PT_LEG, name: "脚仕入先" },
  { supplierId: SUPPLIER_IDS.PT_SCREW, name: "ネジ仕入先" },
];

// 賃率はv5-spec.md §11.2の計算例（賃率2,000円/時）に合わせ、3作業区とも同一値とする。
// capacityMinPerDay（能力計画、design.md §9・EXT-30〜32）も3作業区とも240分/日（実働4時間相当）で統一する。
// 480分（8時間）にすると既定シナリオ（SO-001-1、木製イス10個）単体では山積み超過が一度も発生せず、
// CRPの学習効果を体験できなくなるため、design.md §9.5のとおり意図的に低い値を選んでいる
// （TC-04〜05をそのまま実行するだけでWC-ASMがD+13に300分/240分で超過する）
export const initialWorkCenters: WorkCenter[] = [
  { workCenter: WORK_CENTERS.CUT, ratePerHour: 2000, capacityMinPerDay: 240 },
  { workCenter: WORK_CENTERS.ASM, ratePerHour: 2000, capacityMinPerDay: 240 },
  { workCenter: WORK_CENTERS.INS, ratePerHour: 2000, capacityMinPerDay: 240 },
];

/** 木製イスの既定プリセット（design.md EXT-26）。「プリセットに戻す」とJSONエクスポートの基準 */
export const CHAIR_PRESET: MasterSnapshot = {
  version: 1,
  items: initialItems,
  bom: initialBom,
  routingSteps: initialRoutingSteps,
  workCenters: initialWorkCenters,
  customers: initialCustomers,
  suppliers: initialSuppliers,
};
