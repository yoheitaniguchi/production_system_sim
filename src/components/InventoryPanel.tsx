// 在庫：現在庫・引当済・出荷可能量の3列表示・棚卸調整（design.md §5、v5-spec.md UC-17）
import { useState } from "react";
import type { SimulationAction } from "../domain/reducer";
import { shippableQty } from "../domain/shipment";
import type { SimulationState } from "../types";

interface InventoryPanelProps {
  state: SimulationState;
  dispatch: (action: SimulationAction) => void;
}

function InventoryPanel({ state, dispatch }: InventoryPanelProps) {
  const [selectedItemId, setSelectedItemId] = useState(state.items[0]?.itemId ?? "");
  const [deltaQty, setDeltaQty] = useState(0);

  // マスタは自由に編集できるため、選択中の品目が削除されていることがある。
  // その場合は先頭の品目へ読み替える（存在しないIDのままdispatchしない）
  const itemId = state.items.some((i) => i.itemId === selectedItemId)
    ? selectedItemId
    : (state.items[0]?.itemId ?? "");

  const handleAdjust = (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemId || deltaQty === 0) return;
    dispatch({ type: "STOCK_ADJUST", payload: { itemId, deltaQty } });
    setDeltaQty(0);
  };

  return (
    <div className="panel">
      <h2>在庫</h2>

      <form className="panel__form" onSubmit={handleAdjust}>
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
          調整数量（差異、符号付き）
          <input type="number" value={deltaQty} onChange={(e) => setDeltaQty(Number(e.target.value))} />
        </label>
        <button type="submit">棚卸調整</button>
      </form>

      <table className="panel__table">
        <thead>
          <tr>
            <th>品目</th>
            <th>区分</th>
            <th>現在庫</th>
            <th>引当済</th>
            <th>出荷可能量</th>
          </tr>
        </thead>
        <tbody>
          {state.items.map((item) => {
            const stock = state.stocks.find((s) => s.itemId === item.itemId);
            return (
              <tr key={item.itemId}>
                <td>
                  {item.name}（{item.itemId}）
                </td>
                <td>{item.makeBuy === "MAKE" ? "内製" : "購買"}</td>
                <td>{stock?.onHand ?? 0}</td>
                <td>{stock?.allocated ?? 0}</td>
                <td>{shippableQty(state, item.itemId)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default InventoryPanel;
