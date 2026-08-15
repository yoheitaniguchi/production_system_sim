// ロット追跡（v5-spec.md §11.3 Phase 2-B：後方追跡・前方追跡）
//
// ペギング追跡（PeggingTracePanel、計画上の意図）とは別レイヤの、実際の消費・生成の事実を辿る画面。
import { useState } from "react";
import { traceBackward, traceForward } from "../domain/lot";
import type { SimulationState } from "../types";

interface LotTracePanelProps {
  state: SimulationState;
}

function LotTracePanel({ state }: LotTracePanelProps) {
  const [selectedLotNo, setSelectedLotNo] = useState("");

  const itemName = (id: string) => state.items.find((i) => i.itemId === id)?.name ?? id;

  const options = [...state.lots].sort(
    (a, b) => a.createdDay - b.createdDay || a.lotNo.localeCompare(b.lotNo),
  );

  const selectedLot = state.lots.find((l) => l.lotNo === selectedLotNo);
  const backward = selectedLotNo ? traceBackward(state, selectedLotNo) : [];
  const forward = selectedLotNo ? traceForward(state, selectedLotNo) : [];

  const selectedIndex = options.findIndex((lot) => lot.lotNo === selectedLotNo);
  const goToOffset = (offset: number) => {
    if (options.length === 0) return;
    const baseIndex = selectedIndex === -1 ? 0 : selectedIndex;
    const nextIndex = baseIndex + offset;
    if (nextIndex < 0 || nextIndex >= options.length) return;
    setSelectedLotNo(options[nextIndex].lotNo);
  };
  const hasPrev = selectedIndex > 0;
  const hasNext = selectedIndex !== -1 && selectedIndex < options.length - 1;

  return (
    <div className="panel">
      <h2>ロット追跡</h2>
      <p className="panel__hint">
        ロットを選ぶと、実際に何を消費して作られたか（後方追跡）と、そのロットが何に使われたか（前方追跡）を
        実績のトランザクションから辿って表示する。ペギング追跡（計画上のつながり）とは別に、実際の消費・生成の事実を確認できる。
      </p>

      <form className="panel__form" onSubmit={(e) => e.preventDefault()}>
        <label>
          ロット
          <select value={selectedLotNo} onChange={(e) => setSelectedLotNo(e.target.value)}>
            <option value="">選択してください</option>
            {options.map((lot) => (
              <option key={lot.lotNo} value={lot.lotNo}>
                {lot.lotNo}（{itemName(lot.itemId)} 残{lot.qty} / 起票元{lot.sourceRef} / D+{lot.createdDay}）
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={() => goToOffset(-1)} disabled={!hasPrev}>
          前のロット
        </button>
        <button type="button" onClick={() => goToOffset(1)} disabled={!hasNext}>
          次のロット
        </button>
      </form>

      {selectedLot ? (
        <>
          <h3>後方追跡：このロットは何を使ったか</h3>
          {backward.length === 0 ? (
            <p className="panel__empty">これより上流のロットはありません（購入品の入荷ロット、または未消費）。</p>
          ) : (
            <ul className="pegging-tree">
              {backward.map((hop) => (
                <li key={`${hop.genealogy.parentLot}-${hop.genealogy.childLot}`}>
                  {hop.lot ? `${hop.lot.lotNo}（${itemName(hop.lot.itemId)}）` : hop.genealogy.parentLot} を{" "}
                  {hop.genealogy.consumedQty} 個消費（{hop.genealogy.moNo}）
                </li>
              ))}
            </ul>
          )}

          <h3>前方追跡：このロットはどの製品になったか</h3>
          {forward.length === 0 ? (
            <p className="panel__empty">これより下流のロットはありません（未消費、または最終製品）。</p>
          ) : (
            <ul className="pegging-tree">
              {forward.map((hop) => (
                <li key={`${hop.genealogy.parentLot}-${hop.genealogy.childLot}`}>
                  {hop.genealogy.moNo} で {hop.genealogy.consumedQty} 個消費され、{" "}
                  {hop.lot ? `${hop.lot.lotNo}（${itemName(hop.lot.itemId)}）` : hop.genealogy.childLot} になった
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <p className="panel__empty">ロットを選択してください。</p>
      )}
    </div>
  );
}

export default LotTracePanel;
