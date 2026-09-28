// 能力（山積み）のバーグラフ（Issue #67、design.md EXT-42）。値の整形はdomain/capacity.tsの
// buildCapacityChartModel()が担い、ここは描画だけを行う。グラフは表（CapacityPanel.tsx）と同じ数値の
// 視覚的な補助であり、支援技術向けの正本は表側に残している。
//
// 作業区ごとに1つの帯を縦に並べ、日を横軸に取る。日ごとに計画負荷（破線の枠）と実績負荷（塗り）の2本の棒を
// 立て、能力を破線の横線で示す。縦軸の目盛りは全作業区で共通にして、作業区間の大小を比べられるようにする。
// 能力を超えた作業区×日は、セルの背景・棒の色・「超過 +N」の文字（色に頼らない手がかり）で強調する。
import { buildCapacityChartModel, type CapacityLoadEntry } from "../domain/capacity";

// 文字サイズ（12px）を保つためSVGは拡縮させない（viewBoxを持たせず1ユーザー単位＝1px）。幅は日数ぶんを最小幅として
// 親の幅いっぱいに広げ（帯の背景がパネル幅まで伸びるように）、足りない狭い画面は親の.capacity-chart__scrollが横スクロールする
const LABEL_W = 116;
const COL_W = 84;
const BAR_W = 30;
const BAR_GAP = 4;
const PLOT_H = 72;
/** 帯の上端から棒の領域までの余白。「超過 +N」（1行目）と棒の値ラベル（2行目）を重ねずに置く */
const TOP_PAD = 36;
const BOTTOM_PAD = 6;
const BAND_H = TOP_PAD + PLOT_H + BOTTOM_PAD;
const AXIS_H = 24;
const RIGHT_PAD = 12;

