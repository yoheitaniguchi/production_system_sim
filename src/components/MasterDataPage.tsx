// マスタ：品目・BOM・工順（BOP）・作業区・取引先（design.md §5、v5-spec.md §3.7・UC-01〜03）
//
// 編集可否の線引き（design.md EXT-20）：
// - すべてのマスタで行の追加・削除ができる。ただし「復旧不能・原因不明の停止」を生む操作だけを禁止する
//   （BOM循環／参照中マスタの削除／未完了オーダがある品目の工順の構造変更／区分変更の前提条件）
// - コード（品目コード・作業区・取引先番号）は作成後に変更できない。改名は削除→再登録で行う
// - 単に計算結果が変わるだけの操作（仕掛中オーダがある品目のBOM編集）は禁止せず、業務メッセージで警告する
import type { SimulationAction } from "../domain/reducer";
import type { SimulationState } from "../types";
import BomTable from "./master/BomTable";
import ItemMasterTable from "./master/ItemMasterTable";
import MasterIOToolbar from "./master/MasterIOToolbar";
import PartnerTable from "./master/PartnerTable";
import RoutingTable from "./master/RoutingTable";
import WorkCenterTable from "./master/WorkCenterTable";

interface MasterDataPageProps {
  state: SimulationState;
  dispatch: (action: SimulationAction) => void;
}

function MasterDataPage({ state, dispatch }: MasterDataPageProps) {
  return (
    <div>
      <div className="panel">
        <h2>マスタ</h2>
        <MasterIOToolbar state={state} dispatch={dispatch} />

        {/* 登録順に依存関係がある（作業区・仕入先 → 品目 → BOM・工順）ため、
            依存される側を先に見せる並びにはせず、v5-spec.md §3.7の最小機能の並びを優先する。
            前提が足りない場合は各テーブルの選択肢が空になり、注記で気付ける */}
        <ItemMasterTable state={state} dispatch={dispatch} />
        <BomTable state={state} dispatch={dispatch} />
        <RoutingTable state={state} dispatch={dispatch} />
        <WorkCenterTable state={state} dispatch={dispatch} />
        <PartnerTable state={state} dispatch={dispatch} partnerType="CUSTOMER" />
        <PartnerTable state={state} dispatch={dispatch} partnerType="SUPPLIER" />
      </div>
    </div>
  );
}

export default MasterDataPage;
