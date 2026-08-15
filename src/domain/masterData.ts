// マスタCRUD（v5-spec.md §3.7、design.md EXT-19〜EXT-24）
//
// 呼び出し側（reducer.ts）がstructuredCloneした状態を渡し、この層はそれを直接書き換える
// （CLAUDE.md「コーディング上の注意」の既存流儀）。戻り値はEventLogに載せる業務メッセージ。
//
// 「禁止」と「警告」の線引き（design.md EXT-20）：
// 復旧不能・原因不明の停止を生むもの（BOM循環／工順ゼロの内製品目／仕掛中オーダの工順構造変更／
// 参照中マスタの削除）だけを禁止し、単に計算結果が変わるだけのもの（仕掛中オーダのBOM編集）は
// 警告メッセージに留める。
import type {
  BomLine,
  Customer,
  ItemMaster,
  RoutingStep,
  SimulationState,
  Supplier,
  WorkCenter,
} from "../types";
import {
  findCustomerReferences,
  findItemReferences,
  findSupplierReferences,
  findWorkCenterReferences,
  openMfgOrdersOf,
  openPurchaseOrdersOf,
  wouldCreateBomCycle,
} from "./masterIntegrity";

export class MasterDataError extends Error {}

/** コードは作成後不変（design.md EXT-24）。改名は削除→再登録で行う */
function normalizeCode(raw: string, label: string): string {
  const code = raw.trim();
  if (!code) throw new MasterDataError(`${label}を入力してください`);
  return code;
}

function requireItem(state: SimulationState, itemId: string): ItemMaster {
  const item = state.items.find((i) => i.itemId === itemId);
  if (!item) throw new MasterDataError(`品目が見つかりません: ${itemId}`);
  return item;
}

function assertNonNegativeInt(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0) throw new MasterDataError(`${label}は0以上の整数で入力してください`);
}

// ---------------------------------------------------------------------------
// 品目
// ---------------------------------------------------------------------------

export function addItem(state: SimulationState, input: ItemMaster): string {
  const itemId = normalizeCode(input.itemId, "品目コード");
  if (state.items.some((i) => i.itemId === itemId)) {
    throw new MasterDataError(`品目コードが重複しています: ${itemId}`);
  }
  const name = input.name.trim() || itemId;
  assertNonNegativeInt(input.leadTimeDays, "標準リードタイム");

  if (input.makeBuy === "BUY") {
    assertSupplierAssignable(state, input.defaultSupplierId);
  }

  state.items.push({
    ...input,
    itemId,
    name,
    // 区分に合わない項目は保持しない（BUYに売価は持てるが、MAKEに購入単価・仕入先は意味を持たない）
    defaultSupplierId: input.makeBuy === "BUY" ? input.defaultSupplierId : undefined,
    purchasePrice: input.makeBuy === "BUY" ? input.purchasePrice : undefined,
  });

  const hint =
    input.makeBuy === "MAKE" ? "（内製品目のため、工順を1行以上登録するまで製造オーダを完了できません）" : "";
  return `品目 ${itemId}（${name}）を登録した${hint}`;
}

function assertSupplierAssignable(state: SimulationState, supplierId: string | undefined): void {
  if (!supplierId) {
    throw new MasterDataError("購買品目には既定仕入先が必要です（先に仕入先マスタへ登録してください）");
  }
  if (!state.suppliers.some((s) => s.supplierId === supplierId)) {
    throw new MasterDataError(`仕入先が見つかりません: ${supplierId}`);
  }
}

export type ItemPatch = Partial<Omit<ItemMaster, "itemId">>;

