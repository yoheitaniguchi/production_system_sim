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
//
// マスタ非依存化（design.md EXT-43、Issue #65）：品目コードを直接指定せず、現在のマスタから
// 「最終製品」「中間品」「購買品」の役割をBOM構造で導いて判定・文言を組み立てる（GuideContext）。
// 役割に当たる品目が無い題材では、そのステップを「該当なし」として完了扱いでスキップする。
import { ITEM_IDS } from "../data/masterData";
import type { DashboardKpiHighlights, SimulationState } from "../types";
import { MAX_BOM_DEPTH, buildBomIndex } from "./masterIntegrity";

export interface GuideStep {
  tc: string;
  title: string;
  instruction: string;
  expected: string;
}

/** done=完了／pending=未完了／notApplicable=現在のマスタに該当する品目が無い（EXT-43） */
export type GuideStepStatus = "done" | "pending" | "notApplicable";

export interface GuideStepResult extends GuideStep {
  status: GuideStepStatus;
  /** 「次にやること」の対象外か（done・notApplicableのとき真） */
  done: boolean;
}

/**
 * 現在のマスタから導いた、演習ステップの判定に使う品目の役割（design.md EXT-43）。
 * すべて品目コードの配列で、並びはマスタ（items）の登録順。
 */
export interface GuideContext {
  /** 木製イスのプリセットそのものか。真のときだけ文言に演習シナリオ固有の数量・日付を添える */
  isChairPreset: boolean;
  /** 最終製品：最初の受注明細の品目。受注が無ければBOMレベル0（どのBOMの子でもない）MAKE品目の先頭 */
  finalItemId: string | null;
  /** 最終製品のBOMに含まれる品目（最終製品自身を含む） */
  treeItemIds: string[];
  /** 中間品：最終製品のBOMに含まれる、最終製品以外のMAKE品目（BOMレベル1以上） */
  intermediateIds: string[];
  /** 中間品の材料：中間品の直下にあるBUY品目 */
  intermediateBuyIds: string[];
  /** 最終製品のBOMに含まれるBUY品目すべて */
  buyIds: string[];
  /** 最終製品の工順の最初と最後の工程番号（工順が無ければnull） */
  finalFirstStepNo: number | null;
  finalLastStepNo: number | null;
}

/**
 * 現在のマスタが演習用プリセット（木製イス）と一致しているか（品目コード集合の一致）。
 * EXT-43以降は判定の成否には使わず、文言に木製イスの演習シナリオ固有の数量・日付を添えるかどうかだけに使う。
 */
export function isPresetMaster(state: SimulationState): boolean {
  const expected = Object.values(ITEM_IDS);
  return (
    state.items.length === expected.length && expected.every((itemId) => state.items.some((i) => i.itemId === itemId))
  );
}

/** 最終製品の決定（EXT-43）：受注品目を優先し、受注前はBOMレベル0のMAKE品目で代える */
function resolveFinalItemId(state: SimulationState): string | null {
  const soItemId = state.soLines[0]?.itemId;
  if (soItemId && state.items.some((i) => i.itemId === soItemId)) return soItemId;
  const childIds = new Set(state.bom.map((b) => b.childItemId));
  return state.items.find((i) => i.makeBuy === "MAKE" && !childIds.has(i.itemId))?.itemId ?? null;
}

/** 最終製品から下方向へBOMを辿った品目集合。循環に備え訪問済み集合と深さ上限で打ち切る（EXT-19） */
function collectTree(state: SimulationState, rootId: string): Set<string> {
  const index = buildBomIndex(state.bom);
  const visited = new Set<string>([rootId]);
  let frontier = [rootId];
  for (let depth = 0; depth < MAX_BOM_DEPTH && frontier.length > 0; depth++) {
    const next: string[] = [];
    for (const parent of frontier) {
      for (const child of index.get(parent) ?? []) {
        if (!visited.has(child)) {
          visited.add(child);
          next.push(child);
        }
      }
    }
    frontier = next;
  }
  return visited;
}

