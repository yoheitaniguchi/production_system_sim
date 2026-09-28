// 原価パネルのグラフ（Issue #62、design.md EXT-39）。値の整形はdomain/cost.tsが担い、ここは描画だけを行う。
// グラフは表（CostPanel.tsx）と同じ数値の視覚的な補助であり、支援技術向けの正本は表側に残している。
import type { ItemCostComposition, MfgOrderVariancePoint } from "../domain/cost";
import { MFG_ORDER_STATUS_LABELS } from "../statusLabels";

const WIDTH = 720;
const LABEL_W = 200;
const BAR_X = LABEL_W + 8;
const BAR_MAX_W = 320;
const ROW_H = 30;
const BAR_H = 16;
const PAD_Y = 8;
const LABEL_MAX_CHARS = 16;

function formatYen(value: number): string {
  return `${Math.round(value).toLocaleString()}円`;
}

function truncate(text: string, maxChars: number): string {
  return text.length > maxChars ? `${text.slice(0, maxChars - 1)}…` : text;
}

function percent(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

export interface CostCompositionRow extends ItemCostComposition {
  name: string;
}

/** 品目別標準原価の材料費/加工費を積み上げた横棒グラフ。棒の長さは金額（最大の品目に合わせて正規化） */
export function CostCompositionChart({ rows }: { rows: CostCompositionRow[] }) {
  const maxCost = Math.max(1, ...rows.map((r) => r.standardCost));
  const scale = (value: number) => (value / maxCost) * BAR_MAX_W;
  const height = PAD_Y * 2 + rows.length * ROW_H;

  return (
    <div>
      <div className="chart-legend">
        <span className="chart-legend__item">
          <span className="chart-swatch chart-swatch--material" />
          材料費
        </span>
        <span className="chart-legend__item">
          <span className="chart-swatch chart-swatch--labor" />
          加工費
        </span>
      </div>
      <div className="chart-scroll">
        <svg
          className="chart-svg"
          viewBox={`0 0 ${WIDTH} ${height}`}
          role="img"
          aria-label="品目別標準原価の材料費と加工費の構成グラフ（数値は下の表と同じ）"
        >
          {rows.map((row, i) => {
            const y = PAD_Y + i * ROW_H;
            const barY = y + (ROW_H - BAR_H) / 2;
            const materialW = scale(row.material);
            const laborW = scale(row.labor);
            const label = `${row.name}（${row.itemId}）`;
            return (
              <g key={row.itemId}>
                <text x={LABEL_W} y={y + ROW_H / 2 + 4} textAnchor="end" className="chart-label">
                  {truncate(label, LABEL_MAX_CHARS)}
                  <title>{label}</title>
                </text>
                {materialW > 0 && (
                  <rect x={BAR_X} y={barY} width={materialW} height={BAR_H} className="chart-bar chart-bar--material">
                    <title>{`${label} 材料費 ${formatYen(row.material)}`}</title>
                  </rect>
                )}
                {laborW > 0 && (
                  <rect
                    x={BAR_X + materialW}
                    y={barY}
                    width={laborW}
                    height={BAR_H}
                    className="chart-bar chart-bar--labor"
                  >
                    <title>{`${label} 加工費 ${formatYen(row.labor)}`}</title>
                  </rect>
                )}
                <text x={BAR_X + materialW + laborW + 8} y={y + ROW_H / 2 + 4} className="chart-value">
                  {formatYen(row.standardCost)}
                  {row.materialRatio != null && row.laborRatio != null
                    ? `（材料${percent(row.materialRatio)}・加工${percent(row.laborRatio)}）`
                    : ""}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

export interface MfgOrderVarianceRow extends MfgOrderVariancePoint {
  itemName: string;
}

/** 製造オーダ別原価差異の横棒グラフ。表と同じ順序で、差異の大きいオーダを見つけやすくする */
export function MfgOrderVarianceChart({ rows }: { rows: MfgOrderVarianceRow[] }) {
  const maxVariance = Math.max(1, ...rows.map((r) => r.variance));
  const height = PAD_Y * 2 + rows.length * ROW_H;

  return (
    <div className="chart-scroll">
      <svg
        className="chart-svg"
        viewBox={`0 0 ${WIDTH} ${height}`}
        role="img"
        aria-label="製造オーダ別の原価差異の比較グラフ（数値は下の表と同じ）"
      >
        {rows.map((row, i) => {
          const y = PAD_Y + i * ROW_H;
          const barY = y + (ROW_H - BAR_H) / 2;
          const barW = (Math.max(0, row.variance) / maxVariance) * BAR_MAX_W;
          const label = `${row.moNo} ${row.itemName}`;
          const status = MFG_ORDER_STATUS_LABELS[row.status];
          return (
            <g key={row.moNo}>
              <text x={LABEL_W} y={y + ROW_H / 2 + 4} textAnchor="end" className="chart-label">
                {truncate(label, LABEL_MAX_CHARS)}
                <title>{label}</title>
              </text>
              {barW > 0 && (
                <rect x={BAR_X} y={barY} width={barW} height={BAR_H} className="chart-bar chart-bar--variance">
                  <title>{`${label} 原価差異 ${formatYen(row.variance)}（${status}）`}</title>
                </rect>
              )}
              <text x={BAR_X + barW + 8} y={y + ROW_H / 2 + 4} className="chart-value">
                {formatYen(row.variance)}（{status}）
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
