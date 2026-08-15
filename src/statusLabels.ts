// 各テーブルのステータスコードを画面表示用の日本語ラベルに変換する。
// ラベルはdocs/v5-spec.mdの状態遷移図（受注§6.1、購買§6.5、製造オーダ/工程§6.3、出荷§6.6）の
// 日本語表記をそのまま採用し、内部コードと画面表示の言葉を独自に増やさない。
import type {
  MfgOrderStatus,
  PurchaseOrderStatus,
  ShipmentStatus,
  SoLineStatus,
  WorkInstructionStatus,
} from "./types";

export const SO_LINE_STATUS_LABELS: Record<SoLineStatus, string> = {
  RECEIVED: "受付",
  CONFIRMED: "回答済",
  PARTIAL: "一部出荷",
  CLOSED: "完了",
  CANCELED: "取消",
};

export const PURCHASE_ORDER_STATUS_LABELS: Record<PurchaseOrderStatus, string> = {
  ORDERED: "発注済",
  ACKED: "納期回答済",
  PARTIAL: "一部入庫",
  CLOSED: "入庫完了",
  CANCELED: "取消",
};

export const MFG_ORDER_STATUS_LABELS: Record<MfgOrderStatus, string> = {
  FIRM: "確定",
  RELEASED: "発行済",
  WIP: "仕掛中",
  HOLD: "保留",
  DONE: "完了",
  CANCELED: "取消",
};

export const WORK_INSTRUCTION_STATUS_LABELS: Record<WorkInstructionStatus, string> = {
  WAIT: "未着手",
  WIP: "着手済",
  DONE: "完了",
};

export const SHIPMENT_STATUS_LABELS: Record<ShipmentStatus, string> = {
  ALLOCATED: "引当済",
  SHIPPED: "出荷済",
  CANCELED: "取消",
};
