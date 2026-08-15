// 計画：MRP実行・計画オーダ一括確定・引当元/BOMレベル表示（design.md §5、v5-spec.md §7.1・UC-06/07）
import type { SimulationAction } from "../domain/reducer";
import type { SimulationState } from "../types";

interface PlanningPanelProps {
  state: SimulationState;
  dispatch: (action: SimulationAction) => void;
}

function PlanningPanel({ state, dispatch }: PlanningPanelProps) {
  const itemName = (id: string) => state.items.find((i) => i.itemId === id)?.name ?? id;

  return (
    <div className="panel">
      <h2>計画</h2>

      <div className="panel__toolbar">
        <button type="button" className="panel__btn--primary" onClick={() => dispatch({ type: "MRP_RUN" })}>
          MRPを実行
        </button>
        <button
          type="button"
          className={state.plannedOrders.length > 0 ? "panel__btn--primary" : undefined}
          disabled={state.plannedOrders.length === 0}
          onClick={() => dispatch({ type: "PLANNED_ORDERS_FIRM" })}
        >
          計画オーダを確定（{state.plannedOrders.length}件）
        </button>
      </div>

      <table className="panel__table">
        <thead>
          <tr>
            <th>計画オーダ番号</th>
            <th>品目</th>
            <th>数量</th>
            <th>区分</th>
            <th>必要日</th>
            <th>着手/発注日</th>
            <th>引当元</th>
            <th>BOMレベル</th>
          </tr>
        </thead>
        <tbody>
          {state.plannedOrders.length === 0 ? (
            <tr>
              <td colSpan={8} className="panel__empty">
                計画オーダはありません。MRPを実行してください。
              </td>
            </tr>
          ) : (
            state.plannedOrders.map((plo) => (
              <tr key={plo.ploNo}>
                <td>{plo.ploNo}</td>
                <td>{itemName(plo.itemId)}</td>
                <td>{plo.qty}</td>
                <td>{plo.orderType === "MAKE" ? "内製" : "購買"}</td>
                <td>D+{plo.dueDay}</td>
                <td>D+{plo.startDay}</td>
                <td>{plo.pegTo}</td>
                <td>{plo.bomLevel}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export default PlanningPanel;