export function updateItem(state: SimulationState, itemId: string, patch: ItemPatch): string {
  const item = requireItem(state, itemId);
  const changes: string[] = [];

  // 区分変更の可否は、他のフィールドを触る前にまとめて確かめる。後から検査すると
  // 「既定仕入先の無い購買品目」が中途半端に残る（reducerのapplyActionは例外発生時も
  // 途中までの変更を保持する仕様のため）
  const nextMakeBuy = patch.makeBuy;
  if (nextMakeBuy !== undefined && nextMakeBuy !== item.makeBuy) {
    assertMakeBuyChangeable(state, item, nextMakeBuy);
    if (nextMakeBuy === "BUY") assertSupplierAssignable(state, patch.defaultSupplierId ?? item.defaultSupplierId);
  }

  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name) throw new MasterDataError("品目名を入力してください");
    item.name = name;
    changes.push(`名称を「${name}」に`);
  }

  if (patch.leadTimeDays !== undefined) {
    assertNonNegativeInt(patch.leadTimeDays, "標準リードタイム");
    item.leadTimeDays = patch.leadTimeDays;
    changes.push(`標準リードタイムを ${patch.leadTimeDays} 日に`);
  }

  if (patch.makeBuy !== undefined && patch.makeBuy !== item.makeBuy) {
    item.makeBuy = patch.makeBuy;
    if (patch.makeBuy === "MAKE") {
      item.defaultSupplierId = undefined;
      item.purchasePrice = undefined;
    }
    changes.push(`区分を ${patch.makeBuy === "MAKE" ? "内製" : "購買"} に`);
  }

  if (patch.defaultSupplierId !== undefined) {
    if (item.makeBuy !== "BUY") throw new MasterDataError("既定仕入先を設定できるのは購買品目だけです");
    assertSupplierAssignable(state, patch.defaultSupplierId);
    item.defaultSupplierId = patch.defaultSupplierId;
    changes.push(`既定仕入先を ${patch.defaultSupplierId} に`);
  }

  if (patch.purchasePrice !== undefined) {
    if (item.makeBuy !== "BUY") throw new MasterDataError("購入単価を設定できるのは購買品目だけです");
    if (patch.purchasePrice < 0) throw new MasterDataError("購入単価は0以上で入力してください");
    item.purchasePrice = patch.purchasePrice;
    changes.push(`購入単価を ${patch.purchasePrice} 円に`);
  }

  if (patch.salesPrice !== undefined) {
    if (patch.salesPrice < 0) throw new MasterDataError("売価は0以上で入力してください");
    item.salesPrice = patch.salesPrice;
    changes.push(`売価を ${patch.salesPrice} 円に`);
  }

  if (changes.length === 0) return `品目 ${itemId} に変更はなかった`;
  return `品目 ${itemId} の${changes.join("・")}変更した`;
}

/**
 * 区分（MAKE/BUY）の変更可否。BOM子行・工順行が残っていると、変更した瞬間に
 * 「MRPが展開しない死にデータ」または「完了できない製造オーダ」を生むため、先に消させる。
 */
function assertMakeBuyChangeable(state: SimulationState, item: ItemMaster, next: "MAKE" | "BUY"): void {
  const openMo = openMfgOrdersOf(state, item.itemId);
  if (openMo.length > 0) throw new MasterDataError(`未完了の製造オーダがあるため区分を変更できません: ${openMo.join(", ")}`);
  const openPo = openPurchaseOrdersOf(state, item.itemId);
  if (openPo.length > 0) throw new MasterDataError(`未完了の購買オーダがあるため区分を変更できません: ${openPo.join(", ")}`);

  if (next === "BUY") {
    const children = state.bom.filter((b) => b.parentItemId === item.itemId).length;
    if (children > 0) {
      throw new MasterDataError(`BOM子行が ${children} 行あるため購買品目にできません（先にBOM行を削除してください）`);
    }
    const steps = state.routingSteps.filter((s) => s.itemId === item.itemId).length;
    if (steps > 0) {
      throw new MasterDataError(`工順が ${steps} 行あるため購買品目にできません（先に工順を削除してください）`);
    }
  }
}

export function deleteItem(state: SimulationState, itemId: string): string {
  const item = requireItem(state, itemId);
  const reasons = findItemReferences(state, itemId);
  if (reasons.length > 0) {
    throw new MasterDataError(`参照されているため削除できません（${reasons.join("・")}）: ${itemId}`);
  }
  state.items = state.items.filter((i) => i.itemId !== itemId);
  // 残高0・引当0のSTOCK空行は自動生成されたものなので品目と一緒に消す
  state.stocks = state.stocks.filter((s) => s.itemId !== itemId);
  return `品目 ${itemId}（${item.name}）を削除した`;
}

// ---------------------------------------------------------------------------
// BOM
// ---------------------------------------------------------------------------

