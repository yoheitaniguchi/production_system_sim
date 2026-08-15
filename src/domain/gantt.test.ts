import { describe, expect, it } from "vitest";
import { ITEM_IDS } from "../data/masterData";
import { computeGanttRows, ganttDayRange } from "./gantt";
import { firmAllPlannedOrders, runMRP } from "./mrp";
import { ackPurchaseOrder, receivePurchaseOrder } from "./procurement";
import { completeStep, releaseMfgOrder, startStep } from "./production";
import { cancelSalesOrder, confirmDelivery, createSalesOrder } from "./salesOrder";
import { allocateShipment, shipOut } from "./shipment";
import { createTestState } from "./testUtils";

describe("computeGanttRows（受注ごとの進捗ガントチャート）", () => {
  it("受注登録直後は計画のみで、実績は受注日から今日までの進行中として表示される", () => {
    const state = createTestState(0);
    const soNo = createSalesOrder(state, { customerId: "CUST-A", itemId: ITEM_IDS.FG_CHAIR, qty: 10, requestDay: 15 }, 0);

    const [row] = computeGanttRows(state);
    expect(row.soNo).toBe(soNo);
    expect(row.children).toHaveLength(0); // MRP未実行なので子タスクは無い
    expect(row.summary).toMatchObject({
      kind: "SO",
      planStart: 0,
      planEnd: 15, // 納期回答前は希望納期を暫定の計画終了日とする
      actualStart: 0,
      actualEnd: null,
      ongoing: true,
      barState: "IN_PROGRESS",
    });
  });

  it("納期回答後は計画終了日が回答納期に更新される", () => {
    const state = createTestState(0);
    const soNo = createSalesOrder(state, { customerId: "CUST-A", itemId: ITEM_IDS.FG_CHAIR, qty: 10, requestDay: 20 }, 0);
    confirmDelivery(state, soNo, 15);

    const [row] = computeGanttRows(state);
    expect(row.summary.planEnd).toBe(15);
  });

  it("回答納期を過ぎても出荷できていなければDELAYEDになる", () => {
    const state = createTestState(0);
    const soNo = createSalesOrder(state, { customerId: "CUST-A", itemId: ITEM_IDS.FG_CHAIR, qty: 10, requestDay: 15 }, 0);
    confirmDelivery(state, soNo, 15);
    state.day = 16;

    const [row] = computeGanttRows(state);
    expect(row.summary.barState).toBe("DELAYED");
  });

  it("design.md EXT-2/3：MRP未実行のまま取消した受注はCANCELED表示になり、子タスクも無い（計画オーダが1件も無いため）", () => {
    const state = createTestState(0);
    const soNo = createSalesOrder(state, { customerId: "CUST-A", itemId: ITEM_IDS.FG_CHAIR, qty: 10, requestDay: 15 }, 0);
    cancelSalesOrder(state, soNo);

    const [row] = computeGanttRows(state);
    expect(row.summary.barState).toBe("CANCELED");
    expect(row.children).toHaveLength(0);
  });

  it("design.md EXT-2：計画オーダ確定後に取消した受注は、カスケードでCANCELEDになった購買/製造オーダが子タスクとして残る", () => {
    const state = createTestState(0);
    const soNo = createSalesOrder(state, { customerId: "CUST-A", itemId: ITEM_IDS.FG_CHAIR, qty: 10, requestDay: 15 }, 0);
    confirmDelivery(state, soNo, 15);
    runMRP(state);
    firmAllPlannedOrders(state, 0); // ここまでは実績が一切無いのでEXT-3のガードを満たし取消可能
    cancelSalesOrder(state, soNo);

    const [row] = computeGanttRows(state);
    expect(row.summary.barState).toBe("CANCELED");
    expect(row.children.length).toBeGreaterThan(0); // salesOrder.tsはMO/POを配列から削除せずCANCELEDへカスケードするのみ
    expect(row.children.every((c) => c.barState === "CANCELED")).toBe(true);
  });

  it("v5-spec.md §9.3 TC-01〜16を通しで進めると、購買/製造/出荷の子タスクが計画・実績どおりになる", () => {
    const state = createTestState(0);
    const soNo = createSalesOrder(state, { customerId: "CUST-A", itemId: ITEM_IDS.FG_CHAIR, qty: 10, requestDay: 15 }, 0);
    confirmDelivery(state, soNo, 15);
    runMRP(state);
    firmAllPlannedOrders(state, 0); // 計画オーダを全確定した日＝PurchaseOrder.orderDayになる

    for (const po of state.purchaseOrders) {
      ackPurchaseOrder(state, po.poNo, po.dueDay); // 希望どおりの回答（オンタイム）
    }
    const rmPo = state.purchaseOrders.find((p) => p.itemId === ITEM_IDS.RM_BOARD)!;
    receivePurchaseOrder(state, rmPo.poNo, rmPo.dueDay); // TC-08：D+12入荷

    const saOrder = state.mfgOrders.find((mo) => mo.itemId === ITEM_IDS.SA_SEAT)!;
    releaseMfgOrder(state, saOrder.moNo);
    startStep(state, saOrder.moNo, 10, 12);
    completeStep(state, saOrder.moNo, 10, 10, 0, 13); // TC-09：良品10・不良0
    state.day = 13;

    {
      const [row] = computeGanttRows(state);

      const rmTask = row.children.find((c) => c.id === rmPo.poNo)!;
      expect(rmTask).toMatchObject({
        kind: "PO",
        planStart: 0, // firmAllPlannedOrders(state, 0)を呼んだ日＝発注日
        planEnd: 12, // TC-04表のRM-300必要日
        actualStart: 0,
        actualEnd: 12,
        ongoing: false,
        barState: "DONE",
      });

      const saTask = row.children.find((c) => c.id === saOrder.moNo)!;
      expect(saTask).toMatchObject({
        kind: "MO",
        planStart: 12, // TC-04表のSA-200着手日
        planEnd: 13, // TC-04表のSA-200必要日
        actualStart: 12,
        actualEnd: 13,
        ongoing: false,
        barState: "DONE",
      });

      // PT-400/PT-500は発注済みだが未入荷（回答納期＝必要日D+13ちょうどなのでまだ遅延ではない）
      const ptLegPo = state.purchaseOrders.find((p) => p.itemId === ITEM_IDS.PT_LEG)!;
      const ptTask = row.children.find((c) => c.id === ptLegPo.poNo)!;
      expect(ptTask).toMatchObject({
        planStart: 0,
        planEnd: 13,
        actualStart: 0,
        actualEnd: null,
        ongoing: true,
        barState: "IN_PROGRESS",
      });
    }

    const ptLegPo = state.purchaseOrders.find((p) => p.itemId === ITEM_IDS.PT_LEG)!;
    const ptScrewPo = state.purchaseOrders.find((p) => p.itemId === ITEM_IDS.PT_SCREW)!;
    // TC-10相当（v5-spec.mdの本文は「D+14まで進め」だが、TC-04表のPT-400/PT-500必要日はD+13のため
    // 希望どおりの回答＝D+13受入となる。kpi.test.tsの同シナリオと同じ扱い）
    receivePurchaseOrder(state, ptLegPo.poNo, ptLegPo.dueDay);
    receivePurchaseOrder(state, ptScrewPo.poNo, ptScrewPo.dueDay);

    const fgOrder = state.mfgOrders.find((mo) => mo.itemId === ITEM_IDS.FG_CHAIR)!;
    releaseMfgOrder(state, fgOrder.moNo);
    startStep(state, fgOrder.moNo, 10, 14);
    completeStep(state, fgOrder.moNo, 10, 10, 0, 14); // TC-11
    startStep(state, fgOrder.moNo, 20, 14);
    completeStep(state, fgOrder.moNo, 20, 9, 1, 14); // TC-12：良品9・不良1
    state.day = 14;

    allocateShipment(state, soNo, 1, 15); // TC-15：出荷可能量9のみ引当
    state.day = 15;
    shipOut(state, state.shipments[0].shipNo, 15); // TC-16

    const [row] = computeGanttRows(state);
    expect(row.status).toBe("PARTIAL"); // 受注残1個（TC-13相当）が残るため未CLOSED

    // 全量出荷ではないため受注行の実績終了日はまだ確定しない（今日まで進行中として表示）
    expect(row.summary).toMatchObject({ planEnd: 15, actualStart: 0, actualEnd: null, ongoing: true });

    const fgTask = row.children.find((c) => c.id === fgOrder.moNo)!;
    expect(fgTask).toMatchObject({ planStart: 13, planEnd: 15, actualStart: 14, actualEnd: 14, barState: "DONE" });

    const shipTask = row.children.find((c) => c.kind === "SHIP")!;
    expect(shipTask).toMatchObject({
      planStart: 15,
      planEnd: 15,
      actualStart: 15,
      actualEnd: 15,
      barState: "DONE",
    });
  });
});

describe("ganttDayRange", () => {
  it("表示対象の計画・実績・今日を包含する範囲を返す", () => {
    const state = createTestState(20);
    createSalesOrder(state, { customerId: "CUST-A", itemId: ITEM_IDS.FG_CHAIR, qty: 10, requestDay: 15 }, 0);

    const range = ganttDayRange(computeGanttRows(state), state.day);
    expect(range).toEqual({ minDay: 0, maxDay: 20 });
  });

  it("受注が1件も無ければnullを返す", () => {
    const state = createTestState(0);
    expect(ganttDayRange(computeGanttRows(state), state.day)).toBeNull();
  });
});
