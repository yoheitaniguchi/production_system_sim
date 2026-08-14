// マスタ一式のJSON入出力（design.md EXT-26）
//
// バックエンドが無いため、演習用の題材（品目・BOM・工順・作業区・取引先）はJSONファイルとして
// 書き出し／読み込みして共有する。取り込みはall-or-nothing：スキーマ検証と業務的な整合性検証
// （masterIntegrity.validateMaster）を全件通し、エラーが1件でもあれば一切取り込まない。
import type {
  BomLine,
  Customer,
  ItemMaster,
  MakeBuy,
  MasterSnapshot,
  RoutingStep,
  SimulationState,
  Supplier,
  WorkCenter,
} from "../types";
import { findBomCycles, validateMaster } from "./masterIntegrity";

export class MasterIOError extends Error {}

export function exportMasterSnapshot(state: SimulationState): MasterSnapshot {
  return {
    version: 1,
    items: structuredClone(state.items),
    bom: structuredClone(state.bom),
    routingSteps: structuredClone(state.routingSteps),
    workCenters: structuredClone(state.workCenters),
    customers: structuredClone(state.customers),
    suppliers: structuredClone(state.suppliers),
  };
}

export function serializeMasterSnapshot(state: SimulationState): string {
  return `${JSON.stringify(exportMasterSnapshot(state), null, 2)}\n`;
}

// ---------------------------------------------------------------------------
// スキーマ検証（外部ライブラリを足さずに素の型ガードで書く）
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireArray(root: Record<string, unknown>, key: string): unknown[] {
  const value = root[key];
  if (!Array.isArray(value)) throw new MasterIOError(`${key} が配列ではありません`);
  return value;
}

function requireString(row: Record<string, unknown>, key: string, where: string): string {
  const value = row[key];
  if (typeof value !== "string" || !value.trim()) throw new MasterIOError(`${where}: ${key} は非空の文字列が必要です`);
  return value.trim();
}

function requireNumber(row: Record<string, unknown>, key: string, where: string): number {
  const value = row[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new MasterIOError(`${where}: ${key} は数値が必要です`);
  }
  return value;
}

/**
 * CRUD側（masterData.ts）が課している数値の範囲制約を、JSON取り込み時にも同じ強さで課す。
 * ここが緩いと、負のqtyPer等がCRUDでは拒否される値のままインポートだけを素通りし、
 * production.tsのバックフラッシュで在庫が減るはずが増える、といった実害につながる（design.md EXT-26）。
 */
function requireNonNegative(row: Record<string, unknown>, key: string, where: string): number {
  const value = requireNumber(row, key, where);
  if (value < 0) throw new MasterIOError(`${where}: ${key} は0以上である必要があります`);
  return value;
}

function optionalNonNegative(row: Record<string, unknown>, key: string, where: string): number | undefined {
  if (row[key] === undefined || row[key] === null) return undefined;
  return requireNonNegative(row, key, where);
}

function requireNonNegativeInt(row: Record<string, unknown>, key: string, where: string): number {
  const value = requireNonNegative(row, key, where);
  if (!Number.isInteger(value)) throw new MasterIOError(`${where}: ${key} は整数である必要があります`);
  return value;
}

function requirePositive(row: Record<string, unknown>, key: string, where: string): number {
  const value = requireNumber(row, key, where);
  if (value <= 0) throw new MasterIOError(`${where}: ${key} は正の数である必要があります`);
  return value;
}

function requirePositiveInt(row: Record<string, unknown>, key: string, where: string): number {
  const value = requirePositive(row, key, where);
  if (!Number.isInteger(value)) throw new MasterIOError(`${where}: ${key} は整数である必要があります`);
  return value;
}

function optionalString(row: Record<string, unknown>, key: string, where: string): string | undefined {
  if (row[key] === undefined || row[key] === null) return undefined;
  return requireString(row, key, where);
}

function requireRow(value: unknown, where: string): Record<string, unknown> {
  if (!isRecord(value)) throw new MasterIOError(`${where}: オブジェクトが必要です`);
  return value;
}

function parseMakeBuy(row: Record<string, unknown>, where: string): MakeBuy {
  const value = row.makeBuy;
  if (value !== "MAKE" && value !== "BUY") throw new MasterIOError(`${where}: makeBuy は "MAKE" か "BUY" が必要です`);
  return value;
}

/**
 * JSON文字列をMasterSnapshotへ変換する。形式エラーはMasterIOErrorを投げ、
 * 業務的な不整合（循環BOM・存在しない参照など）は validateMaster のエラーをまとめて投げる。
 */
