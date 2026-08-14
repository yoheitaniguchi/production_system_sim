// BOM（構成）マスタ（v5-spec.md §3.7 最小機能2・UC-02「BOMをツリー表示する」）
//
// 多階層BOMを自由に登録できるようになったため、平坦な一覧だけでは構成が把握できない。
// UC-02が求めるツリー表示を一覧の前に置き、登録結果を階層で確認できるようにする。
import { useState } from "react";
import { buildBomIndex } from "../../domain/masterIntegrity";
import type { SimulationAction } from "../../domain/reducer";
import type { SimulationState } from "../../types";
import { EditableNumberField } from "../EditableField";
import DeleteRowButton from "./DeleteRowButton";

interface Props {
  state: SimulationState;
  dispatch: (action: SimulationAction) => void;
}

interface TreeNodeProps {
  state: SimulationState;
  itemId: string;
  qtyPer: number | null;
  /** 循環したデータを掴んでも描画が止まらないようにする（描画は防御的に打ち切る） */
  ancestors: string[];
}

function BomTreeNode({ state, itemId, qtyPer, ancestors }: TreeNodeProps) {
  const item = state.items.find((i) => i.itemId === itemId);
  const label = item ? `${item.name}（${itemId}）` : `${itemId}（品目マスタに無し）`;
  const cyclic = ancestors.includes(itemId);
  const children = cyclic ? [] : (buildBomIndex(state.bom).get(itemId) ?? []);

  return (
    <li>
      <span className="master__tree-node">
        {label}
        {qtyPer != null ? <span className="master__tree-qty"> ×{qtyPer}</span> : null}
        {item ? <span className="master__tree-kind">{item.makeBuy === "MAKE" ? "内製" : "購買"}</span> : null}
        {cyclic ? <span className="master__tree-cycle">循環</span> : null}
      </span>
      {children.length > 0 ? (
        <ul>
          {children.map((childId) => {
            const line = state.bom.find((b) => b.parentItemId === itemId && b.childItemId === childId);
            return (
              <BomTreeNode
                key={childId}
                state={state}
                itemId={childId}
                qtyPer={line?.qtyPer ?? null}
                ancestors={[...ancestors, itemId]}
              />
            );
          })}
        </ul>
      ) : null}
    </li>
  );
}

function BomTable({ state, dispatch }: Props) {
  const [draft, setDraft] = useState({ parentItemId: "", childItemId: "", qtyPer: 1 });

  const itemName = (id: string) => state.items.find((i) => i.itemId === id)?.name ?? id;
  const makeItems = state.items.filter((i) => i.makeBuy === "MAKE");
  // 子を持たない品目＝BOMツリーの根。品目がどこからも使われていない場合もここに出る
  const childIds = new Set(state.bom.map((b) => b.childItemId));
  const roots = state.items.filter((i) => !childIds.has(i.itemId));

  const handleAdd = () => {
    dispatch({
      type: "MASTER_ADD_BOM_LINE",
      payload: {
        line: { parentItemId: draft.parentItemId, childItemId: draft.childItemId, qtyPer: draft.qtyPer },
      },
    });
    setDraft({ ...draft, childItemId: "" });
  };

  return (
    <>
      <h3>BOM（構成）</h3>

      {roots.length > 0 ? (
        <ul className="master__tree">
          {roots.map((root) => (
            <BomTreeNode key={root.itemId} state={state} itemId={root.itemId} qtyPer={null} ancestors={[]} />
          ))}
        </ul>
      ) : (
        <p className="master__note">最上位の品目がありません（すべての品目が他の品目の子になっています）。</p>
      )}

      <table className="panel__table">
        <thead>
          <tr>
            <th>親品目</th>
            <th>子品目</th>
            <th>員数</th>
            <th />
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
                      type: "MASTER_UPDATE_BOM_LINE",
                      payload: { parentItemId: line.parentItemId, childItemId: line.childItemId, patch: { qtyPer } },
                    })
                  }
                />
              </td>
              <td>
                {/* BOM行は他テーブルのFK対象ではないため常に削除できる。ただし仕掛中オーダの
                    バックフラッシュ内容が変わる点は、実行時に業務メッセージで警告する（EXT-23） */}
                <DeleteRowButton
                  blockedBy={[]}
                  label={`BOM ${line.parentItemId} -> ${line.childItemId}`}
                  onDelete={() =>
                    dispatch({
                      type: "MASTER_DELETE_BOM_LINE",
                      payload: { parentItemId: line.parentItemId, childItemId: line.childItemId },
                    })
                  }
                />
              </td>
            </tr>
          ))}

          <tr className="master__new-row">
            <td>
              <select
                value={draft.parentItemId}
                onChange={(e) => setDraft({ ...draft, parentItemId: e.target.value })}
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
              <select value={draft.childItemId} onChange={(e) => setDraft({ ...draft, childItemId: e.target.value })}>
                <option value="">（子品目を選択）</option>
                {state.items
                  .filter((i) => i.itemId !== draft.parentItemId)
                  .map((i) => (
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
                value={draft.qtyPer}
                onChange={(e) => setDraft({ ...draft, qtyPer: Number(e.target.value) })}
              />
            </td>
            <td>
              <button
                type="button"
                className="master__add"
                disabled={!draft.parentItemId || !draft.childItemId}
                onClick={handleAdd}
              >
                ＋追加
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      <p className="master__note">
        親にできるのは内製品目だけです。自身を祖先に持つ構成（循環参照）は登録時に拒否されます。
      </p>
    </>
  );
}

export default BomTable;
