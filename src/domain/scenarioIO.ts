// シナリオ（SimulationState全体）のJSON入出力（design.md EXT-40、Issue #61）
//
// masterIO.ts（マスタ一式だけを扱う）のパターンを、受注・オーダ・在庫・イベントログ等のトランザクションまで
// 拡張したもの。演習の中断・再開や特定状態の共有に使う。明示的なエクスポート/インポート操作であり、
// 自動保存はしない（CLAUDE.mdの「永続化なし」方針と矛盾しない）。取り込みはall-or-nothing：
// スキーマ検証・マスタ検証（値域・整合性）・履歴と採番シーケンスの検証を全件通し、1件でも失敗すれば一切取り込まない。
// トランザクション間の参照整合性（soLinesが存在しないsalesOrdersを指していないか等）の網羅的な検証は
// 本モジュールの範囲外（Issue #61で別Issueとした）。
import type { SimulationState } from "../types";
import { MasterIOError, parseMasterSnapshot } from "./masterIO";

export class ScenarioIOError extends Error {}

export const SCENARIO_KIND = "production-system-sim-scenario";
export const SCENARIO_VERSION = 1;

export function serializeScenario(state: SimulationState): string {
  return `${JSON.stringify({ kind: SCENARIO_KIND, version: SCENARIO_VERSION, state }, null, 2)}\n`;
}

// ---------------------------------------------------------------------------
// スキーマ検証（masterIO.tsと同じく外部ライブラリを足さず、行の形を宣言的に書く）
// ---------------------------------------------------------------------------

/** 値を検査し、問題があればその説明を、無ければnullを返す */
type Check = (value: unknown) => string | null;
type RowSpec = Record<string, Check>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const str: Check = (v) => (typeof v === "string" ? null : "文字列が必要です");
const num: Check = (v) => (typeof v === "number" && Number.isFinite(v) ? null : "数値が必要です");
const numOrNull: Check = (v) => (v === null ? null : num(v));
const optStr: Check = (v) => (v === undefined ? null : str(v));
const optNum: Check = (v) => (v === undefined ? null : num(v));
const strArray: Check = (v) =>
  Array.isArray(v) && v.every((x) => typeof x === "string") ? null : "文字列の配列が必要です";
const oneOf =
  (values: readonly string[]): Check =>
  (v) =>
    typeof v === "string" && values.includes(v) ? null : `次のいずれかが必要です: ${values.join(" / ")}`;

function checkRow(row: unknown, spec: RowSpec): string[] {
  if (!isRecord(row)) return ["オブジェクトが必要です"];
  const errors: string[] = [];
  for (const [key, check] of Object.entries(spec)) {
    const message = check(row[key]);
    if (message) errors.push(`${key}: ${message}`);
  }
  return errors;
}

const objectOf =
  (spec: RowSpec): Check =>
  (v) =>
    checkRow(v, spec)[0] ?? null;

const MAKE_BUY = ["MAKE", "BUY"] as const;
const SO_LINE_STATUSES = ["RECEIVED", "CONFIRMED", "PARTIAL", "CLOSED", "CANCELED"] as const;
const MFG_ORDER_STATUSES = ["FIRM", "RELEASED", "WIP", "HOLD", "DONE", "CANCELED"] as const;
const WORK_INSTRUCTION_STATUSES = ["WAIT", "WIP", "DONE"] as const;
const PURCHASE_ORDER_STATUSES = ["ORDERED", "ACKED", "PARTIAL", "CLOSED", "CANCELED"] as const;
const STOCK_TXN_TYPES = ["RCV", "ISS", "PRD", "SHP", "ADJ"] as const;
const SHIPMENT_STATUSES = ["ALLOCATED", "SHIPPED", "CANCELED"] as const;

const backlogMetric = objectOf({ qty: num, amount: num });

