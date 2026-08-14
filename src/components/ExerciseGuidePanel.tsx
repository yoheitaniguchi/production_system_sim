// 演習ガイド（v5-spec.md §8.1 D3、design.md DEV-4・EXT-17）
import { computeGuideProgress, currentGuideStep, isPresetMaster } from "../domain/exerciseGuide";
import type { SimulationState } from "../types";

interface ExerciseGuidePanelProps {
  state: SimulationState;
}

function ExerciseGuidePanel({ state }: ExerciseGuidePanelProps) {
  const steps = computeGuideProgress(state);
  const current = currentGuideStep(state);

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
