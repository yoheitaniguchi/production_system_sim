// 受注〜出荷プロセス連携図（BPMN風）用の表示データを計算する純粋関数。
// ドメイン一覧・データの流れは v5-spec.md §2.1 のドメイン関係図（mermaid）に基づく。
//
// 「直前の操作で何が動いたか」の判定は、reducer.ts の applyAction() が積む最新の
// EventLogEntry（1操作＝1エントリ）の message/tableDeltas から機械的に求める。
// EventLogEntry に action種別のタグを持たせていないため、reducer.ts の各case文が生成する
// メッセージ文言（固定テンプレート）を手がかりにする。メッセージテンプレートを変更する際は
// この対応表も合わせて見直すこと（隠れた依存）。
import type { SimulationState } from "../types";

export type DomainId = "salesOrder" | "planning" | "procurement" | "production" | "inventory" | "shipment" | "master";

export const DOMAIN_LABELS: Record<DomainId, string> = {
  salesOrder: "受注",
  planning: "計画",
  procurement: "発注",
  production: "工程",
  inventory: "在庫",
  shipment: "出荷",
  master: "マスタ",
};

export interface FlowDef {
  id: string;
  from: DomainId;
  to: DomainId;
  /** 線上に表示するラベル（v5-spec.md §2.1のドメイン関係図の矢印ラベルをそのまま使う） */
  label: string;
  /** マスタからの「全ドメインの前提」は常時表示の点線とし、ハイライト対象にしない */
  static?: boolean;
}

/** v5-spec.md §2.1 のドメイン関係図から導いたドメイン間のメッセージフロー一覧 */
export const FLOWS: FlowDef[] = [
  { id: "salesOrder-planning", from: "salesOrder", to: "planning", label: "独立需要" },
  { id: "inventory-planning", from: "inventory", to: "planning", label: "現在庫" },
  { id: "planning-procurement", from: "planning", to: "procurement", label: "購買計画オーダ" },
  { id: "planning-production", from: "planning", to: "production", label: "製造計画オーダ" },
  { id: "procurement-planning", from: "procurement", to: "planning", label: "注文残＝入庫予定" },
  { id: "production-planning", from: "production", to: "planning", label: "仕掛＝製造予定" },
  { id: "procurement-inventory", from: "procurement", to: "inventory", label: "入庫実績" },
  { id: "production-inventory", from: "production", to: "inventory", label: "部品出庫・完成入庫" },
  { id: "salesOrder-shipment", from: "salesOrder", to: "shipment", label: "出荷指示" },
  { id: "inventory-shipment", from: "inventory", to: "shipment", label: "引当・出荷出庫" },
  { id: "shipment-salesOrder", from: "shipment", to: "salesOrder", label: "出荷実績" },
  { id: "master-salesOrder", from: "master", to: "salesOrder", label: "前提", static: true },
  { id: "master-planning", from: "master", to: "planning", label: "前提", static: true },
  { id: "master-procurement", from: "master", to: "procurement", label: "前提", static: true },
  { id: "master-production", from: "master", to: "production", label: "前提", static: true },
  { id: "master-inventory", from: "master", to: "inventory", label: "前提", static: true },
  { id: "master-shipment", from: "master", to: "shipment", label: "前提", static: true },
];

/** masterData.tsの業務メッセージの行頭（エンティティ名）。マスタ操作の判定に使う */
const MASTER_MESSAGE_PREFIXES = ["品目 ", "BOM ", "工順 ", "作業区 ", "得意先 ", "仕入先 ", "マスタを"];

function isMasterMessage(message: string): boolean {
  return MASTER_MESSAGE_PREFIXES.some((prefix) => message.startsWith(prefix));
}

export interface ActiveFlows {
  /** 直前の操作の業務メッセージ。まだ何も操作していなければnull */
  lastMessage: string | null;
  flowIds: Set<string>;
  activeDomains: Set<DomainId>;
}

/** 直前の操作（EventLogEntryの末尾）が、どのドメイン間フローを動かしたかを判定する */
export function computeActiveFlows(state: SimulationState): ActiveFlows {
  const last = state.eventLog[state.eventLog.length - 1];
  const flowIds = new Set<string>();
  const activeDomains = new Set<DomainId>();
  if (!last) return { lastMessage: null, flowIds, activeDomains };

  const addFlow = (id: string) => {
    const flow = FLOWS.find((f) => f.id === id);
    if (!flow) return;
    flowIds.add(id);
    activeDomains.add(flow.from);
    activeDomains.add(flow.to);
  };
  const hasDelta = (table: string) => last.tableDeltas.some((d) => d.startsWith(table));

  const msg = last.message;
  if (msg.startsWith("[エラー]")) {
    // 操作が失敗した場合は状態が変化していない可能性が高いため、フローはハイライトしない
  } else if (isMasterMessage(msg)) {
    // マスタCRUD（masterData.ts）の業務メッセージ。「〜を登録した」は受注・出荷実績のメッセージとも
    // 部分一致しうるため、includesではなく行頭のエンティティ名で判定する
    activeDomains.add("master");
  } else if (msg.includes("MRPを実行した")) {
    // runMRP()は受注残・現在庫・注文残・仕掛の4種類の供給/需要を同時に読むため、4本すべて動く
    addFlow("salesOrder-planning");
    addFlow("inventory-planning");
    addFlow("procurement-planning");
    addFlow("production-planning");
  } else if (msg.includes("件を確定した")) {
    if (hasDelta("MFG_ORDER")) addFlow("planning-production");
    if (hasDelta("PURCHASE_ORDER")) addFlow("planning-procurement");
  } else if (msg.includes("の入荷を計上した")) {
    addFlow("procurement-inventory");
  } else if (msg.includes("を完了した（良品")) {
    addFlow("production-inventory");
  } else if (msg.includes("個引き当てた")) {
    addFlow("salesOrder-shipment");
    addFlow("inventory-shipment");
  } else if (msg.includes("の出荷実績を登録した")) {
    addFlow("shipment-salesOrder");
    addFlow("inventory-shipment");
  } else if (msg.includes("に変更した")) {
    activeDomains.add("master");
  } else if (msg.includes("を受注登録した") || msg.includes("の納期を") || msg.includes("を取消した")) {
    activeDomains.add("salesOrder");
  } else if (msg.includes("の納期回答を")) {
    activeDomains.add("procurement");
  } else if (msg.includes("をリリースした") || msg.includes("に着手した")) {
    activeDomains.add("production");
  } else if (msg.includes("の引当を解除した")) {
    activeDomains.add("shipment");
  } else if (msg.includes("の在庫を") && msg.includes("調整した")) {
    activeDomains.add("inventory");
  }

  return { lastMessage: msg, flowIds, activeDomains };
}
