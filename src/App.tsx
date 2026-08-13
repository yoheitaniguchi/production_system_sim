import { useReducer, useState } from "react";
import AlertBar from "./components/AlertBar";
import ClockControls from "./components/ClockControls";
import EventLogPanel from "./components/EventLogPanel";
import InventoryPanel from "./components/InventoryPanel";
import MasterDataPage from "./components/MasterDataPage";
import PlanningPanel from "./components/PlanningPanel";
import ProcurementPanel from "./components/ProcurementPanel";
import ProductionPanel from "./components/ProductionPanel";
import SalesOrderPanel from "./components/SalesOrderPanel";
import ShipmentPanel from "./components/ShipmentPanel";
import { createInitialState, simulationReducer } from "./domain/reducer";

// ドメイン画面のタブ一覧。design.md §5の順序どおり、実装済みのものから順に追加していく
// （Phase 5f以降で分析画面・プロセス連携図を追加する）。
const TABS = [
  { id: "sales-order", label: "受注", Component: SalesOrderPanel },
  { id: "planning", label: "計画", Component: PlanningPanel },
  { id: "procurement", label: "発注", Component: ProcurementPanel },
  { id: "production", label: "工程", Component: ProductionPanel },
  { id: "inventory", label: "在庫", Component: InventoryPanel },
  { id: "shipment", label: "出荷", Component: ShipmentPanel },
  { id: "master-data", label: "マスタ", Component: MasterDataPage },
] as const;

function App() {
  const [state, dispatch] = useReducer(simulationReducer, undefined, createInitialState);
  const [activeTab, setActiveTab] = useState<(typeof TABS)[number]["id"]>(TABS[0].id);

  const ActiveComponent = TABS.find((t) => t.id === activeTab)?.Component ?? TABS[0].Component;

  return (
    <div className="app">
      <header className="app__header">
        <h1>生産管理ミニマムシミュレーター</h1>
        <ClockControls
          day={state.day}
          onAdvanceDay={() => dispatch({ type: "ADVANCE_DAY" })}
          onReset={() => dispatch({ type: "RESET" })}
        />
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
    </div>
  );
}

export default App;
