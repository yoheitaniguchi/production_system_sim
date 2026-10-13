// MRP展開（runMRP）の性能テスト（docs/process/poc-definition.md 4章「性能（計算）」、
// docs/process/review-report.md F-4）。
//
// 目標値：既定プリセット（木製イス）・受注20件でMRP実行が1秒以内。4階層BOM・品目100件で3秒以内。
// 閾値は目標値そのものとし（実測はこれより桁違いに小さい）、CIでは劣化検知として使う。
// 同じ状態で複数回実行した最大値を測る（runMRPはPLANNED_ORDERを全削除して再生成するため、繰り返しても結果は同じ）。
import { describe, expect, it } from "vitest";
import { ITEM_IDS } from "../data/masterData";
import { firmAllPlannedOrders, runMRP } from "./mrp";
import { createSalesOrder } from "./salesOrder";
import { createTestState } from "./testUtils";
import type { BomLine, ItemMaster, RoutingStep, SimulationState } from "../types";

const RUNS = 5;

function measureMaxMs(state: SimulationState): number {
  let max = 0;
  for (let i = 0; i < RUNS; i += 1) {
    const t0 = performance.now();
    runMRP(state);
    max = Math.max(max, performance.now() - t0);
  }
  return max;
}

/**
 * 品目100件・4階層（レベル0〜3）のマスタを生成する。
 * 製品系列10個 × 内製7品目（FG 1・L1 2・L2 4）＝70品目と、系列をまたいで共有する購買品30品目。
 * L2の各品目は購買品3品目を使う（共有により、需要間で供給を取り合う経路も通す）。
 */
function buildLargeMaster(state: SimulationState): string[] {
  const supplierId = "SUP-PERF";
  const workCenter = "WC-PERF";
  const items: ItemMaster[] = [];
  const bom: BomLine[] = [];
  const routingSteps: RoutingStep[] = [];
  const fgIds: string[] = [];

  const buyIds = Array.from({ length: 30 }, (_, i) => `RM-${String(i + 1).padStart(3, "0")}`);
  for (const itemId of buyIds) {
    items.push({ itemId, name: itemId, makeBuy: "BUY", leadTimeDays: 3, defaultSupplierId: supplierId, purchasePrice: 100 });
  }

  const addMake = (itemId: string) => {
    items.push({ itemId, name: itemId, makeBuy: "MAKE", leadTimeDays: 1 });
    routingSteps.push({ itemId, stepNo: 10, workCenter, stdTimeMin: 10 });
  };

  let buyCursor = 0;
  for (let f = 1; f <= 10; f += 1) {
    const fg = `FG-${f}`;
    fgIds.push(fg);
    addMake(fg);
    for (let a = 1; a <= 2; a += 1) {
      const sa = `SA-${f}-${a}`;
      addMake(sa);
      bom.push({ parentItemId: fg, childItemId: sa, qtyPer: 2 });
      for (let b = 1; b <= 2; b += 1) {
        const sb = `SB-${f}-${a}-${b}`;
        addMake(sb);
        bom.push({ parentItemId: sa, childItemId: sb, qtyPer: 2 });
        for (let r = 0; r < 3; r += 1) {
          bom.push({ parentItemId: sb, childItemId: buyIds[buyCursor % buyIds.length], qtyPer: 3 });
          buyCursor += 1;
        }
      }
    }
  }

  state.items = items;
  state.bom = bom;
  state.routingSteps = routingSteps;
  state.workCenters = [{ workCenter, ratePerHour: 2400, capacityMinPerDay: 480 }];
  state.suppliers = [{ supplierId, name: "性能テスト用仕入先" }];
  return fgIds;
}

function addOrders(state: SimulationState, itemIds: string[], count: number, firstDay: number): void {
  for (let i = 0; i < count; i += 1) {
    const itemId = itemIds[i % itemIds.length];
    const customerId = i % 2 === 0 ? "CUST-A" : "CUST-B";
    createSalesOrder(state, { customerId, itemId, qty: 10 + (i % 5), requestDay: firstDay + i }, 0);
  }
}

describe("[UC-06][単体][性能テスト] runMRPの実行時間（poc-definition.md 4章）", () => {
  it("[UC-06][単体][性能テスト][正常] 既定プリセット（木製イス）・受注20件でMRP実行が1秒以内", () => {
    const state = createTestState(0);
    addOrders(state, [ITEM_IDS.FG_CHAIR], 20, 10);

    const ms = measureMaxMs(state);
    console.info(`[perf] runMRP 木製イス・受注20件: 最大 ${ms.toFixed(2)} ms（${RUNS}回）`);

    // 受注1件あたり5品目（FG・座面・木板・脚・ネジ）の計画オーダが出る
    expect(state.plannedOrders).toHaveLength(100);
    expect(ms).toBeLessThan(1000);
  });

  it("[UC-06][単体][性能テスト][正常] 4階層BOM・品目100件・受注20件でMRP実行が3秒以内", () => {
    const state = createTestState(0);
    const fgIds = buildLargeMaster(state);
    expect(state.items).toHaveLength(100);
    addOrders(state, fgIds, 20, 20);

    const ms = measureMaxMs(state);
    console.info(`[perf] runMRP 4階層・品目100件・受注20件: 最大 ${ms.toFixed(2)} ms（${RUNS}回）`);

    // 受注1件あたり内製7品目＋購買12品目（L2の4品目×3）の計画オーダが出る
    expect(state.plannedOrders).toHaveLength(20 * 19);
    expect(Math.max(...state.plannedOrders.map((p) => p.bomLevel))).toBe(3);
    expect(ms).toBeLessThan(3000);
  });

  it("[UC-06][単体][性能テスト][正常] 4階層BOM・品目100件で確定済みオーダ（受注20件分）がある状態に受注20件を追加してもMRP実行が3秒以内", () => {
    // 既存の製造オーダの部材所要を再検証する経路（explodeOpenOrderComponents）も含めて測る
    const state = createTestState(0);
    const fgIds = buildLargeMaster(state);
    addOrders(state, fgIds, 20, 20);
    runMRP(state);
    firmAllPlannedOrders(state, 0);
    expect(state.mfgOrders).toHaveLength(20 * 7);
    addOrders(state, fgIds, 20, 40);

    const ms = measureMaxMs(state);
    console.info(`[perf] runMRP 4階層・品目100件・確定済み20件＋新規受注20件: 最大 ${ms.toFixed(2)} ms（${RUNS}回）`);

    // 確定済み分は供給で賄われ、新規受注20件分だけが計画オーダになる
    expect(state.plannedOrders).toHaveLength(20 * 19);
    expect(ms).toBeLessThan(3000);
  });
});
