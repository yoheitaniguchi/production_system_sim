// 本日実行可能な操作のハイライト（design.md DEV-2：自動再生機能の代わりの軽量な代替案）
import { computeTodayActions, type TodayActionDomain } from "../domain/todayActions";
import type { SimulationState } from "../types";

interface TodayActionsBarProps {
  state: SimulationState;
  onNavigate: (domain: TodayActionDomain) => void;
}

function TodayActionsBar({ state, onNavigate }: TodayActionsBarProps) {
  const actions = computeTodayActions(state);

  if (actions.length === 0) {
    return (
      <div className="today-actions today-actions--empty">
        本日実行可能な操作はありません。受注登録や日を進めるなどの操作をしてください。
      </div>
    );
  }

  return (
    <div className="today-actions">
      <span className="today-actions__label">本日実行可能な操作：</span>
      {actions.map((action) => (
        <button
          key={`${action.domain}-${action.label}`}
          type="button"
          className="today-actions__item"
          onClick={() => onNavigate(action.domain)}
        >
          {action.label}（{action.count}）
        </button>
      ))}
    </div>
  );
}

export default TodayActionsBar;
