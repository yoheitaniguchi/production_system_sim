// 能力（山積み）のバーグラフ（Issue #67、design.md EXT-42）。描画結果のマークアップを検査する
// （jsdom等を足さず、react-dom/serverの静的レンダリングだけで超過ハイライトの有無を確認する）
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ITEM_IDS } from "../data/masterData";
import { computeCapacityLoad } from "../domain/capacity";
import { firmAllPlannedOrders, runMRP } from "../domain/mrp";
import { confirmDelivery, createSalesOrder } from "../domain/salesOrder";
import { createTestState } from "../domain/testUtils";
import { CapacityLoadChart } from "./CapacityLoadChart";

// design.md §9.5の計算例：TC-04〜05の確定結果だけでWC-ASM D+13が300分/240分の山積み超過になる
function firmedChairState() {
  const state = createTestState(0);
  const soNo = createSalesOrder(state, { customerId: "CUST-A", itemId: ITEM_IDS.FG_CHAIR, qty: 10, requestDay: 15 }, 0);
  confirmDelivery(state, soNo, 15);
  runMRP(state);
  firmAllPlannedOrders(state, 0);
  return state;
}

const countOf = (markup: string, needle: string) => markup.split(needle).length - 1;

describe("CapacityLoadChart（Issue #67）", () => {
  it("[単体][画面部品テスト][正常] design.md §9.5の超過（WC-ASM D+13）だけが警告としてハイライトされる", () => {
    const markup = renderToStaticMarkup(<CapacityLoadChart entries={computeCapacityLoad(firmedChairState())} />);

    // セルの強調はWC-ASM D+13の1件だけ（WC-CUT D+12・WC-INS D+13は能力内）
    expect(countOf(markup, 'class="capacity-chart__cell--overload"')).toBe(1);
    expect(countOf(markup, 'class="capacity-chart__cell"')).toBe(2);
    // 色に頼らない手がかり：「超過 +60」の文字と、ツールチップ・aria-labelの内容
    expect(markup).toContain("超過 +60");
    expect(markup).toContain("WC-ASM D+13：能力240分を60分超過");
    expect(markup).toContain("能力超過：WC-ASM D+13（60分超過）");
    // 超過した計画負荷の棒だけが警告色のクラスを持つ
    expect(countOf(markup, "capacity-chart__bar--over")).toBe(1);
    expect(markup).toContain("WC-ASM D+13 計画負荷 300分（能力240分）");
  });

  it("[単体][画面部品テスト][境界] どの作業区・日も能力内なら、超過のハイライトも「超過」の文字も出ない", () => {
    const state = firmedChairState();
    for (const wc of state.workCenters) wc.capacityMinPerDay = 480;

    const markup = renderToStaticMarkup(<CapacityLoadChart entries={computeCapacityLoad(state)} />);

    expect(markup).not.toContain("capacity-chart__cell--overload");
    expect(markup).not.toContain("capacity-chart__bar--over");
    expect(markup).not.toContain("超過 +");
    expect(markup).toContain("能力超過はありません");
    // 負荷そのものは描画されている
    expect(markup).toContain("WC-ASM D+13 計画負荷 300分（能力480分）");
  });

  it("[単体][画面部品テスト][境界] 計画負荷が能力内でも実績負荷が能力を超えれば、実績の棒が警告になる", () => {
    const entries = [{ workCenter: "WC-X", day: 5, plannedMin: 100, actualMin: 300, capacityMin: 240 }];

    const markup = renderToStaticMarkup(<CapacityLoadChart entries={entries} />);

    expect(countOf(markup, 'class="capacity-chart__bar--actual capacity-chart__bar--over"')).toBe(1);
    expect(countOf(markup, 'class="capacity-chart__bar--plan"')).toBe(1); // 計画側は能力内の通常色
    expect(markup).toContain("超過 +60");
  });

  it("[単体][画面部品テスト][境界] 負荷が1件も無ければ何も描画しない", () => {
    expect(renderToStaticMarkup(<CapacityLoadChart entries={[]} />)).toBe("");
  });
});
