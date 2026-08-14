// マスタ画面用の編集可能フィールド（design.md §5、Phase 4bで先送りしたmin制約をここで反映）
import { useEffect, useState } from "react";

interface NumberFieldProps {
  value: number;
  min?: number;
  onCommit: (value: number) => void;
}

/**
 * 数値の編集可能フィールド。入力中はローカル状態のみ更新し、blur時に確定値としてコミットする
 * （キー入力のたびにdispatchすると、入力途中の空文字などが弾かれて勝手に元の値へ戻ってしまうため）。
 * min未満・非数値の場合はコミットせず、表示を確定済みの値へ戻す。
 */
export function EditableNumberField({ value, min = 1, onCommit }: NumberFieldProps) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);

  return (
    <input
      type="number"
      min={min}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const num = Number(draft);
        if (Number.isFinite(num) && num >= min) {
          onCommit(num);
        } else {
          setDraft(String(value));
        }
      }}
      className="editable-field__number"
    />
  );
}

interface TextFieldProps {
  value: string;
  onCommit: (value: string) => void;
}

interface SelectFieldProps {
  value: string;
  options: Array<{ value: string; label: string }>;
  onCommit: (value: string) => void;
}

/**
 * 選択式の編集可能フィールド（区分・既定仕入先・作業区）。選択の確定は1操作で終わるため、
 * 数値・テキストと違いドラフト状態を持たずchangeで即コミットする。
 */
export function EditableSelectField({ value, options, onCommit }: SelectFieldProps) {
  return (
    <select
      value={value}
      onChange={(e) => {
        if (e.target.value !== value) onCommit(e.target.value);
      }}
      className="editable-field__select"
    >
      {/* 現在値が選択肢に無い場合（マスタ削除直後など）でも表示が空にならないようにする */}
      {options.some((o) => o.value === value) ? null : <option value={value}>{value || "—"}</option>}
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

export function EditableTextField({ value, onCommit }: TextFieldProps) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  return (
    <input
      type="text"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft.trim()) {
          onCommit(draft.trim());
        } else {
          setDraft(value);
        }
      }}
      className="editable-field__text"
    />
  );
}