export function CapacityLoadChart({ entries }: { entries: CapacityLoadEntry[] }) {
  const model = buildCapacityChartModel(entries);
  if (model.rows.length === 0) return null;

  const width = LABEL_W + model.days.length * COL_W + RIGHT_PAD;
  const height = model.rows.length * BAND_H + AXIS_H;
  const scale = PLOT_H / model.maxMin;
  const overloads = model.rows.flatMap((row) =>
    row.cells.filter((c) => c.overloadMin > 0).map((c) => `${row.workCenter} D+${c.day}（${c.overloadMin}分超過）`),
  );
  const barsX = (colX: number) => colX + (COL_W - (BAR_W * 2 + BAR_GAP)) / 2;
  const barH = (minutes: number) => (minutes > 0 ? Math.max(1, minutes * scale) : 0);

  return (
    <div>
      <div className="capacity-chart__legend">
        <span className="capacity-chart__legend-item">
          <span className="capacity-chart__swatch capacity-chart__swatch--plan" />
          計画負荷（未着手の作業指示）
        </span>
        <span className="capacity-chart__legend-item">
          <span className="capacity-chart__swatch capacity-chart__swatch--actual" />
          実績負荷（着手済みの作業指示）
        </span>
        <span className="capacity-chart__legend-item">
          <span className="capacity-chart__swatch capacity-chart__swatch--cap" />
          能力（1日あたり）
        </span>
        <span className="capacity-chart__legend-item">
          <span className="capacity-chart__swatch capacity-chart__swatch--overload" />
          能力超過
        </span>
      </div>
      <div className="capacity-chart__scroll">
        <svg
          className="capacity-chart__svg"
          width="100%"
          height={height}
          style={{ minWidth: width }}
          role="img"
          aria-label={`作業区×日の山積みバーグラフ（数値は下の表と同じ）。${
            overloads.length > 0 ? `能力超過：${overloads.join("、")}` : "能力超過はありません"
          }`}
        >
          {model.rows.map((row, i) => {
            const bandTop = i * BAND_H;
            const plotBottom = bandTop + TOP_PAD + PLOT_H;
            const capY = plotBottom - row.capacityMin * scale;
            return (
              <g key={row.workCenter}>
                {i % 2 === 0 && <rect x={0} y={bandTop} width="100%" height={BAND_H} className="capacity-chart__band" />}
                <text x={LABEL_W - 10} y={bandTop + TOP_PAD + 16} textAnchor="end" className="capacity-chart__label">
                  {row.workCenter}
                </text>
                <text x={LABEL_W - 10} y={bandTop + TOP_PAD + 32} textAnchor="end" className="capacity-chart__sub-label">
                  能力 {row.capacityMin}分/日
                </text>
                <line x1={LABEL_W} y1={plotBottom} x2={width - RIGHT_PAD} y2={plotBottom} className="capacity-chart__baseline" />

                {row.cells.map((cell) => {
                  const col = model.days.indexOf(cell.day);
                  const colX = LABEL_W + col * COL_W;
                  const x0 = barsX(colX);
                  const planH = barH(cell.plannedMin);
                  const actualH = barH(cell.actualMin);
                  const planOver = cell.plannedMin > row.capacityMin;
                  const actualOver = cell.actualMin > row.capacityMin;
                  const overloaded = cell.overloadMin > 0;
                  const where = `${row.workCenter} D+${cell.day}`;
                  const capText = `能力${row.capacityMin}分`;
                  return (
                    <g key={cell.day} className={overloaded ? "capacity-chart__cell--overload" : "capacity-chart__cell"}>
                      {overloaded && (
                        <>
                          <rect
                            x={colX + 2}
                            y={bandTop + 2}
                            width={COL_W - 4}
                            height={BAND_H - 4}
                            className="capacity-chart__cell-bg--overload"
                          >
                            <title>{`${where}：能力${row.capacityMin}分を${cell.overloadMin}分超過`}</title>
                          </rect>
                          <text x={colX + COL_W / 2} y={bandTop + 15} textAnchor="middle" className="capacity-chart__overload-label">
                            超過 +{cell.overloadMin}
                          </text>
                        </>
                      )}
                      {planH > 0 && (
                        <>
                          <rect
                            x={x0}
                            y={plotBottom - planH}
                            width={BAR_W}
                            height={planH}
                            className={planOver ? "capacity-chart__bar--plan capacity-chart__bar--over" : "capacity-chart__bar--plan"}
                          >
                            <title>{`${where} 計画負荷 ${cell.plannedMin}分（${capText}）`}</title>
                          </rect>
                        </>
                      )}
                      {actualH > 0 && (
                        <>
                          <rect
                            x={x0 + BAR_W + BAR_GAP}
                            y={plotBottom - actualH}
                            width={BAR_W}
                            height={actualH}
                            className={actualOver ? "capacity-chart__bar--actual capacity-chart__bar--over" : "capacity-chart__bar--actual"}
                          >
                            <title>{`${where} 実績負荷 ${cell.actualMin}分（${capText}）`}</title>
                          </rect>
                        </>
                      )}
                    </g>
                  );
                })}

                {/* 能力線は棒より手前に描く（棒に隠れて能力との差が読めなくなるのを避ける） */}
                <line x1={LABEL_W} y1={capY} x2={width - RIGHT_PAD} y2={capY} className="capacity-chart__cap-line">
                  <title>{`${row.workCenter} 能力 ${row.capacityMin}分/日`}</title>
                </line>

                {/* 値ラベルは能力線のさらに手前に描き、縁取り（CSS）で線に重なっても読めるようにする */}
                {row.cells.map((cell) => {
                  const x0 = barsX(LABEL_W + model.days.indexOf(cell.day) * COL_W);
                  return (
                    <g key={cell.day}>
                      {cell.plannedMin > 0 && (
                        <text
                          x={x0 + BAR_W / 2}
                          y={plotBottom - barH(cell.plannedMin) - 4}
                          textAnchor="middle"
                          className="capacity-chart__value"
                        >
                          {cell.plannedMin}
                        </text>
                      )}
                      {cell.actualMin > 0 && (
                        <text
                          x={x0 + BAR_W + BAR_GAP + BAR_W / 2}
                          y={plotBottom - barH(cell.actualMin) - 4}
                          textAnchor="middle"
                          className="capacity-chart__value"
                        >
                          {cell.actualMin}
                        </text>
                      )}
                    </g>
                  );
                })}
              </g>
            );
          })}

          {model.days.map((day, col) => (
            <text
              key={day}
              x={LABEL_W + col * COL_W + COL_W / 2}
              y={height - 8}
              textAnchor="middle"
              className="capacity-chart__axis-label"
            >
              D+{day}
            </text>
          ))}
        </svg>
      </div>
      <p className="panel__hint">負荷のある日だけを並べている（日と日の間の空きは詰めて表示する）</p>
    </div>
  );
}
