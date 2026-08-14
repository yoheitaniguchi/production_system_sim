// マスタ整合性の検証（v5-spec.md §3.7 最小機能5「BOM循環参照チェック」、design.md EXT-19〜EXT-24）
//
// すべて状態を変更しない純粋関数。マスタCRUD（masterData.ts）の事前検証と、
// AlertBarの常時表示（validateMaster）の両方から使う。
import type { BomLine, SimulationState } from "../types";

/** BOM探索の深さ上限。循環検出をすり抜けた場合の保険（design.md EXT-19の三重防御の3段目） */
export const MAX_BOM_DEPTH = 20;

/** 親品目 -> 子品目一覧 の隣接リスト。BOM探索のたびにO(n)のfilterを繰り返さないための前処理 */
export function buildBomIndex(bom: BomLine[]): Map<string, string[]> {
  const index = new Map<string, string[]>();
  for (const line of bom) {
    const children = index.get(line.parentItemId);
    if (children) children.push(line.childItemId);
    else index.set(line.parentItemId, [line.childItemId]);
  }
  return index;
}

/**
 * `from` から下方向（子へ）BOMを辿って `target` に到達できるか。
 * 既存BOMが循環していても停止するよう、訪問済み集合で打ち切る。
 */
export function reachesDownward(bom: BomLine[], from: string, target: string): boolean {
  const index = buildBomIndex(bom);
  const visited = new Set<string>();
  const stack = [from];
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current === target) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    stack.push(...(index.get(current) ?? []));
  }
  return false;
}

/**
 * BOM行 parent -> child を追加すると循環が生じるか（v5-spec.md §3.7 最小機能5
 * 「登録時に自身を祖先に持たないことを検証」）。
 * child から下へ辿って parent に届くなら、その行を足した瞬間に閉路になる。
 */
export function wouldCreateBomCycle(bom: BomLine[], parentItemId: string, childItemId: string): boolean {
  if (parentItemId === childItemId) return true;
  return reachesDownward(bom, childItemId, parentItemId);
}

/**
 * 既存BOM全体に含まれる循環の入口品目を列挙する（JSONインポート時の一括検査用）。
 * 「循環の一部である品目」を返すのであって、閉路そのものを復元はしない。
 */
export function findBomCycles(bom: BomLine[]): string[] {
  const index = buildBomIndex(bom);
  const state = new Map<string, "visiting" | "done">();
  const cyclic = new Set<string>();

  const visit = (itemId: string): void => {
    const status = state.get(itemId);
    if (status === "done") return;
    if (status === "visiting") {
      cyclic.add(itemId);
      return;
    }
    state.set(itemId, "visiting");
    for (const child of index.get(itemId) ?? []) visit(child);
    state.set(itemId, "done");
  };

  for (const parent of index.keys()) visit(parent);
  return [...cyclic].sort();
}

// ---------------------------------------------------------------------------
// 参照検査（削除ガード。design.md EXT-21「参照中は削除禁止」）
// ---------------------------------------------------------------------------

/**
 * 品目を削除できない理由の一覧。空配列なら削除可。
 * STOCKは残高0・引当0の空行なら「自動生成された空行」として無視する（品目と一緒に消す）。
 */
export function findItemReferences(state: SimulationState, itemId: string): string[] {
  const reasons: string[] = [];

  const asParent = state.bom.filter((b) => b.parentItemId === itemId).length;
  if (asParent > 0) reasons.push(`BOMの親として ${asParent} 行`);
  const asChild = state.bom.filter((b) => b.childItemId === itemId).length;
  if (asChild > 0) reasons.push(`BOMの子として ${asChild} 行`);

  const routing = state.routingSteps.filter((s) => s.itemId === itemId).length;
  if (routing > 0) reasons.push(`工順 ${routing} 行`);

  const soLines = state.soLines.filter((l) => l.itemId === itemId).length;
  if (soLines > 0) reasons.push(`受注明細 ${soLines} 件`);

  const plos = state.plannedOrders.filter((p) => p.itemId === itemId).length;
  if (plos > 0) reasons.push(`計画オーダ ${plos} 件`);

  const mos = state.mfgOrders.filter((m) => m.itemId === itemId).length;
  if (mos > 0) reasons.push(`製造オーダ ${mos} 件`);

  const pos = state.purchaseOrders.filter((p) => p.itemId === itemId).length;
  if (pos > 0) reasons.push(`購買オーダ ${pos} 件`);

  const txns = state.stockTxns.filter((t) => t.itemId === itemId).length;
  if (txns > 0) reasons.push(`在庫トランザクション ${txns} 件`);

  const lots = state.lots.filter((l) => l.itemId === itemId).length;
  if (lots > 0) reasons.push(`ロット ${lots} 件`);

  const stock = state.stocks.find((s) => s.itemId === itemId);
  if (stock && (stock.onHand !== 0 || stock.allocated !== 0)) {
    reasons.push(`在庫残高（現在庫${stock.onHand}・引当済${stock.allocated}）`);
  }

  return reasons;
}

export function findWorkCenterReferences(state: SimulationState, workCenter: string): string[] {
  const reasons: string[] = [];
  const routing = state.routingSteps.filter((s) => s.workCenter === workCenter).length;
  if (routing > 0) reasons.push(`工順 ${routing} 行`);
  const wis = state.workInstructions.filter((w) => w.workCenter === workCenter).length;
  if (wis > 0) reasons.push(`作業指示 ${wis} 件`);
  return reasons;
}

