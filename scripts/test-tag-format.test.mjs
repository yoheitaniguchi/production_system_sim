import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { collectTestTitles, validateTagTitle } from "./test-tag-format.mjs";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");

describe("validateTagTitle", () => {
  it("UC・工程・種類・観点の4つがそろった印は誤り無し", () => {
    expect(validateTagTitle("[UC-06/UC-07][単体][機能テスト][正常] TC-05〜06: 説明")).toEqual([]);
  });

  it("UC番号・観点を省いた印も誤り無し", () => {
    expect(validateTagTitle("[総合][機能テスト] 受注から出荷まで")).toEqual([]);
  });

  it("印の後ろに[@security]のような別の目印が空白を挟んで続いてもよい", () => {
    expect(validateTagTitle("[単体][セキュリティテスト][異常] [@security] 説明")).toEqual([]);
  });

  it("種類の位置に定義外の値（[異常系]）があれば誤りとする", () => {
    expect(validateTagTitle("[単体][異常系][異常] 説明")).toEqual(["テストの種類「異常系」が定義済みの16種類に無い"]);
  });

  it("工程だけの印（[結合]のみ）は誤りとする", () => {
    expect(validateTagTitle("[結合] 説明")).toHaveLength(1);
  });

  it("工程の位置に[@security]があれば誤りとする", () => {
    expect(validateTagTitle("[@security][異常] 説明")).toEqual([
      "工程「@security」が単体／結合／総合のいずれでもない",
      "テストの種類「異常」が定義済みの16種類に無い",
    ]);
  });

  it("UC-01〜23の範囲外や桁違いのUC番号は誤りとする", () => {
    expect(validateTagTitle("[UC-24/UC-6][単体][機能テスト] 説明")).toHaveLength(2);
  });

  it("観点が正常／異常／境界以外なら誤りとする", () => {
    expect(validateTagTitle("[単体][機能テスト][準正常] 説明")).toHaveLength(1);
  });

  it("印が無い、または印の直後に空白が無いテスト名は誤りとする", () => {
    expect(validateTagTitle("説明だけ")).toHaveLength(1);
    expect(validateTagTitle("[単体][機能テスト]説明")).toHaveLength(1);
  });
});

describe("collectTestTitles", () => {
  it("it・test・修飾付き・it.eachのテスト名を行番号付きで集め、describeは拾わない", () => {
    const source = [
      'describe("[単体][機能テスト] describeは対象外", () => {',
      '  it("a", () => {});',
      "  test.skip('b', () => {});",
      "  it.each([[1]])(`c ${'x'} d`, () => {});",
      "});",
    ].join("\n");
    expect(collectTestTitles(source)).toEqual([
      { title: "a", line: 2 },
      { title: "b", line: 3 },
      { title: "c ${} d", line: 4 },
    ]);
  });
});

// src/配下の全テスト（docs/process/review-report.md B-5の対象範囲）が書式どおりであることを常に確かめる
describe("src/配下のテストの印", () => {
  const files = fs
    .readdirSync(path.join(REPO_ROOT, "src"), { recursive: true })
    .filter((f) => /\.test\.tsx?$/.test(f))
    .map((f) => path.join("src", f));

  it("検査対象のテストファイルが見つかる", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it("すべてのit()/test()の名前がdocs/test-tagging.mdの書式に従っている", () => {
    const violations = files.flatMap((file) =>
      collectTestTitles(fs.readFileSync(path.join(REPO_ROOT, file), "utf8"), file).flatMap(({ title, line }) =>
        validateTagTitle(title).map((error) => `${file.split(path.sep).join("/")}:${line} ${error}`),
      ),
    );
    expect(violations).toEqual([]);
  });
});