function backflushWarning(state: SimulationState, parentItemId: string): string {
  const open = openMfgOrdersOf(state, parentItemId);
  if (open.length === 0) return "";
  // design.md EXT-23：禁止せず警告に留める（production.tsのバックフラッシュはstate.bomを実行時参照する）
  return `［注意］未完了の製造オーダ（${open.join(", ")}）の部品消費内容が変わります`;
}

export function addBomLine(state: SimulationState, input: BomLine): string {
  const parent = requireItem(state, input.parentItemId);
  requireItem(state, input.childItemId);

  if (parent.makeBuy !== "MAKE") {
    throw new MasterDataError(`BOMの親にできるのは内製品目だけです: ${input.parentItemId}`);
  }
  if (input.qtyPer <= 0) throw new MasterDataError("員数は1以上で入力してください");
  if (state.bom.some((b) => b.parentItemId === input.parentItemId && b.childItemId === input.childItemId)) {
    throw new MasterDataError(`同じ親子のBOM行が既にあります: ${input.parentItemId} -> ${input.childItemId}`);
  }
  // v5-spec.md §3.7 最小機能5：登録時に自身を祖先に持たないことを検証する
  if (wouldCreateBomCycle(state.bom, input.parentItemId, input.childItemId)) {
    throw new MasterDataError(
      `BOMが循環するため登録できません: ${input.parentItemId} -> ${input.childItemId}`,
    );
  }

  state.bom.push({ ...input });
  return `BOM ${input.parentItemId} -> ${input.childItemId}（員数${input.qtyPer}）を追加した${backflushWarning(state, input.parentItemId)}`;
}

export function updateBomLine(
  state: SimulationState,
  parentItemId: string,
  childItemId: string,
  patch: { qtyPer: number },
): string {
  const line = state.bom.find((b) => b.parentItemId === parentItemId && b.childItemId === childItemId);
  if (!line) throw new MasterDataError(`BOM行が見つかりません: ${parentItemId} -> ${childItemId}`);
  if (patch.qtyPer <= 0) throw new MasterDataError("員数は1以上で入力してください");
  line.qtyPer = patch.qtyPer;
  return `BOM ${parentItemId} -> ${childItemId} の員数を ${patch.qtyPer} に変更した${backflushWarning(state, parentItemId)}`;
}

export function deleteBomLine(state: SimulationState, parentItemId: string, childItemId: string): string {
  const line = state.bom.find((b) => b.parentItemId === parentItemId && b.childItemId === childItemId);
  if (!line) throw new MasterDataError(`BOM行が見つかりません: ${parentItemId} -> ${childItemId}`);
  state.bom = state.bom.filter((b) => !(b.parentItemId === parentItemId && b.childItemId === childItemId));
  return `BOM ${parentItemId} -> ${childItemId} を削除した${backflushWarning(state, parentItemId)}`;
}

// ---------------------------------------------------------------------------
// 工順（BOP）
// ---------------------------------------------------------------------------

/**
 * 工順の構造変更（行の追加・削除）のガード（design.md EXT-20）。
 * production.tsのfirstStepNo/lastStepNo/nextStepNoは実行時にstate.routingStepsを読むため、
 * 仕掛中オーダがある品目の工順を増減させると「最終工程」が変わり完成入庫が起きなくなる。
 */
function assertRoutingStructureEditable(state: SimulationState, itemId: string): void {
  const open = openMfgOrdersOf(state, itemId);
  if (open.length > 0) {
    throw new MasterDataError(
      `未完了の製造オーダ（${open.join(", ")}）があるため工順の追加・削除はできません（標準時間・作業区の変更は可能です）`,
    );
  }
}

