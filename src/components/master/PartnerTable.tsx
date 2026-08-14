// 取引先マスタ（v5-spec.md §3.7 最小機能4）。design.md DEV-1により得意先／仕入先は別テーブルなので、
// 同じ形のテーブルを partnerType で使い分ける。
import { useState } from "react";
import { findCustomerReferences, findSupplierReferences } from "../../domain/masterIntegrity";
import type { PartnerType } from "../../domain/masterData";
import type { SimulationAction } from "../../domain/reducer";
import type { SimulationState } from "../../types";
import { EditableTextField } from "../EditableField";
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
    ? state.customers.map((c) => ({ partnerId: c.customerId, name: c.name }))
    : state.suppliers.map((s) => ({ partnerId: s.supplierId, name: s.name }));

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
      <table className="panel__table">
        <thead>
          <tr>
            <th>{idLabel}</th>
            <th>{nameLabel}</th>
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
                  onCommit={(name) =>
                    dispatch({ type: "MASTER_UPDATE_PARTNER_NAME", payload: { partnerType, partnerId: row.partnerId, name } })
                  }
                />
              </td>
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
                onChange={(e) => setDraft({ ...draft, partnerId: e.target.value })}
              />
            </td>
            <td>
              <input
                type="text"
                value={draft.name}
                placeholder={nameLabel}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </td>
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
