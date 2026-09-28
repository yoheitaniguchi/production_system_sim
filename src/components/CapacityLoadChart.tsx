// 能力（山積み）のバーグラフ（Issue #67、design.md EXT-42）。値の整形はdomain/capacity.tsの
// buildCapacityChartModel()が担い、ここは描画だけを行う。グラフは表（CapacityPanel.tsx）と同じ数値の
// 視覚的な補助であり、支援技術向けの正本は表側に残している。
//
// 作業区ごとに1つの帯を縦に並べ、日を横軸に取る。日ごとに計画負荷（破線の枠）と実績負荷（塗り）の2本の棒を
// 立て、能力を破線の横線で示す。縦軸の目盛りは全作業区で共通にして、作業区間の大小を比べられるようにする。
// 能力を超えた作業区×日は、セルの背景・棒の色・「超過 +N分」の文字（色に頼らない手がかり）で強調する。
// 作業区名は横スクロールしても見えるよう、SVGの外の固定列（HTML）に置く。
import { buildCapacityChartModel, type CapacityLoadEntry } from "../domain/capacity";

// 文字サイズ（12px）を保つためSVGは拡縮させない（viewBoxを持たせず1ユーザー単位＝1px）。幅は日数ぶんを最小幅として
// 親の幅いっぱいに広げ（帯の背景・能力線がパネル幅まで伸びるように）、足りない狭い画面は親の.capacity-chart__scrollが
// 横スクロールする
const LABEL_W = 116;
const COL_W = 84;
const BAR_W = 30;
const BAR_GAP = 4;
const PLOT_H = 72;
/** 帯の上端から棒の領域までの余白。「超過 +N分」（1行目）と棒の値ラベル（2行目）を重ねずに置く */
const TOP_PAD = 36;
/** 基線の下の余白。帯ごとに日付（D+N）を置くため、作業区が多くても軸から遠くならない */
const BOTTOM_PAD = 20;
const BAND_H = TOP_PAD + PLOT_H + BOTTOM_PAD;
const RIGHT_PAD = 12;
/** 縦に長くならないよう、aria-labelに列挙する超過セルの件数の上限（残りは件数のみ） */
const ARIA_OVERLOAD_LIMIT = 5;

interface CapacityLoadChartProps {
  entries: CapacityLoadEntry[];
  /** 作業区の並び順（マスタ順＝工程の流れ）。省略時・未掲載の作業区はコード順 */
  workCenterOrder?: string[];
}

