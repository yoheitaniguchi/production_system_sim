// 受注〜出荷プロセス連携図（BPMN風。design.md §5「（付加価値）プロセス連携図」）
import {
  computeActiveFlows,
  DOMAIN_LABELS,
  FLOWS,
  type DomainId,
  type FlowDef,
} from "../domain/processFlow";
import type { SimulationState } from "../types";

interface ProcessFlowDiagramProps {
  state: SimulationState;
}

const BOX_W = 150;
const BOX_H = 60;

// v5-spec.md §2.1のドメイン関係図（受注/出荷が約束レイヤ、計画が変換レイヤ、発注/工程が実行レイヤ、
// 在庫が事実レイヤ）の縦の並びを踏襲しつつ、SVG上で見やすいよう横方向にも展開した配置
const NODES: Record<DomainId, { cx: number; cy: number }> = {
  salesOrder: { cx: 140, cy: 70 },
  planning: { cx: 460, cy: 70 },
  procurement: { cx: 780, cy: 70 },
  production: { cx: 1100, cy: 70 },
  master: { cx: 140, cy: 300 },
  inventory: { cx: 460, cy: 300 },
  shipment: { cx: 780, cy: 300 },
};

// 同じ2ノード間を逆方向にも結ぶ流れ（計画⇄発注、計画⇄工程、受注⇄出荷）に個別の曲げ量を与え、線が重ならないようにする
const CURVE_OFFSET: Record<string, number> = {
  "planning-procurement": -22,
  "procurement-planning": 22,
  "planning-production": -22,
  "production-planning": 22,
  "salesOrder-shipment": -140,
  "shipment-salesOrder": 140,
};

const LABEL_OFFSET: Record<string, number> = {
  "planning-procurement": -14,
  "procurement-planning": 16,
  "planning-production": -14,
  "production-planning": 16,
  "salesOrder-shipment": -16,
  "shipment-salesOrder": 16,
};

function controlPoint(x1: number, y1: number, x2: number, y2: number, offset: number) {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const px = -dy / len;
  const py = dx / len;
  return { x: mx + px * offset, y: my + py * offset };
}

/** 中心座標から見て方向(dirX, dirY)にある矩形の境界上の点を求める（矢印を箱の縁で止めるため） */
function clipToBox(cx: number, cy: number, dirX: number, dirY: number) {
  const hw = BOX_W / 2;
  const hh = BOX_H / 2;
  if (dirX === 0 && dirY === 0) return { x: cx, y: cy };
  const scaleX = dirX !== 0 ? hw / Math.abs(dirX) : Number.POSITIVE_INFINITY;
  const scaleY = dirY !== 0 ? hh / Math.abs(dirY) : Number.POSITIVE_INFINITY;
  const scale = Math.min(scaleX, scaleY);
  return { x: cx + dirX * scale, y: cy + dirY * scale };
}

function quadraticPoint(p0: { x: number; y: number }, c: { x: number; y: number }, p2: { x: number; y: number }, t: number) {
  const x = (1 - t) * (1 - t) * p0.x + 2 * (1 - t) * t * c.x + t * t * p2.x;
  const y = (1 - t) * (1 - t) * p0.y + 2 * (1 - t) * t * c.y + t * t * p2.y;
  return { x, y };
}

interface FlowGeometry {
  flow: FlowDef;
  path: string;
  labelX: number;
  labelY: number;
}

function computeFlowGeometry(flow: FlowDef): FlowGeometry {
  const from = NODES[flow.from];
  const to = NODES[flow.to];

  // A→BとB→Aが対になる流れで曲げ量・ラベル位置を一貫した向きで扱うため、
  // 実際のfrom/toではなくドメインIDの辞書順で固定した「正準方向」を基準に法線を計算する
  const reversed = flow.from > flow.to;
  const canonFrom = reversed ? to : from;
  const canonTo = reversed ? from : to;

  const offset = CURVE_OFFSET[flow.id] ?? 0;
  const control = controlPoint(canonFrom.cx, canonFrom.cy, canonTo.cx, canonTo.cy, offset);

  const start = clipToBox(from.cx, from.cy, control.x - from.cx, control.y - from.cy);
  const end = clipToBox(to.cx, to.cy, control.x - to.cx, control.y - to.cy);
  const path = `M ${start.x} ${start.y} Q ${control.x} ${control.y} ${end.x} ${end.y}`;

  const labelOffset = LABEL_OFFSET[flow.id] ?? 0;
  const mid = quadraticPoint(start, control, end, 0.5);
  const dx = canonTo.cx - canonFrom.cx;
  const dy = canonTo.cy - canonFrom.cy;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;

  return { flow, path, labelX: mid.x + nx * labelOffset, labelY: mid.y + ny * labelOffset };
}

