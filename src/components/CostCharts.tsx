// 原価パネルのグラフ（Issue #62、design.md EXT-39）。値の整形はdomain/cost.tsが担い、ここは描画だけを行う。
// グラフは表（CostPanel.tsx）と同じ数値の視覚的な補助であり、支援技術向けの正本は表側に残している。
import type { ItemCostComposition, MfgOrderVariancePoint } from "../domain/cost";
import { MFG_ORDER_STATUS_LABELS } from "../statusLabels";

// 文字サイズ（12px）を保つためSVGは拡縮させない。狭い画面では親の.cost-chart__scrollが横スクロールする
const WIDTH = 760;
const LABEL_W = 210;
const BAR_X = LABEL_W + 8;
const BAR_MAX_W = 320;
const ROW_H = 30;
const BAR_H = 16;
const PAD_Y = 8;
const LABEL_MAX_CHARS = 18;

function formatYen(value: number): string {
  return `${Math.round(value).toLocaleString()}円`;
}

/** 末尾を切り詰める。一意キー（品目コード・オーダ番号）は先頭に置いて残し、名称側が省略されるようにする */
function truncate(text: string, maxChars: number): string {
  return text.length > maxChars ? `${text.slice(0, maxChars - 1)}…` : text;
}

export interface CostCompositionRow extends ItemCostComposition {
  name: string;
}

/**
 * 品目別標準原価の材料費/加工費の構成比を示す100%積み上げの横棒グラフ。全品目の棒の長さを揃えて
 * 構成の違いを比べやすくし、金額は棒の右に文字で併記する。
 */
export function CostCompositionChart({ rows }: { rows: CostCompositionRow[] }) {
  const height = PAD_Y * 2 + rows.length * ROW_H;

  return (
    <div>
      <div className="cost-chart__legend">
        <span className="cost-chart__legend-item">
          <span className="cost-chart__swatch cost-chart__swatch--material" />
          材料費
        </span>
        <span className="cost-chart__legend-item">
          <span className="cost-chart__swatch cost-chart__swatch--labor" />
          加工費
        </span>
      </div>
      <div className="cost-chart__scroll" tabIndex={0} role="region" aria-label="品目別標準原価の構成比グラフ（横スクロールできます）">
        <svg
          className="cost-chart__svg"
          width={WIDTH}
          height={height}
          viewBox={`0 0 ${WIDTH} ${height}`}
          role="img"
          aria-label="品目別標準原価の材料費と加工費の構成比グラフ（数値は下の表と同じ）"
        >
          {rows.map((row, i) => {
            const y = PAD_Y + i * ROW_H;
            const barY = y + (ROW_H - BAR_H) / 2;
            const label = `${row.itemId} ${row.name}`;
            // 丸め後の合計が101%等にならないよう、加工費は100から材料費を引いて求める
            const materialPct = row.materialRatio != null ? Math.round(row.materialRatio * 100) : null;
            const laborPct = materialPct != null ? 100 - materialPct : null;
            const materialW = row.materialRatio != null ? row.materialRatio * BAR_MAX_W : 0;
            const laborW = row.laborRatio != null ? BAR_MAX_W - materialW : 0;
            return (
              <g key={row.itemId}>
                <text x={LABEL_W} y={y + ROW_H / 2 + 4} textAnchor="end" className="cost-chart__label">
                  {truncate(label, LABEL_MAX_CHARS)}
                  <title>{label}</title>
                </text>
                <rect x={BAR_X} y={barY} width={BAR_MAX_W} height={BAR_H} className="cost-chart__track" />
                {materialW > 0 && (
                  <rect
                    x={BAR_X}
                    y={barY}
                    width={materialW}
                    height={BAR_H}
                    className="cost-chart__bar--material"
                  >
                    <title>{`${label} 材料費 ${formatYen(row.material)}`}</title>
                  </rect>
                )}
                {laborW > 0 && (
                  <rect
                    x={BAR_X + materialW}
                    y={barY}
                    width={laborW}
                    height={BAR_H}
                    className="cost-chart__bar--labor"
                  >
                    <title>{`${label} 加工費 ${formatYen(row.labor)}`}</title>
                  </rect>
                )}
                <text x={BAR_X + BAR_MAX_W + 10} y={y + ROW_H / 2 + 4} className="cost-chart__value">
                  {formatYen(row.standardCost)}
                  {materialPct != null && laborPct != null ? `（材料${materialPct}%・加工${laborPct}%）` : ""}
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

/**
 * 製造オーダ別原価差異の横棒グラフ。表と同じ順序で並べる。完了（DONE）オーダの差異は不良・仕損による確定値だが、
 * 未完了オーダは完成品振替額がまだ0のため投入額そのままの暫定値になる。両者を同じ見た目で並べると
 * 誤読されるため、暫定値は薄い塗り＋破線の枠で区別する。
 */
export function MfgOrderVarianceChart({ rows }: { rows: MfgOrderVarianceRow[] }) {
  const maxVariance = Math.max(1, ...rows.map((r) => r.variance));
  const height = PAD_Y * 2 + rows.length * ROW_H;

  return (
    <div>
      <div className="cost-chart__legend">
        <span className="cost-chart__legend-item">
          <span className="cost-chart__swatch cost-chart__swatch--variance" />
          完了オーダの原価差異（不良・仕損の分）
        </span>
        <span className="cost-chart__legend-item">
          <span className="cost-chart__swatch cost-chart__swatch--provisional" />
          未完了オーダの暫定値（投入額）
        </span>
      </div>
      <div className="cost-chart__scroll" tabIndex={0} role="region" aria-label="製造オーダ別原価差異グラフ（横スクロールできます）">
        <svg
          className="cost-chart__svg"
          width={WIDTH}
          height={height}
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
            const provisional = row.status !== "DONE";
            return (
              <g key={row.moNo}>
                <text x={LABEL_W} y={y + ROW_H / 2 + 4} textAnchor="end" className="cost-chart__label">
                  {truncate(label, LABEL_MAX_CHARS)}
                  <title>{label}</title>
                </text>
                {barW > 0 && (
                  <rect
                    x={BAR_X}
                    y={barY}
                    width={barW}
                    height={BAR_H}
                    className={provisional ? "cost-chart__bar--provisional" : "cost-chart__bar--variance"}
                  >
                    <title>{`${label} 原価差異 ${formatYen(row.variance)}（${status}）`}</title>
                  </rect>
                )}
                <text x={BAR_X + barW + 8} y={y + ROW_H / 2 + 4} className="cost-chart__value">
                  {formatYen(row.variance)}（{status}）
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
