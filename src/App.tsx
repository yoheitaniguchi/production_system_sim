import { useReducer } from "react";
import AlertBar from "./components/AlertBar";
import ClockControls from "./components/ClockControls";
import EventLogPanel from "./components/EventLogPanel";
import { createInitialState, simulationReducer } from "./domain/reducer";

// Phase 5a：共通シェル（時計操作・警告バー・データ増分ログ）のみ。
// 7ドメイン画面・分析画面・プロセス連携図はPhase 5b以降でタブとして追加する。
function App() {
  const [state, dispatch] = useReducer(simulationReducer, undefined, createInitialState);

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
      <main className="app__main">
        <p className="app__placeholder">
          ドメイン画面（受注・計画・発注・工程・在庫・出荷・マスタ）と分析画面は Phase 5b 以降で追加する。
        </p>
      </main>
      <EventLogPanel entries={state.eventLog} />
    </div>
  );
}

export default App;
