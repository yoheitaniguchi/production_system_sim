// 作業区マスタ（v5-spec.md §11.2 Phase 2-A：原価積上げの加工費に使う賃率を持つ）
import { useState } from "react";
import { findWorkCenterReferences } from "../../domain/masterIntegrity";
import type { SimulationAction } from "../../domain/reducer";
import type { SimulationState } from "../../types";
import { EditableNumberField } from "../EditableField";
import DeleteRowButton from "./DeleteRowButton";

interface Props {
  state: SimulationState;
  dispatch: (action: SimulationAction) => void;
}

function WorkCenterTable({ state, dispatch }: Props) {
  // capacityMinPerDayの既定値480（実働8時間）は新規追加する作業区向けの現実的な既定値。
  // 既定プリセットの240分/日は演習効果を狙った意図的な値であり別扱い（design.md §9.5）
  const [draft, setDraft] = useState({ workCenter: "", ratePerHour: 2000, capacityMinPerDay: 480 });

  const handleAdd = () => {
    dispatch({
      type: "MASTER_ADD_WORK_CENTER",
      payload: {
        workCenter: {
          workCenter: draft.workCenter,
          ratePerHour: draft.ratePerHour,
          capacityMinPerDay: draft.capacityMinPerDay,
        },
      },
    });
    setDraft({ ...draft, workCenter: "" });
  };

  return (
    <>
      <h3>作業区マスタ</h3>
      <table className="panel__table">
        <thead>
          <tr>
            <th>作業区</th>
            <th>賃率（円/時）</th>
            <th>能力（分/日）</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {state.workCenters.map((wc) => (
            <tr key={wc.workCenter}>
              <td>{wc.workCenter}</td>
              <td>
                <EditableNumberField
                  value={wc.ratePerHour}
                  min={0}
                  onCommit={(ratePerHour) =>
                    dispatch({
                      type: "MASTER_UPDATE_WORK_CENTER",
                      payload: { workCenter: wc.workCenter, patch: { ratePerHour } },
                    })
                  }
                />
              </td>
              <td>
                <EditableNumberField
                  value={wc.capacityMinPerDay}
                  min={0}
                  onCommit={(capacityMinPerDay) =>
                    dispatch({
                      type: "MASTER_UPDATE_WORK_CENTER",
                      payload: { workCenter: wc.workCenter, patch: { capacityMinPerDay } },
                    })
                  }
                />
              </td>
              <td>
                <DeleteRowButton
                  blockedBy={findWorkCenterReferences(state, wc.workCenter)}
                  label={`作業区 ${wc.workCenter}`}
                  onDelete={() => dispatch({ type: "MASTER_DELETE_WORK_CENTER", payload: { workCenter: wc.workCenter } })}
                />
              </td>
            </tr>
          ))}

          <tr className="master__new-row">
            <td>
              <input
                type="text"
                value={draft.workCenter}
                placeholder="WC-PNT"
                onChange={(e) => setDraft({ ...draft, workCenter: e.target.value })}
              />
            </td>
            <td>
              <input
                type="number"
                min={0}
                value={draft.ratePerHour}
                onChange={(e) => setDraft({ ...draft, ratePerHour: Number(e.target.value) })}
              />
            </td>
            <td>
              <input
                type="number"
                min={0}
                value={draft.capacityMinPerDay}
                onChange={(e) => setDraft({ ...draft, capacityMinPerDay: Number(e.target.value) })}
              />
            </td>
            <td>
              <button type="button" className="master__add" disabled={!draft.workCenter.trim()} onClick={handleAdd}>
                ＋追加
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </>
  );
}

export default WorkCenterTable;
