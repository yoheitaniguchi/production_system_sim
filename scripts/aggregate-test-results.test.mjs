import { describe, expect, it } from "vitest";
import path from "node:path";
import {
  buildCoverageSummary,
  buildIndexEntry,
  buildRunRecord,
  extractTag,
  mergeIndex,
  parseJUnitXml,
} from "./aggregate-test-results.mjs";

const SAMPLE_JUNIT_XML = `<?xml version="1.0" encoding="UTF-8" ?>
<testsuites name="vitest tests" tests="3" failures="1" errors="0" time="0.5">
    <testsuite name="src/domain/sample.test.ts" timestamp="2026-09-27T00:00:00.000Z" hostname="vm" tests="3" failures="1" errors="0" skipped="1" time="0.5">
        <testcase classname="src/domain/sample.test.ts" name="在庫の確認 &gt; [UC-06][単体][機能テスト][正常] TC-04: 正常に展開できる" time="0.123456">
        </testcase>
        <testcase classname="src/domain/sample.test.ts" name="在庫の確認 &gt; [UC-08][単体][機能テスト][異常] TC-13: 不足時にエラーを返す" time="0.05">
            <failure message="expected 1 to be 2 // Object.is equality" type="AssertionError">AssertionError: expected 1 to be 2 // Object.is equality

- Expected
+ Received

 ❯ src/domain/sample.test.ts:42:10</failure>
        </testcase>
        <testcase classname="src/domain/sample.test.ts" name="在庫の確認 &gt; 後で実装するテスト" time="0">
            <skipped/>
        </testcase>
    </testsuite>
</testsuites>`;

const REPO_ROOT = "/home/user/production_system_sim";

const SAMPLE_COVERAGE_SUMMARY = {
  total: {
    lines: { total: 100, covered: 80, skipped: 0, pct: 80 },
    statements: { total: 100, covered: 80, skipped: 0, pct: 80 },
    functions: { total: 10, covered: 9, skipped: 0, pct: 90 },
    branches: { total: 20, covered: 15, skipped: 0, pct: 75 },
  },
  [path.join(REPO_ROOT, "src/domain/mrp.ts")]: {
    lines: { total: 50, covered: 45, skipped: 0, pct: 90 },
    statements: { total: 50, covered: 45, skipped: 0, pct: 90 },
    functions: { total: 5, covered: 5, skipped: 0, pct: 100 },
    branches: { total: 10, covered: 8, skipped: 0, pct: 80 },
  },
};

describe("parseJUnitXml", () => {
  it("passed/failed/skippedの3件を、ファイル・名前・所要時間(ms)とともに読み取る", () => {
    const tests = parseJUnitXml(SAMPLE_JUNIT_XML);

    expect(tests).toHaveLength(3);
    expect(tests[0]).toEqual({
      file: "src/domain/sample.test.ts",
      name: "在庫の確認 > [UC-06][単体][機能テスト][正常] TC-04: 正常に展開できる",
      status: "passed",
      durationMs: 123,
    });
    expect(tests[2].status).toBe("skipped");
    expect(tests[2].durationMs).toBe(0);
  });

  it("failure要素からfailureMessageと、テキスト中の「ファイルパス:行番号」をlocationとして抽出する", () => {
    const tests = parseJUnitXml(SAMPLE_JUNIT_XML);
    const failed = tests[1];

    expect(failed.status).toBe("failed");
    expect(failed.failureMessage).toContain("expected 1 to be 2");
    expect(failed.location).toBe("src/domain/sample.test.ts:42:10");
  });

  it("failure/error要素が無い場合、location・failureMessageのフィールド自体を持たない", () => {
    const tests = parseJUnitXml(SAMPLE_JUNIT_XML);
    const passed = tests[0];

    expect(passed).not.toHaveProperty("failureMessage");
    expect(passed).not.toHaveProperty("location");
  });

  it("testsuite・testcaseが1件だけの場合でも配列として扱える(fast-xml-parserは単数要素をオブジェクトのまま返す)", () => {
    const singleXml = `<?xml version="1.0" encoding="UTF-8" ?>
<testsuites name="vitest tests" tests="1" failures="0" errors="0" time="0.01">
    <testsuite name="src/domain/single.test.ts" timestamp="2026-09-27T00:00:00.000Z" hostname="vm" tests="1" failures="0" errors="0" skipped="0" time="0.01">
        <testcase classname="src/domain/single.test.ts" name="単独のテスト" time="0.01"></testcase>
    </testsuite>
</testsuites>`;

    const tests = parseJUnitXml(singleXml);
    expect(tests).toEqual([{ file: "src/domain/single.test.ts", name: "単独のテスト", status: "passed", durationMs: 10 }]);
  });
});

