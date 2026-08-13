// 発注：仕入先納期回答・入荷計上・注文残（design.md §5、v5-spec.md §6.5・UC-10/11）
import { useState } from "react";
import type { SimulationAction } from "../domain/reducer";
import type { SimulationState } from "../types";

interface ProcurementPanelProps {
  state: SimulationState;
  dispatch: (action: SimulationAction) => void;
}

function ProcurementPanel({ state, dispatch }: ProcurementPanelProps) {
  const [confirmDayDrafts, setConfirmDayDrafts] = useState<Record<string, number>>({});

  const itemName = (id: string) => state.items.find((i) => i.itemId === id)?.name ?? id;
  const supplierName = (id: string) => state.suppliers.find((s) => s.supplierId === id)?.name ?? id;

  return (
    <div className="panel">
      <h2>発注</h2>

      <table className="panel__table">
        <thead>
          <tr>
            <th>購買オーダ番号</th>
            <th>ペグ先</th>
            <th>仕入先</th>
            <th>品目</th>
            <th>数量</th>
            <th>発注日</th>
            <th>希望納期</th>
            <th>回答納期</th>
            <th>入荷済数</th>
            <th>状態</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {state.purchaseOrders.length === 0 ? (
            <tr>
              <td colSpan={11} className="panel__empty">
                購買オーダはありません。計画オーダを確定してください。
              </td>
            </tr>
          ) : (
            state.purchaseOrders.map((po) => {
              const promisedDay = po.confirmDay ?? po.dueDay;
              const canReceive = po.status === "ACKED" || po.status === "PARTIAL";
              return (
                <tr key={po.poNo}>
                  <td>{po.poNo}</td>
                  <td>{po.pegTo}</td>
                  <td>{supplierName(po.supplierId)}</td>
                  <td>{itemName(po.itemId)}</td>
                  <td>{po.qty}</td>
                  <td>D+{po.orderDay}</td>
                  <td>D+{po.dueDay}</td>
                  <td>{po.confirmDay != null ? `D+${po.confirmDay}` : "—"}</td>
                  <td>{po.receivedQty}</td>
                  <td>{po.status}</td>
                  <td className="panel__actions">
                    {po.status === "ORDERED" && (
                      <>
                        <input
                          type="number"
                          className="panel__inline-input"
                          value={confirmDayDrafts[po.poNo] ?? po.dueDay}
                          onChange={(e) =>
                            setConfirmDayDrafts((prev) => ({ ...prev, [po.poNo]: Number(e.target.value) }))
                          }
                        />
                        <button
                          type="button"
                          onClick={() =>
                            dispatch({
                              type: "PO_ACK",
                              payload: { poNo: po.poNo, confirmDay: confirmDayDrafts[po.poNo] ?? po.dueDay },
                            })
                          }
                        >
                          納期回答
                        </button>
                      </>
                    )}
                    {canReceive && (
                      <button
                        type="button"
                        disabled={state.day < promisedDay}
                        title={state.day < promisedDay ? `入荷予定日 D+${promisedDay} 以降に計上できます` : undefined}
                        onClick={() => dispatch({ type: "PO_RECEIVE", payload: { poNo: po.poNo } })}
                      >
                        入荷計上
                      </button>
                    )}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

export default ProcurementPanel;
