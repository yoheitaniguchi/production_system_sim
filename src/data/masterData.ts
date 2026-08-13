// 初期マスタデータ（docs/v5-spec.md §1.1：木製イス）
import type { BomLine, Customer, ItemMaster, RoutingStep, Supplier } from "../types";

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

export const initialItems: ItemMaster[] = [
  { itemId: ITEM_IDS.FG_CHAIR, name: "木製イス", makeBuy: "MAKE", leadTimeDays: 2 },
  { itemId: ITEM_IDS.SA_SEAT, name: "座面ASSY", makeBuy: "MAKE", leadTimeDays: 1 },
  { itemId: ITEM_IDS.RM_BOARD, name: "木板", makeBuy: "BUY", leadTimeDays: 5 },
  { itemId: ITEM_IDS.PT_LEG, name: "脚", makeBuy: "BUY", leadTimeDays: 3 },
  { itemId: ITEM_IDS.PT_SCREW, name: "ネジ", makeBuy: "BUY", leadTimeDays: 3 },
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
  { supplierId: "SUP-RM300", name: "木板仕入先" },
  { supplierId: "SUP-PT400", name: "脚仕入先" },
  { supplierId: "SUP-PT500", name: "ネジ仕入先" },
];
