// 能力（山積み）：v5-spec.md §11.1ロードマップ Phase 3（CRP）、design.md §9・EXT-30〜32
//
// 作業区×日で計画負荷・実績負荷・能力を一覧し、超過をハイライトする。有限能力スケジューリング
// （山崩し・自動リスケジュール）は行わない、あくまで可視化のみの画面（design.md §9.2）。
import { downloadCsv, todayDateStamp } from "../csvExport";
import { computeCapacityLoad, computePlannedOrderLoad } from "../domain/capacity";
import type { SimulationState } from "../types";

interface CapacityPanelProps {
  state: SimulationState;
}

function CapacityPanel({ state }: CapacityPanelProps) {
  const load = computeCapacityLoad(state);
  const plannedLoad = computePlannedOrderLoad(state);

  const downloadLoadCsv = () =>
    downloadCsv(
      `capacity_load_${todayDateStamp()}.csv`,
      ["作業区", "日(D+)", "計画負荷(分)", "実績負荷(分)", "能力(分/日)", "判定"],
      load.map((entry) => {
        const overloaded = entry.plannedMin > entry.capacityMin || entry.actualMin > entry.capacityMin;
        const required = Math.max(entry.plannedMin, entry.actualMin);
        return [
          entry.workCenter,
          entry.day,
          entry.plannedMin,
          entry.actualMin,
          entry.capacityMin,
          overloaded ? `超過（${required - entry.capacityMin}分）` : "OK",
        ];
      }),
    );

  return (
    <div className="panel">
      <h2>能力（山積み）</h2>
      <p className="panel__hint">
        作業区ごとに、確定済みの製造オーダ（未着手は計画負荷、着手済みは実績負荷）が1日あたりの稼働能力を
        超えていないかを表示する。超過があっても確定・リリース・着手などの操作は止まらない——判断は人が行う
        （P13・EXT-20と同じ「警告のみ」方針）。稼働日カレンダーは扱わないため、能力は1日あたりの固定値である。
        負荷は「数量×標準時間」に、工順で設定した段取り時間を製造オーダ1件の当該工程につき1回だけ加えた値である
      </p>

      <h3>確定済みの負荷</h3>
      {load.length === 0 ? (
        <p className="panel__empty">
          確定済みの製造オーダはありません。
          {plannedLoad.length > 0
            ? "下の「計画オーダの見込み負荷」で確定前の見込みを確認できます。"
            : "計画オーダを確定してください。"}
        </p>
      ) : (
        <>
          <div className="panel__toolbar">
            <button type="button" aria-label="山積み表をCSVでエクスポート" onClick={downloadLoadCsv}>
              CSVでエクスポート
            </button>
          </div>
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
        </>
      )}

      {plannedLoad.length > 0 && (
        <div className="capacity-panel__preview">
          <h3>計画オーダの見込み負荷（確定前プレビュー）</h3>
          <p className="panel__hint">
            まだ確定していない計画オーダ（PLANNED_ORDER）による見込み負荷。計画オーダを確定すると
            上の確定済み負荷の表へ移る。ここで超過が見えても計画オーダの確定は止まらない
            （警告のみ。P13・EXT-20・EXT-31と同じ方針）
          </p>
          <table className="panel__table">
            <thead>
              <tr>
                <th>作業区</th>
                <th>日</th>
                <th>見込み負荷（分）</th>
                <th>能力（分/日）</th>
                <th>判定</th>
              </tr>
            </thead>
            <tbody>
              {plannedLoad.map((entry) => {
                const overloaded = entry.previewMin > entry.capacityMin;
                return (
                  <tr
                    key={`${entry.workCenter}-${entry.day}`}
                    className={overloaded ? "capacity-panel__row--overload" : undefined}
                  >
                    <td>{entry.workCenter}</td>
                    <td>D+{entry.day}</td>
                    <td>{entry.previewMin}</td>
                    <td>{entry.capacityMin}</td>
                    <td>{overloaded ? `超過見込み（${entry.previewMin - entry.capacityMin}分）` : "OK"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default CapacityPanel;
