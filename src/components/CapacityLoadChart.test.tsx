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
    expect(countOf(markup, 'data-overload="true"')).toBe(1);
    expect(countOf(markup, 'data-overload="false"')).toBe(2);
    // 色に頼らない手がかり：「超過 +60分」の文字と、ツールチップ・aria-labelの内容
    expect(markup).toContain("超過 +60分");
    expect(markup).toContain("WC-ASM D+13：能力240分を60分超過");
    expect(markup).toContain("能力超過：WC-ASM D+13（60分超過）");
    // 超過した計画負荷の棒だけが警告色のクラスを持つ
    expect(countOf(markup, "capacity-chart__bar--overload")).toBe(1);
    expect(markup).toContain("WC-ASM D+13 計画負荷 300分（能力240分）");
  });

  it("[単体][画面部品テスト][正常] どの作業区・日も能力内なら、超過のハイライトも「超過」の文字も出ない", () => {
    const state = firmedChairState();
    for (const wc of state.workCenters) wc.capacityMinPerDay = 480;

    const markup = renderToStaticMarkup(<CapacityLoadChart entries={computeCapacityLoad(state)} />);

    expect(markup).not.toContain('data-overload="true"');
    expect(markup).not.toContain("capacity-chart__bar--overload");
    expect(markup).not.toContain("超過 +");
    expect(markup).toContain("能力超過はありません");
    // 負荷そのものは描画されている
    expect(markup).toContain("WC-ASM D+13 計画負荷 300分（能力480分）");
  });

  it("[単体][画面部品テスト][境界] 計画負荷が能力内でも実績負荷が能力を超えれば、実績の棒が警告になる", () => {
    const entries = [{ workCenter: "WC-X", day: 5, plannedMin: 100, actualMin: 300, capacityMin: 240 }];

    const markup = renderToStaticMarkup(<CapacityLoadChart entries={entries} />);

    expect(countOf(markup, 'class="capacity-chart__bar--actual capacity-chart__bar--overload"')).toBe(1);
    expect(countOf(markup, 'class="capacity-chart__bar--plan"')).toBe(1); // 計画側は能力内の通常色
    expect(markup).toContain("超過 +60分");
  });

  it("[単体][画面部品テスト][境界] 能力0・負荷0の行だけでも、NaN・Infinityを含む属性を出力しない", () => {
    const entries = [{ workCenter: "WC-Z", day: 1, plannedMin: 0, actualMin: 0, capacityMin: 0 }];

    const markup = renderToStaticMarkup(<CapacityLoadChart entries={entries} />);

    expect(markup).not.toContain("NaN");
    expect(markup).not.toContain("Infinity");
  });

  it("[単体][画面部品テスト][正常] 作業区の並びは渡したマスタ順（工程の流れ）に従い、固定列と横スクロール領域を持つ", () => {
    const state = firmedChairState();
    const order = state.workCenters.map((w) => w.workCenter); // CUT→ASM→INS（マスタ順）

    const markup = renderToStaticMarkup(
      <CapacityLoadChart entries={computeCapacityLoad(state)} workCenterOrder={order} />,
    );

    const positions = order.map((wc) => markup.indexOf(`<span class="capacity-chart__label">${wc}</span>`));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions); // 出現順＝マスタ順
    // キーボードだけでも横スクロールできるよう、スクロール領域はフォーカス可能なリージョンにしてある
    expect(markup).toContain('tabindex="0"');
    expect(markup).toContain('role="region"');
  });

  it("[単体][画面部品テスト][境界] 超過セルが多いときのaria-labelは先頭5件と残り件数だけを含む", () => {
    const entries = Array.from({ length: 8 }, (_, i) => ({
      workCenter: "WC-X",
      day: i + 1,
      plannedMin: 300,
      actualMin: 0,
      capacityMin: 240,
    }));

    const markup = renderToStaticMarkup(<CapacityLoadChart entries={entries} />);

    expect(markup).toContain("WC-X D+5（60分超過）");
    expect(markup).not.toContain("WC-X D+6（60分超過）、");
    expect(markup).toContain("ほか3件（詳細は下の表）");
  });

  it("[単体][画面部品テスト][境界] 負荷が1件も無ければ何も描画しない", () => {
    expect(renderToStaticMarkup(<CapacityLoadChart entries={[]} />)).toBe("");
  });
});
