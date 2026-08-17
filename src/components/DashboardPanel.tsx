// ダッシュボード：受注残・計画残・発注残・製造残・出荷残・在庫のバーンダウンチャート（数量／金額切替）と、
// KPIサマリーカード・アラート件数を1画面に俯瞰する（design.md ダッシュボード機能）。
// 個々の指標の算出方法まで確認したいときはKPIタブ・原価タブ・能力タブを見る、という役割分担にする
// （このタブは「今どうなっているか」を一目で把握するための俯瞰画面に留める）。
// 日次推移はreducer.tsがADVANCE_DAY等の操作のたびに記録するstate.dashboardHistoryをそのまま使い、
// ここでBOM階層やオーダ状態を独自に辿り直すことはしない。
import { useMemo, useState } from "react";
import type { DashboardSnapshot, SimulationState } from "../types";

interface DashboardPanelProps {
  state: SimulationState;
}

type MetricMode = "qty" | "amount";

interface SeriesDef {
  key: keyof DashboardSnapshot["backlog"];
  label: string;
  swatchClass: string;
}

const SERIES: SeriesDef[] = [
  { key: "order", label: "受注残", swatchClass: "dashboard__swatch--order" },
  { key: "planned", label: "計画残", swatchClass: "dashboard__swatch--planned" },
  { key: "purchase", label: "発注残", swatchClass: "dashboard__swatch--purchase" },
  { key: "production", label: "製造残", swatchClass: "dashboard__swatch--production" },
  { key: "shipment", label: "出荷残", swatchClass: "dashboard__swatch--shipment" },
  { key: "inventory", label: "在庫", swatchClass: "dashboard__swatch--inventory" },
];

const MARGIN_LEFT = 56;
const MARGIN_RIGHT = 16;
const MARGIN_TOP = 12;
const MARGIN_BOTTOM = 28;
const DAY_WIDTH = 34;
const CHART_HEIGHT = 260;
const MIN_TICK_PX = 44;
const NICE_STEPS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
const Y_TICK_COUNT = 4;

function tickStepFor(dayWidth: number): number {
  return NICE_STEPS.find((step) => step * dayWidth >= MIN_TICK_PX) ?? NICE_STEPS[NICE_STEPS.length - 1];
}

/** 上限値に対して見やすいY軸目盛りの刻み幅（1/2/5の倍数）を選ぶ */
function niceYStep(maxValue: number, tickCount: number): number {
  if (maxValue <= 0) return 1;
  const rough = maxValue / tickCount;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const normalized = rough / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return step * magnitude;
}

function formatYen(value: number): string {
  return `${Math.round(value).toLocaleString()}円`;
}

function formatPercent(value: number | null): string {
  return value != null ? `${(value * 100).toFixed(1)}%` : "—";
}

function formatRatio(value: number | null): string {
  return value != null ? value.toFixed(2) : "—";
}

function Sparkline({ values }: { values: (number | null)[] }) {
  const points = values
    .map((v, i) => (v != null ? { x: i, y: v } : null))
    .filter((p): p is { x: number; y: number } => p != null);
  if (points.length < 2) return <span className="dashboard__spark-empty">推移データ不足</span>;

  const w = 84;
  const h = 22;
  const minX = points[0].x;
  const maxX = points[points.length - 1].x;
  const minY = Math.min(...points.map((p) => p.y));
  const maxY = Math.max(...points.map((p) => p.y));
  const xOf = (x: number) => (maxX === minX ? 0 : ((x - minX) / (maxX - minX)) * w);
  const yOf = (y: number) => (maxY === minY ? h / 2 : h - ((y - minY) / (maxY - minY)) * h);
  const path = points.map((p) => `${xOf(p.x)},${yOf(p.y)}`).join(" ");
  const last = points[points.length - 1];

  return (
    <svg className="dashboard__spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <polyline points={path} className="dashboard__spark-line" />
      <circle cx={xOf(last.x)} cy={yOf(last.y)} r={2} className="dashboard__spark-dot" />
    </svg>
  );
}