export function buildGuideContext(state: SimulationState): GuideContext {
  const finalItemId = resolveFinalItemId(state);
  const tree = finalItemId ? collectTree(state, finalItemId) : new Set<string>();
  // マスタの登録順で並べる（文言の品目の並びを安定させるため）
  const treeItems = state.items.filter((i) => tree.has(i.itemId));
  const intermediateIds = treeItems
    .filter((i) => i.makeBuy === "MAKE" && i.itemId !== finalItemId)
    .map((i) => i.itemId);
  const intermediateSet = new Set(intermediateIds);
  const intermediateChildIds = new Set(
    state.bom.filter((b) => intermediateSet.has(b.parentItemId)).map((b) => b.childItemId),
  );
  const buyIds = treeItems.filter((i) => i.makeBuy === "BUY").map((i) => i.itemId);
  const finalSteps = state.routingSteps.filter((r) => r.itemId === finalItemId).map((r) => r.stepNo);
  return {
    isChairPreset: isPresetMaster(state),
    finalItemId,
    treeItemIds: treeItems.map((i) => i.itemId),
    intermediateIds,
    intermediateBuyIds: buyIds.filter((id) => intermediateChildIds.has(id)),
    buyIds,
    finalFirstStepNo: finalSteps.length > 0 ? Math.min(...finalSteps) : null,
    finalLastStepNo: finalSteps.length > 0 ? Math.max(...finalSteps) : null,
  };
}

function countLogMessages(state: SimulationState, prefix: string): number {
  return state.eventLog.filter((e) => e.message.startsWith(prefix)).length;
}

function hasTxn(state: SimulationState, itemId: string, txnType: "RCV" | "PRD"): boolean {
  return state.stockTxns.some((t) => t.itemId === itemId && t.txnType === txnType);
}

/** 最終製品が内製品か（購買品を受注した場合、製造系のステップは「該当なし」） */
function finalIsMake(state: SimulationState, ctx: GuideContext): boolean {
  return state.items.some((i) => i.itemId === ctx.finalItemId && i.makeBuy === "MAKE");
}

interface InternalStep {
  tc: string;
  build: (state: SimulationState, ctx: GuideContext) => Omit<GuideStep, "tc">;
  /** 現在のマスタに該当する品目が無いか（省略時は常に該当あり） */
  notApplicable?: (state: SimulationState, ctx: GuideContext) => boolean;
  isDone: (state: SimulationState, ctx: GuideContext) => boolean;
}

