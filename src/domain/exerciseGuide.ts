// 演習ガイド（v5-spec.md §8.1 D3、design.md DEV-4）
//
// v5-spec.md §9.3のTC-02〜TC-18（通し演習の正常系シーケンス）をステップ一覧として提示し、
// 各ステップが完了したかどうかを現在のSimulationStateから自動判定する。TC-01（マスタ初期化）は
// 初期状態で常に真となる確認項目として先頭に含める。
//
// 判定は「一度満たされたら後戻りしない」ことを優先し、SOLE_LINE・STOCK_TXN・MFG_ORDER・SHIPMENTなど
// 増分専用テーブルの存在有無で見る。PLANNED_ORDERはMRP再実行のたびに全削除・全再生成される揮発データ
// （v5-spec.md §6.2）で単独では「何回MRPを実行したか」を判定できないため、TC-04・TC-06・TC-14の判定は
// EventLogPanelと同じ「eventLog.messageの固定テンプレートを手がかりにする」手法（design.md
// processFlow.tsの前例を踏襲）で「MRPを実行した」ログの出現回数を数える。design.md EXT-17参照：
// 演習の想定順序（TC-04→TC-06→TC-14の3回）から外れた操作をすると回数がずれる場合があるが、
// このガイドは進行の目安であり他タブの操作を妨げないため、簡略化として許容する。
import { ITEM_IDS } from "../data/masterData";
import type { SimulationState } from "../types";

export interface GuideStep {
  tc: string;
  title: string;
  instruction: string;
  expected: string;
}

export interface GuideStepResult extends GuideStep {
  done: boolean;
}

function countLogMessages(state: SimulationState, prefix: string): number {
  return state.eventLog.filter((e) => e.message.startsWith(prefix)).length;
}

interface InternalStep extends GuideStep {
  isDone: (state: SimulationState) => boolean;
}

