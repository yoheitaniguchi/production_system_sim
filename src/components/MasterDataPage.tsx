// マスタ：品目・BOM・工順・取引先・作業区（design.md §5）
//
// 編集可否の線引き（design.md §5・mini-simulator CLAUDE.mdの踏襲）：
// - 品目の標準リードタイム・購入単価・売価は編集可、区分（内製／購買）は編集不可（構造が変わるため）
// - BOMの員数は編集可、構造（品目の追加・削除）は編集不可
// - 工順の標準時間は編集可、工程の追加・削除は不可
// - 得意先・仕入先の名称は編集可、新規追加は編集不可
// - 作業区の賃率は編集可（v5-spec.md §11.2 Phase 2-A）
import type { SimulationAction } from "../domain/reducer";
import type { SimulationState } from "../types";
import { EditableNumberField, EditableTextField } from "./EditableField";

interface MasterDataPageProps {
  state: SimulationState;
  dispatch: (action: SimulationAction) => void;
}

function MasterDataPage({ state, dispatch }: MasterDataPageProps) {
  const itemName = (id: string) => state.items.find((i) => i.itemId === id)?.name ?? id;

  return (
    <div>
      <div className="panel">
        <h2>マスタ</h2>

        <h3>品目マスタ</h3>
        <table className="panel__table">
          <thead>
            <tr>
              <th>品目</th>
              <th>区分</th>
              <th>標準リードタイム（日）</th>
              <th>購入単価（円）</th>
              <th>売価（円）</th>
            </tr>
          </thead>
          <tbody>
            {state.items.map((item) => (
              <tr key={item.itemId}>
                <td>
                  {item.name}（{item.itemId}）
                </td>
                <td>{item.makeBuy === "MAKE" ? "内製" : "購買"}</td>
                <td>
                  <EditableNumberField
                    value={item.leadTimeDays}
                    min={1}
                    onCommit={(leadTimeDays) =>
                      dispatch({ type: "MASTER_UPDATE_ITEM_LEAD_TIME", payload: { itemId: item.itemId, leadTimeDays } })
                    }
                  />
                </td>
                <td>
                  {item.makeBuy === "BUY" ? (
                    <EditableNumberField
                      value={item.purchasePrice ?? 0}
                      min={0}
                      onCommit={(purchasePrice) =>
                        dispatch({ type: "MASTER_UPDATE_ITEM_PURCHASE_PRICE", payload: { itemId: item.itemId, purchasePrice } })
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
                      dispatch({ type: "MASTER_UPDATE_ITEM_SALES_PRICE", payload: { itemId: item.itemId, salesPrice } })
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <h3>BOM（構成）</h3>
        <table className="panel__table">
          <thead>
            <tr>
              <th>親品目</th>
              <th>子品目</th>
              <th>員数</th>
            </tr>
          </thead>
          <tbody>
            {state.bom.map((line) => (
              <tr key={`${line.parentItemId}-${line.childItemId}`}>
                <td>{itemName(line.parentItemId)}</td>
                <td>{itemName(line.childItemId)}</td>
                <td>
                  <EditableNumberField
                    value={line.qtyPer}
                    min={1}
                    onCommit={(qtyPer) =>
                      dispatch({
                        type: "MASTER_UPDATE_BOM_QTY_PER",
                        payload: { parentItemId: line.parentItemId, childItemId: line.childItemId, qtyPer },
                      })
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <h3>工順マスタ</h3>
        <table className="panel__table">
          <thead>
            <tr>
              <th>品目</th>
              <th>工程</th>
              <th>作業区</th>
              <th>標準時間（分）</th>
            </tr>
          </thead>
          <tbody>
            {state.routingSteps.map((step) => (
              <tr key={`${step.itemId}-${step.stepNo}`}>
                <td>{itemName(step.itemId)}</td>
                <td>{step.stepNo}</td>
                <td>{step.workCenter}</td>
                <td>
                  <EditableNumberField
                    value={step.stdTimeMin}
                    min={1}
                    onCommit={(stdTimeMin) =>
                      dispatch({
                        type: "MASTER_UPDATE_ROUTING_STD_TIME",
                        payload: { itemId: step.itemId, stepNo: step.stepNo, stdTimeMin },
                      })
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <h3>作業区マスタ</h3>
        <table className="panel__table">
          <thead>
            <tr>
              <th>作業区</th>
              <th>賃率（円/時）</th>
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
                      dispatch({ type: "MASTER_UPDATE_WORK_CENTER_RATE", payload: { workCenter: wc.workCenter, ratePerHour } })
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <h3>得意先マスタ</h3>
        <table className="panel__table">
          <thead>
            <tr>
              <th>得意先番号</th>
              <th>得意先名</th>
            </tr>
          </thead>
          <tbody>
            {state.customers.map((customer) => (
              <tr key={customer.customerId}>
                <td>{customer.customerId}</td>
                <td>
                  <EditableTextField
                    value={customer.name}
                    onCommit={(name) =>
                      dispatch({
                        type: "MASTER_UPDATE_PARTNER_NAME",
                        payload: { partnerType: "CUSTOMER", partnerId: customer.customerId, name },
                      })
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <h3>仕入先マスタ</h3>
        <table className="panel__table">
          <thead>
            <tr>
              <th>仕入先番号</th>
              <th>仕入先名</th>
            </tr>
          </thead>
          <tbody>
            {state.suppliers.map((supplier) => (
              <tr key={supplier.supplierId}>
                <td>{supplier.supplierId}</td>
                <td>
                  <EditableTextField
                    value={supplier.name}
                    onCommit={(name) =>
                      dispatch({
                        type: "MASTER_UPDATE_PARTNER_NAME",
                        payload: { partnerType: "SUPPLIER", partnerId: supplier.supplierId, name },
                      })
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default MasterDataPage;