export function findSupplierReferences(state: SimulationState, supplierId: string): string[] {
  const reasons: string[] = [];
  const items = state.items.filter((i) => i.defaultSupplierId === supplierId).length;
  if (items > 0) reasons.push(`既定仕入先として品目 ${items} 件`);
  const pos = state.purchaseOrders.filter((p) => p.supplierId === supplierId).length;
  if (pos > 0) reasons.push(`購買オーダ ${pos} 件`);
  return reasons;
}

export function findCustomerReferences(state: SimulationState, customerId: string): string[] {
  const reasons: string[] = [];
  const sos = state.salesOrders.filter((s) => s.customerId === customerId).length;
  if (sos > 0) reasons.push(`受注 ${sos} 件`);
  return reasons;
}

/** 未完了（＝工順の構造変更で壊れうる）製造オーダ。design.md EXT-20 */
export function openMfgOrdersOf(state: SimulationState, itemId: string): string[] {
  return state.mfgOrders
    .filter((m) => m.itemId === itemId && m.status !== "DONE" && m.status !== "CANCELED")
    .map((m) => m.moNo);
}

/** 未完了の購買オーダ。区分（MAKE/BUY）変更のガードに使う */
export function openPurchaseOrdersOf(state: SimulationState, itemId: string): string[] {
  return state.purchaseOrders
    .filter((p) => p.itemId === itemId && p.status !== "CLOSED" && p.status !== "CANCELED")
    .map((p) => p.poNo);
}

// ---------------------------------------------------------------------------
// マスタ健全性の常時チェック（AlertBar表示用。design.md EXT-22）
// ---------------------------------------------------------------------------

export interface MasterIssue {
  level: "エラー" | "警告";
  /** 関連する品目・作業区などのコード（画面での絞り込み表示に使う） */
  subject: string;
  message: string;
}

/**
 * validateMasterが必要とする範囲だけを切り出したビュー。SimulationStateもMasterSnapshotも
 * 構造的にこれを満たすため、取り込み前のスナップショットをそのまま検証できる。
 */
export type MasterView = Pick<SimulationState, "items" | "bom" | "routingSteps" | "workCenters" | "suppliers">;

/**
 * 現在のマスタから検出できる不整合の一覧。登録時バリデーションをすり抜けた場合
 * （JSONインポート、順序に依存した編集）の受け皿であり、状態は変更しない。
 */
export function validateMaster(state: MasterView): MasterIssue[] {
  const issues: MasterIssue[] = [];
  const itemIds = new Set(state.items.map((i) => i.itemId));
  const workCenterIds = new Set(state.workCenters.map((w) => w.workCenter));
  const supplierIds = new Set(state.suppliers.map((s) => s.supplierId));

  for (const itemId of findBomCycles(state.bom)) {
    issues.push({ level: "エラー", subject: itemId, message: "BOMが循環しています（MRP展開・原価積上げができません）" });
  }

  for (const line of state.bom) {
    if (!itemIds.has(line.parentItemId)) {
      issues.push({ level: "エラー", subject: line.parentItemId, message: "BOMの親品目が品目マスタに存在しません" });
    }
    if (!itemIds.has(line.childItemId)) {
      issues.push({ level: "エラー", subject: line.childItemId, message: "BOMの子品目が品目マスタに存在しません" });
    }
  }

  for (const step of state.routingSteps) {
    if (!itemIds.has(step.itemId)) {
      issues.push({ level: "エラー", subject: step.itemId, message: "工順の品目が品目マスタに存在しません" });
    }
    if (!workCenterIds.has(step.workCenter)) {
      issues.push({
        level: "エラー",
        subject: step.workCenter,
        message: `工順（${step.itemId} 工程${step.stepNo}）が存在しない作業区を参照しています`,
      });
    }
  }

  for (const item of state.items) {
    if (item.makeBuy === "MAKE" && !state.routingSteps.some((s) => s.itemId === item.itemId)) {
      issues.push({
        level: "エラー",
        subject: item.itemId,
        message: "内製品目に工順が1行もありません（製造オーダを完了できません）",
      });
    }
    if (item.makeBuy === "BUY") {
      if (!item.defaultSupplierId) {
        issues.push({ level: "エラー", subject: item.itemId, message: "購買品目に既定仕入先が設定されていません" });
      } else if (!supplierIds.has(item.defaultSupplierId)) {
        issues.push({ level: "エラー", subject: item.itemId, message: "既定仕入先が仕入先マスタに存在しません" });
      }
      if (item.purchasePrice == null) {
        issues.push({ level: "警告", subject: item.itemId, message: "購買品目に購入単価がありません（原価を0として計算します）" });
      }
    }
    if (item.makeBuy === "BUY" && state.bom.some((b) => b.parentItemId === item.itemId)) {
      issues.push({
        level: "エラー",
        subject: item.itemId,
        message: "購買品目にBOM子行があります（MRPは購買品目を展開しないため無視されます）",
      });
    }
  }

  // 仕掛中の製造オーダがある品目のBOM編集は、バックフラッシュの消費内容を変える（design.md EXT-23）。
  // ただしこれは「編集した瞬間」にしか意味のない注意であり、状態からは後追いできないため、
  // ここではなくmasterData.tsのBOM編集操作が返す業務メッセージ側で警告する。

  return issues;
}
