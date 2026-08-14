// 本日実行可能な操作の集計（design.md DEV-2：自動再生機能は実装しないため、代わりに
// 「本日実行可能な操作のハイライト」を提供する軽量な代替案として新設）
import type { SimulationState } from "../types";
import { canStartStep } from "./production";
import { shippableQty } from "./shipment";

/** App.tsxのTABS配列のidと一致させ、ハイライトからタブ遷移・バッジ表示に使えるようにする */
export type TodayActionDomain = "sales-order" | "planning" | "procurement" | "production" | "shipment";

export interface TodayAction {
  domain: TodayActionDomain;
  label: string;
  count: number;
}

/**
 * 現在の状態（state.day時点）で実行可能な操作を種別ごとに集計する。
 * 各判定条件は対応するドメイン関数のガード条件（production.ts/procurement.ts/shipment.ts）と
 * 一致させ、UI側で独自のガード判定ロジックを重複させない。
 */
export function computeTodayActions(state: SimulationState): TodayAction[] {
  const actions: TodayAction[] = [];

  const pendingConfirm = state.soLines.filter((l) => l.status === "RECEIVED").length;
  if (pendingConfirm > 0) {
    actions.push({ domain: "sales-order", label: "納期回答待ちの受注", count: pendingConfirm });
  }

  if (state.plannedOrders.length > 0) {
    actions.push({ domain: "planning", label: "計画オーダ確定待ち", count: state.plannedOrders.length });
  }

  const pendingAck = state.purchaseOrders.filter((p) => p.status === "ORDERED").length;
  if (pendingAck > 0) {
    actions.push({ domain: "procurement", label: "納期回答待ちの購買オーダ", count: pendingAck });
  }

  const receivable = state.purchaseOrders.filter(
    (p) => (p.status === "ACKED" || p.status === "PARTIAL") && state.day >= (p.confirmDay ?? p.dueDay),
  ).length;
  if (receivable > 0) {
    actions.push({ domain: "procurement", label: "入荷計上可能な購買オーダ", count: receivable });
  }

  const releasable = state.mfgOrders.filter((m) => m.status === "FIRM").length;
  if (releasable > 0) {
    actions.push({ domain: "production", label: "リリース可能な製造オーダ", count: releasable });
  }

  const startable = state.workInstructions.filter(
    (wi) => wi.status === "WAIT" && canStartStep(state, wi.moNo, wi.stepNo),
  ).length;
  if (startable > 0) {
    actions.push({ domain: "production", label: "着手可能な工程", count: startable });
  }

  const completable = state.workInstructions.filter((wi) => wi.status === "WIP").length;
  if (completable > 0) {
    actions.push({ domain: "production", label: "完了入力待ちの工程", count: completable });
  }

  const allocatable = state.soLines.filter(
    (l) => (l.status === "CONFIRMED" || l.status === "PARTIAL") && shippableQty(state, l.itemId) > 0,
  ).length;
  if (allocatable > 0) {
    actions.push({ domain: "shipment", label: "引当可能な受注", count: allocatable });
  }

  const shippable = state.shipments.filter((s) => s.status === "ALLOCATED").length;
  if (shippable > 0) {
    actions.push({ domain: "shipment", label: "出荷実績登録待ちの出荷指示", count: shippable });
  }

  return actions;
}
