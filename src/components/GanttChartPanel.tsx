// 進捗ガント：受注ごとの計画・実績を時間軸で比較する画面（design.md §5「進捗ガント」、§8 gantt.ts）。
// 「引当元追跡」（PeggingTracePanel.tsx）が同じ確定オーダ集合をツリーで見せるのに対し、
// こちらは時間軸で並べて比較する。ドメイン計算はdomain/gantt.tsに集約し、ここでは表示のみを担う。
import { useMemo, useState } from "react";
import { computeGanttRows, ganttDayRange, type GanttBarState, type GanttOrderRow, type GanttTask } from "../domain/gantt";
import type { SimulationState } from "../types";

interface GanttChartPanelProps {
  state: SimulationState;
}

const SUMMARY_ROW_H = 38;
const CHILD_ROW_H = 30;
const DAY_WIDTH = 26;
const MARGIN_X = 28;
const TOP_AXIS_H = 24;
/** 日目盛りラベル同士が重ならない最小間隔(px)。DAY_WIDTHが狭いときは複数日おきに間引く */
const MIN_TICK_PX = 44;
const NICE_STEPS = [1, 2, 5, 10, 20, 50, 100, 200, 500];

function tickStepFor(dayWidth: number): number {
  return NICE_STEPS.find((step) => step * dayWidth >= MIN_TICK_PX) ?? NICE_STEPS[NICE_STEPS.length - 1];
}

const BAR_STATE_LABELS: Record<GanttBarState, string> = {
  PLANNED: "未着手",
  IN_PROGRESS: "進行中",
  DELAYED: "遅延",
  DONE: "完了",
  CANCELED: "取消",
};

interface FlatRow {
  key: string;
  task: GanttTask;
  isSummary: boolean;
  hasChildren: boolean;
  y: number;
  h: number;
}

function flattenRows(rows: GanttOrderRow[], expanded: Set<string>): FlatRow[] {
  const flat: FlatRow[] = [];
  let y = 0;
  for (const row of rows) {
    const key = `${row.soNo}-${row.lineNo}`;
    flat.push({ key, task: row.summary, isSummary: true, hasChildren: row.children.length > 0, y, h: SUMMARY_ROW_H });
    y += SUMMARY_ROW_H;
    if (expanded.has(key)) {
      for (const child of row.children) {
        flat.push({ key: `${key}::${child.id}`, task: child, isSummary: false, hasChildren: false, y, h: CHILD_ROW_H });
        y += CHILD_ROW_H;
      }
    }
  }
  return flat;
}

function GanttBarMarks({ task, y, h, xOfDay, isSummary, today }: {
  task: GanttTask;
  y: number;
  h: number;
  xOfDay: (day: number) => number;
  isSummary: boolean;
  today: number;
}) {
  const stateClass = task.barState.toLowerCase();

  if (task.kind === "SHIP") {
    const cx = xOfDay(task.planStart);
    const cy = y + h / 2;
    const r = 5;
    return (
      <rect
        x={cx - r}
        y={cy - r}
        width={r * 2}
        height={r * 2}
        transform={`rotate(45 ${cx} ${cy})`}
        className={`gantt__milestone gantt__milestone--${stateClass}`}
      >
        <title>{`${task.label}：${BAR_STATE_LABELS[task.barState]}`}</title>
      </rect>
    );
  }

  const barH = isSummary ? 12 : 9;
  const planY = y + (isSummary ? 6 : 4);
  const actualY = planY + barH + 2;

  const planX = xOfDay(task.planStart);
  const planW = Math.max(xOfDay(task.planEnd) - planX, 4);

  const hasActual = task.barState !== "PLANNED";
  const actualEndDay = task.ongoing ? today : (task.actualEnd ?? task.actualStart ?? task.planStart);
  const actualX = hasActual ? xOfDay(task.actualStart ?? task.planStart) : 0;
  const actualW = hasActual ? Math.max(xOfDay(actualEndDay) - actualX, 4) : 0;

  return (
    <g>
      <rect x={planX} y={planY} width={planW} height={barH} rx={3} className="gantt__bar gantt__bar--plan">
        <title>{`${task.label}：計画 D+${task.planStart}〜D+${task.planEnd}`}</title>
      </rect>
      {hasActual && (
        <rect
          x={actualX}
          y={actualY}
          width={actualW}
          height={barH}
          rx={3}
          className={`gantt__bar gantt__bar--${stateClass}${task.ongoing ? " gantt__bar--ongoing" : ""}`}
        >
          <title>{`${task.label}：実績 D+${task.actualStart}〜${task.ongoing ? "進行中" : `D+${task.actualEnd}`}（${BAR_STATE_LABELS[task.barState]}）`}</title>
        </rect>
      )}
    </g>
  );
}

