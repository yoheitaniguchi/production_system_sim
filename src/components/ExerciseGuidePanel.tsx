// 演習ガイド（v5-spec.md §8.1 D3、design.md DEV-4・EXT-17・EXT-43）
import { computeGuideProgress, computeGuideSummary, currentGuideStep, type GuideStepStatus } from "../domain/exerciseGuide";
import type { SimulationState } from "../types";

interface ExerciseGuidePanelProps {
  state: SimulationState;
}

const STATUS_LABELS: Record<GuideStepStatus, string> = {
  done: "✓",
  pending: "—",
  notApplicable: "該当なし",
};

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

      {/* ステップの判定・文言は現在のマスタから組み立てる（design.md EXT-43）。該当する品目が無いステップは「該当なし」 */}
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
        <div className="guide__summary">
          <h3>演習完了レポート</h3>
          <table className="panel__table">
            <thead>
              <tr>
                <th>項目</th>
                <th>値</th>
                <th>算出方法</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>所要日数</td>
                <td>{summary.durationDays}日</td>
                <td>受注登録（イベントログ開始日）から完了時点までの日数</td>
              </tr>
              <tr>
                <td>発生した警告件数（延べ）</td>
                <td>{summary.totalAlertCount}件</td>
                <td>
                  日程遅延・未充足需要・マスタ不整合・能力超過の警告件数を日次で合算（同一警告が複数日続くと
                  日数分カウントされる簡略集計）
                </td>
              </tr>
              <tr>
                <td>納期遵守率</td>
                <td>{formatPercent(summary.kpiHighlights.deliveryComplianceRate)}</td>
                <td>実出荷日 ≤ 回答納期</td>
              </tr>
              <tr>
                <td>計画達成率</td>
                <td>{formatPercent(summary.kpiHighlights.planAchievementRate)}</td>
                <td>良品数 ÷ 計画数（両方）</td>
              </tr>
              <tr>
                <td>直行率</td>
                <td>{formatPercent(summary.kpiHighlights.firstPassYieldRate)}</td>
                <td>良品数 ÷ 投入数</td>
              </tr>
              <tr>
                <td>在庫回転</td>
                <td>{formatRatio(summary.kpiHighlights.inventoryTurnover)}</td>
                <td>出庫数量 ÷ 現在庫（EXT-13）</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <h3>ステップ一覧</h3>
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
              <td>{STATUS_LABELS[step.status]}</td>
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