const STEPS: InternalStep[] = [
  {
    tc: "TC-01",
    build: (state) => ({
      title: "マスタ初期化の確認",
      instruction: `マスタタブで品目${state.items.length}件・BOM${state.bom.length}行・工順${state.routingSteps.length}行が揃っていることを確認する`,
      expected: `ITEM ${state.items.length}行 / BOM_LINE ${state.bom.length}行 / ROUTING_STEP ${state.routingSteps.length}行`,
    }),
    isDone: () => true,
  },
  {
    tc: "TC-02",
    build: (state, ctx) => {
      const name = ctx.finalItemId ? itemName(state, ctx.finalItemId) : null;
      return {
        title: "受注登録",
        instruction: ctx.isChairPreset
          ? `受注タブで「${name}」を数量10、希望納期D+15で登録する`
          : name
            ? `受注タブで「${name}」を登録する（数量・希望納期は任意）`
            : "受注タブで受注を登録する",
        expected: "SALES_ORDER 1行 / SO_LINE 1行（status=RECEIVED）",
      };
    },
    isDone: (state) => state.soLines.length >= 1,
  },
  {
    tc: "TC-03",
    build: (_state, ctx) => ({
      title: "納期回答",
      instruction: ctx.isChairPreset ? "登録した受注の納期回答をD+15で確定する" : "登録した受注の納期回答を確定する",
      expected: "SO_LINE status=CONFIRMED",
    }),
    isDone: (state) => state.soLines.some((l) => l.confirmDay != null),
  },
  {
    tc: "TC-04",
    build: (_state, ctx) => ({
      title: "MRP実行",
      instruction: "計画タブで「MRPを実行」する",
      expected: ctx.treeItemIds.length > 0 ? `PLANNED_ORDER ${ctx.treeItemIds.length}行` : "PLANNED_ORDER 生成",
    }),
    isDone: (state) => countLogMessages(state, "MRPを実行した") >= 1,
  },
  {
    tc: "TC-05",
    build: (state, ctx) => {
      const makeIds = ctx.treeItemIds.filter((id) => !ctx.buyIds.includes(id));
      const wiCount = state.routingSteps.filter((r) => makeIds.includes(r.itemId)).length;
      return {
        title: "計画オーダ確定",
        instruction: "計画タブで「計画オーダを確定」する",
        expected: `MFG_ORDER ${makeIds.length}行 / PURCHASE_ORDER ${ctx.buyIds.length}行 / WORK_INSTRUCTION ${wiCount}行`,
      };
    },
    // 購買品の無い題材では購買オーダが生まれないため、製造オーダだけで判定する
    isDone: (state, ctx) =>
      (state.mfgOrders.length >= 1 || !finalIsMake(state, ctx)) &&
      (state.purchaseOrders.length >= 1 || ctx.buyIds.length === 0),
  },
  {
    tc: "TC-06",
    build: () => ({
      title: "MRP再実行で重複が無いことを確認",
      instruction: "計画タブでもう一度「MRPを実行」し、計画オーダが0件になることを確認する",
      expected: "PLANNED_ORDER 0行（確定済オーダが供給に算入されるため）",
    }),
    isDone: (state) => countLogMessages(state, "MRPを実行した") >= 2,
  },
  {
    tc: "TC-07",
    build: (_state, ctx) => ({
      title: "購買オーダの納期回答",
      instruction: `発注タブで${ctx.buyIds.length}件の購買オーダすべてに納期回答する`,
      expected: `PURCHASE_ORDER status=ACKED（${ctx.buyIds.length}件とも）`,
    }),
    notApplicable: (_state, ctx) => ctx.buyIds.length === 0,
    isDone: (state) => state.purchaseOrders.length >= 1 && state.purchaseOrders.every((p) => p.confirmDay != null),
  },
  {
    tc: "TC-08",
    build: (state, ctx) => {
      const ids = ctx.intermediateBuyIds;
      const anyOf = ids.length > 1 ? "（中間品の材料。いずれか1件で完了）" : "";
      return {
        title: `${namesOf(state, ids) || "中間品の材料"}の入荷計上`,
        instruction: `${ctx.isChairPreset ? "D+12" : "入荷予定日"}まで日を進め、${labelsOf(state, ids) || "中間品の材料"}を入荷計上する${anyOf}`,
        expected: "STOCK_TXN +1（RCV）/ PO status=CLOSED",
      };
    },
    notApplicable: (_state, ctx) => ctx.intermediateBuyIds.length === 0,
    isDone: (state, ctx) => ctx.intermediateBuyIds.some((id) => hasTxn(state, id, "RCV")),
  },
  {
    tc: "TC-09",
    build: (state, ctx) => {
      const names = namesOf(state, ctx.intermediateIds, "・") || "中間品";
      const multiple = ctx.intermediateIds.length > 1;
      return {
        title: `${names}の製造`,
        instruction: ctx.isChairPreset
          ? `工程タブで${names}の製造オーダをリリース・着手・完了（良品10・不良0）する`
          : `工程タブで${names}の製造オーダをリリース・着手・完了する${multiple ? "（下位の中間品から順に）" : ""}`,
        expected: ctx.isChairPreset
          ? "STOCK_TXN +2（ISS 木板 / PRD 座面ASSY）"
          : `STOCK_TXN（ISS 材料 / PRD ${namesOf(state, ctx.intermediateIds, " / ")}）`,
      };
    },
    notApplicable: (_state, ctx) => ctx.intermediateIds.length === 0,
    isDone: (state, ctx) => ctx.intermediateIds.every((id) => hasTxn(state, id, "PRD")),
  },
  {
    tc: "TC-10",
    build: (state, ctx) => {
      // TC-08で入荷済みの「中間品の材料」を除いた残りの購買品を文言に出す。判定は購買品すべての入荷
      const rest = ctx.buyIds.filter((id) => !ctx.intermediateBuyIds.includes(id));
      const ids = rest.length > 0 ? rest : ctx.buyIds;
      return {
        title: `${rest.length > 0 ? namesOf(state, rest) : "購買品すべて"}の入荷計上`,
        instruction: `${ctx.isChairPreset ? "D+14" : "入荷予定日"}まで日を進め、${labelsOf(state, ids)}を入荷計上する`,
        expected: `STOCK_TXN +${ids.length}（RCV）`,
      };
    },
    notApplicable: (_state, ctx) => ctx.buyIds.length === 0,
    isDone: (state, ctx) => ctx.buyIds.every((id) => hasTxn(state, id, "RCV")),
  },
  {
    tc: "TC-11",
    build: (state, ctx) => {
      const name = ctx.finalItemId ? itemName(state, ctx.finalItemId) : "最終製品";
      const step = `工程${ctx.finalFirstStepNo ?? ""}${ctx.isChairPreset ? "（組立）" : ""}`;
      const children = state.bom.filter((b) => b.parentItemId === ctx.finalItemId).map((b) => b.childItemId);
      return {
        title: `${name} ${step}完了`,
        instruction: `工程タブで${name}の製造オーダをリリース・着手し、${step}を完了する${ctx.isChairPreset ? "（良品10・不良0）" : ""}`,
        expected: `STOCK_TXN +${children.length}（ISS ${namesOf(state, children, " / ")}）`,
      };
    },
    notApplicable: (state, ctx) => !finalIsMake(state, ctx) || ctx.finalFirstStepNo == null,
    isDone: (state, ctx) =>
      state.mfgOrders.some(
        (mo) =>
          mo.itemId === ctx.finalItemId &&
          state.workInstructions.some(
            (w) => w.moNo === mo.moNo && w.stepNo === ctx.finalFirstStepNo && w.status === "DONE",
          ),
      ),
  },
  {
    tc: "TC-12",
    build: (state, ctx) => {
      const name = ctx.finalItemId ? itemName(state, ctx.finalItemId) : "最終製品";
      const singleStep = ctx.finalFirstStepNo === ctx.finalLastStepNo;
      const step = `工程${ctx.finalLastStepNo ?? ""}${ctx.isChairPreset ? "（検査）" : ""}`;
      return {
        title: singleStep ? `${name} 製造オーダ完了` : `${name} ${step}完了`,
        instruction: ctx.isChairPreset
          ? `${step}を完了する（例：良品9・不良1）`
          : `${singleStep ? "製造オーダ" : step}を完了する（不良数を入れると、次のステップで未充足需要を確認できる）`,
        expected: `STOCK_TXN +1（PRD ${name}）/ MFG_ORDER status=DONE`,
      };
    },
    notApplicable: (state, ctx) => !finalIsMake(state, ctx),
    isDone: (state, ctx) => finalOrderDone(state, ctx),
  },
  {
    tc: "TC-13",
    build: () => ({
      title: "未充足需要の確認",
      instruction: "警告バーで「未充足需要」の表示を確認する（不良が出ていれば不足数量が表示される）",
      expected: "不足数量が表示される（不良が無ければ表示は無く、それで問題無い）",
    }),
    notApplicable: (state, ctx) => !finalIsMake(state, ctx),
    isDone: (state, ctx) => finalOrderDone(state, ctx),
  },
  {
    tc: "TC-14",
    build: () => ({
      title: "MRP再実行（不足分の補充）",
      instruction: "計画タブで再度「MRPを実行」し、不足分の計画オーダが生成されることを確認する",
      expected: "PLANNED_ORDER 生成（不足がある場合のみ）",
    }),
    isDone: (state) => countLogMessages(state, "MRPを実行した") >= 3,
  },
  {
    tc: "TC-15",
    build: () => ({
      title: "出荷指示（引当）",
      instruction: "出荷タブで受注を引き当てる",
      expected: "SHIPMENT 1行（ALLOCATED）",
    }),
    isDone: (state) => state.shipments.length >= 1,
  },
  {
    tc: "TC-16",
    build: (_state, ctx) => ({
      title: "出荷実績登録",
      instruction: ctx.isChairPreset ? "D+15で出荷実績を登録する" : "出荷タブで出荷実績を登録する",
      expected: "STOCK_TXN +1（SHP）/ SO_LINE status=PARTIALまたはCLOSED",
    }),
    isDone: (state) => state.shipments.some((s) => s.status === "SHIPPED"),
  },
  {
    tc: "TC-17",
    build: () => ({
      title: "KPI確認",
      instruction: "KPIタブで納期遵守率・直行率・計画達成率・受注残を確認する",
      expected: "各指標が算出される",
    }),
    isDone: (state) => state.shipments.some((s) => s.status === "SHIPPED"),
  },
  {
    tc: "TC-18",
    build: () => ({
      title: "引当元追跡",
      instruction: "引当元追跡タブで受注から製造・購買オーダまでの繋がりを確認する",
      expected: "MFG_ORDER・PURCHASE_ORDER・STOCK_TXNの繋がりが表示される",
    }),
    isDone: (state) => state.shipments.some((s) => s.status === "SHIPPED"),
  },
];

