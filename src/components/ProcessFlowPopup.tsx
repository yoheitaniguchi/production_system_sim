// プロセス連携図をポップアップ表示するための軽量ラッパー。各タブを操作しながら参照できるよう、
// タブ切り替えでアンマウントされないApp直下に置き、固定位置のフローティングパネルとして重ねて表示する
// （背景を暗転させる全画面バックドロップは持たない＝他タブの操作をブロックしない）。
import { useEffect } from "react";
import type { SimulationState } from "../types";
import ProcessFlowDiagram from "./ProcessFlowDiagram";

interface ProcessFlowPopupProps {
  state: SimulationState;
  onClose: () => void;
}

function ProcessFlowPopup({ state, onClose }: ProcessFlowPopupProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="process-flow-popup" role="dialog" aria-label="プロセス連携図（ポップアップ）">
      <button
        type="button"
        className="process-flow-popup__close"
        aria-label="プロセス連携図を閉じる"
        onClick={onClose}
      >
        ×
      </button>
      <div className="process-flow-popup__body">
        <ProcessFlowDiagram state={state} />
      </div>
    </div>
  );
}

export default ProcessFlowPopup;
