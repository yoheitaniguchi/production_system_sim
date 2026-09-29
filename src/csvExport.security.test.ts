import { describe, expect, it } from "vitest";
import { buildCsv } from "./csvExport";

// SEC-001（docs/security/reports参照）：escapeCsvFieldはカンマ・引用符・改行はエスケープするが、
// セル先頭が `=`/`+`/`-`/`@` の場合にExcel/Google Sheets等が数式として評価してしまう
// 「CSV数式インジェクション」への対策が無い。品目名・作業区コード等のマスタ値（ユーザーが自由に
// 設定できる）がCostPanel.tsx等でCSVへそのまま載るため、悪意ある品目名を経由して到達可能。
// 安全な実装は、危険な先頭文字を持つフィールドの前に `'` 等の無害な文字を挿入して文字列として
// 固定する（現状は未対応のため、このテストは失敗する＝脆弱性の顕在化）。
describe("buildCsv（SEC-001: CSV数式インジェクション対策）", () => {
  it.each([
    ["=", "=cmd|'/C calc'!A0"],
    ["+", "+1+1"],
    ["-", "-1+1"],
    ["@", "@SUM(1+1)"],
  ])("[@security][異常] セル先頭が%sの場合は数式として評価されないよう無害化される", (_label, dangerous) => {
    const csv = buildCsv(["品目名"], [[dangerous]]);
    const [, dataLine] = csv.split("\r\n");
    // 危険な形のまま出力されていないこと（先頭に無害化のためのプレフィックスが付くはず）
    expect(dataLine).not.toBe(dangerous);
    expect(dataLine.startsWith(dangerous)).toBe(false);
  });

  it("[@security][正常] 数式を意図しない通常の品目名はこれまでどおり変化しない", () => {
    const csv = buildCsv(["品目名"], [["木製イス"]]);
    expect(csv).toBe("品目名\r\n木製イス");
  });
});
