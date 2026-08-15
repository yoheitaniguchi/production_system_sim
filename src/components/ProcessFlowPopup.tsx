// プロセス連携図をポップアップ表示するための軽量ラッパー。各タブを操作しながら参照できるよう、
// タブ切り替えでアンマウントされないApp直下に置き、固定位置のフローティングパネルとして重ねて表示する
// （背景を暗転させる全画面バックドロップは持たない＝他タブの操作をブロックしない）。
// ヘッダー部分をドラッグして好きな位置へ動かせる（他タブの操作対象を隠さないようにするため）。
import { useEffect, useRef, useState } from "react";
import type { SimulationState } from "../types";
import ProcessFlowDiagram from "./ProcessFlowDiagram";

interface ProcessFlowPopupProps {
  state: SimulationState;
  onClose: () => void;
}

interface DragState {
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
}

function ProcessFlowPopup({ state, onClose }: ProcessFlowPopupProps) {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<DragState | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const handleHeaderPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, originX: offset.x, originY: offset.y };
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
  };

  const handleHeaderPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    setOffset({ x: drag.originX + (e.clientX - drag.startX), y: drag.originY + (e.clientY - drag.startY) });
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === e.pointerId) {
      dragRef.current = null;
      setDragging(false);
    }
  };

  return (
    <div
      className="process-flow-popup"
      style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}
      role="dialog"
      aria-label="プロセス連携図（ポップアップ）"
    >
      <div
        className={
          dragging ? "process-flow-popup__header process-flow-popup__header--dragging" : "process-flow-popup__header"
        }
        onPointerDown={handleHeaderPointerDown}
        onPointerMove={handleHeaderPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <span className="process-flow-popup__title">プロセス連携図</span>
        <button
          type="button"
          className="process-flow-popup__close"
          aria-label="プロセス連携図を閉じる"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onClose}
        >
          ×
        </button>
      </div>
      <div className="process-flow-popup__body">
        <ProcessFlowDiagram state={state} />
      </div>
    </div>
  );
}

export default ProcessFlowPopup;