describe("extractTag", () => {
  it("docs/test-tagging.mdが定める[UC-xx][工程][テストの種類][観点]形式の印を抽出する", () => {
    expect(extractTag("[UC-06][単体][機能テスト][正常] TC-04: 受注を展開する")).toBe(
      "[UC-06][単体][機能テスト][正常]",
    );
  });

  it("describeとitの連結で印が先頭に来ない場合でも、部分一致で抽出する(先頭一致を仮定しない)", () => {
    const name = "初期マスタデータ（v5-spec.md §1.1：木製イス） > [UC-06][単体][機能テスト][正常] TC-04: 受注を展開する";
    expect(extractTag(name)).toBe("[UC-06][単体][機能テスト][正常]");
  });

  it("観点タグを省略した3要素の印も抽出できる", () => {
    expect(extractTag("[UC-08/UC-13][結合][機能テスト] TC-E1〜E3: 警告のまま着手")).toBe(
      "[UC-08/UC-13][結合][機能テスト]",
    );
  });

  it("UC番号が無い(UCタグ自体を持たない)テスト名は抽出対象外でnullを返す", () => {
    expect(extractTag("[単体][機能テスト][正常] BOMに循環参照が無い")).toBeNull();
  });

  it("印が全く無いテスト名はnullを返す", () => {
    expect(extractTag("特別な印を持たないテスト")).toBeNull();
  });
});

describe("buildCoverageSummary", () => {
  it("\"total\"キーをfiles配列から除外し、lines.pctをoverallPercentの算出元に使う", () => {
    const coverage = buildCoverageSummary(SAMPLE_COVERAGE_SUMMARY, REPO_ROOT);

    expect(coverage.overallPercent).toBe(80);
    expect(coverage.overallPercentMetric).toBe("lines");
    expect(coverage.files).toHaveLength(1);
    expect(coverage.files.find((f) => f.path === "total")).toBeUndefined();
  });

  it("coverage-summary.jsonの絶対パスを、リポジトリルートからの相対パス(/区切り)へ変換する", () => {
    const coverage = buildCoverageSummary(SAMPLE_COVERAGE_SUMMARY, REPO_ROOT);

    expect(coverage.files).toEqual([{ path: "src/domain/mrp.ts", percent: 90 }]);
  });
});

describe("buildRunRecord / buildIndexEntry", () => {
  it("JUnit XMLとcoverage-summary.jsonから、runs/<runId>.jsonのスキーマ通りのオブジェクトを組み立てる", () => {
    const runRecord = buildRunRecord({
      runId: "12345",
      workflow: "test.yml",
      trigger: "push",
      commit: "abc123",
      branch: "main",
      startedAt: "2026-09-27T00:00:00Z",
      completedAt: "2026-09-27T00:01:00Z",
      conclusion: "failure",
      junitXml: SAMPLE_JUNIT_XML,
      coverageSummaryJson: SAMPLE_COVERAGE_SUMMARY,
      repoRoot: REPO_ROOT,
    });

    expect(runRecord.runId).toBe("12345");
    expect(runRecord.tests).toHaveLength(3);
    expect(runRecord.coverage.overallPercent).toBe(80);

    const indexEntry = buildIndexEntry(runRecord);
    expect(indexEntry).toEqual({
      runId: "12345",
      commit: "abc123",
      branch: "main",
      completedAt: "2026-09-27T00:01:00Z",
      conclusion: "failure",
      passed: 1,
      failed: 1,
      skipped: 1,
    });
  });
});

describe("mergeIndex", () => {
  const entryA = { runId: "1", commit: "a", branch: "main", completedAt: "t1", conclusion: "success", passed: 1, failed: 0, skipped: 0 };
  const entryB = { runId: "2", commit: "b", branch: "main", completedAt: "t2", conclusion: "success", passed: 2, failed: 0, skipped: 0 };

  it("空のindex.jsonへ新規エントリを追記する", () => {
    expect(mergeIndex({ runs: [] }, entryA)).toEqual({ runs: [entryA] });
  });

  it("runsキーが無いindex.jsonにも新規エントリを追記できる", () => {
    expect(mergeIndex({}, entryA)).toEqual({ runs: [entryA] });
  });

  it("同一runIdが既に存在する場合は上書きし、他のエントリは保持する", () => {
    const updatedEntryA = { ...entryA, conclusion: "failure", failed: 1 };
    const result = mergeIndex({ runs: [entryA, entryB] }, updatedEntryA);

    expect(result.runs).toEqual([updatedEntryA, entryB]);
  });

  it("新しいrunIdの場合は末尾に追記する(既存エントリの順序を変えない)", () => {
    const result = mergeIndex({ runs: [entryA] }, entryB);

    expect(result.runs).toEqual([entryA, entryB]);
  });
});
