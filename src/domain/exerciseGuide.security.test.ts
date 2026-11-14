import { describe, expect, it } from "vitest";
import { buildGuideContext } from "./exerciseGuide";
import { createTestState } from "./testUtils";
import { ITEM_IDS, WORK_CENTERS } from "../data/masterData";

// SEC-001（docs/security/reports参照）：buildGuideContext()は最終製品の工順の最初・最後の工程番号を
// 求める。もともとMath.min(...finalSteps)/Math.max(...finalSteps)のスプレッド引数で書かれており、
// JSON取り込みで1品目に十数万件規模の工順を入れられると、V8の引数上限を超えてRangeErrorになり
// 演習ガイドの描画ごと落ちる懸念があった（docs/security/checklist.md §6.3 可用性／§6.1 入力検証）。
// reduceへの置き換え後も、大量の工順で例外を投げず、正しい最小・最大値を返すことを回帰テストとして確かめる。
const STEP_COUNT = 200_000;

describe("exerciseGuide buildGuideContext 大量工順 [@security]", () => {
  it("[単体][セキュリティテスト][異常] [@security] 最終製品に20万件の工順があっても例外を投げず最初・最後の工程番号を正しく求める", () => {
    const state = createTestState();
    // 既定プリセットの工順（10・20）より小さい値・大きい値を含め、昇順・降順のどちらでもない順に入れる
    for (let i = 0; i < STEP_COUNT; i++) {
      const stepNo = i % 2 === 0 ? 100 + i : 100 + STEP_COUNT * 2 - i;
      state.routingSteps.push({
        itemId: ITEM_IDS.FG_CHAIR,
        stepNo,
        workCenter: WORK_CENTERS.ASM,
        stdTimeMin: 1,
      });
    }
    state.routingSteps.push({ itemId: ITEM_IDS.FG_CHAIR, stepNo: 5, workCenter: WORK_CENTERS.ASM, stdTimeMin: 1 });
    state.routingSteps.push({
      itemId: ITEM_IDS.FG_CHAIR,
      stepNo: 9_000_000,
      workCenter: WORK_CENTERS.INS,
      stdTimeMin: 1,
    });

    const finalCount = state.routingSteps.filter((r) => r.itemId === ITEM_IDS.FG_CHAIR).length;
    expect(finalCount).toBeGreaterThan(STEP_COUNT);

    let ctx: ReturnType<typeof buildGuideContext> | undefined;
    expect(() => {
      ctx = buildGuideContext(state);
    }).not.toThrow();
    expect(ctx?.finalItemId).toBe(ITEM_IDS.FG_CHAIR);
    expect(ctx?.finalFirstStepNo).toBe(5);
    expect(ctx?.finalLastStepNo).toBe(9_000_000);
  });
});