function ProcessFlowDiagram({ state }: ProcessFlowDiagramProps) {
  const { lastMessage, flowIds, activeDomains } = computeActiveFlows(state);
  const geometries = FLOWS.map(computeFlowGeometry);
  const activeFlowDefs = FLOWS.filter((f) => flowIds.has(f.id));

  return (
    <div className="panel">
      <h2>プロセス連携図</h2>
      <p className="panel__hint">
        受注・計画・発注・工程・在庫・出荷・マスタの7ドメインをプールとして表し、ドメイン間を結ぶ矢印が
        「どちらからどちらへモノ・データが流れるか」を表す。マスタから他ドメインへの点線は常時表示の前提関係。
        アクセント色の実線は、直前の操作で実際に動いた流れ。
      </p>

      <div className="process-flow-canvas">
        <svg
          viewBox="-20 -10 1300 420"
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label="受注から出荷までのドメイン間のプロセス連携図"
        >
          <defs>
            <marker id="pf-end-active" markerWidth={12} markerHeight={12} refX={8} refY={5} orient="auto-start-reverse">
              <path d="M1,1 L9,5 L1,9" fill="none" stroke="var(--pf-active)" strokeWidth={1.6} />
            </marker>
            <marker id="pf-end-idle" markerWidth={12} markerHeight={12} refX={8} refY={5} orient="auto-start-reverse">
              <path d="M1,1 L9,5 L1,9" fill="none" stroke="var(--pf-idle)" strokeWidth={1.6} />
            </marker>
          </defs>

          {geometries.map(({ flow, path, labelX, labelY }) => {
            const active = flowIds.has(flow.id);
            const stroke = active ? "var(--pf-active)" : "var(--pf-idle)";
            return (
              <g key={flow.id}>
                <path
                  d={path}
                  fill="none"
                  stroke={stroke}
                  strokeWidth={active ? 2.2 : flow.static ? 1 : 1.3}
                  strokeDasharray={active ? "0" : flow.static ? "3 3" : "5 4"}
                  markerEnd={`url(#${active ? "pf-end-active" : "pf-end-idle"})`}
                  opacity={flow.static && !active ? 0.5 : active ? 1 : 0.8}
                />
                {!flow.static && (
                  <>
                    <rect
                      x={labelX - flow.label.length * 5.3 - 4}
                      y={labelY - 9}
                      width={flow.label.length * 10.6 + 8}
                      height={14}
                      fill="var(--pf-label-bg)"
                      opacity={0.9}
                    />
                    <text
                      x={labelX}
                      y={labelY + 1}
                      fontSize={10.5}
                      textAnchor="middle"
                      fill={active ? "var(--pf-active)" : "var(--pf-idle-text)"}
                      fontWeight={active ? 600 : 400}
                    >
                      {flow.label}
                    </text>
                  </>
                )}
              </g>
            );
          })}

          {(Object.keys(NODES) as DomainId[]).map((id) => {
            const { cx, cy } = NODES[id];
            const active = activeDomains.has(id);
            return (
              <g key={id}>
                <rect
                  x={cx - BOX_W / 2}
                  y={cy - BOX_H / 2}
                  width={BOX_W}
                  height={BOX_H}
                  rx={10}
                  fill={active ? "var(--pf-active-fill)" : "var(--pf-node-fill)"}
                  stroke={active ? "var(--pf-active)" : "var(--pf-idle)"}
                  strokeWidth={active ? 2.4 : 1.5}
                />
                <text x={cx} y={cy + 5} textAnchor="middle" fontSize={15} fontWeight={700} fill="var(--pf-text)">
                  {DOMAIN_LABELS[id]}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <p className="process-flow-legend">
        実線＋アクセント色：直前の操作で動いた流れ／点線：現在動きのない流れ／マスタからの点線：常時表示の前提関係
      </p>

      <div className="process-flow-today">
        <h3>直前の操作で動いたモノ・データ</h3>
        {lastMessage === null ? (
          <p className="panel__empty">まだ操作していません。</p>
        ) : activeFlowDefs.length === 0 ? (
          <p className="panel__empty">「{lastMessage}」では、ドメイン間で動いたモノ・データはありませんでした。</p>
        ) : (
          <ul className="process-flow-today__list">
            {activeFlowDefs.map((flow) => (
              <li key={flow.id}>
                {DOMAIN_LABELS[flow.from]} → {DOMAIN_LABELS[flow.to]}：{flow.label}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default ProcessFlowDiagram;
