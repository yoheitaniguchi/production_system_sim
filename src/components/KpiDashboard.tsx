// KPIダッシュボード：v5-spec.md §10の12指標を組織目線/現場目線の別ブロックで表示（design.md §5・EXT-14）
import { downloadCsv, todayDateStamp } from "../csvExport";
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

// CSV出力用の生の数値（画面表示用の書式・単位は付けず、単位は列見出し側に持たせる。design.md/Issue #54）
function rawPercent(value: number | null): number | string {
  return value != null ? Math.round(value * 1000) / 10 : "";
}

function rawRatio(value: number | null): number | string {
  return value != null ? Math.round(value * 100) / 100 : "";
}

function rawDays(value: number | null): number | string {
  return value != null ? Math.round(value * 10) / 10 : "";
}

interface MetricRow {
  label: string;
  value: string;
  note: string;
  /** CSV出力用の生の数値（単位はunitへ）。null相当の値は空文字にする */
  csvValue: number | string;
  unit?: string;
}

function csvLabel(row: MetricRow): string {
  return row.unit ? `${row.label}(${row.unit})` : row.label;
}

function downloadMetricsCsv(filenamePrefix: string, rows: MetricRow[]): void {
  downloadCsv(
    `${filenamePrefix}_${todayDateStamp()}.csv`,
    ["指標", "値", "算出方法"],
    rows.map((row) => [csvLabel(row), row.csvValue, row.note]),
  );
}

function KpiDashboard({ state }: KpiDashboardProps) {
  const kpi = computeKpi(state);

  // v5-spec.md §10の「主な目線」列どおり。「両方」に分類される指標（design.md EXT-14）は
  // 組織目線・現場目線の両ブロックに重複表示する（2ブロック構成のまま情報を落とさないため）。
  const orgMetrics: MetricRow[] = [
    {
      label: "納期遵守率",
      value: formatPercent(kpi.deliveryComplianceRate),
      note: "実出荷日 ≤ 回答納期",
      csvValue: rawPercent(kpi.deliveryComplianceRate),
      unit: "%",
    },
    {
      label: "回答納期充足率",
      value: formatPercent(kpi.confirmDateComplianceRate),
      note: "回答納期 ≤ 希望納期",
      csvValue: rawPercent(kpi.confirmDateComplianceRate),
      unit: "%",
    },
    { label: "受注残", value: `${kpi.orderBacklogQty}`, note: "未完了受注の残数量", csvValue: kpi.orderBacklogQty },
    {
      label: "在庫回転",
      value: formatRatio(kpi.inventoryTurnover),
      note: "出庫数量 ÷ 現在庫（EXT-13）",
      csvValue: rawRatio(kpi.inventoryTurnover),
    },
    {
      label: "仕入先納期遵守率",
      value: formatPercent(kpi.supplierDeliveryComplianceRate),
      note: "入庫日 ≤ 回答納期",
      csvValue: rawPercent(kpi.supplierDeliveryComplianceRate),
      unit: "%",
    },
    {
      label: "日程警告件数",
      value: `${kpi.scheduleAlertCount}件`,
      note: "checkSchedule() の警告数",
      csvValue: kpi.scheduleAlertCount,
    },
    {
      label: "計画達成率",
      value: formatPercent(kpi.planAchievementRate),
      note: "良品数 ÷ 計画数（両方）",
      csvValue: rawPercent(kpi.planAchievementRate),
      unit: "%",
    },
    {
      label: "製造リードタイム実績",
      value: formatDays(kpi.avgProductionLeadTimeDays),
      note: "完了オーダの平均（両方）",
      csvValue: rawDays(kpi.avgProductionLeadTimeDays),
      unit: "日",
    },
    {
      label: "棚卸差異率",
      value: formatPercent(kpi.physicalInventoryVarianceRate),
      note: "ADJ絶対値 ÷ 現在庫（両方）",
      csvValue: rawPercent(kpi.physicalInventoryVarianceRate),
      unit: "%",
    },
  ];

  const floorMetrics: MetricRow[] = [
    {
      label: "直行率",
      value: formatPercent(kpi.firstPassYieldRate),
      note: "良品数 ÷ 投入数",
      csvValue: rawPercent(kpi.firstPassYieldRate),
      unit: "%",
    },
    { label: "仕掛数量", value: `${kpi.wipQty}`, note: "status = WIP のオーダ数量", csvValue: kpi.wipQty },
    {
      label: "欠品発生件数",
      value: `${kpi.stockoutEventCount}件`,
      note: "HOLD状態のMFG_ORDER数（EXT-11）",
      csvValue: kpi.stockoutEventCount,
    },
    {
      label: "計画達成率",
      value: formatPercent(kpi.planAchievementRate),
      note: "良品数 ÷ 計画数（両方）",
      csvValue: rawPercent(kpi.planAchievementRate),
      unit: "%",
    },
    {
      label: "製造リードタイム実績",
      value: formatDays(kpi.avgProductionLeadTimeDays),
      note: "完了オーダの平均（両方）",
      csvValue: rawDays(kpi.avgProductionLeadTimeDays),
      unit: "日",
    },
    {
      label: "棚卸差異率",
      value: formatPercent(kpi.physicalInventoryVarianceRate),
      note: "ADJ絶対値 ÷ 現在庫（両方）",
      csvValue: rawPercent(kpi.physicalInventoryVarianceRate),
      unit: "%",
    },
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
      <div className="panel__toolbar">
        <button type="button" aria-label="組織目線KPIをCSVでエクスポート" onClick={() => downloadMetricsCsv("kpi_org", orgMetrics)}>
          CSVでエクスポート
        </button>
      </div>
      {renderTable(orgMetrics)}

      <h3>現場目線</h3>
      <div className="panel__toolbar">
        <button
          type="button"
          aria-label="現場目線KPIをCSVでエクスポート"
          onClick={() => downloadMetricsCsv("kpi_floor", floorMetrics)}
        >
          CSVでエクスポート
        </button>
      </div>
      {renderTable(floorMetrics)}
    </div>
  );
}

export default KpiDashboard;