function itemName(state: SimulationState, itemId: string): string {
  return state.items.find((i) => i.itemId === itemId)?.name ?? itemId;
}

/** 品目名の列挙（既定の区切りは「・」） */
function namesOf(state: SimulationState, ids: string[], sep = "・"): string {
  return ids.map((id) => itemName(state, id)).join(sep);
}

/** 「品目名（品目コード）」の列挙 */
function labelsOf(state: SimulationState, ids: string[]): string {
  return ids.map((id) => `${itemName(state, id)}（${id}）`).join("・");
}

function finalOrderDone(state: SimulationState, ctx: GuideContext): boolean {
  return state.mfgOrders.some((mo) => mo.itemId === ctx.finalItemId && mo.status === "DONE");
}

/** 全ステップの完了状況（design.md DEV-4：TCを画面上で自動判定する。EXT-43：マスタ非依存） */
export function computeGuideProgress(state: SimulationState): GuideStepResult[] {
  const ctx = buildGuideContext(state);
  return STEPS.map((step) => {
    const status: GuideStepStatus = step.notApplicable?.(state, ctx)
      ? "notApplicable"
      : step.isDone(state, ctx)
        ? "done"
        : "pending";
    return { tc: step.tc, ...step.build(state, ctx), status, done: status !== "pending" };
  });
}

