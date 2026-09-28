// 原価（v5-spec.md §11.2 Phase 2-A：標準原価の積上げ・オーダ別原価差異・組織目線の金額指標）
import { downloadCsv, todayDateStamp } from "../csvExport";
import {
  backlogValue,
  computeItemCostComposition,
  computeMfgOrderCost,
  computeMfgOrderVarianceSeries,
  inventoryValue,
  scrapLossValue,
} from "../domain/cost";
import type { SimulationState } from "../types";
import { CostCompositionChart, MfgOrderVarianceChart } from "./CostCharts";

interface CostPanelProps {
  state: SimulationState;
}

function formatYen(value: number): string {
  return `${Math.round(value).toLocaleString()}円`;
}

function CostPanel({ state }: CostPanelProps) {
  const itemName = (id: string) => state.items.find((i) => i.itemId === id)?.name ?? id;
  const itemCosts = computeItemCostComposition(state);
  const mfgOrderCosts = state.mfgOrders.map((mo) => computeMfgOrderCost(state, mo.moNo));
  const varianceSeries = computeMfgOrderVarianceSeries(state);

  const amountMetrics = [
    { label: "在庫金額", amount: inventoryValue(state), note: "現在庫数量 × 標準原価の合計" },
    { label: "受注残高（金額）", amount: backlogValue(state), note: "未出荷の受注残数量 × 売価の合計" },
    { label: "不良損失額", amount: scrapLossValue(state), note: "製造オーダの不良数量 × 標準原価の合計" },
  ];

  const downloadAmountMetricsCsv = () =>
    downloadCsv(
      `cost_metrics_${todayDateStamp()}.csv`,
      ["指標", "値(円)", "算出方法"],
      amountMetrics.map((m) => [m.label, Math.round(m.amount), m.note]),
    );

  const downloadItemCostsCsv = () =>
    downloadCsv(
      `cost_items_${todayDateStamp()}.csv`,
      ["品目コード", "品目名", "材料費(円)", "加工費(円)", "標準原価(円)"],
      itemCosts.map((c) => [c.itemId, itemName(c.itemId), Math.round(c.material), Math.round(c.labor), Math.round(c.standardCost)]),
    );

  const downloadMfgOrderCostsCsv = () =>
    downloadCsv(
      `cost_mfg_orders_${todayDateStamp()}.csv`,
      ["製造オーダ番号", "品目コード", "品目名", "投入材料費(円)", "投入加工費(円)", "完成品振替額(円)", "原価差異(円)"],
      state.mfgOrders.map((mo, idx) => [
        mo.moNo,
        mo.itemId,
        itemName(mo.itemId),
        Math.round(mfgOrderCosts[idx].inputMaterial),
        Math.round(mfgOrderCosts[idx].inputLabor),
        Math.round(mfgOrderCosts[idx].outputStandard),
        Math.round(mfgOrderCosts[idx].variance),
      ]),
    );

  return (
    <div className="panel">
      <h2>原価</h2>

      <h3>組織目線（金額指標）</h3>
      <div className="panel__toolbar">
        <button type="button" aria-label="金額指標をCSVでエクスポート" onClick={downloadAmountMetricsCsv}>
          CSVでエクスポート
        </button>
      </div>
      <table className="panel__table">
        <thead>
          <tr>
            <th>指標</th>
            <th>値</th>
            <th>算出方法</th>
          </tr>
        </thead>
        <tbody>
          {amountMetrics.map((m) => (
            <tr key={m.label}>
              <td>{m.label}</td>
              <td>{formatYen(m.amount)}</td>
              <td>{m.note}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>品目別標準原価</h3>
      <p className="panel__hint">
        グラフの棒は標準原価を100%とした材料費・加工費の構成比で、金額は棒の右に表示する。数値の正本は下の表。
      </p>
      <CostCompositionChart rows={itemCosts.map((c) => ({ ...c, name: itemName(c.itemId) }))} />
      <div className="panel__toolbar">
        <button type="button" aria-label="品目別標準原価をCSVでエクスポート" onClick={downloadItemCostsCsv}>
          CSVでエクスポート
        </button>
      </div>
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
        <>
          <p className="panel__hint">
            未完了のオーダは完成品振替額がまだ0のため、投入額がそのまま差異として表示される。完了後は不良・仕損の分だけが残る。
          </p>
          <MfgOrderVarianceChart rows={varianceSeries.map((p) => ({ ...p, itemName: itemName(p.itemId) }))} />
          <div className="panel__toolbar">
            <button type="button" aria-label="製造オーダ別原価差異をCSVでエクスポート" onClick={downloadMfgOrderCostsCsv}>
              CSVでエクスポート
            </button>
          </div>
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
        </>
      )}
    </div>
  );
}

export default CostPanel;
