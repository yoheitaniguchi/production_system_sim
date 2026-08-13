import { describe, expect, it } from "vitest";
import { ITEM_IDS } from "../data/masterData";
import { confirmDelivery, createSalesOrder } from "./salesOrder";
import { runMRP } from "./mrp";
import { resolveRootPegKey } from "./pegging";
import { createTestState } from "./testUtils";

// design.md §6：複数受注が同一資材（木板 RM-300）を取り合う演習（TC-M1）。
// v1 design.md §9-2（モーターを軸にした複数受注の優先順位ルール演習）と同じ狙いを、
// v5仕様書のMRPバッチモデル上で再現する。
//
// 前提：木板（RM-300）が手元に1枚だけ残っている（見込み在庫の払出し残り等を想定）。
//   - 受注Y：木製イス2脚、D0登録、回答納期D+30（余裕あり）
//   - 受注Z：木製イス1脚、D2登録（Yより後）、回答納期D+20（Yより早い＝優先度が高い）
//
// design.md EXT-1（需要は必要日昇順で展開する）が正しく実装されていれば、
// 登録が後のZが先に処理され、限られた1枚の木板在庫はZの所要を満たすために使われる。
// Yはその分、木板を新規に2枚とも発注する必要が生じる。
describe("複数受注の資源競合演習（design.md §6 TC-M1）", () => {
  it("納期が早いZが手元在庫（木板1枚）を優先的に使い、Yは全量を新規発注する", () => {
    const state = createTestState(0);
    state.stocks.push({ itemId: ITEM_IDS.RM_BOARD, onHand: 1, allocated: 0 });

    const soY = createSalesOrder(state, { customerId: "CUST-A", itemId: ITEM_IDS.FG_CHAIR, qty: 2, requestDay: 30 }, 0);
    confirmDelivery(state, soY, 30);

    state.day = 2;
    const soZ = createSalesOrder(state, { customerId: "CUST-B", itemId: ITEM_IDS.FG_CHAIR, qty: 1, requestDay: 20 }, 2);
    confirmDelivery(state, soZ, 20);

    runMRP(state);

    const rmPlos = state.plannedOrders.filter((p) => p.itemId === ITEM_IDS.RM_BOARD);
    const zRmPlo = rmPlos.find((p) => resolveRootPegKey(state, p.pegTo) === `${soZ}-1`);
    const yRmPlo = rmPlos.find((p) => resolveRootPegKey(state, p.pegTo) === `${soY}-1`);

    // Zの木板所要(1枚)は手元在庫でまかなえるため、Z向けの新規計画オーダは生成されない
    expect(zRmPlo).toBeUndefined();
    // Yの木板所要(2枚)は、在庫1枚をZに使われた後のため、2枚とも新規発注が必要になる
    expect(yRmPlo).toMatchObject({ qty: 2, orderType: "BUY" });
  });

  it("受注登録順ではなく納期昇順で展開されることを確認する（design.md EXT-1）", () => {
    // 上のテストと数量関係を入れ替え、Zの方が登録は後でも需要処理が先であることを別角度から確認する。
    // Yを先に登録しても、Yの木板所要が先に在庫を使い切ってしまう「登録順」処理にはなっていないことを見る。
    const state = createTestState(0);
    state.stocks.push({ itemId: ITEM_IDS.RM_BOARD, onHand: 1, allocated: 0 });

    const soY = createSalesOrder(state, { customerId: "CUST-A", itemId: ITEM_IDS.FG_CHAIR, qty: 5, requestDay: 30 }, 0);
    confirmDelivery(state, soY, 30);
    state.day = 2;
    const soZ = createSalesOrder(state, { customerId: "CUST-B", itemId: ITEM_IDS.FG_CHAIR, qty: 1, requestDay: 10 }, 2);
    confirmDelivery(state, soZ, 10);

    runMRP(state);

    const demandOrderIndexes = state.plannedOrders
      .filter((p) => p.itemId === ITEM_IDS.FG_CHAIR)
      .map((p) => p.pegTo);
    // FG-100のPLOはトップレベル需要そのものなので、先に展開された方（＝納期が早いZ）が
    // PLO-001として先頭に来る
    expect(demandOrderIndexes[0]).toBe(`${soZ}-1`);
    expect(demandOrderIndexes[1]).toBe(`${soY}-1`);
  });
});
