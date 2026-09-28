// テキストファイルをBlobとしてダウンロードさせる共有ユーティリティ（Issue #61のシナリオ書き出し用）。
// src/csvExport.ts・src/theme.tsと同様、ドメインロジックではないsrc直下に置く。
export function downloadTextFile(filename: string, mimeType: string, text: string): void {
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