export function addRoutingStep(state: SimulationState, input: RoutingStep): string {
  const item = requireItem(state, input.itemId);
  if (item.makeBuy !== "MAKE") throw new MasterDataError(`工順を持てるのは内製品目だけです: ${input.itemId}`);
  if (!Number.isInteger(input.stepNo) || input.stepNo <= 0) {
    throw new MasterDataError("工程順序は1以上の整数で入力してください");
  }
  if (state.routingSteps.some((s) => s.itemId === input.itemId && s.stepNo === input.stepNo)) {
    throw new MasterDataError(`同じ工程順序が既にあります: ${input.itemId} 工程${input.stepNo}`);
  }
  if (!state.workCenters.some((w) => w.workCenter === input.workCenter)) {
    throw new MasterDataError(`作業区が見つかりません: ${input.workCenter}`);
  }
  if (input.stdTimeMin < 0) throw new MasterDataError("標準時間は0以上で入力してください");
  assertRoutingStructureEditable(state, input.itemId);

  state.routingSteps.push({ ...input });
  return `工順 ${input.itemId} 工程${input.stepNo}（${input.workCenter}・${input.stdTimeMin}分）を追加した`;
}

export function updateRoutingStep(
  state: SimulationState,
  itemId: string,
  stepNo: number,
  patch: { workCenter?: string; stdTimeMin?: number },
): string {
  const step = state.routingSteps.find((s) => s.itemId === itemId && s.stepNo === stepNo);
  if (!step) throw new MasterDataError(`工順が見つかりません: ${itemId} 工程${stepNo}`);
  const changes: string[] = [];

  if (patch.workCenter !== undefined) {
    if (!state.workCenters.some((w) => w.workCenter === patch.workCenter)) {
      throw new MasterDataError(`作業区が見つかりません: ${patch.workCenter}`);
    }
    step.workCenter = patch.workCenter;
    changes.push(`作業区を ${patch.workCenter} に`);
  }
  if (patch.stdTimeMin !== undefined) {
    if (patch.stdTimeMin < 0) throw new MasterDataError("標準時間は0以上で入力してください");
    step.stdTimeMin = patch.stdTimeMin;
    changes.push(`標準時間を ${patch.stdTimeMin} 分に`);
  }

  if (changes.length === 0) return `工順 ${itemId} 工程${stepNo} に変更はなかった`;
  return `工順 ${itemId} 工程${stepNo} の${changes.join("・")}変更した`;
}

export function deleteRoutingStep(state: SimulationState, itemId: string, stepNo: number): string {
  const step = state.routingSteps.find((s) => s.itemId === itemId && s.stepNo === stepNo);
  if (!step) throw new MasterDataError(`工順が見つかりません: ${itemId} 工程${stepNo}`);
  assertRoutingStructureEditable(state, itemId);

  state.routingSteps = state.routingSteps.filter((s) => !(s.itemId === itemId && s.stepNo === stepNo));
  const remaining = state.routingSteps.filter((s) => s.itemId === itemId).length;
  const hint = remaining === 0 ? "（工順が0行になりました。1行以上ないと製造オーダを完了できません）" : "";
  return `工順 ${itemId} 工程${stepNo} を削除した${hint}`;
}

// ---------------------------------------------------------------------------
// 作業区
// ---------------------------------------------------------------------------

export function addWorkCenter(state: SimulationState, input: WorkCenter): string {
  const workCenter = normalizeCode(input.workCenter, "作業区コード");
  if (state.workCenters.some((w) => w.workCenter === workCenter)) {
    throw new MasterDataError(`作業区コードが重複しています: ${workCenter}`);
  }
  if (input.ratePerHour < 0) throw new MasterDataError("賃率は0以上で入力してください");
  if (input.capacityMinPerDay < 0) throw new MasterDataError("稼働可能時間（分/日）は0以上で入力してください");
  state.workCenters.push({ workCenter, ratePerHour: input.ratePerHour, capacityMinPerDay: input.capacityMinPerDay });
  return `作業区 ${workCenter}（賃率${input.ratePerHour}円/時・能力${input.capacityMinPerDay}分/日）を登録した`;
}

export function updateWorkCenter(
  state: SimulationState,
  workCenter: string,
  patch: { ratePerHour?: number; capacityMinPerDay?: number },
): string {
  const wc = state.workCenters.find((w) => w.workCenter === workCenter);
  if (!wc) throw new MasterDataError(`作業区が見つかりません: ${workCenter}`);
  const changes: string[] = [];

  if (patch.ratePerHour !== undefined) {
    if (patch.ratePerHour < 0) throw new MasterDataError("賃率は0以上で入力してください");
    wc.ratePerHour = patch.ratePerHour;
    changes.push(`賃率を ${patch.ratePerHour} 円/時に`);
  }
  if (patch.capacityMinPerDay !== undefined) {
    if (patch.capacityMinPerDay < 0) throw new MasterDataError("稼働可能時間（分/日）は0以上で入力してください");
    wc.capacityMinPerDay = patch.capacityMinPerDay;
    changes.push(`能力を ${patch.capacityMinPerDay} 分/日に`);
  }

  if (changes.length === 0) return `${workCenter} に変更はなかった`;
  return `${workCenter} の${changes.join("・")}変更した`;
}

