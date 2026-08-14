// 工程：製造オーダのリリース・工程着手/完了（design.md §5、v5-spec.md §6.3・§6.4・§7.3・UC-12/13/14）
import { useState } from "react";
import type { SimulationAction } from "../domain/reducer";
import type { SimulationState } from "../types";

interface ProductionPanelProps {
  state: SimulationState;
  dispatch: (action: SimulationAction) => void;
}

interface CompleteDraft {
  goodQty: number;
  scrapQty: number;
}

function ProductionPanel({ state, dispatch }: ProductionPanelProps) {
  const [completeDrafts, setCompleteDrafts] = useState<Record<string, CompleteDraft>>({});

  const itemName = (id: string) => state.items.find((i) => i.itemId === id)?.name ?? id;

  const draftKey = (moNo: string, stepNo: number) => `${moNo}-${stepNo}`;

  const draftFor = (moNo: string, stepNo: number, inputQty: number): CompleteDraft =>
    completeDrafts[draftKey(moNo, stepNo)] ?? { goodQty: inputQty, scrapQty: 0 };

  const setDraft = (moNo: string, stepNo: number, patch: Partial<CompleteDraft>, inputQty: number) => {
    setCompleteDrafts((prev) => ({
      ...prev,
      [draftKey(moNo, stepNo)]: { ...draftFor(moNo, stepNo, inputQty), ...patch },
    }));
  };

  return (
    <div className="panel">
      <h2>工程</h2>

      {state.mfgOrders.length === 0 ? (
        <p className="panel__empty">製造オーダはありません。計画オーダを確定してください。</p>
      ) : (
        state.mfgOrders.map((mo) => {
          const steps = state.workInstructions
            .filter((wi) => wi.moNo === mo.moNo)
            .sort((a, b) => a.stepNo - b.stepNo);
          return (
            <div key={mo.moNo} className="panel__group">
              <div className="panel__toolbar">
                <strong>
                  {mo.moNo}（{itemName(mo.itemId)} x{mo.planQty}、ペグ先 {mo.pegTo}、着手日 D+{mo.startDay}、
                  完了予定 D+{mo.dueDay}、状態 {mo.status}）
                </strong>
                {mo.status === "FIRM" && (
                  <button type="button" onClick={() => dispatch({ type: "MFG_RELEASE", payload: { moNo: mo.moNo } })}>
                    リリース
                  </button>
                )}
              </div>

              <table className="panel__table">
                <thead>
                  <tr>
                    <th>工程</th>
                    <th>作業区</th>
                    <th>投入数</th>
                    <th>良品数</th>
                    <th>不良数</th>
                    <th>着手日</th>
                    <th>完了日</th>
                    <th>状態</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {steps.map((wi, idx) => {
                    const draft = draftFor(wi.moNo, wi.stepNo, wi.inputQty);
                    const draftInvalid = draft.goodQty + draft.scrapQty !== wi.inputQty;
                    const prevStep = idx > 0 ? steps[idx - 1] : undefined;
                    const readyToStart = !prevStep || prevStep.status === "DONE";
                    return (
                      <tr key={`${wi.moNo}-${wi.stepNo}`}>
                        <td>{wi.stepNo}</td>
                        <td>{wi.workCenter}</td>
                        <td>{wi.inputQty}</td>
                        <td>{wi.status === "DONE" ? wi.goodQty : "—"}</td>
                        <td>{wi.status === "DONE" ? wi.scrapQty : "—"}</td>
                        <td>{wi.actualStartDay != null ? `D+${wi.actualStartDay}` : "—"}</td>
                        <td>{wi.actualEndDay != null ? `D+${wi.actualEndDay}` : "—"}</td>
                        <td>{wi.status}</td>
                        <td className="panel__actions">
                          {wi.status === "WAIT" && readyToStart && (
                            <button
                              type="button"
                              className="panel__btn--primary"
                              onClick={() =>
                                dispatch({ type: "WI_START", payload: { moNo: wi.moNo, stepNo: wi.stepNo } })
                              }
                            >
                              着手
                            </button>
                          )}
                          {wi.status === "WAIT" && !readyToStart && (
                            <span title={`前工程（工程${prevStep?.stepNo}）が完了するまで着手できません`}>
                              前工程待ち
                            </span>
                          )}
                          {wi.status === "WIP" && (
                            <>
                              <label>
                                良品
                                <input
                                  type="number"
                                  min={0}
                                  className="panel__inline-input"
                                  value={draft.goodQty}
                                  onChange={(e) =>
                                    setDraft(wi.moNo, wi.stepNo, { goodQty: Number(e.target.value) }, wi.inputQty)
                                  }
                                />
                              </label>
                              <label>
                                不良
                                <input
                                  type="number"
                                  min={0}
                                  className="panel__inline-input"
                                  value={draft.scrapQty}
                                  onChange={(e) =>
                                    setDraft(wi.moNo, wi.stepNo, { scrapQty: Number(e.target.value) }, wi.inputQty)
                                  }
                                />
                              </label>
                              <button
                                type="button"
                                className={draftInvalid ? undefined : "panel__btn--primary"}
                                disabled={draftInvalid}
                                title={draftInvalid ? `良品数＋不良数は投入数（${wi.inputQty}）と一致させてください` : undefined}
                                onClick={() =>
                                  dispatch({
                                    type: "WI_COMPLETE",
                                    payload: {
                                      moNo: wi.moNo,
                                      stepNo: wi.stepNo,
                                      goodQty: draft.goodQty,
                                      scrapQty: draft.scrapQty,
                                    },
                                  })
                                }
                              >
                                完了
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        })
      )}
    </div>
  );
}

export default ProductionPanel;
