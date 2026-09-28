import { describe, expect, it } from "vitest";
import { buildCsv, todayDateStamp } from "./csvExport";

describe("buildCsv（Issue #54：CSVエクスポート）", () => {
  it("[単体][機能テスト][正常] headers・rowsをカンマ区切り・CRLF改行のCSV文字列に変換する", () => {
    const csv = buildCsv(["品目", "数量"], [["木製イス", 10], ["座面ASSY", 5]]);
    expect(csv).toBe("品目,数量\r\n木製イス,10\r\n座面ASSY,5");
  });

  it("[単体][機能テスト][境界] rowsが空の場合はヘッダー行のみを返す", () => {
    expect(buildCsv(["品目", "数量"], [])).toBe("品目,数量");
  });

  it("[単体][機能テスト][異常] フィールドにカンマが含まれる場合は引用符で囲む", () => {
    const csv = buildCsv(["備考"], [["超過（60分, 要確認）"]]);
    expect(csv).toBe('備考\r\n"超過（60分, 要確認）"');
  });

  it("[単体][機能テスト][異常] フィールドに引用符が含まれる場合は二重化して引用符で囲む", () => {
    const csv = buildCsv(["備考"], [['状態は"OK"']]);
    expect(csv).toBe('備考\r\n"状態は""OK"""');
  });

  it("[単体][機能テスト][異常] フィールドに改行が含まれる場合は引用符で囲む", () => {
    const csv = buildCsv(["備考"], [["1行目\n2行目"]]);
    expect(csv).toBe('備考\r\n"1行目\n2行目"');
  });

  it("[単体][機能テスト][正常] 数値フィールドはそのまま出力する（引用符で囲まない）", () => {
    expect(buildCsv(["値"], [[12.3]])).toBe("値\r\n12.3");
  });
});

describe("todayDateStamp（Issue #54：CSVファイル名の日付）", () => {
  it("[単体][機能テスト][正常] 指定した日付をYYYY-MM-DD形式にする", () => {
    expect(todayDateStamp(new Date("2026-08-20T15:30:00Z"))).toBe("2026-08-20");
  });

  it("[単体][機能テスト][正常] 引数を省略すると現在日時を使う", () => {
    expect(todayDateStamp()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