/** SimulationStateの配列テーブルごとの行スキーマ（types.tsと対応。フィールドを足したらここも合わせる） */
const TABLE_SPECS: Array<[keyof SimulationState, RowSpec]> = [
  [
    "items",
    {
      itemId: str,
      name: str,
      makeBuy: oneOf(MAKE_BUY),
      leadTimeDays: num,
      defaultSupplierId: optStr,
      purchasePrice: optNum,
      salesPrice: optNum,
    },
  ],
  ["bom", { parentItemId: str, childItemId: str, qtyPer: num }],
  ["routingSteps", { itemId: str, stepNo: num, workCenter: str, stdTimeMin: num, setupMin: optNum }],
  ["customers", { customerId: str, name: str, priorityRank: optNum }],
  ["suppliers", { supplierId: str, name: str }],
  ["workCenters", { workCenter: str, ratePerHour: num, capacityMinPerDay: num }],
  ["salesOrders", { soNo: str, customerId: str, orderedDay: num }],
  [
    "soLines",
    {
      soNo: str,
      lineNo: num,
      itemId: str,
      qty: num,
      requestDay: num,
      confirmDay: numOrNull,
      shippedQty: num,
      status: oneOf(SO_LINE_STATUSES),
    },
  ],
  [
    "plannedOrders",
    {
      ploNo: str,
      itemId: str,
      qty: num,
      dueDay: num,
      startDay: num,
      orderType: oneOf(MAKE_BUY),
      pegTo: str,
      bomLevel: num,
    },
  ],
  [
    "mfgOrders",
    {
      moNo: str,
      ploNo: str,
      pegTo: str,
      itemId: str,
      planQty: num,
      goodQty: num,
      scrapQty: num,
      startDay: num,
      dueDay: num,
      status: oneOf(MFG_ORDER_STATUSES),
      bomLevel: num,
    },
  ],
  [
    "workInstructions",
    {
      moNo: str,
      stepNo: num,
      workCenter: str,
      inputQty: num,
      goodQty: num,
      scrapQty: num,
      actualStartDay: numOrNull,
      actualEndDay: numOrNull,
      status: oneOf(WORK_INSTRUCTION_STATUSES),
    },
  ],
  [
    "purchaseOrders",
    {
      poNo: str,
      ploNo: str,
      pegTo: str,
      supplierId: str,
      itemId: str,
      qty: num,
      orderDay: num,
      dueDay: num,
      confirmDay: numOrNull,
      receivedQty: num,
      status: oneOf(PURCHASE_ORDER_STATUSES),
    },
  ],
  ["stocks", { itemId: str, onHand: num, allocated: num }],
  [
    "stockTxns",
    { txnId: str, itemId: str, txnType: oneOf(STOCK_TXN_TYPES), qty: num, txnDay: num, refNo: str, lotNo: optStr },
  ],
  [
    "shipments",
    {
      shipNo: str,
      soNo: str,
      lineNo: num,
      qty: num,
      planDay: num,
      actualDay: numOrNull,
      status: oneOf(SHIPMENT_STATUSES),
    },
  ],
  ["lots", { lotNo: str, itemId: str, qty: num, originalQty: num, createdDay: num, sourceRef: str }],
  ["lotGenealogy", { parentLot: str, childLot: str, moNo: str, consumedQty: num }],
  ["eventLog", { day: num, message: str, tableDeltas: strArray }],
  [
    "dashboardHistory",
    {
      day: num,
      backlog: objectOf({
        order: backlogMetric,
        planned: backlogMetric,
        purchase: backlogMetric,
        production: backlogMetric,
        shipment: backlogMetric,
        inventory: backlogMetric,
      }),
      alertCounts: objectOf({ schedule: num, unmetDemand: num, masterIssue: num, capacityOverload: num }),
      kpiHighlights: objectOf({
        deliveryComplianceRate: numOrNull,
        confirmDateComplianceRate: numOrNull,
        orderBacklogQty: num,
        planAchievementRate: numOrNull,
        firstPassYieldRate: numOrNull,
        wipQty: num,
        avgProductionLeadTimeDays: numOrNull,
        inventoryTurnover: numOrNull,
        supplierDeliveryComplianceRate: numOrNull,
        stockoutEventCount: num,
        physicalInventoryVarianceRate: numOrNull,
        scheduleAlertCount: num,
      }),
    },
  ],
];

/** 検査結果として一度に列挙するエラー数の上限（巨大な壊れたファイルで画面が埋まらないようにする） */
const MAX_REPORTED_ERRORS = 12;