export function deleteWorkCenter(state: SimulationState, workCenter: string): string {
  if (!state.workCenters.some((w) => w.workCenter === workCenter)) {
    throw new MasterDataError(`作業区が見つかりません: ${workCenter}`);
  }
  const reasons = findWorkCenterReferences(state, workCenter);
  if (reasons.length > 0) {
    throw new MasterDataError(`参照されているため削除できません（${reasons.join("・")}）: ${workCenter}`);
  }
  state.workCenters = state.workCenters.filter((w) => w.workCenter !== workCenter);
  return `作業区 ${workCenter} を削除した`;
}

// ---------------------------------------------------------------------------
// 取引先（design.md DEV-1によりCustomer/Supplierは別テーブル）
// ---------------------------------------------------------------------------

export type PartnerType = "CUSTOMER" | "SUPPLIER";

export function addPartner(state: SimulationState, partnerType: PartnerType, partnerId: string, name: string): string {
  const id = normalizeCode(partnerId, partnerType === "CUSTOMER" ? "得意先番号" : "仕入先番号");
  const label = name.trim() || id;
  if (partnerType === "CUSTOMER") {
    if (state.customers.some((c) => c.customerId === id)) {
      throw new MasterDataError(`得意先番号が重複しています: ${id}`);
    }
    const customer: Customer = { customerId: id, name: label };
    state.customers.push(customer);
    return `得意先 ${id}（${label}）を登録した`;
  }
  if (state.suppliers.some((s) => s.supplierId === id)) {
    throw new MasterDataError(`仕入先番号が重複しています: ${id}`);
  }
  const supplier: Supplier = { supplierId: id, name: label };
  state.suppliers.push(supplier);
  return `仕入先 ${id}（${label}）を登録した`;
}

export function updatePartnerName(
  state: SimulationState,
  partnerType: PartnerType,
  partnerId: string,
  name: string,
): string {
  const label = name.trim();
  if (!label) throw new MasterDataError("名称を入力してください");
  if (partnerType === "CUSTOMER") {
    const customer = state.customers.find((c) => c.customerId === partnerId);
    if (!customer) throw new MasterDataError(`得意先が見つかりません: ${partnerId}`);
    customer.name = label;
  } else {
    const supplier = state.suppliers.find((s) => s.supplierId === partnerId);
    if (!supplier) throw new MasterDataError(`仕入先が見つかりません: ${partnerId}`);
    supplier.name = label;
  }
  return `${partnerId} の名称を「${label}」に変更した`;
}

export function deletePartner(state: SimulationState, partnerType: PartnerType, partnerId: string): string {
  if (partnerType === "CUSTOMER") {
    if (!state.customers.some((c) => c.customerId === partnerId)) {
      throw new MasterDataError(`得意先が見つかりません: ${partnerId}`);
    }
    const reasons = findCustomerReferences(state, partnerId);
    if (reasons.length > 0) {
      throw new MasterDataError(`参照されているため削除できません（${reasons.join("・")}）: ${partnerId}`);
    }
    state.customers = state.customers.filter((c) => c.customerId !== partnerId);
    return `得意先 ${partnerId} を削除した`;
  }
  if (!state.suppliers.some((s) => s.supplierId === partnerId)) {
    throw new MasterDataError(`仕入先が見つかりません: ${partnerId}`);
  }
  const reasons = findSupplierReferences(state, partnerId);
  if (reasons.length > 0) {
    throw new MasterDataError(`参照されているため削除できません（${reasons.join("・")}）: ${partnerId}`);
  }
  state.suppliers = state.suppliers.filter((s) => s.supplierId !== partnerId);
  return `仕入先 ${partnerId} を削除した`;
}
