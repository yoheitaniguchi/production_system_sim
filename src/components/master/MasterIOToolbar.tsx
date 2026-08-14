// マスタ一式のJSON入出力とプリセット復元（design.md EXT-26）
//
// バックエンドが無いので、エクスポートはBlobのダウンロード、インポートはFileReaderで行う。
// 取り込み・プリセット復元はどちらも全トランザクションを初期化するため、必ず確認を挟む。
import { useRef, useState } from "react";
import { MasterIOError, parseMasterSnapshot, serializeMasterSnapshot } from "../../domain/masterIO";
import type { SimulationAction } from "../../domain/reducer";
import type { SimulationState } from "../../types";

interface Props {
  state: SimulationState;
  dispatch: (action: SimulationAction) => void;
}

function MasterIOToolbar({ state, dispatch }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const hasTransactions = state.salesOrders.length > 0 || state.stockTxns.length > 0;

  const handleExport = () => {
    const blob = new Blob([serializeMasterSnapshot(state)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "master-data.json";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = async (file: File) => {
    setError(null);
    try {
      const snapshot = parseMasterSnapshot(await file.text());
      if (
        hasTransactions &&
        !window.confirm("マスタを取り込むと、現在の受注・オーダ・在庫はすべて初期化されます。続けますか？")
      ) {
        return;
      }
      dispatch({ type: "MASTER_IMPORT", payload: { snapshot } });
    } catch (err) {
      setError(err instanceof MasterIOError ? err.message : `読み込みに失敗しました: ${String(err)}`);
    }
  };

  return (
    <div className="master__toolbar">
      <button type="button" onClick={handleExport}>
        JSONでエクスポート
      </button>
      <button type="button" onClick={() => fileInputRef.current?.click()}>
        JSONをインポート
      </button>
      <button
        type="button"
        onClick={() => {
          if (window.confirm("マスタを既定プリセット（木製イス）に戻します。トランザクションはすべて初期化されます。")) {
            dispatch({ type: "MASTER_RESET_TO_PRESET" });
          }
        }}
      >
        既定プリセットに戻す
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        className="master__file-input"
        onChange={(e) => {
          const file = e.target.files?.[0];
          // 同じファイルを続けて選び直せるように値をクリアしておく
          e.target.value = "";
          if (file) void handleImportFile(file);
        }}
      />
      {error ? <pre className="master__io-error">{error}</pre> : null}
    </div>
  );
}

export default MasterIOToolbar;