/**
 * 宣言されたキー以外が無いことを検査する（SEC-002）。`__proto__`等を名乗る未知キーを含め、
 * 素通りさせず一律で拒否する。masterIO.tsのparseMasterSnapshotが行フィールドを個別に取り出して
 * 新規オブジェクトを組み立てる安全な作りなのに対し、こちらは検証を通った`raw.state`をそのまま
 * 返す実装のため、この明示的な許可リスト検査で埋め合わせる。
 */
function checkNoExtraKeys(row: unknown, allowedKeys: readonly string[], where: string): string[] {
  if (!isRecord(row)) return [];
  const allowed = new Set(allowedKeys);
  const extraKeys = Object.keys(row).filter((key) => !allowed.has(key));
  return extraKeys.length > 0 ? [`${where}: 未知のフィールドがあります: ${extraKeys.join(", ")}`] : [];
}

function collectSchemaErrors(state: Record<string, unknown>): string[] {
  const errors: string[] = [];

  const day = state.day;
  if (typeof day !== "number" || !Number.isInteger(day) || day < 0) {
    errors.push("state.day: 0以上の整数が必要です");
  }

  for (const [key, spec] of TABLE_SPECS) {
    const rows = state[key];
    if (!Array.isArray(rows)) {
      errors.push(`state.${key}: 配列が必要です`);
      continue;
    }
    rows.forEach((row, i) => {
      for (const message of checkRow(row, spec)) errors.push(`state.${key}[${i}].${message}`);
      errors.push(...checkNoExtraKeys(row, Object.keys(spec), `state.${key}[${i}]`));
    });
  }

  for (const [key] of SEQUENCES) {
    const value = state[key];
    if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
      errors.push(`state.${key}: 1以上の整数が必要です`);
    }
  }

  const allowedTopLevelKeys = ["day", ...TABLE_SPECS.map(([key]) => key), ...SEQUENCES.map(([key]) => key)];
  errors.push(...checkNoExtraKeys(state, allowedTopLevelKeys, "state"));

  return errors;
}

/**
 * dashboardHistoryの不変条件（reducer.tsのupsertDashboardSnapshotが保つ「1日1件・day昇順」）。
 * 崩れたまま取り込むと、バーンダウンチャートの横軸が乱れたり、以降の当日分の上書き・追記が誤った位置に入る。
 * 行の形が正しいことが前提のため、スキーマ検証を通った後に呼ぶ。
 */
function collectHistoryErrors(state: SimulationState): string[] {
  const errors: string[] = [];
  let prevDay = -1;
  state.dashboardHistory.forEach((snap, i) => {
    if (snap.day <= prevDay) errors.push(`state.dashboardHistory[${i}].day: 日の昇順（重複なし）である必要があります`);
    if (snap.day > state.day) errors.push(`state.dashboardHistory[${i}].day: 現在日（${state.day}）より先の日は記録できません`);
    prevDay = snap.day;
  });
  return errors;
}

// ---------------------------------------------------------------------------
// 採番用シーケンスの検証
// ---------------------------------------------------------------------------

type SequenceKey = "nextSoSeq" | "nextMoSeq" | "nextPoSeq" | "nextTxnSeq" | "nextShipSeq" | "nextLotSeq";

/**
 * 採番用シーケンスと、それが採番する番号の形式。取り込んだ後に採番される番号が既存のオーダ番号等と
 * 重複すると、以降の操作で主キーが衝突するため、「次に採番される番号」が既存の最大番号より大きいことを求める。
 */
const SEQUENCES: Array<[SequenceKey, { label: string; prefix: string; ids: (s: SimulationState) => string[] }]> = [
  ["nextSoSeq", { label: "受注番号", prefix: "SO-", ids: (s) => s.salesOrders.map((o) => o.soNo) }],
  ["nextMoSeq", { label: "製造オーダ番号", prefix: "MO-", ids: (s) => s.mfgOrders.map((o) => o.moNo) }],
  ["nextPoSeq", { label: "購買オーダ番号", prefix: "PO-", ids: (s) => s.purchaseOrders.map((o) => o.poNo) }],
  ["nextTxnSeq", { label: "在庫受払番号", prefix: "TXN-", ids: (s) => s.stockTxns.map((t) => t.txnId) }],
  ["nextShipSeq", { label: "出荷番号", prefix: "SHIP-", ids: (s) => s.shipments.map((sh) => sh.shipNo) }],
  ["nextLotSeq", { label: "ロット番号", prefix: "LOT-", ids: (s) => s.lots.map((l) => l.lotNo) }],
];

