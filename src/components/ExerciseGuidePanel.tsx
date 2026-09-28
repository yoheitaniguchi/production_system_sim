// 演習ガイド（v5-spec.md §8.1 D3、design.md DEV-4・EXT-17）
import { computeGuideProgress, computeGuideSummary, currentGuideStep, isPresetMaster } from "../domain/exerciseGuide";
import type { SimulationState } from "../types";

interface ExerciseGuidePanelProps {
  state: SimulationState;
}

function formatPercent(value: number | null): string {
  return value != null ? `${(value * 100).toFixed(1)}%` : "—";
}

function formatRatio(value: number | null): string {
  return value != null ? value.toFixed(2) : "—";
}

function ExerciseGuidePanel({ state }: ExerciseGuidePanelProps) {
  const steps = computeGuideProgress(state);
  const current = currentGuideStep(state);
  const summary = current === null ? computeGuideSummary(state) : null;

  return (
    <div className="panel">
      <h2>演習ガイド</h2>

      {/* 本ガイドはv5-spec.md §9の木製イスシナリオ専用の判定を持つ（design.md EXT-27） */}
      {isPresetMaster(state) ? null : (
        <div className="guide__current">
          現在のマスタは演習用プリセット（木製イス）と異なるため、以下のステップ判定は成立しません。
          マスタタブの「既定プリセットに戻す」で復元できます。
        </div>
      )}

      {current ? (
        <div className="guide__current">
          <strong>
            次にやること：{current.tc} {current.title}
          </strong>
          <p>{current.instruction}</p>
          <p className="guide__expected">期待結果：{current.expected}</p>
        </div>
      ) : (
        <div className="guide__current guide__current--done">
          全ステップ（TC-01〜TC-18）が完了しました。お疲れさまでした。
        </div>
      )}

      {summary && (
        <>
          <h3>演習完了レポート</h3>
          <table className="panel__table">
            <thead>
              <tr>
                <th>項目</th>
                <th>値</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>所要日数</td>
                <td>{summary.durationDays}日</td>
              </tr>
              <tr>
                <td>発生した警告件数（延べ）</td>
                <td>{summary.totalAlertCount}件</td>
              </tr>
              <tr>
                <td>納期遵守率</td>
                <td>{formatPercent(summary.kpiHighlights.deliveryComplianceRate)}</td>
              </tr>
              <tr>
                <td>計画達成率</td>
                <td>{formatPercent(summary.kpiHighlights.planAchievementRate)}</td>
              </tr>
              <tr>
                <td>直行率</td>
                <td>{formatPercent(summary.kpiHighlights.firstPassYieldRate)}</td>
              </tr>
              <tr>
                <td>在庫回転</td>
                <td>{formatRatio(summary.kpiHighlights.inventoryTurnover)}</td>
              </tr>
            </tbody>
          </table>
        </>
      )}

      <table className="panel__table">
        <thead>
          <tr>
            <th>状態</th>
            <th>TC</th>
            <th>ステップ</th>
            <th>操作方法</th>
            <th>期待結果</th>
          </tr>
        </thead>
        <tbody>
          {steps.map((step) => (
            <tr key={step.tc} className={step.done ? "guide__row--done" : undefined}>
              <td>{step.done ? "✓" : "—"}</td>
              <td>{step.tc}</td>
              <td>{step.title}</td>
              <td>{step.instruction}</td>
              <td>{step.expected}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default ExerciseGuidePanel;