/** 次に取り組むべきステップ（最初の未完了ステップ。該当なしのステップは飛ばす）。全完了ならnull */
export function currentGuideStep(state: SimulationState): GuideStepResult | null {
  return computeGuideProgress(state).find((s) => !s.done) ?? null;
}

export interface GuideSummary {
  /** 所要日数（演習開始日から完了時点までの日数） */
  durationDays: number;
  /** 発生した警告件数（延べ）。dashboardHistoryの各日alertCountsの合計を全日にわたり合算する（Issue #53） */
  totalAlertCount: number;
  /** 主要KPI最終値（dashboardHistoryの最終日エントリ） */
  kpiHighlights: DashboardKpiHighlights;
}

/**
 * 全ステップ完了時の演習完了レポート（Issue #53）。研修の振り返り資料として、所要日数・発生した
 * 警告件数（延べ）・主要KPI最終値をまとめる。currentGuideStep(state) === nullのときに使う想定。
 */
export function computeGuideSummary(state: SimulationState): GuideSummary {
  const durationDays = state.day - state.eventLog[0].day;
  const totalAlertCount = state.dashboardHistory.reduce((sum, snap) => {
    const c = snap.alertCounts;
    return sum + c.schedule + c.unmetDemand + c.masterIssue + c.capacityOverload;
  }, 0);
  const last = state.dashboardHistory[state.dashboardHistory.length - 1];
  return { durationDays, totalAlertCount, kpiHighlights: last.kpiHighlights };
}
