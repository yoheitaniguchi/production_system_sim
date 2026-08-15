// ペギング追跡：受注→計画→確定オーダ→トランザクションを辿るツリー表示（design.md §5、v5-spec.md §7.4）
import { useState } from "react";
import { pegKey, traceFromOrder } from "../domain/pegging";
import { MFG_ORDER_STATUS_LABELS, PURCHASE_ORDER_STATUS_LABELS, SO_LINE_STATUS_LABELS } from "../statusLabels";
import type { MfgOrder, PurchaseOrder, SimulationState, StockTxn } from "../types";

interface PeggingTracePanelProps {
  state: SimulationState;
}

interface PegNode {
  kind: "MFG" | "PO";
  no: string;
  itemId: string;
  qty: number;
  status: string;
  children: PegNode[];
  txns: StockTxn[];
}

/**
 * traceFromOrder()が返す確定オーダの集合（フラット）を、pegTo/ploNoの対応関係を手がかりに
 * ツリー状に組み立てる。BOM階層の再探索ではなく、既にtraceFromOrder()が解決した集合を
 * 表示用に並べ替えるだけの処理（domain/pegging.tsのロジックを重複させない）。
 */
function buildPegTree(
  parentKey: string,
  traced: { mfgOrders: MfgOrder[]; purchaseOrders: PurchaseOrder[]; stockTxns: StockTxn[] },
): PegNode[] {
  const mfgNodes: PegNode[] = traced.mfgOrders
    .filter((mo) => mo.pegTo === parentKey)
    .map((mo) => ({
      kind: "MFG",
      no: mo.moNo,
      itemId: mo.itemId,
      qty: mo.planQty,
      status: mo.status,
      children: buildPegTree(mo.ploNo, traced),
      txns: traced.stockTxns.filter((t) => t.refNo === mo.moNo),
    }));
  const poNodes: PegNode[] = traced.purchaseOrders
    .filter((po) => po.pegTo === parentKey)
    .map((po) => ({
      kind: "PO",
      no: po.poNo,
      itemId: po.itemId,
      qty: po.qty,
      status: po.status,
      children: buildPegTree(po.ploNo, traced),
      txns: traced.stockTxns.filter((t) => t.refNo === po.poNo),
    }));

  return [...mfgNodes, ...poNodes];
}

function PegNodeView({ node, itemName }: { node: PegNode; itemName: (id: string) => string }) {
  return (
    <li>
      <span className="pegging-tree__node">
        <strong>{node.kind === "MFG" ? "製造" : "購買"}</strong> {node.no}（{itemName(node.itemId)} x{node.qty}、
        状態{" "}
        {node.kind === "MFG"
          ? MFG_ORDER_STATUS_LABELS[node.status as MfgOrder["status"]]
          : PURCHASE_ORDER_STATUS_LABELS[node.status as PurchaseOrder["status"]]}
        ）
        {node.txns.length > 0 && (
          <span className="pegging-tree__txns">
            {node.txns
              .map(
                (t) =>
                  `${t.txnType} ${t.qty > 0 ? "+" : ""}${t.qty}（D+${t.txnDay}${t.lotNo ? `、${t.lotNo}` : ""}）`,
              )
              .join("、 ")}
          </span>
        )}
      </span>
      {node.children.length > 0 && (
        <ul className="pegging-tree">
          {node.children.map((child) => (
            <PegNodeView key={child.no} node={child} itemName={itemName} />
          ))}
        </ul>
      )}
    </li>
  );
}

function PeggingTracePanel({ state }: PeggingTracePanelProps) {
  const [selectedKey, setSelectedKey] = useState<string>("");

  const itemName = (id: string) => state.items.find((i) => i.itemId === id)?.name ?? id;
  const customerName = (id: string) => state.customers.find((c) => c.customerId === id)?.name ?? id;

  const options = state.soLines.map((line) => ({
    key: pegKey(line.soNo, line.lineNo),
    label: `${line.soNo}-${line.lineNo}（${itemName(line.itemId)} x${line.qty}）`,
  }));

  const selectedLine = state.soLines.find((line) => pegKey(line.soNo, line.lineNo) === selectedKey);
  const order = selectedLine ? state.salesOrders.find((o) => o.soNo === selectedLine.soNo) : undefined;
  const tree =
    selectedLine != null
      ? buildPegTree(selectedKey, traceFromOrder(state, selectedLine.soNo, selectedLine.lineNo))
      : [];

  return (
    <div className="panel">
      <h2>ペギング追跡</h2>
      <p className="panel__hint">
        受注明細を選ぶと、その受注がどの計画オーダ・確定オーダ（製造／購買）にひも付いているかを、
        計画上のつながり（ペグ先）で下流までたどって表示する。
      </p>

      <form className="panel__form" onSubmit={(e) => e.preventDefault()}>
        <label>
          受注明細
          <select value={selectedKey} onChange={(e) => setSelectedKey(e.target.value)}>
            <option value="">選択してください</option>
            {options.map((opt) => (
              <option key={opt.key} value={opt.key}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      </form>

      {selectedLine ? (
        <ul className="pegging-tree">
          <li>
            <span className="pegging-tree__node">
              <strong>受注</strong> {selectedLine.soNo}-{selectedLine.lineNo}（
              {order ? customerName(order.customerId) : "—"}、{itemName(selectedLine.itemId)} x{selectedLine.qty}、
              状態 {SO_LINE_STATUS_LABELS[selectedLine.status]}）
            </span>
            {tree.length > 0 ? (
              <ul className="pegging-tree">
                {tree.map((node) => (
                  <PegNodeView key={node.no} node={node} itemName={itemName} />
                ))}
              </ul>
            ) : (
              <p className="panel__empty">まだ計画オーダの確定がありません。</p>
            )}
          </li>
        </ul>
      ) : (
        <p className="panel__empty">受注明細を選択してください。</p>
      )}
    </div>
  );
}

export default PeggingTracePanel;
