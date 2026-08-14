// マスタ行の削除ボタン（design.md EXT-21）。
// 参照されている行は押せないようにし、ブロック理由をtitleで見せる（「なぜ消せないのか」が
// マスタ画面だけで分かることが、参照整合性を学ぶうえでの主眼）。
interface DeleteRowButtonProps {
  /** 空配列なら削除可。1件以上あれば無効化してその理由を表示する */
  blockedBy: string[];
  /** 確認ダイアログに出す対象名 */
  label: string;
  onDelete: () => void;
}

function DeleteRowButton({ blockedBy, label, onDelete }: DeleteRowButtonProps) {
  const blocked = blockedBy.length > 0;
  return (
    <button
      type="button"
      className="master__delete"
      disabled={blocked}
      title={blocked ? `削除できません：${blockedBy.join("・")}から参照されています` : `${label} を削除する`}
      onClick={() => {
        if (window.confirm(`${label} を削除します。よろしいですか？`)) onDelete();
      }}
    >
      削除
    </button>
  );
}

export default DeleteRowButton;
