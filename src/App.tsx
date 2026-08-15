import { useLayoutEffect, useReducer, useState } from "react";
import AlertBar from "./components/AlertBar";
import BurgerMenu from "./components/BurgerMenu";
import ClockControls from "./components/ClockControls";
import CostPanel from "./components/CostPanel";
import EventLogPanel from "./components/EventLogPanel";
import ExerciseGuidePanel from "./components/ExerciseGuidePanel";
import GanttChartPanel from "./components/GanttChartPanel";
import InventoryPanel from "./components/InventoryPanel";
import KpiDashboard from "./components/KpiDashboard";
import LotTracePanel from "./components/LotTracePanel";
import MasterDataPage from "./components/MasterDataPage";
import PeggingTracePanel from "./components/PeggingTracePanel";
import PlanningPanel from "./components/PlanningPanel";
import ProcessFlowPopup from "./components/ProcessFlowPopup";
import ProcurementPanel from "./components/ProcurementPanel";
import ProductionPanel from "./components/ProductionPanel";
import SalesOrderPanel from "./components/SalesOrderPanel";
import ShipmentPanel from "./components/ShipmentPanel";
import TodayActionsBar from "./components/TodayActionsBar";
import { computeTodayActions } from "./domain/todayActions";
import { createInitialState, simulationReducer } from "./domain/reducer";
import { loadStoredTheme, storeTheme } from "./theme";

// ドメイン画面のタブ一覧。design.md §5の順序どおり実装済みのものから順に追加してきた（Phase 5a〜5g完了）。
// プロセス連携図は他タブを操作しながら参照できるよう、タブ切り替えではなくポップアップ表示に分離している
// （下のapp__tabs内で個別にトグルボタンとして扱う）。
const TABS = [
  { id: "sales-order", label: "受注", Component: SalesOrderPanel },
  { id: "planning", label: "計画", Component: PlanningPanel },
  { id: "procurement", label: "発注", Component: ProcurementPanel },
  { id: "production", label: "工程", Component: ProductionPanel },
  { id: "inventory", label: "在庫", Component: InventoryPanel },
  { id: "shipment", label: "出荷", Component: ShipmentPanel },
  { id: "master-data", label: "マスタ", Component: MasterDataPage },
  { id: "kpi", label: "KPI", Component: KpiDashboard },
  { id: "cost", label: "原価", Component: CostPanel },
  { id: "pegging", label: "引当元追跡", Component: PeggingTracePanel },
  { id: "lot-trace", label: "ロット追跡", Component: LotTracePanel },
  { id: "gantt", label: "進捗ガント", Component: GanttChartPanel },
  { id: "exercise-guide", label: "演習ガイド", Component: ExerciseGuidePanel },
] as const;

function App() {
  const [state, dispatch] = useReducer(simulationReducer, undefined, createInitialState);
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]["id"]>(TABS[0].id);
  const [themeId, setThemeId] = useState<string>(() => loadStoredTheme());
  const [flowPopupOpen, setFlowPopupOpen] = useState(false);

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = themeId;
    storeTheme(themeId);
  }, [themeId]);

  const ActiveComponent = TABS.find((t) => t.id === activeTab)?.Component ?? TABS[0].Component;

  const countByTab = computeTodayActions(state).reduce<Record<string, number>>((acc, action) => {
    acc[action.domain] = (acc[action.domain] ?? 0) + action.count;
    return acc;
  }, {});

  return (
    <div className="app">
      <BurgerMenu themeId={themeId} onSelectTheme={setThemeId} />
      <header className="app__header">
        <h1>生産管理ミニマムシミュレーター</h1>
      </header>
      <AlertBar state={state} onNavigate={(tabId) => setActiveTab(tabId)} />
      {state.eventLog.length === 0 && activeTab !== "exercise-guide" && (
        <div className="onboarding-hint">
          はじめての方は「演習ガイド」タブで手順を確認しながら進められます。
          <button type="button" className="alert-bar__link" onClick={() => setActiveTab("exercise-guide")}>
            演習ガイドを開く
          </button>
        </div>
      )}
      <TodayActionsBar state={state} onNavigate={(domain) => setActiveTab(domain)} />
      <nav className="app__tabs">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={tab.id === activeTab ? "app__tab app__tab--active" : "app__tab"}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
            {countByTab[tab.id] ? <span className="app__tab-badge">{countByTab[tab.id]}</span> : null}
          </button>
        ))}
        <button
          type="button"
          className={flowPopupOpen ? "app__tab app__tab--active" : "app__tab"}
          aria-pressed={flowPopupOpen}
          onClick={() => setFlowPopupOpen((open) => !open)}
        >
          プロセス連携図
        </button>
      </nav>
      <main className="app__main">
        <ActiveComponent state={state} dispatch={dispatch} />
      </main>
      {flowPopupOpen && <ProcessFlowPopup state={state} onClose={() => setFlowPopupOpen(false)} />}
      <EventLogPanel entries={state.eventLog} />
      <ClockControls
        day={state.day}
        onAdvanceDay={() => dispatch({ type: "ADVANCE_DAY" })}
        onReset={() => dispatch({ type: "RESET" })}
      />
    </div>
  );
}

export default App;