function GanttChartPanel({ state }: GanttChartPanelProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showClosed, setShowClosed] = useState(true);
  const [showCanceled, setShowCanceled] = useState(true);

  const allRows = useMemo(() => computeGanttRows(state), [state]);
  const rows = allRows.filter((row) => {
    if (!showClosed && row.status === "CLOSED") return false;
    if (!showCanceled && row.status === "CANCELED") return false;
    return true;
  });

  const toggle = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const range = ganttDayRange(rows, state.day);
  const flat = useMemo(() => flattenRows(rows, expanded), [rows, expanded]);

  return (
    <div className="panel">
      <h2>進捗ガント</h2>
      <p className="panel__hint">
        受注ごとに、受注〜出荷の計画（枠線バー）と実績（塗りバー）を時間軸で並べて比較する。行頭の▸をクリックすると、
        その受注にひも付く購買・製造・出荷オーダの内訳（引当元追跡と同じ集合）を時系列で展開できる。
      </p>

      <div className="gantt__toolbar">
        <label className="gantt__filter">
          <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} />
          完了済み（CLOSED）を表示
        </label>
        <label className="gantt__filter">
          <input type="checkbox" checked={showCanceled} onChange={(e) => setShowCanceled(e.target.checked)} />
          取消済み（CANCELED）を表示
        </label>
      </div>

      <div className="gantt__legend">
        <span className="gantt__legend-item">
          <span className="gantt__swatch gantt__swatch--plan" />計画
        </span>
        <span className="gantt__legend-item">
          <span className="gantt__swatch gantt__swatch--in_progress" />実績・進行中
        </span>
        <span className="gantt__legend-item">
          <span className="gantt__swatch gantt__swatch--done" />実績・完了
        </span>
        <span className="gantt__legend-item">
          <span className="gantt__swatch gantt__swatch--delayed" />遅延
        </span>
        <span className="gantt__legend-item">
          <span className="gantt__swatch gantt__swatch--canceled" />取消
        </span>
        <span className="gantt__legend-item">
          <span className="gantt__legend-today" />今日（D+{state.day}）
        </span>
      </div>

      {rows.length === 0 || !range ? (
        <p className="panel__empty">表示できる受注がありません。</p>
      ) : (
        <div className="gantt__body">
          <div className="gantt__labels" style={{ paddingTop: TOP_AXIS_H }}>
            {flat.map((f) => (
              <div
                key={f.key}
                className={f.isSummary ? "gantt__label-row" : "gantt__label-row gantt__label-row--child"}
                style={{ height: f.h }}
              >
                {f.isSummary ? (
                  <button
                    type="button"
                    className="gantt__expand-btn"
                    aria-expanded={expanded.has(f.key)}
                    disabled={!f.hasChildren}
                    onClick={() => toggle(f.key)}
                    title={f.hasChildren ? "内訳の展開/折りたたみ" : "内訳（計画オーダの確定）がまだありません"}
                  >
                    {f.hasChildren ? (expanded.has(f.key) ? "▾" : "▸") : "・"}
                  </button>
                ) : (
                  <span className="gantt__label-indent" aria-hidden="true" />
                )}
                <span className="gantt__label-text" title={f.task.label}>
                  {f.task.label}
                </span>
                <span className={`gantt__status-badge gantt__status-badge--${f.task.barState.toLowerCase()}`}>
                  {BAR_STATE_LABELS[f.task.barState]}
                </span>
              </div>
            ))}
          </div>

          <div className="gantt__chart-scroll">
            {(() => {
              const totalDays = range.maxDay - range.minDay + 1;
              const chartWidth = MARGIN_X * 2 + totalDays * DAY_WIDTH;
              const bodyHeight = flat.reduce((h, f) => h + f.h, 0);
              const chartHeight = TOP_AXIS_H + bodyHeight;
              const xOfDay = (day: number) => MARGIN_X + (day - range.minDay) * DAY_WIDTH;
              const tickStep = tickStepFor(DAY_WIDTH);
              const ticks: number[] = [];
              for (let d = range.minDay; d <= range.maxDay; d += tickStep) ticks.push(d);
              // 末尾（maxDay）がラベル同士の最小間隔より近い位置に来る場合は、直前の目盛りを
              // maxDayに置き換える（D+14 D+15のような重なりを避ける）
              const lastTick = ticks[ticks.length - 1];
              if (lastTick !== range.maxDay) {
                if ((range.maxDay - lastTick) * DAY_WIDTH < MIN_TICK_PX && ticks.length > 1) {
                  ticks[ticks.length - 1] = range.maxDay;
                } else {
                  ticks.push(range.maxDay);
                }
              }

              return (
                <svg width={chartWidth} height={chartHeight} role="img" aria-label="受注進捗ガントチャート">
                  {flat.map((f, i) =>
                    i % 2 === 1 ? (
                      <rect
                        key={`bg-${f.key}`}
                        x={0}
                        y={TOP_AXIS_H + f.y}
                        width={chartWidth}
                        height={f.h}
                        className="gantt__row-bg"
                      />
                    ) : null,
                  )}

                  {ticks.map((d) => (
                    <g key={`grid-${d}`}>
                      <line
                        x1={xOfDay(d)}
                        y1={TOP_AXIS_H}
                        x2={xOfDay(d)}
                        y2={chartHeight}
                        className="gantt__grid-line"
                      />
                      <text x={xOfDay(d)} y={TOP_AXIS_H - 8} className="gantt__grid-label">
                        D+{d}
                      </text>
                    </g>
                  ))}

                  {flat.map((f) => (
                    <GanttBarMarks
                      key={f.key}
                      task={f.task}
                      y={TOP_AXIS_H + f.y}
                      h={f.h}
                      xOfDay={xOfDay}
                      isSummary={f.isSummary}
                      today={state.day}
                    />
                  ))}

                  <line
                    x1={xOfDay(state.day)}
                    y1={0}
                    x2={xOfDay(state.day)}
                    y2={chartHeight}
                    className="gantt__today-line"
                  />
                </svg>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}

export default GanttChartPanel;
