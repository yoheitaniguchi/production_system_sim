// 出荷：引当（出荷指示）・出荷実績登録を別操作として提供（design.md §5、v5-spec.md §6.6・UC-18/19）
import type { SimulationAction } from "../domain/reducer";
import { shippableQty } from "../domain/shipment";
import type { SimulationState } from "../types";

interface ShipmentPanelProps {
  state: SimulationState;
  dispatch: (action: SimulationAction) => void;
}

function ShipmentPanel({ state, dispatch }: ShipmentPanelProps) {
  const itemName = (id: string) => state.items.find((i) => i.itemId === id)?.name ?? id;

  const allocatableLines = state.soLines.filter(
    (line) => line.status === "CONFIRMED" || line.status === "PARTIAL",
  );

  return (
    <div className="panel">
      <h2>出荷</h2>

      <h3>引当（出荷指示）</h3>
      <table className="panel__table">
        <thead>
          <tr>
            <th>受注番号</th>
            <th>品目</th>
            <th>受注残</th>
            <th>出荷可能量</th>
            <th>状態</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {allocatableLines.length === 0 ? (
            <tr>
              <td colSpan={6} className="panel__empty">
                引当対象の受注はありません（納期回答済の受注が対象）。
              </td>
            </tr>
          ) : (
            allocatableLines.map((line) => {
              const remaining = line.qty - line.shippedQty;
              const available = shippableQty(state, line.itemId);
              return (
                <tr key={`${line.soNo}-${line.lineNo}`}>
                  <td>{line.soNo}</td>
                  <td>{itemName(line.itemId)}</td>
                  <td>{remaining}</td>
                  <td>{available}</td>
                  <td>{line.status}</td>
                  <td className="panel__actions">
                    <button
                      type="button"
                      disabled={available <= 0}
                      title={available <= 0 ? "出荷可能量がありません" : undefined}
                      onClick={() =>
                        dispatch({ type: "SHIPMENT_ALLOCATE", payload: { soNo: line.soNo, lineNo: line.lineNo } })
                      }
                    >
                      引当
                    </button>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>

      <h3>出荷指示一覧</h3>
      <table className="panel__table">
        <thead>
          <tr>
            <th>出荷指示番号</th>
            <th>受注番号</th>
            <th>品目</th>
            <th>数量</th>
            <th>引当日</th>
            <th>出荷日</th>
            <th>状態</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {state.shipments.length === 0 ? (
            <tr>
              <td colSpan={8} className="panel__empty">
                出荷指示はありません。
              </td>
            </tr>
          ) : (
            state.shipments.map((shipment) => {
              const line = state.soLines.find(
                (l) => l.soNo === shipment.soNo && l.lineNo === shipment.lineNo,
              );
              return (
                <tr key={shipment.shipNo}>
                  <td>{shipment.shipNo}</td>
                  <td>
                    {shipment.soNo}-{shipment.lineNo}
                  </td>
                  <td>{line ? itemName(line.itemId) : "—"}</td>
                  <td>{shipment.qty}</td>
                  <td>D+{shipment.planDay}</td>
                  <td>{shipment.actualDay != null ? `D+${shipment.actualDay}` : "—"}</td>
                  <td>{shipment.status}</td>
                  <td className="panel__actions">
                    {shipment.status === "ALLOCATED" && (
                      <>
                        <button
                          type="button"
                          onClick={() => dispatch({ type: "SHIPMENT_SHIP", payload: { shipNo: shipment.shipNo } })}
                        >
                          出荷実績登録
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            dispatch({ type: "SHIPMENT_CANCEL", payload: { shipNo: shipment.shipNo } })
                          }
                        >
                          引当解除
                        </button>
                      </>
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

export default ShipmentPanel;
