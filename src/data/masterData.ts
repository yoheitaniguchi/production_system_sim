// 初期マスタデータ（docs/v5-spec.md §1.1：木製イス）
//
// マスタが自由に登録できるようになった後も、この木製イスは「既定プリセット」として維持する
// （design.md EXT-26）。v5-spec.md §9のTC-01〜18・演習ガイド・既存の自動テストはすべて
// このプリセットを前提にしており、createInitialState()の戻り値は従来どおりである。
import type { BomLine, Customer, ItemMaster, MasterPreset, MasterSnapshot, RoutingStep, Supplier, WorkCenter } from "../types";

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

// 自転車プリセット（design.md EXT-34）：木製イス（2階層BOM）とは別業種・4階層BOMの題材。
// multiLevelBom.test.tsが検証している「FG→SA→SA→RM」の4階層構造を土台に、実在感のある品目名を当てた。
//   自転車（内製・LT2・売価15,000）
//     ├─ 車輪ASSY（内製・LT1）×2
//     │    └─ リムASSY（内製・LT1）×1
//     │         └─ アルミリム材（購買・LT3・単価300）×1
//     └─ フレーム（購買・LT3・単価4,000）×1
export const BIKE_ITEM_IDS = {
  FG_BIKE: "FG-700",
  SA_WHEEL: "SA-710",
  SA_RIM: "SA-720",
  RM_ALUM: "RM-730",
  PT_FRAME: "PT-740",
} as const;

export const BIKE_WORK_CENTERS = {
  WELD: "WC-WELD",
  ASSM: "WC-BASM",
  INSP: "WC-BINS",
} as const;

export const BIKE_SUPPLIER_IDS = {
  RM_ALUM: "SUP-RM730",
  PT_FRAME: "SUP-PT740",
} as const;

// 売価15,000円は、標準原価9,600円（アルミリム材300×2＋フレーム4,000＋溶接/組立/検査の加工費2,200×2＋…実際は
// rollupCost()参照）に対し約36%の粗利率で仮置きした値（design.md EXT-15と同じ位置付け。マスタ画面でいつでも変更可）
export const bikeItems: ItemMaster[] = [
  { itemId: BIKE_ITEM_IDS.FG_BIKE, name: "自転車", makeBuy: "MAKE", leadTimeDays: 2, salesPrice: 15000 },
  { itemId: BIKE_ITEM_IDS.SA_WHEEL, name: "車輪ASSY", makeBuy: "MAKE", leadTimeDays: 1 },
  { itemId: BIKE_ITEM_IDS.SA_RIM, name: "リムASSY", makeBuy: "MAKE", leadTimeDays: 1 },
  {
    itemId: BIKE_ITEM_IDS.RM_ALUM,
    name: "アルミリム材",
    makeBuy: "BUY",
    leadTimeDays: 3,
    defaultSupplierId: BIKE_SUPPLIER_IDS.RM_ALUM,
    purchasePrice: 300,
  },
  {
    itemId: BIKE_ITEM_IDS.PT_FRAME,
    name: "フレーム",
    makeBuy: "BUY",
    leadTimeDays: 3,
    defaultSupplierId: BIKE_SUPPLIER_IDS.PT_FRAME,
    purchasePrice: 4000,
  },
];

export const bikeBom: BomLine[] = [
  { parentItemId: BIKE_ITEM_IDS.FG_BIKE, childItemId: BIKE_ITEM_IDS.SA_WHEEL, qtyPer: 2 },
  { parentItemId: BIKE_ITEM_IDS.FG_BIKE, childItemId: BIKE_ITEM_IDS.PT_FRAME, qtyPer: 1 },
  { parentItemId: BIKE_ITEM_IDS.SA_WHEEL, childItemId: BIKE_ITEM_IDS.SA_RIM, qtyPer: 1 },
  { parentItemId: BIKE_ITEM_IDS.SA_RIM, childItemId: BIKE_ITEM_IDS.RM_ALUM, qtyPer: 1 },
];

export const bikeRoutingSteps: RoutingStep[] = [
  { itemId: BIKE_ITEM_IDS.SA_RIM, stepNo: 10, workCenter: BIKE_WORK_CENTERS.WELD, stdTimeMin: 15 },
  { itemId: BIKE_ITEM_IDS.SA_WHEEL, stepNo: 10, workCenter: BIKE_WORK_CENTERS.ASSM, stdTimeMin: 20 },
  { itemId: BIKE_ITEM_IDS.FG_BIKE, stepNo: 10, workCenter: BIKE_WORK_CENTERS.ASSM, stdTimeMin: 40 },
  { itemId: BIKE_ITEM_IDS.FG_BIKE, stepNo: 20, workCenter: BIKE_WORK_CENTERS.INSP, stdTimeMin: 15 },
];

export const bikeCustomers: Customer[] = [
  { customerId: "CUST-1", name: "得意先1" },
  { customerId: "CUST-2", name: "得意先2" },
];

export const bikeSuppliers: Supplier[] = [
  { supplierId: BIKE_SUPPLIER_IDS.RM_ALUM, name: "アルミ材仕入先" },
  { supplierId: BIKE_SUPPLIER_IDS.PT_FRAME, name: "フレーム仕入先" },
];

export const bikeWorkCenters: WorkCenter[] = [
  { workCenter: BIKE_WORK_CENTERS.WELD, ratePerHour: 2400, capacityMinPerDay: 480 },
  { workCenter: BIKE_WORK_CENTERS.ASSM, ratePerHour: 2400, capacityMinPerDay: 480 },
  { workCenter: BIKE_WORK_CENTERS.INSP, ratePerHour: 2400, capacityMinPerDay: 480 },
];

/** 自転車の第2プリセット（design.md EXT-34）。木製イスとは別業種・4階層BOMの題材 */
export const BICYCLE_PRESET: MasterSnapshot = {
  version: 1,
  items: bikeItems,
  bom: bikeBom,
  routingSteps: bikeRoutingSteps,
  workCenters: bikeWorkCenters,
  customers: bikeCustomers,
  suppliers: bikeSuppliers,
};

/** 既定プリセットの一覧（design.md EXT-34）。マスタ画面のプリセット切替ドロップダウン・MASTER_RESET_TO_PRESETが参照する */
export const DEFAULT_PRESET_ID = "CHAIR";

export const MASTER_PRESETS: readonly MasterPreset[] = [
  { id: "CHAIR", label: "木製イス", snapshot: CHAIR_PRESET },
  { id: "BICYCLE", label: "自転車（4階層BOM）", snapshot: BICYCLE_PRESET },
];

/** presetIdからプリセット定義を引く。未知のIDは既定プリセット（木製イス）へフォールバックする */
export function resolveMasterPreset(presetId: string | undefined): MasterPreset {
  return (
    MASTER_PRESETS.find((p) => p.id === presetId) ?? MASTER_PRESETS.find((p) => p.id === DEFAULT_PRESET_ID)!
  );
}
