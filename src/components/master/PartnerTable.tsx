// 取引先マスタ（v5-spec.md §3.7 最小機能4）。design.md DEV-1により得意先／仕入先は別テーブルなので、
// 同じ形のテーブルを partnerType で使い分ける。ただし「優先度ランク」列（design.md EXT-36）は
// 得意先のみが持つ概念（MRP実行時の需要処理順序に影響する）のため、得意先側にのみ追加する。
import { useState } from "react";
import { findCustomerReferences, findSupplierReferences } from "../../domain/masterIntegrity";
import type { PartnerType } from "../../domain/masterData";
import type { SimulationAction } from "../../domain/reducer";
import type { SimulationState } from "../../types";
import { EditableNumberField, EditableTextField } from "../EditableField";
import DeleteRowButton from "./DeleteRowButton";

interface Props {
  state: SimulationState;
  dispatch: (action: SimulationAction) => void;
  partnerType: PartnerType;
}

function PartnerTable({ state, dispatch, partnerType }: Props) {
  const [draft, setDraft] = useState({ partnerId: "", name: "" });

  const isCustomer = partnerType === "CUSTOMER";
  const title = isCustomer ? "得意先マスタ" : "仕入先マスタ";
  const idLabel = isCustomer ? "得意先番号" : "仕入先番号";
  const nameLabel = isCustomer ? "得意先名" : "仕入先名";
  const rows = isCustomer
    ? state.customers.map((c) => ({ partnerId: c.customerId, name: c.name, priorityRank: c.priorityRank ?? 0 }))
    : state.suppliers.map((s) => ({ partnerId: s.supplierId, name: s.name, priorityRank: 0 }));

  const blockedBy = (partnerId: string) =>
    isCustomer ? findCustomerReferences(state, partnerId) : findSupplierReferences(state, partnerId);

  const handleAdd = () => {
    dispatch({
      type: "MASTER_ADD_PARTNER",
      payload: { partnerType, partnerId: draft.partnerId, name: draft.name },
    });
    setDraft({ partnerId: "", name: "" });
  };

  return (
    <>
      <h3>{title}</h3>
      {isCustomer && (
        <p className="panel__hint">
          優先度ランクは数値が大きいほど優先される。MRP実行（計画の再計算）時、複数受注が同じ部材・在庫を
          取り合う場面で、優先度ランクが高い得意先の需要から先に処理される（同ランクなら納期が早い順）
        </p>
      )}
      <table className="panel__table">
        <thead>
          <tr>
            <th>{idLabel}</th>
            <th>{nameLabel}</th>
            {isCustomer && <th>優先度ランク</th>}
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.partnerId}>
              <td>{row.partnerId}</td>
              <td>
                <EditableTextField
                  value={row.name}
                  ariaLabel={`${nameLabel}（${row.partnerId}）`}
                  onCommit={(name) =>
                    dispatch({ type: "MASTER_UPDATE_PARTNER_NAME", payload: { partnerType, partnerId: row.partnerId, name } })
                  }
                />
              </td>
              {isCustomer && (
                <td>
                  <EditableNumberField
                    value={row.priorityRank}
                    min={0}
                    ariaLabel={`優先度ランク（${row.partnerId}）`}
                    onCommit={(priorityRank) =>
                      dispatch({ type: "MASTER_UPDATE_CUSTOMER_PRIORITY_RANK", payload: { customerId: row.partnerId, priorityRank } })
                    }
                  />
                </td>
              )}
              <td>
                <DeleteRowButton
                  blockedBy={blockedBy(row.partnerId)}
                  label={`${isCustomer ? "得意先" : "仕入先"} ${row.partnerId}（${row.name}）`}
                  onDelete={() =>
                    dispatch({ type: "MASTER_DELETE_PARTNER", payload: { partnerType, partnerId: row.partnerId } })
                  }
                />
              </td>
            </tr>
          ))}

          <tr className="master__new-row">
            <td>
              <input
                type="text"
                value={draft.partnerId}
                placeholder={isCustomer ? "CUST-C" : "SUP-XXX"}
                aria-label={`${idLabel}（新規行）`}
                onChange={(e) => setDraft({ ...draft, partnerId: e.target.value })}
              />
            </td>
            <td>
              <input
                type="text"
                value={draft.name}
                placeholder={nameLabel}
                aria-label={`${nameLabel}（新規行）`}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </td>
            {isCustomer && <td />}
            <td>
              <button type="button" className="master__add" disabled={!draft.partnerId.trim()} onClick={handleAdd}>
                ＋追加
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </>
  );
}

export default PartnerTable;
