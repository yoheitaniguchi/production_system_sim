// 原価（v5-spec.md §11.2 Phase 2-A：標準原価の積上げ・オーダ別原価差異・組織目線の金額指標）
import { backlogValue, computeAllItemCosts, computeMfgOrderCost, inventoryValue, scrapLossValue } from "../domain/cost";
import type { SimulationState } from "../types";

interface CostPanelProps {
  state: SimulationState;
}

function formatYen(value: number): string {
  return `${Math.round(value).toLocaleString()}円`;
}

function CostPanel({ state }: CostPanelProps) {
  const itemName = (id: string) => state.items.find((i) => i.itemId === id)?.name ?? id;
  const itemCosts = computeAllItemCosts(state);
  const mfgOrderCosts = state.mfgOrders.map((mo) => computeMfgOrderCost(state, mo.moNo));

  return (
    <div className="panel">
      <h2>原価</h2>

      <h3>組織目線（金額指標）</h3>
      <table className="panel__table">
        <thead>
          <tr>
            <th>指標</th>
            <th>値</th>
            <th>算出方法</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>在庫金額</td>
            <td>{formatYen(inventoryValue(state))}</td>
            <td>現在庫数量 × 標準原価の合計</td>
          </tr>
          <tr>
            <td>受注残高（金額）</td>
            <td>{formatYen(backlogValue(state))}</td>
            <td>未出荷の受注残数量 × 売価の合計</td>
          </tr>
          <tr>
            <td>不良損失額</td>
            <td>{formatYen(scrapLossValue(state))}</td>
            <td>製造オーダの不良数量 × 標準原価の合計</td>
          </tr>
        </tbody>
      </table>

      <h3>品目別標準原価</h3>
      <table className="panel__table">
        <thead>
          <tr>
            <th>品目</th>
            <th>材料費</th>
            <th>加工費</th>
            <th>標準原価</th>
          </tr>
        </thead>
        <tbody>
          {itemCosts.map((c) => (
            <tr key={c.itemId}>
              <td>
                {itemName(c.itemId)}（{c.itemId}）
              </td>
              <td>{formatYen(c.material)}</td>
              <td>{formatYen(c.labor)}</td>
              <td>{formatYen(c.standardCost)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>製造オーダ別原価差異</h3>
      {mfgOrderCosts.length === 0 ? (
        <p className="panel__empty">製造オーダはありません。計画オーダを確定してください。</p>
      ) : (
        <table className="panel__table">
          <thead>
            <tr>
              <th>製造オーダ番号</th>
              <th>品目</th>
              <th>投入材料費</th>
              <th>投入加工費</th>
              <th>完成品振替額</th>
              <th>原価差異</th>
            </tr>
          </thead>
          <tbody>
            {state.mfgOrders.map((mo, idx) => (
              <tr key={mo.moNo}>
                <td>{mo.moNo}</td>
                <td>{itemName(mo.itemId)}</td>
                <td>{formatYen(mfgOrderCosts[idx].inputMaterial)}</td>
                <td>{formatYen(mfgOrderCosts[idx].inputLabor)}</td>
                <td>{formatYen(mfgOrderCosts[idx].outputStandard)}</td>
                <td>{formatYen(mfgOrderCosts[idx].variance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default CostPanel;
