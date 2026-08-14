import { useLayoutEffect, useReducer, useState } from "react";
import AlertBar from "./components/AlertBar";
import BurgerMenu from "./components/BurgerMenu";
import ClockControls from "./components/ClockControls";
import EventLogPanel from "./components/EventLogPanel";
import InventoryPanel from "./components/InventoryPanel";
import KpiDashboard from "./components/KpiDashboard";
import MasterDataPage from "./components/MasterDataPage";
import PeggingTracePanel from "./components/PeggingTracePanel";
import PlanningPanel from "./components/PlanningPanel";
import ProcessFlowDiagram from "./components/ProcessFlowDiagram";
import ProcurementPanel from "./components/ProcurementPanel";
import ProductionPanel from "./components/ProductionPanel";
import SalesOrderPanel from "./components/SalesOrderPanel";
import ShipmentPanel from "./components/ShipmentPanel";
import { createInitialState, simulationReducer } from "./domain/reducer";
import { loadStoredTheme, storeTheme } from "./theme";

// ドメイン画面のタブ一覧。design.md §5の順序どおり実装済みのものから順に追加してきた（Phase 5a〜5g完了）。
const TABS = [
  { id: "sales-order", label: "受注", Component: SalesOrderPanel },
  { id: "planning", label: "計画", Component: PlanningPanel },
  { id: "procurement", label: "発注", Component: ProcurementPanel },
  { id: "production", label: "工程", Component: ProductionPanel },
  { id: "inventory", label: "在庫", Component: InventoryPanel },
  { id: "shipment", label: "出荷", Component: ShipmentPanel },
  { id: "master-data", label: "マスタ", Component: MasterDataPage },
  { id: "kpi", label: "KPI", Component: KpiDashboard },
  { id: "pegging", label: "ペギング追跡", Component: PeggingTracePanel },
  { id: "process-flow", label: "プロセス連携図", Component: ProcessFlowDiagram },
] as const;

function App() {
  const [state, dispatch] = useReducer(simulationReducer, undefined, createInitialState);
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]["id"]>(TABS[0].id);
  const [themeId, setThemeId] = useState<string>(() => loadStoredTheme());

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = themeId;
    storeTheme(themeId);
  }, [themeId]);

  const ActiveComponent = TABS.find((t) => t.id === activeTab)?.Component ?? TABS[0].Component;

  return (
    <div className="app">
      <BurgerMenu themeId={themeId} onSelectTheme={setThemeId} />
      <header className="app__header">
        <h1>生産管理ミニマムシミュレーター</h1>
      </header>
      <AlertBar state={state} />
      <nav className="app__tabs">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={tab.id === activeTab ? "app__tab app__tab--active" : "app__tab"}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>
      <main className="app__main">
        <ActiveComponent state={state} dispatch={dispatch} />
      </main>
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
