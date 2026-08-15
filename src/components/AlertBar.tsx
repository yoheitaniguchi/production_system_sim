// 警告バー（design.md §5：日程整合警告・未充足需要・マスタ健全性。常時再計算、専用ボタン無し）
//
// マスタが自由に編集できるようになったため、日程・需要と並べて「マスタ自体の不整合」も出す
// （design.md EXT-22）。工順ゼロの内製品目のように、放置すると製造オーダが完了できなくなる
// 種類の不整合を、操作の前に気付けるようにするのが狙い。
//
// 各警告は「読むだけ」で終わらせず、TodayActionsBarと同様に解消先のタブへ遷移できるボタンを添える
// （マスタ不整合→マスタタブ、日程遅延・未充足需要→MRP再実行のある計画タブ）。
import { validateMaster } from "../domain/masterIntegrity";
import { checkSchedule, unmetDemand } from "../domain/schedule";
import type { SimulationState } from "../types";

type AlertNavigateTarget = "planning" | "master-data";

interface AlertBarProps {
  state: SimulationState;
  onNavigate: (target: AlertNavigateTarget) => void;
}

function AlertBar({ state, onNavigate }: AlertBarProps) {
  const alerts = checkSchedule(state);
  const unmet = unmetDemand(state);
  const masterIssues = validateMaster(state);

  if (alerts.length === 0 && unmet.length === 0 && masterIssues.length === 0) {
    return <div className="alert-bar alert-bar--ok">警告なし</div>;
  }

  const itemName = (itemId: string) => state.items.find((i) => i.itemId === itemId)?.name ?? itemId;

  return (
    <div className="alert-bar alert-bar--warn">
      {masterIssues.map((issue, i) => (
        <div key={`master-${issue.subject}-${i}`} className="alert-bar__item">
          <span>
            マスタ{issue.level}：{issue.subject} — {issue.message}
          </span>
          <button type="button" className="alert-bar__link" onClick={() => onNavigate("master-data")}>
            マスタタブで確認
          </button>
        </div>
      ))}
      {alerts.map((alert) => (
        <div key={`${alert.source}-${alert.target}`} className="alert-bar__item">
          <span>
            日程遅延：{alert.source} の到着が {alert.target} の着手日に {alert.delayDays} 日遅れる見込み（影響を受ける受注：
            {alert.affectedSoLine}）
          </span>
          <button type="button" className="alert-bar__link" onClick={() => onNavigate("planning")}>
            計画タブで確認
          </button>
        </div>
      ))}
      {unmet.map((u) => (
        <div key={u.itemId} className="alert-bar__item">
          <span>
            未充足需要：{itemName(u.itemId)} が {u.shortage} 個不足しています。MRPの再実行が必要です
          </span>
          <button type="button" className="alert-bar__link" onClick={() => onNavigate("planning")}>
            計画タブでMRPを実行
          </button>
        </div>
      ))}
    </div>
  );
}

export default AlertBar;