function DashboardPanel({ state }: DashboardPanelProps) {
  const [mode, setMode] = useState<MetricMode>("qty");
  const history = state.dashboardHistory;
  const latest = history[history.length - 1];

  const range = useMemo(() => {
    if (history.length === 0) return null;
    return { minDay: history[0].day, maxDay: history[history.length - 1].day };
  }, [history]);

  const maxValue = useMemo(() => {
    let max = 0;
    for (const snap of history) {
      for (const s of SERIES) max = Math.max(max, snap.backlog[s.key][mode]);
    }
    return max;
  }, [history, mode]);

  const kpiCards = latest
    ? [
        { label: "納期遵守率", value: formatPercent(latest.kpiHighlights.deliveryComplianceRate), key: "deliveryComplianceRate" as const },
        { label: "計画達成率", value: formatPercent(latest.kpiHighlights.planAchievementRate), key: "planAchievementRate" as const },
        { label: "直行率", value: formatPercent(latest.kpiHighlights.firstPassYieldRate), key: "firstPassYieldRate" as const },
        { label: "在庫回転", value: formatRatio(latest.kpiHighlights.inventoryTurnover), key: "inventoryTurnover" as const },
      ]
    : [];

  const alertBadges = latest
    ? [
        { label: "日程遅延", count: latest.alertCounts.schedule },
        { label: "未充足需要", count: latest.alertCounts.unmetDemand },
        { label: "マスタ不整合", count: latest.alertCounts.masterIssue },
        { label: "能力超過", count: latest.alertCounts.capacityOverload },
      ]
    : [];

  return (
    <div className="panel">
      <h2>ダッシュボード</h2>
      <p className="panel__hint">
        受注残・計画残・発注残・製造残・出荷残・在庫の残高推移（バーンダウン）と、主要KPI・アラート件数を1画面で
        俯瞰する。個々の指標の算出方法はKPI／原価／能力タブを、警告への対応は画面上部の警告バーを参照。
        推移は「次の日へ進む」等の操作のたびに当日分を記録して積み上げる（ページを開き直すと消える）。
      </p>

      <h3>KPIサマリー</h3>
      <div className="dashboard__kpi-cards">
        {kpiCards.length === 0 ? (
          <p className="panel__empty">まだデータがありません。</p>
        ) : (
          kpiCards.map((card) => (
            <div key={card.label} className="dashboard__kpi-card">
              <span className="dashboard__kpi-card-label">{card.label}</span>
              <span className="dashboard__kpi-card-value">{card.value}</span>
              <Sparkline values={history.map((snap) => snap.kpiHighlights[card.key])} />
            </div>
          ))
        )}
      </div>

      <h3>アラート件数</h3>
      <div className="dashboard__alerts">
        {alertBadges.map((a) => (
          <span
            key={a.label}
            className={a.count > 0 ? "dashboard__alert-badge dashboard__alert-badge--warn" : "dashboard__alert-badge dashboard__alert-badge--ok"}
          >
            {a.label} {a.count}件
          </span>
        ))}
      </div>

      <h3>バーンダウンチャート</h3>
      <div className="dashboard__toolbar">
        <button
          type="button"
          className={mode === "qty" ? "panel__btn--primary" : undefined}
          onClick={() => setMode("qty")}
        >
          数量
        </button>
        <button
          type="button"
          className={mode === "amount" ? "panel__btn--primary" : undefined}
          onClick={() => setMode("amount")}
        >
          金額
        </button>
      </div>

      <div className="dashboard__legend">
        {SERIES.map((s) => (
          <span key={s.key} className="dashboard__legend-item">
            <span className={`dashboard__swatch ${s.swatchClass}`} />
            {s.label}
          </span>
        ))}
      </div>

      {!range || history.length === 0 ? (
        <p className="panel__empty">推移データがありません。</p>
      ) : (
        <div className="dashboard__chart-scroll">
          {(() => {
            const totalDays = range.maxDay - range.minDay + 1;
            const chartWidth = MARGIN_LEFT + MARGIN_RIGHT + totalDays * DAY_WIDTH;
            const plotHeight = CHART_HEIGHT - MARGIN_TOP - MARGIN_BOTTOM;
            const xOfDay = (day: number) => MARGIN_LEFT + (day - range.minDay) * DAY_WIDTH;
            const yStep = niceYStep(maxValue, Y_TICK_COUNT);
            const yMax = Math.max(yStep, Math.ceil((maxValue || 1) / yStep) * yStep);
            const yOfValue = (value: number) => MARGIN_TOP + plotHeight - (value / yMax) * plotHeight;

            const tickStep = tickStepFor(DAY_WIDTH);
            const dayTicks: number[] = [];
            for (let d = range.minDay; d <= range.maxDay; d += tickStep) dayTicks.push(d);
            if (dayTicks[dayTicks.length - 1] !== range.maxDay) dayTicks.push(range.maxDay);

            const yTicks: number[] = [];
            for (let v = 0; v <= yMax; v += yStep) yTicks.push(v);

            return (
              <svg width={chartWidth} height={CHART_HEIGHT} role="img" aria-label="残高推移バーンダウンチャート">
                {yTicks.map((v) => (
                  <g key={`y-${v}`}>
                    <line
                      x1={MARGIN_LEFT}
                      y1={yOfValue(v)}
                      x2={chartWidth - MARGIN_RIGHT}
                      y2={yOfValue(v)}
                      className="dashboard__grid-line"
                    />
                    <text x={MARGIN_LEFT - 8} y={yOfValue(v) + 4} textAnchor="end" className="dashboard__grid-label">
                      {mode === "amount" ? Math.round(v).toLocaleString() : v}
                    </text>
                  </g>
                ))}

                {dayTicks.map((d) => (
                  <text key={`x-${d}`} x={xOfDay(d)} y={CHART_HEIGHT - MARGIN_BOTTOM + 18} textAnchor="middle" className="dashboard__grid-label">
                    D+{d}
                  </text>
                ))}

                {SERIES.map((s) => {
                  const points = history.map((snap) => `${xOfDay(snap.day)},${yOfValue(snap.backlog[s.key][mode])}`).join(" ");
                  return (
                    <g key={s.key}>
                      <polyline points={points} className={`dashboard__series dashboard__series--${s.key}`} />
                      {history.map((snap) => (
                        <circle
                          key={`${s.key}-${snap.day}`}
                          cx={xOfDay(snap.day)}
                          cy={yOfValue(snap.backlog[s.key][mode])}
                          r={3}
                          className={`dashboard__point dashboard__point--${s.key}`}
                        >
                          <title>
                            {`${s.label} D+${snap.day}：${mode === "amount" ? formatYen(snap.backlog[s.key][mode]) : `${snap.backlog[s.key][mode]}個`}`}
                          </title>
                        </circle>
                      ))}
                    </g>
                  );
                })}
              </svg>
            );
          })()}
        </div>
      )}
    </div>
  );
}

export default DashboardPanel;
