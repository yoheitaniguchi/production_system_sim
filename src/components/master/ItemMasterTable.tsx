// 品目マスタ（v5-spec.md §3.7 最小機能1、design.md EXT-20〜EXT-24）
//
// 品目コードは作成後に変更できない（EXT-24：12テーブルのFKが一斉に壊れるため）。
// 改名したい場合は削除してから登録し直す。
import { useState } from "react";
import type { SimulationAction } from "../../domain/reducer";
import { findItemReferences } from "../../domain/masterIntegrity";
import type { ItemMaster, MakeBuy, SimulationState } from "../../types";
import { EditableNumberField, EditableSelectField, EditableTextField } from "../EditableField";
import DeleteRowButton from "./DeleteRowButton";

interface Props {
  state: SimulationState;
  dispatch: (action: SimulationAction) => void;
}

const MAKE_BUY_OPTIONS = [
  { value: "MAKE", label: "内製" },
  { value: "BUY", label: "購買" },
];

function ItemMasterTable({ state, dispatch }: Props) {
  const [draft, setDraft] = useState({
    itemId: "",
    name: "",
    makeBuy: "MAKE" as MakeBuy,
    leadTimeDays: 1,
    defaultSupplierId: "",
    purchasePrice: 0,
    salesPrice: 0,
  });

  const supplierOptions = state.suppliers.map((s) => ({ value: s.supplierId, label: `${s.name}（${s.supplierId}）` }));

  const handleAdd = () => {
    const item: ItemMaster = {
      itemId: draft.itemId,
      name: draft.name,
      makeBuy: draft.makeBuy,
      leadTimeDays: draft.leadTimeDays,
      defaultSupplierId: draft.makeBuy === "BUY" ? draft.defaultSupplierId || undefined : undefined,
      purchasePrice: draft.makeBuy === "BUY" ? draft.purchasePrice : undefined,
      salesPrice: draft.salesPrice || undefined,
    };
    dispatch({ type: "MASTER_ADD_ITEM", payload: { item } });
    setDraft((d) => ({ ...d, itemId: "", name: "" }));
  };

  return (
    <>
      <h3>品目マスタ</h3>
      <div className="panel__table-scroll">
      <table className="panel__table">
        <thead>
          <tr>
            <th>品目コード</th>
            <th>品目名</th>
            <th>区分</th>
            <th>標準リードタイム（日）</th>
            <th>既定仕入先</th>
            <th>購入単価（円）</th>
            <th>売価（円）</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {state.items.map((item) => (
            <tr key={item.itemId}>
              <td>{item.itemId}</td>
              <td>
                <EditableTextField
                  value={item.name}
                  onCommit={(name) => dispatch({ type: "MASTER_UPDATE_ITEM", payload: { itemId: item.itemId, patch: { name } } })}
                />
              </td>
              <td>
                <EditableSelectField
                  value={item.makeBuy}
                  options={MAKE_BUY_OPTIONS}
                  onCommit={(makeBuy) =>
                    dispatch({
                      type: "MASTER_UPDATE_ITEM",
                      payload: {
                        itemId: item.itemId,
                        // MAKE->BUYはdomain側が同一patch内の既定仕入先を要求する（区分だけ先に
                        // 変えると「既定仕入先の無い購買品目」になるため）。品目は常にdefaultSupplierIdを
                        // undefinedへクリアしてから区分を切り替えるので、この操作の中で新しい仕入先を
                        // 選ばせる術がUI単独では無い。既存の仕入先の先頭を仮の既定値として一緒に送り、
                        // 実際の仕入先は右隣のセルで選び直せるようにする（仕入先が1件も無ければ
                        // domain側のエラーがそのままイベントログに出る）
                        patch:
                          makeBuy === "BUY"
                            ? { makeBuy: makeBuy as MakeBuy, defaultSupplierId: state.suppliers[0]?.supplierId }
                            : { makeBuy: makeBuy as MakeBuy },
                      },
                    })
                  }
                />
              </td>
              <td>
                <EditableNumberField
                  value={item.leadTimeDays}
                  min={0}
                  onCommit={(leadTimeDays) =>
                    dispatch({ type: "MASTER_UPDATE_ITEM", payload: { itemId: item.itemId, patch: { leadTimeDays } } })
                  }
                />
              </td>
              <td>
                {item.makeBuy === "BUY" ? (
                  <EditableSelectField
                    value={item.defaultSupplierId ?? ""}
                    options={supplierOptions}
                    onCommit={(defaultSupplierId) =>
                      dispatch({
                        type: "MASTER_UPDATE_ITEM",
                        payload: { itemId: item.itemId, patch: { defaultSupplierId } },
                      })
                    }
                  />
                ) : (
                  "—"
                )}
              </td>
              <td>
                {item.makeBuy === "BUY" ? (
                  <EditableNumberField
                    value={item.purchasePrice ?? 0}
                    min={0}
                    onCommit={(purchasePrice) =>
                      dispatch({ type: "MASTER_UPDATE_ITEM", payload: { itemId: item.itemId, patch: { purchasePrice } } })
                    }
                  />
                ) : (
                  "—"
                )}
              </td>
              <td>
                <EditableNumberField
                  value={item.salesPrice ?? 0}
                  min={0}
                  onCommit={(salesPrice) =>
                    dispatch({ type: "MASTER_UPDATE_ITEM", payload: { itemId: item.itemId, patch: { salesPrice } } })
                  }
                />
              </td>
              <td>
                <DeleteRowButton
                  blockedBy={findItemReferences(state, item.itemId)}
                  label={`品目 ${item.itemId}（${item.name}）`}
                  onDelete={() => dispatch({ type: "MASTER_DELETE_ITEM", payload: { itemId: item.itemId } })}
                />
              </td>
            </tr>
          ))}

          <tr className="master__new-row">
            <td>
              <input
                type="text"
                value={draft.itemId}
                placeholder="FG-200"
                onChange={(e) => setDraft({ ...draft, itemId: e.target.value })}
              />
            </td>
            <td>
              <input
                type="text"
                value={draft.name}
                placeholder="品目名"
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </td>
            <td>
              <select
                value={draft.makeBuy}
                onChange={(e) => setDraft({ ...draft, makeBuy: e.target.value as MakeBuy })}
              >
                {MAKE_BUY_OPTIONS.map((o) => (
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
                value={draft.leadTimeDays}
                onChange={(e) => setDraft({ ...draft, leadTimeDays: Number(e.target.value) })}
              />
            </td>
            <td>
              {draft.makeBuy === "BUY" ? (
                <select
                  value={draft.defaultSupplierId}
                  onChange={(e) => setDraft({ ...draft, defaultSupplierId: e.target.value })}
                >
                  <option value="">（選択）</option>
                  {supplierOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : (
                "—"
              )}
            </td>
            <td>
              {draft.makeBuy === "BUY" ? (
                <input
                  type="number"
                  min={0}
                  value={draft.purchasePrice}
                  onChange={(e) => setDraft({ ...draft, purchasePrice: Number(e.target.value) })}
                />
              ) : (
                "—"
              )}
            </td>
            <td>
              <input
                type="number"
                min={0}
                value={draft.salesPrice}
                onChange={(e) => setDraft({ ...draft, salesPrice: Number(e.target.value) })}
              />
            </td>
            <td>
              <button type="button" className="master__add" disabled={!draft.itemId.trim()} onClick={handleAdd}>
                ＋追加
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      </div>
      {draft.makeBuy === "BUY" && supplierOptions.length === 0 && (
        <p className="master__note master__note--warn">
          仕入先が1件も登録されていないため、購買品目には既定仕入先を設定できません。先に仕入先マスタで仕入先を登録してください。
        </p>
      )}
      <p className="master__note">
        品目コードは登録後に変更できません（受注・オーダ・在庫の参照が壊れるため）。改名する場合は削除して登録し直してください。
      </p>
    </>
  );
}

export default ItemMasterTable;