/** `PREFIX数字` 形式の番号のうち最大の数字を返す。形式に合わない番号（手入力のマスタ由来等）は無視する */
function maxNumberedSuffix(ids: string[], prefix: string): number {
  let max = 0;
  for (const id of ids) {
    if (!id.startsWith(prefix)) continue;
    const suffix = id.slice(prefix.length);
    if (/^\d+$/.test(suffix)) max = Math.max(max, Number(suffix));
  }
  return max;
}

function collectSequenceErrors(state: SimulationState): string[] {
  const errors: string[] = [];
  for (const [key, { label, prefix, ids }] of SEQUENCES) {
    const max = maxNumberedSuffix(ids(state), prefix);
    if (state[key] <= max) {
      errors.push(
        `${key}（${state[key]}）が既存の${label}の最大値（${prefix}${max}）以下です。次に採番する番号が既存と重複します`,
      );
    }
  }
  return errors;
}

// ---------------------------------------------------------------------------
// 取り込み
// ---------------------------------------------------------------------------

function summarizeErrors(errors: string[]): string {
  const shown = errors.slice(0, MAX_REPORTED_ERRORS);
  const rest = errors.length - shown.length;
  return `シナリオとして取り込めません:\n- ${shown.join("\n- ")}${rest > 0 ? `\n- …ほか${rest}件` : ""}`;
}

/**
 * JSON文字列をSimulationStateへ変換する。形式エラー・スキーマ不正・マスタ整合性エラー・採番シーケンスの
 * 不整合は、いずれもScenarioIOErrorを投げて一切取り込まない（all-or-nothing）。
 */
export function parseScenario(json: string): SimulationState {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new ScenarioIOError("JSONとして解釈できません");
  }
  if (!isRecord(raw)) throw new ScenarioIOError("トップレベルがオブジェクトではありません");
  if (raw.kind !== SCENARIO_KIND) {
    // マスタのJSONエクスポート（masterIO.ts）を選んでしまうのは起こりやすい取り違えなので、専用の案内を出す
    if (Array.isArray(raw.items) && raw.state === undefined) {
      throw new ScenarioIOError(
        "マスタのJSONです。シナリオのJSON（メニューの「シナリオ」からエクスポートしたもの）を選んでください",
      );
    }
    throw new ScenarioIOError("シナリオのJSONではありません（kindが一致しません）");
  }
  if (raw.version !== SCENARIO_VERSION) {
    throw new ScenarioIOError(`未対応のversionです（${SCENARIO_VERSION}が必要）: ${String(raw.version)}`);
  }
  if (!isRecord(raw.state)) throw new ScenarioIOError("stateがオブジェクトではありません");

  const schemaErrors = collectSchemaErrors(raw.state);
  if (schemaErrors.length > 0) throw new ScenarioIOError(summarizeErrors(schemaErrors));

  // スキーマ検証を通ったため、以降は型どおりに扱える
  const state = raw.state as unknown as SimulationState;

  // マスタ部分は、マスタJSONの取り込み（parseMasterSnapshot）と同じ強さで検証する。型が合うだけでなく、
  // CRUD側が課す値域（qtyPerは正、標準時間・賃率は0以上、stepNoは正の整数、空文字禁止等。EXT-26追記）と、
  // 重複キー・BOM循環・参照の整合性（assertSnapshotUsable）も通す。負のqtyPerはバックフラッシュで在庫が増える等の実害になる。
  // 戻り値（正規化後のスナップショット）は使わず、元のstateをそのまま復元する（往復で値を変えないため）
  try {
    parseMasterSnapshot(
      JSON.stringify({
        version: 1,
        items: state.items,
        bom: state.bom,
        routingSteps: state.routingSteps,
        workCenters: state.workCenters,
        customers: state.customers,
        suppliers: state.suppliers,
      }),
    );
  } catch (err) {
    if (err instanceof MasterIOError) throw new ScenarioIOError(err.message);
    throw err;
  }

  const consistencyErrors = [...collectHistoryErrors(state), ...collectSequenceErrors(state)];
  if (consistencyErrors.length > 0) throw new ScenarioIOError(summarizeErrors(consistencyErrors));

  return state;
}
