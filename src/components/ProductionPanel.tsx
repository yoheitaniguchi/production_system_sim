// 工程：製造オーダのリリース・工程着手/完了（design.md §5、v5-spec.md §6.3・§6.4・§7.3・UC-12/13/14）
import { useState } from "react";
import type { SimulationAction } from "../domain/reducer";
import { MFG_ORDER_STATUS_LABELS, WORK_INSTRUCTION_STATUS_LABELS } from "../statusLabels";
import type { SimulationState } from "../types";

interface ProductionPanelProps {
  state: SimulationState;
  dispatch: (action: SimulationAction) => void;
}

interface CompleteDraft {
  goodQty: number;
  scrapQty: number;
}

interface SplitDraft {
  splitQty: number;
  newStartDay: number;
  newDueDay: number;
}

function ProductionPanel({ state, dispatch }: ProductionPanelProps) {
  const [completeDrafts, setCompleteDrafts] = useState<Record<string, CompleteDraft>>({});
  const [splitDrafts, setSplitDrafts] = useState<Record<string, SplitDraft>>({});

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

  // 能力超過（山積み）を解消するための分割操作（design.md EXT-33）。既定値は「半分を翌日以降へ」
  const splitDraftFor = (mo: SimulationState["mfgOrders"][number]): SplitDraft =>
    splitDrafts[mo.moNo] ?? {
      splitQty: Math.max(1, Math.floor(mo.planQty / 2)),
      newStartDay: mo.startDay + 1,
      newDueDay: mo.dueDay + 1,
    };

  const setSplitDraft = (mo: SimulationState["mfgOrders"][number], patch: Partial<SplitDraft>) => {
    setSplitDrafts((prev) => ({ ...prev, [mo.moNo]: { ...splitDraftFor(mo), ...patch } }));
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
                  {mo.moNo}（{itemName(mo.itemId)} x{mo.planQty}、引当元 {mo.pegTo}、着手日 D+{mo.startDay}、
                  完了予定 D+{mo.dueDay}、状態 {MFG_ORDER_STATUS_LABELS[mo.status]}）
                </strong>
                {mo.status === "FIRM" && (
                  <button
                    type="button"
                    className="panel__btn--primary"
                    onClick={() => dispatch({ type: "MFG_RELEASE", payload: { moNo: mo.moNo } })}
                  >
                    リリース
                  </button>
                )}
              </div>

              {mo.status === "FIRM" && mo.planQty >= 2 && (
                <div className="panel__toolbar" title="能力超過（山積み）の解消などのため、数量を分けて別の着手日へ振り分ける">
                  {(() => {
                    const draft = splitDraftFor(mo);
                    const splitInvalid =
                      !Number.isInteger(draft.splitQty) ||
                      draft.splitQty <= 0 ||
                      draft.splitQty >= mo.planQty ||
                      draft.newDueDay < draft.newStartDay;
                    return (
                      <>
                        <label>
                          分割数量
                          <input
                            type="number"
                            min={1}
                            max={mo.planQty - 1}
                            className="panel__inline-input"
                            value={draft.splitQty}
                            onChange={(e) => setSplitDraft(mo, { splitQty: Number(e.target.value) })}
                          />
                        </label>
                        <label>
                          分割先の着手日 D+
                          <input
                            type="number"
                            min={0}
                            className="panel__inline-input"
                            value={draft.newStartDay}
                            onChange={(e) => setSplitDraft(mo, { newStartDay: Number(e.target.value) })}
                          />
                        </label>
                        <label>
                          分割先の完了予定日 D+
                          <input
                            type="number"
                            min={0}
                            className="panel__inline-input"
                            value={draft.newDueDay}
                            onChange={(e) => setSplitDraft(mo, { newDueDay: Number(e.target.value) })}
                          />
                        </label>
                        <button
                          type="button"
                          className={splitInvalid ? undefined : "panel__btn--primary"}
                          disabled={splitInvalid}
                          onClick={() => {
                            dispatch({
                              type: "MFG_SPLIT",
                              payload: {
                                moNo: mo.moNo,
                                splitQty: draft.splitQty,
                                newStartDay: draft.newStartDay,
                                newDueDay: draft.newDueDay,
                              },
                            });
                            setSplitDrafts((prev) => {
                              const next = { ...prev };
                              delete next[mo.moNo];
                              return next;
                            });
                          }}
                        >
                          分割
                        </button>
                        {splitInvalid && (
                          <span className="panel__hint-inline">
                            分割数量は1〜{mo.planQty - 1}、完了予定日は着手日以降にしてください
                          </span>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}

              <div className="panel__table-scroll">
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
                        <td>{WORK_INSTRUCTION_STATUS_LABELS[wi.status]}</td>
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
                              {draftInvalid && (
                                <span className="panel__hint-inline">
                                  良品数＋不良数を投入数（{wi.inputQty}）と一致させてください
                                </span>
                              )}
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

export default ProductionPanel;
