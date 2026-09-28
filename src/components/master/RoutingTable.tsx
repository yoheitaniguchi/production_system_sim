// 工順（BOP）マスタ（v5-spec.md §3.7 最小機能3、design.md EXT-20）
//
// production.tsのfirstStepNo/lastStepNoは実行時にstate.routingStepsを読むため、仕掛中の製造オーダが
// ある品目の工順を増減させると「最終工程」が変わり完成入庫が起きなくなる。そのため構造変更
// （行の追加・削除）だけを未完了オーダのある品目で禁止し、標準時間・段取り時間・作業区の変更は常に許可する。
import { useState } from "react";
import { openMfgOrdersOf } from "../../domain/masterIntegrity";
import type { SimulationAction } from "../../domain/reducer";
import type { SimulationState } from "../../types";
import { EditableNumberField, EditableSelectField } from "../EditableField";
import DeleteRowButton from "./DeleteRowButton";

interface Props {
  state: SimulationState;
  dispatch: (action: SimulationAction) => void;
}

function RoutingTable({ state, dispatch }: Props) {
  const [draft, setDraft] = useState({ itemId: "", stepNo: 10, workCenter: "", stdTimeMin: 10, setupMin: 0 });

  const itemName = (id: string) => state.items.find((i) => i.itemId === id)?.name ?? id;
  const makeItems = state.items.filter((i) => i.makeBuy === "MAKE");
  const workCenterOptions = state.workCenters.map((w) => ({ value: w.workCenter, label: w.workCenter }));

  const steps = [...state.routingSteps].sort((a, b) => a.itemId.localeCompare(b.itemId) || a.stepNo - b.stepNo);

  const structureBlockedBy = (itemId: string): string[] => {
    const open = openMfgOrdersOf(state, itemId);
    return open.length > 0 ? [`未完了の製造オーダ ${open.join(", ")}`] : [];
  };

  const handleAdd = () => {
    dispatch({
      type: "MASTER_ADD_ROUTING_STEP",
      payload: {
        step: {
          itemId: draft.itemId,
          stepNo: draft.stepNo,
          workCenter: draft.workCenter,
          stdTimeMin: draft.stdTimeMin,
          setupMin: draft.setupMin,
        },
      },
    });
    setDraft({ ...draft, stepNo: draft.stepNo + 10 });
  };

  return (
    <>
      <h3>工順マスタ（BOP）</h3>
      <div className="panel__table-scroll">
      <table className="panel__table">
        <thead>
          <tr>
            <th>品目</th>
            <th>工程</th>
            <th>作業区</th>
            <th>標準時間（分）</th>
            <th>段取り時間（分）</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {steps.map((step) => (
            <tr key={`${step.itemId}-${step.stepNo}`}>
              <td>{itemName(step.itemId)}</td>
              <td>{step.stepNo}</td>
              <td>
                <EditableSelectField
                  value={step.workCenter}
                  options={workCenterOptions}
                  ariaLabel={`作業区（${itemName(step.itemId)}（${step.itemId}） 工程${step.stepNo}）`}
                  onCommit={(workCenter) =>
                    dispatch({
                      type: "MASTER_UPDATE_ROUTING_STEP",
                      payload: { itemId: step.itemId, stepNo: step.stepNo, patch: { workCenter } },
                    })
                  }
                />
              </td>
              <td>
                <EditableNumberField
                  value={step.stdTimeMin}
                  min={0}
                  ariaLabel={`標準時間（分）（${itemName(step.itemId)}（${step.itemId}） 工程${step.stepNo}）`}
                  onCommit={(stdTimeMin) =>
                    dispatch({
                      type: "MASTER_UPDATE_ROUTING_STEP",
                      payload: { itemId: step.itemId, stepNo: step.stepNo, patch: { stdTimeMin } },
                    })
                  }
                />
              </td>
              <td>
                <EditableNumberField
                  value={step.setupMin ?? 0}
                  min={0}
                  ariaLabel={`段取り時間（分）（${itemName(step.itemId)}（${step.itemId}） 工程${step.stepNo}）`}
                  onCommit={(setupMin) =>
                    dispatch({
                      type: "MASTER_UPDATE_ROUTING_STEP",
                      payload: { itemId: step.itemId, stepNo: step.stepNo, patch: { setupMin } },
                    })
                  }
                />
              </td>
              <td>
                <DeleteRowButton
                  blockedBy={structureBlockedBy(step.itemId)}
                  label={`工順 ${step.itemId} 工程${step.stepNo}`}
                  onDelete={() =>
                    dispatch({
                      type: "MASTER_DELETE_ROUTING_STEP",
                      payload: { itemId: step.itemId, stepNo: step.stepNo },
                    })
                  }
                />
              </td>
            </tr>
          ))}

          <tr className="master__new-row">
            <td>
              <select
                value={draft.itemId}
                aria-label="品目（新規行）"
                onChange={(e) => setDraft({ ...draft, itemId: e.target.value })}
              >
                <option value="">（内製品目を選択）</option>
                {makeItems.map((i) => (
                  <option key={i.itemId} value={i.itemId}>
                    {i.name}（{i.itemId}）
                  </option>
                ))}
              </select>
            </td>
            <td>
              <input
                type="number"
                min={1}
                value={draft.stepNo}
                aria-label="工程（新規行）"
                onChange={(e) => setDraft({ ...draft, stepNo: Number(e.target.value) })}
              />
            </td>
            <td>
              <select
                value={draft.workCenter}
                aria-label="作業区（新規行）"
                onChange={(e) => setDraft({ ...draft, workCenter: e.target.value })}
              >
                <option value="">（作業区を選択）</option>
                {workCenterOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </td>
            <td>
              <input
                type="number"
                min={0}
                value={draft.stdTimeMin}
                aria-label="標準時間（分）（新規行）"
                onChange={(e) => setDraft({ ...draft, stdTimeMin: Number(e.target.value) })}
              />
            </td>
            <td>
              <input
                type="number"
                min={0}
                value={draft.setupMin}
                aria-label="段取り時間（分）（新規行）"
                onChange={(e) => setDraft({ ...draft, setupMin: Number(e.target.value) })}
              />
            </td>
            <td>
              <button
                type="button"
                className="master__add"
                disabled={!draft.itemId || !draft.workCenter || structureBlockedBy(draft.itemId).length > 0}
                onClick={handleAdd}
              >
                ＋追加
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      </div>
      {state.workCenters.length === 0 && (
        <p className="master__note master__note--warn">
          作業区が1件も登録されていないため、工順を追加できません。先に作業区マスタで作業区を登録してください。
        </p>
      )}
      <p className="master__note">
        内製品目には工順が1行以上必要です（0行だと作業指示が作られず、製造オーダを完了できません）。
        未完了の製造オーダがある品目は、工順の追加・削除ができません（標準時間・段取り時間・作業区の変更は可能です）。
      </p>
      <p className="master__note">
        標準時間は1個あたり、段取り時間は製造オーダ1件のこの工程につき1回だけかかる時間です。
        能力（山積み）の負荷は「数量×標準時間＋段取り時間」で計算されます（段取り時間は数量に比例しません。
        未設定＝0分なら標準時間だけで計算されます）。原価には反映されません。
      </p>
    </>
  );
}

export default RoutingTable;