export function CapacityLoadChart({ entries, workCenterOrder }: CapacityLoadChartProps) {
  const model = buildCapacityChartModel(entries, workCenterOrder);
  if (model.rows.length === 0) return null;

  const minWidth = model.days.length * COL_W + RIGHT_PAD;
  const height = model.rows.length * BAND_H;
  const scale = PLOT_H / model.maxMin;
  const barsX = (col: number) => col * COL_W + (COL_W - (BAR_W * 2 + BAR_GAP)) / 2;
  const barH = (minutes: number) => (minutes > 0 ? Math.max(1, minutes * scale) : 0);

  const overloads = model.rows.flatMap((row) =>
    row.cells.filter((c) => c.overloadMin > 0).map((c) => `${row.workCenter} D+${c.day}（${c.overloadMin}分超過）`),
  );
  const overloadText =
    overloads.length === 0
      ? "能力超過はありません"
      : `能力超過：${overloads.slice(0, ARIA_OVERLOAD_LIMIT).join("、")}${
          overloads.length > ARIA_OVERLOAD_LIMIT ? `、ほか${overloads.length - ARIA_OVERLOAD_LIMIT}件（詳細は下の表）` : ""
        }`;

  return (
    <div>
      <p className="panel__hint">
        横軸は負荷のある日だけを等間隔に並べている（日付が飛ぶことがあるため、D+の値で読む）。数値の単位は分
      </p>
      <div className="capacity-chart__legend" aria-hidden="true">
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
      <div className="capacity-chart__frame">
        <div className="capacity-chart__labels" aria-hidden="true" style={{ width: LABEL_W }}>
          {model.rows.map((row, i) => (
            <div
              key={row.workCenter}
              className={i % 2 === 0 ? "capacity-chart__label-row capacity-chart__label-row--shaded" : "capacity-chart__label-row"}
              style={{ height: BAND_H, paddingTop: TOP_PAD, paddingBottom: BOTTOM_PAD }}
            >
              <span className="capacity-chart__label">{row.workCenter}</span>
              <span className="capacity-chart__sub-label">能力 {row.capacityMin}分/日</span>
            </div>
          ))}
        </div>
        {/* 横に溢れるときキーボードだけでもスクロールできるよう、フォーカス可能なリージョンにする */}
        <div className="capacity-chart__scroll" tabIndex={0} role="region" aria-label="山積みグラフ（横スクロールできます）">
          <svg
            className="capacity-chart__svg"
            width="100%"
            height={height}
            style={{ minWidth }}
            role="img"
            aria-label={`作業区ごと・日ごとの山積みバーグラフ。計画負荷（未着手）と実績負荷（着手済み）を能力と比べる（数値は下の表と同じ）。${overloadText}`}
          >
            {model.rows.map((row, i) => {
              const bandTop = i * BAND_H;
              const plotBottom = bandTop + TOP_PAD + PLOT_H;
              const capY = plotBottom - row.capacityMin * scale;
              return (
                <g key={row.workCenter}>
                  {i % 2 === 0 && <rect x={0} y={bandTop} width="100%" height={BAND_H} className="capacity-chart__band" />}
                  <line x1={0} y1={plotBottom} x2="100%" y2={plotBottom} className="capacity-chart__baseline" />

                  {row.cells.map((cell) => {
                    const col = model.days.indexOf(cell.day);
                    const colX = col * COL_W;
                    const x0 = barsX(col);
                    const planH = barH(cell.plannedMin);
                    const actualH = barH(cell.actualMin);
                    const overloaded = cell.overloadMin > 0;
                    const where = `${row.workCenter} D+${cell.day}`;
                    const capText = `能力${row.capacityMin}分`;
                    return (
                      <g key={cell.day} data-overload={overloaded ? "true" : "false"}>
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
                              超過 +{cell.overloadMin}分
                            </text>
                          </>
                        )}
                        {planH > 0 && (
                          <rect
                            x={x0}
                            y={plotBottom - planH}
                            width={BAR_W}
                            height={planH}
                            className={
                              cell.plannedOverloaded
                                ? "capacity-chart__bar--plan capacity-chart__bar--overload"
                                : "capacity-chart__bar--plan"
                            }
                          >
                            <title>{`${where} 計画負荷 ${cell.plannedMin}分（${capText}）`}</title>
                          </rect>
                        )}
                        {actualH > 0 && (
                          <rect
                            x={x0 + BAR_W + BAR_GAP}
                            y={plotBottom - actualH}
                            width={BAR_W}
                            height={actualH}
                            className={
                              cell.actualOverloaded
                                ? "capacity-chart__bar--actual capacity-chart__bar--overload"
                                : "capacity-chart__bar--actual"
                            }
                          >
                            <title>{`${where} 実績負荷 ${cell.actualMin}分（${capText}）`}</title>
                          </rect>
                        )}
                      </g>
                    );
                  })}

                  {/* 能力線は棒より手前に描く（棒に隠れて能力との差が読めなくなるのを避ける） */}
                  <line x1={0} y1={capY} x2="100%" y2={capY} className="capacity-chart__cap-line">
                    <title>{`${row.workCenter} 能力 ${row.capacityMin}分/日`}</title>
                  </line>

                  {/* 値ラベルは能力線のさらに手前に描き、縁取り（CSS）で線に重なっても読めるようにする */}
                  {row.cells.map((cell) => {
                    const x0 = barsX(model.days.indexOf(cell.day));
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

                  {/* 日付ラベルは超過セルの背景（半透明のテーマもある）に隠れないよう最後に描き、超過セル内は警告色の文字にする */}
                  {model.days.map((day, col) => {
                    const overloadedDay = row.cells.some((c) => c.day === day && c.overloadMin > 0);
                    return (
                      <text
                        key={day}
                        x={col * COL_W + COL_W / 2}
                        y={plotBottom + 15}
                        textAnchor="middle"
                        className={
                          overloadedDay
                            ? "capacity-chart__axis-label capacity-chart__axis-label--overload"
                            : "capacity-chart__axis-label"
                        }
                      >
                        D+{day}
                      </text>
                    );
                  })}
                </g>
              );
            })}
          </svg>
        </div>
      </div>
    </div>
  );
}