export function parseMasterSnapshot(json: string): MasterSnapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new MasterIOError("JSONとして解釈できません");
  }
  if (!isRecord(raw)) throw new MasterIOError("トップレベルがオブジェクトではありません");
  if (raw.version !== 1) throw new MasterIOError(`未対応のversionです（1が必要）: ${String(raw.version)}`);

  const items: ItemMaster[] = requireArray(raw, "items").map((row, i) => {
    const where = `items[${i}]`;
    const record = requireRow(row, where);
    const makeBuy = parseMakeBuy(record, where);
    return {
      itemId: requireString(record, "itemId", where),
      name: requireString(record, "name", where),
      makeBuy,
      leadTimeDays: requireNonNegativeInt(record, "leadTimeDays", where),
      defaultSupplierId: makeBuy === "BUY" ? optionalString(record, "defaultSupplierId", where) : undefined,
      purchasePrice: makeBuy === "BUY" ? optionalNonNegative(record, "purchasePrice", where) : undefined,
      salesPrice: optionalNonNegative(record, "salesPrice", where),
    };
  });

  const bom: BomLine[] = requireArray(raw, "bom").map((row, i) => {
    const where = `bom[${i}]`;
    const record = requireRow(row, where);
    return {
      parentItemId: requireString(record, "parentItemId", where),
      childItemId: requireString(record, "childItemId", where),
      qtyPer: requirePositive(record, "qtyPer", where),
    };
  });

  const routingSteps: RoutingStep[] = requireArray(raw, "routingSteps").map((row, i) => {
    const where = `routingSteps[${i}]`;
    const record = requireRow(row, where);
    return {
      itemId: requireString(record, "itemId", where),
      stepNo: requirePositiveInt(record, "stepNo", where),
      workCenter: requireString(record, "workCenter", where),
      stdTimeMin: requireNonNegative(record, "stdTimeMin", where),
    };
  });

  const workCenters: WorkCenter[] = requireArray(raw, "workCenters").map((row, i) => {
    const where = `workCenters[${i}]`;
    const record = requireRow(row, where);
    return {
      workCenter: requireString(record, "workCenter", where),
      ratePerHour: requireNonNegative(record, "ratePerHour", where),
    };
  });

  const customers: Customer[] = requireArray(raw, "customers").map((row, i) => {
    const where = `customers[${i}]`;
    const record = requireRow(row, where);
    return { customerId: requireString(record, "customerId", where), name: requireString(record, "name", where) };
  });

  const suppliers: Supplier[] = requireArray(raw, "suppliers").map((row, i) => {
    const where = `suppliers[${i}]`;
    const record = requireRow(row, where);
    return { supplierId: requireString(record, "supplierId", where), name: requireString(record, "name", where) };
  });

  const snapshot: MasterSnapshot = { version: 1, items, bom, routingSteps, workCenters, customers, suppliers };
  assertSnapshotUsable(snapshot);
  return snapshot;
}

/** 主キー重複と、validateMasterのエラーレベルの指摘をまとめて検査する */
export function assertSnapshotUsable(snapshot: MasterSnapshot): void {
  const problems: string[] = [];

  const pushDuplicates = (keys: string[], label: string) => {
    const seen = new Set<string>();
    for (const key of keys) {
      if (seen.has(key)) problems.push(`${label}が重複しています: ${key}`);
      seen.add(key);
    }
  };
  pushDuplicates(snapshot.items.map((i) => i.itemId), "品目コード");
  pushDuplicates(snapshot.workCenters.map((w) => w.workCenter), "作業区コード");
  pushDuplicates(snapshot.customers.map((c) => c.customerId), "得意先番号");
  pushDuplicates(snapshot.suppliers.map((s) => s.supplierId), "仕入先番号");
  pushDuplicates(snapshot.bom.map((b) => `${b.parentItemId} -> ${b.childItemId}`), "BOM行");
  pushDuplicates(snapshot.routingSteps.map((s) => `${s.itemId} 工程${s.stepNo}`), "工順行");

  // 循環は validateMaster でも検出するが、そちらは他の検査より前に無限再帰しないことが前提なので
  // ここで先に潰しておく
  for (const itemId of findBomCycles(snapshot.bom)) {
    problems.push(`BOMが循環しています: ${itemId}`);
  }

  if (problems.length === 0) {
    // MasterSnapshotはMasterViewを構造的に満たすため、そのまま業務的な整合性検証にかけられる
    for (const issue of validateMaster(snapshot)) {
      if (issue.level === "エラー") problems.push(`${issue.subject}: ${issue.message}`);
    }
  }

  if (problems.length > 0) {
    throw new MasterIOError(`マスタとして取り込めません:\n- ${problems.join("\n- ")}`);
  }
}
