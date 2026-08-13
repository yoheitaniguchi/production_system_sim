// 警告バー（design.md §5：日程整合警告・未充足需要。常時再計算、専用ボタン無し）
import { checkSchedule, unmetDemand } from "../domain/schedule";
import type { SimulationState } from "../types";

interface AlertBarProps {
  state: SimulationState;
}

function AlertBar({ state }: AlertBarProps) {
  const alerts = checkSchedule(state);
  const unmet = unmetDemand(state);

  if (alerts.length === 0 && unmet.length === 0) {
    return <div className="alert-bar alert-bar--ok">警告なし</div>;
  }

  const itemName = (itemId: string) => state.items.find((i) => i.itemId === itemId)?.name ?? itemId;

  return (
    <div className="alert-bar alert-bar--warn">
      {alerts.map((alert) => (
        <div key={`${alert.source}-${alert.target}`} className="alert-bar__item">
          日程遅延：{alert.source} の到着が {alert.target} の着手日に {alert.delayDays} 日遅れる見込み（影響を受ける受注：
          {alert.affectedSoLine}）
        </div>
      ))}
      {unmet.map((u) => (
        <div key={u.itemId} className="alert-bar__item">
          未充足需要：{itemName(u.itemId)} が {u.shortage} 個不足しています。MRPの再実行が必要です
        </div>
      ))}
    </div>
  );
}

export default AlertBar;
