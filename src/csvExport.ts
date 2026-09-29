// 表データのCSVエクスポート（Issue #54）。src/theme.ts・src/statusLabels.tsと同様、
// ドメインロジックではないsrc直下の共有ユーティリティとして置く。
// 各パネルが既に保持する構造化データ（headers/rows）を受け取ってCSV文字列を組み立てるだけで、
// DOM（.panel__table）を直接走査することはしない。

// セル先頭が=/+/-/@（またはタブ・CR）だと、Excel/Google Sheets等が数式として評価してしまう
// 「CSV数式インジェクション」対策。品目名・作業区コード等ユーザーが自由に設定できる値がそのまま
// セルに載る画面があるため、無害化のための`'`を1文字だけ先頭に挿入する（SEC-001）。
const FORMULA_INJECTION_PATTERN = /^[=+\-@\t\r]/;

function escapeCsvField(field: string | number): string {
  const text = String(field);
  const neutralized = FORMULA_INJECTION_PATTERN.test(text) ? `'${text}` : text;
  if (/[",\r\n]/.test(neutralized)) {
    return `"${neutralized.replace(/"/g, '""')}"`;
  }
  return neutralized;
}

/** headers・rowsからCSV文字列を組み立てる（RFC4180ふうにCRLF区切り・必要なフィールドのみ引用符で囲む） */
export function buildCsv(headers: string[], rows: (string | number)[][]): string {
  return [headers, ...rows].map((cols) => cols.map(escapeCsvField).join(",")).join("\r\n");
}

/** ファイル名に使う日付（YYYY-MM-DD）。テスト容易性のため対象日時を引数で受け取れるようにする */
export function todayDateStamp(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

/** CSVをBlobとしてダウンロードさせる（MasterIOToolbar.tsxのJSONエクスポートと同じBlob+アンカー方式） */
export function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]): void {
  const csv = buildCsv(headers, rows);
  // 先頭にUTF-8 BOMを付け、Excel等で日本語が文字化けしないようにする
  const bom = String.fromCharCode(0xfeff);
  const blob = new Blob([bom + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
