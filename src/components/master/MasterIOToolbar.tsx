// マスタ一式のJSON入出力とプリセット復元（design.md EXT-26）
//
// バックエンドが無いので、エクスポートはBlobのダウンロード、インポートはFileReaderで行う。
// 取り込み・プリセット復元はどちらも全トランザクションを初期化するため、必ず確認を挟む。
import { useRef, useState } from "react";
import { DEFAULT_PRESET_ID, MASTER_PRESETS, resolveActivePresetId } from "../../data/masterData";
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
  const [selectedPresetId, setSelectedPresetId] = useState<string>(DEFAULT_PRESET_ID);

  const hasTransactions = state.salesOrders.length > 0 || state.stockTxns.length > 0;
  // 「現在どのプリセットが読み込まれているか」は専用の状態を持たず、品目コード集合からstateの都度導出する。
  // JSONインポートや個別のマスタCRUD編集の後でも自動的に正しくなる（design.md EXT-34）
  const activePresetId = resolveActivePresetId(state);
  const activePreset = MASTER_PRESETS.find((p) => p.id === activePresetId);

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

  const handleSwitchPreset = () => {
    const preset = MASTER_PRESETS.find((p) => p.id === selectedPresetId);
    if (!preset) return;
    // 既定プリセット（木製イス）以外へ切り替えると演習ガイドの自動判定が使えなくなる（design.md EXT-27・EXT-34）
    // ため、切替の入口であるこの確認ダイアログでその旨も伝える
    const guideCaveat =
      preset.id === DEFAULT_PRESET_ID ? "" : " 既定プリセット（木製イス）以外では演習ガイドの自動判定が使用できません。";
    if (
      window.confirm(
        `マスタをプリセット「${preset.label}」に切り替えます。トランザクションはすべて初期化されます。${guideCaveat}`,
      )
    ) {
      dispatch({ type: "MASTER_RESET_TO_PRESET", payload: { presetId: preset.id } });
      setSelectedPresetId(preset.id);
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
      <label className="master__preset-select">
        プリセット切替
        <select value={selectedPresetId} onChange={(e) => setSelectedPresetId(e.target.value)}>
          {MASTER_PRESETS.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.label}
            </option>
          ))}
        </select>
      </label>
      <button type="button" onClick={handleSwitchPreset}>
        選択したプリセットに切り替える
      </button>
      <button
        type="button"
        onClick={() => {
          if (window.confirm("マスタを既定プリセット「木製イス」に戻します。トランザクションはすべて初期化されます。")) {
            dispatch({ type: "MASTER_RESET_TO_PRESET", payload: { presetId: DEFAULT_PRESET_ID } });
            setSelectedPresetId(DEFAULT_PRESET_ID);
          }
        }}
      >
        既定プリセットに戻す
      </button>
      <span className="master__active-preset">
        現在のプリセット: {activePreset ? activePreset.label : "不明（プリセット外のマスタ）"}
      </span>
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
