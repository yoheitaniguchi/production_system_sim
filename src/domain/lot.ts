// ロット管理（v5-spec.md §11.3 Phase 2-B：ロット採番・FIFO消費・ロット系譜）
//
// ペギングとロット系譜は別物（v5-spec.md §11.3）。ペギング（domain/pegging.ts）は「何のために作るか」
// という計画上の意図、ロット系譜は「実際に何を使ったか」という事実。既存のSTOCK（品目単位のfungibleな
// 残高、design.md §4）は変更せず、実際の入出庫（RCV/PRD/ADJ+で生成、ISS/SHP/ADJ-で消費）と連動する形で
// ロット台帳を並行して維持する（design.md EXT-18）。
//
// テストコードが`receivePurchaseOrder()`等のドメイン関数を経由せず`state.stocks`へ在庫を直接注入している
// 箇所（production.test.ts等）では、注入した数量に対応するLotが存在しない。この「ロット台帳に基づかない
// 在庫」を消費する場合、consumeFifo()はエラーにせずlotNo未設定（追跡対象外）の消費として扱う。
import type { Lot, LotGenealogy, SimulationState } from "../types";

/** 入庫ロットの採番（RCV/PRD/ADJ+で共通） */
export function createLot(state: SimulationState, itemId: string, qty: number, day: number, sourceRef: string): Lot {
  const lot: Lot = {
    lotNo: `LOT-${String(state.nextLotSeq).padStart(4, "0")}`,
    itemId,
    qty,
    createdDay: day,
    sourceRef,
  };
  state.nextLotSeq += 1;
  state.lots.push(lot);
  return lot;
}

export interface LotConsumption {
  /** ロット台帳に基づかない在庫を消費した場合はundefined（追跡対象外） */
  lotNo?: string;
  qty: number;
}

/**
 * FIFO（作成日昇順、同日はlotNo昇順）で指定数量を消費する（v5-spec.md §11.3の出庫ルール）。
 * ロット台帳の残数量だけでは不足する場合、残りをlotNo未設定の1件として返す（エラーにしない。
 * 上記のとおりテストコードの直接注入在庫を想定した振る舞い）。
 */
export function consumeFifo(state: SimulationState, itemId: string, qty: number): LotConsumption[] {
  const available = state.lots
    .filter((l) => l.itemId === itemId && l.qty > 0)
    .sort((a, b) => a.createdDay - b.createdDay || a.lotNo.localeCompare(b.lotNo));

  const result: LotConsumption[] = [];
  let remaining = qty;
  for (const lot of available) {
    if (remaining <= 0) break;
    const take = Math.min(lot.qty, remaining);
    lot.qty -= take;
    result.push({ lotNo: lot.lotNo, qty: take });
    remaining -= take;
  }
  if (remaining > 0) {
    result.push({ lotNo: undefined, qty: remaining });
  }
  return result;
}

interface TraceHop {
  genealogy: LotGenealogy;
  lot?: Lot;
}

/** 後方追跡：このロットは何を使って作られたか（v5-spec.md §11.3） */
export function traceBackward(state: SimulationState, lotNo: string): TraceHop[] {
  const direct = state.lotGenealogy.filter((g) => g.childLot === lotNo);
  return direct.flatMap((g) => [
    { genealogy: g, lot: state.lots.find((l) => l.lotNo === g.parentLot) },
    ...traceBackward(state, g.parentLot),
  ]);
}

/** 前方追跡：このロットはどの製品ロットになったか（v5-spec.md §11.3、回収範囲の特定に使う） */
export function traceForward(state: SimulationState, lotNo: string): TraceHop[] {
  const direct = state.lotGenealogy.filter((g) => g.parentLot === lotNo);
  return direct.flatMap((g) => [
    { genealogy: g, lot: state.lots.find((l) => l.lotNo === g.childLot) },
    ...traceForward(state, g.childLot),
  ]);
}
