// 受注：登録・納期回答・取消（design.md §5、v5-spec.md §6.1・UC-04/05）
import { useState } from "react";
import type { SimulationAction } from "../domain/reducer";
import { SO_LINE_STATUS_LABELS } from "../statusLabels";
import type { SimulationState } from "../types";

interface SalesOrderPanelProps {
  state: SimulationState;
  dispatch: (action: SimulationAction) => void;
}

function SalesOrderPanel({ state, dispatch }: SalesOrderPanelProps) {
  const [selectedCustomerId, setSelectedCustomerId] = useState(state.customers[0]?.customerId ?? "");
  const [selectedItemId, setSelectedItemId] = useState(state.items[0]?.itemId ?? "");
  const [qty, setQty] = useState(1);

  // マスタは自由に編集できるため、選択中の得意先・品目が削除されていることがある。
  // その場合は先頭へ読み替える（存在しないIDのままdispatchしない）
  const customerId = state.customers.some((c) => c.customerId === selectedCustomerId)
    ? selectedCustomerId
    : (state.customers[0]?.customerId ?? "");
  const itemId = state.items.some((i) => i.itemId === selectedItemId)
    ? selectedItemId
    : (state.items[0]?.itemId ?? "");
  const [requestDay, setRequestDay] = useState(state.day + 1);
  const [confirmDayDrafts, setConfirmDayDrafts] = useState<Record<string, number>>({});

  const itemName = (id: string) => state.items.find((i) => i.itemId === id)?.name ?? id;
  const customerName = (id: string) => state.customers.find((c) => c.customerId === id)?.name ?? id;

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerId || !itemId || qty <= 0) return;
    dispatch({ type: "SO_CREATE", payload: { customerId, itemId, qty, requestDay } });
  };

  return (
    <div className="panel">
      <h2>受注</h2>

      <form className="panel__form" onSubmit={handleCreate}>
        <label>
          得意先
          <select value={customerId} onChange={(e) => setSelectedCustomerId(e.target.value)}>
            {state.customers.map((c) => (
              <option key={c.customerId} value={c.customerId}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          品目
          <select value={itemId} onChange={(e) => setSelectedItemId(e.target.value)}>
            {state.items.map((i) => (
              <option key={i.itemId} value={i.itemId}>
                {i.name}（{i.itemId}）
              </option>
            ))}
          </select>
        </label>
        <label>
          数量
          <input type="number" min={1} value={qty} onChange={(e) => setQty(Number(e.target.value))} />
        </label>
        <label>
          希望納期（D+）
          <input
            type="number"
            min={state.day}
            value={requestDay}
            onChange={(e) => setRequestDay(Number(e.target.value))}
          />
        </label>
        <button type="submit" className="panel__btn--primary">
          受注登録
        </button>
      </form>

      <div className="panel__table-scroll">
      <table className="panel__table">
        <thead>
          <tr>
            <th>受注番号</th>
            <th>得意先</th>
            <th>品目</th>
            <th>数量</th>
            <th>希望納期</th>
            <th>回答納期</th>
            <th>出荷済</th>
            <th>状態</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {state.soLines.map((line) => {
            const order = state.salesOrders.find((o) => o.soNo === line.soNo);
            const canCancel = line.status !== "CLOSED" && line.status !== "CANCELED" && line.shippedQty === 0;
            return (
              <tr key={`${line.soNo}-${line.lineNo}`}>
                <td>{line.soNo}</td>
                <td>{order ? customerName(order.customerId) : "—"}</td>
                <td>{itemName(line.itemId)}</td>
                <td>{line.qty}</td>
                <td>D+{line.requestDay}</td>
                <td>{line.confirmDay != null ? `D+${line.confirmDay}` : "—"}</td>
                <td>{line.shippedQty}</td>
                <td>{SO_LINE_STATUS_LABELS[line.status]}</td>
                <td className="panel__actions">
                  {line.status === "RECEIVED" && (
                    <>
                      <input
                        type="number"
                        className="panel__inline-input"
                        aria-label="回答納期（D+）"
                        title="回答納期（D+）"
                        value={confirmDayDrafts[line.soNo] ?? line.requestDay}
                        onChange={(e) =>
                          setConfirmDayDrafts((prev) => ({ ...prev, [line.soNo]: Number(e.target.value) }))
                        }
                      />
                      <button
                        type="button"
                        className="panel__btn--primary"
                        onClick={() =>
                          dispatch({
                            type: "SO_CONFIRM_DELIVERY",
                            payload: { soNo: line.soNo, confirmDay: confirmDayDrafts[line.soNo] ?? line.requestDay },
                          })
                        }
                      >
                        納期回答
                      </button>
                    </>
                  )}
                  {canCancel && (
                    <button type="button" onClick={() => dispatch({ type: "SO_CANCEL", payload: { soNo: line.soNo } })}>
                      取消
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </div>
  );
}

export default SalesOrderPanel;