const STEPS: InternalStep[] = [
  {
    tc: "TC-01",
    title: "マスタ初期化の確認",
    instruction: "マスタタブで品目5件・BOM4行・工順3行が揃っていることを確認する",
    expected: "ITEM 5行 / BOM_LINE 4行 / ROUTING_STEP 3行",
    isDone: () => true,
  },
  {
    tc: "TC-02",
    title: "受注登録",
    instruction: "受注タブで「木製イス」を数量10、希望納期D+15で登録する",
    expected: "SALES_ORDER 1行 / SO_LINE 1行（status=RECEIVED）",
    isDone: (state) => state.soLines.length >= 1,
  },
  {
    tc: "TC-03",
    title: "納期回答",
    instruction: "登録した受注の納期回答をD+15で確定する",
    expected: "SO_LINE status=CONFIRMED",
    isDone: (state) => state.soLines.some((l) => l.confirmDay != null),
  },
  {
    tc: "TC-04",
    title: "MRP実行",
    instruction: "計画タブで「MRPを実行」する",
    expected: "PLANNED_ORDER 5行",
    isDone: (state) => countLogMessages(state, "MRPを実行した") >= 1,
  },
  {
    tc: "TC-05",
    title: "計画オーダ確定",
    instruction: "計画タブで「計画オーダを確定」する",
    expected: "MFG_ORDER 2行 / PURCHASE_ORDER 3行 / WORK_INSTRUCTION 3行",
    isDone: (state) => state.mfgOrders.length >= 1 && state.purchaseOrders.length >= 1,
  },
  {
    tc: "TC-06",
    title: "MRP再実行で重複が無いことを確認",
    instruction: "計画タブでもう一度「MRPを実行」し、計画オーダが0件になることを確認する",
    expected: "PLANNED_ORDER 0行（確定済オーダが供給に算入されるため）",
    isDone: (state) => countLogMessages(state, "MRPを実行した") >= 2,
  },
  {
    tc: "TC-07",
    title: "購買オーダの納期回答",
    instruction: "発注タブで3件の購買オーダすべてに納期回答する",
    expected: "PURCHASE_ORDER status=ACKED（3件とも）",
    isDone: (state) => state.purchaseOrders.length >= 3 && state.purchaseOrders.every((p) => p.confirmDay != null),
  },
  {
    tc: "TC-08",
    title: "木板の入荷計上",
    instruction: "D+12まで日を進め、木板（RM-300）を入荷計上する",
    expected: "STOCK_TXN +1（RCV）/ PO status=CLOSED",
    isDone: (state) => state.stockTxns.some((t) => t.itemId === ITEM_IDS.RM_BOARD && t.txnType === "RCV"),
  },
  {
    tc: "TC-09",
    title: "座面ASSYの製造",
    instruction: "工程タブで座面ASSYの製造オーダをリリース・着手・完了（良品10・不良0）する",
    expected: "STOCK_TXN +2（ISS 木板 / PRD 座面ASSY）",
    isDone: (state) => state.stockTxns.some((t) => t.itemId === ITEM_IDS.SA_SEAT && t.txnType === "PRD"),
  },
  {
    tc: "TC-10",
    title: "脚・ネジの入荷計上",
    instruction: "D+14まで日を進め、脚（PT-400）・ネジ（PT-500）を入荷計上する",
    expected: "STOCK_TXN +2（RCV）",
    isDone: (state) =>
      state.stockTxns.some((t) => t.itemId === ITEM_IDS.PT_LEG && t.txnType === "RCV") &&
      state.stockTxns.some((t) => t.itemId === ITEM_IDS.PT_SCREW && t.txnType === "RCV"),
  },
  {
    tc: "TC-11",
    title: "木製イス 工程10（組立）完了",
    instruction: "工程タブで木製イスの製造オーダをリリース・着手し、工程10（組立）を完了する（良品10・不良0）",
    expected: "STOCK_TXN +3（ISS 座面ASSY / 脚 / ネジ）",
    isDone: (state) => {
      const fgOrder = state.mfgOrders.find((mo) => mo.itemId === ITEM_IDS.FG_CHAIR);
      const wi = fgOrder && state.workInstructions.find((w) => w.moNo === fgOrder.moNo && w.stepNo === 10);
      return wi?.status === "DONE";
    },
  },
  {
    tc: "TC-12",
    title: "木製イス 工程20（検査）完了",
    instruction: "工程20（検査）を完了する（例：良品9・不良1）",
    expected: "STOCK_TXN +1（PRD 木製イス）/ MFG_ORDER status=DONE",
    isDone: (state) => state.mfgOrders.find((mo) => mo.itemId === ITEM_IDS.FG_CHAIR)?.status === "DONE",
  },
  {
    tc: "TC-13",
    title: "未充足需要の確認",
    instruction: "警告バーで「未充足需要」の表示を確認する（不良が出ていれば不足数量が表示される）",
    expected: "不足数量が表示される（不良が無ければ表示は無く、それで問題無い）",
    isDone: (state) => state.mfgOrders.find((mo) => mo.itemId === ITEM_IDS.FG_CHAIR)?.status === "DONE",
  },
  {
    tc: "TC-14",
    title: "MRP再実行（不足分の補充）",
    instruction: "計画タブで再度「MRPを実行」し、不足分の計画オーダが生成されることを確認する",
    expected: "PLANNED_ORDER 生成（不足がある場合のみ）",
    isDone: (state) => countLogMessages(state, "MRPを実行した") >= 3,
  },
  {
    tc: "TC-15",
    title: "出荷指示（引当）",
    instruction: "出荷タブで受注を引き当てる",
    expected: "SHIPMENT 1行（ALLOCATED）",
    isDone: (state) => state.shipments.length >= 1,
  },
  {
    tc: "TC-16",
    title: "出荷実績登録",
    instruction: "D+15で出荷実績を登録する",
    expected: "STOCK_TXN +1（SHP）/ SO_LINE status=PARTIALまたはCLOSED",
    isDone: (state) => state.shipments.some((s) => s.status === "SHIPPED"),
  },
  {
    tc: "TC-17",
    title: "KPI確認",
    instruction: "KPIタブで納期遵守率・直行率・計画達成率・受注残を確認する",
    expected: "各指標が算出される",
    isDone: (state) => state.shipments.some((s) => s.status === "SHIPPED"),
  },
  {
    tc: "TC-18",
    title: "引当元追跡",
    instruction: "引当元追跡タブで受注から製造・購買オーダまでの繋がりを確認する",
    expected: "MFG_ORDER・PURCHASE_ORDER・STOCK_TXNの繋がりが表示される",
    isDone: (state) => state.shipments.some((s) => s.status === "SHIPPED"),
  },
];

/**
 * 現在のマスタが演習用プリセット（木製イス）と一致しているか。
 * マスタが自由に登録できるようになったため、別題材のマスタでは上記の判定（品目コード直指定）が
 * 成立しない。画面側でその旨を案内するために使う（design.md EXT-27）。
 */
export function isPresetMaster(state: SimulationState): boolean {
  const expected = Object.values(ITEM_IDS);
  return (
    state.items.length === expected.length && expected.every((itemId) => state.items.some((i) => i.itemId === itemId))
  );
}

/** 全ステップの完了状況（design.md DEV-4：TCを画面上で自動判定する） */
export function computeGuideProgress(state: SimulationState): GuideStepResult[] {
  return STEPS.map(({ isDone, ...step }) => ({ ...step, done: isDone(state) }));
}

/** 次に取り組むべきステップ（最初の未完了ステップ）。全完了ならnull */
export function currentGuideStep(state: SimulationState): GuideStepResult | null {
  return computeGuideProgress(state).find((s) => !s.done) ?? null;
}
