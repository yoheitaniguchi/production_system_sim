// 能力（山積み）：v5-spec.md §11.1ロードマップ Phase 3（CRP）、design.md §9・EXT-30〜32
//
// 作業区×日で計画負荷・実績負荷・能力を一覧し、超過をハイライトする。有限能力スケジューリング
// （山崩し・自動リスケジュール）は行わない、あくまで可視化のみの画面（design.md §9.2）。
import { computeCapacityLoad } from "../domain/capacity";
import type { SimulationState } from "../types";

interface CapacityPanelProps {
  state: SimulationState;
}

function CapacityPanel({ state }: CapacityPanelProps) {
  const load = computeCapacityLoad(state);

  return (
    <div className="panel">
      <h2>能力（山積み）</h2>
      <p className="panel__hint">
        作業区ごとに、確定済みの製造オーダ（未着手は計画負荷、着手済みは実績負荷）が1日あたりの稼働能力を
        超えていないかを表示する。超過があっても確定・リリース・着手などの操作は止まらない——判断は人が行う
        （P13・EXT-20と同じ「警告のみ」方針）。稼働日カレンダーは扱わないため、能力は1日あたりの固定値である
      </p>

      {load.length === 0 ? (
        <p className="panel__empty">製造オーダはありません。計画オーダを確定してください。</p>
      ) : (
        <table className="panel__table">
          <thead>
            <tr>
              <th>作業区</th>
              <th>日</th>
              <th>計画負荷（分）</th>
              <th>実績負荷（分）</th>
              <th>能力（分/日）</th>
              <th>判定</th>
            </tr>
          </thead>
          <tbody>
            {load.map((entry) => {
              const overloaded = entry.plannedMin > entry.capacityMin || entry.actualMin > entry.capacityMin;
              const required = Math.max(entry.plannedMin, entry.actualMin);
              return (
                <tr key={`${entry.workCenter}-${entry.day}`} className={overloaded ? "capacity-panel__row--overload" : undefined}>
                  <td>{entry.workCenter}</td>
                  <td>D+{entry.day}</td>
                  <td>{entry.plannedMin}</td>
                  <td>{entry.actualMin}</td>
                  <td>{entry.capacityMin}</td>
                  <td>{overloaded ? `超過（${required - entry.capacityMin}分）` : "OK"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default CapacityPanel;
