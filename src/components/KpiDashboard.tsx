// KPIダッシュボード：v5-spec.md §10の12指標を組織目線/現場目線の別ブロックで表示（design.md §5・EXT-14）
import { computeKpi } from "../domain/kpi";
import type { SimulationState } from "../types";

interface KpiDashboardProps {
  state: SimulationState;
}

function formatPercent(value: number | null): string {
  return value != null ? `${(value * 100).toFixed(1)}%` : "—";
}

function formatRatio(value: number | null): string {
  return value != null ? value.toFixed(2) : "—";
}

function formatDays(value: number | null): string {
  return value != null ? `${value.toFixed(1)}日` : "—";
}

interface MetricRow {
  label: string;
  value: string;
  note: string;
}

function KpiDashboard({ state }: KpiDashboardProps) {
  const kpi = computeKpi(state);

  // v5-spec.md §10の「主な目線」列どおり。「両方」に分類される指標（design.md EXT-14）は
  // 組織目線・現場目線の両ブロックに重複表示する（2ブロック構成のまま情報を落とさないため）。
  const orgMetrics: MetricRow[] = [
    { label: "納期遵守率", value: formatPercent(kpi.deliveryComplianceRate), note: "実出荷日 ≤ 回答納期" },
    { label: "回答納期充足率", value: formatPercent(kpi.confirmDateComplianceRate), note: "回答納期 ≤ 希望納期" },
    { label: "受注残", value: `${kpi.orderBacklogQty}`, note: "未完了受注の残数量" },
    { label: "在庫回転", value: formatRatio(kpi.inventoryTurnover), note: "出庫数量 ÷ 現在庫（EXT-13）" },
    { label: "仕入先納期遵守率", value: formatPercent(kpi.supplierDeliveryComplianceRate), note: "入庫日 ≤ 回答納期" },
    { label: "日程警告件数", value: `${kpi.scheduleAlertCount}件`, note: "checkSchedule() の警告数" },
    { label: "計画達成率", value: formatPercent(kpi.planAchievementRate), note: "良品数 ÷ 計画数（両方）" },
    { label: "製造リードタイム実績", value: formatDays(kpi.avgProductionLeadTimeDays), note: "完了オーダの平均（両方）" },
    { label: "棚卸差異率", value: formatPercent(kpi.physicalInventoryVarianceRate), note: "ADJ絶対値 ÷ 現在庫（両方）" },
  ];

  const floorMetrics: MetricRow[] = [
    { label: "直行率", value: formatPercent(kpi.firstPassYieldRate), note: "良品数 ÷ 投入数" },
    { label: "仕掛数量", value: `${kpi.wipQty}`, note: "status = WIP のオーダ数量" },
    { label: "欠品発生件数", value: `${kpi.stockoutEventCount}件`, note: "HOLD状態のMFG_ORDER数（EXT-11）" },
    { label: "計画達成率", value: formatPercent(kpi.planAchievementRate), note: "良品数 ÷ 計画数（両方）" },
    { label: "製造リードタイム実績", value: formatDays(kpi.avgProductionLeadTimeDays), note: "完了オーダの平均（両方）" },
    { label: "棚卸差異率", value: formatPercent(kpi.physicalInventoryVarianceRate), note: "ADJ絶対値 ÷ 現在庫（両方）" },
  ];

  const renderTable = (rows: MetricRow[]) => (
    <table className="panel__table">
      <thead>
        <tr>
          <th>指標</th>
          <th>値</th>
          <th>算出方法</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.label}>
            <td>{row.label}</td>
            <td>{row.value}</td>
            <td>{row.note}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <div className="panel">
      <h2>KPIダッシュボード</h2>
      <p className="panel__hint">
        現在の状態から算出した指標を、組織目線（経営・受注管理向け）と現場目線（工程・品質向け）に分けて表示する。
        「両方」の指標は両ブロックに重複して表示している。
      </p>

      <h3>組織目線</h3>
      {renderTable(orgMetrics)}

      <h3>現場目線</h3>
      {renderTable(floorMetrics)}
    </div>
  );
}

export default KpiDashboard;
