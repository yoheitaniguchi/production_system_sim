#!/usr/bin/env node
// CI（test.ymlのtestジョブ）が完了した際に、JUnit XML（test-results/junit.xml）とカバレッジの
// json-summary（coverage/coverage-summary.json）を読み取り、自動テスト管理アプリ（別Issueで実装予定）
// が読みやすいJSON形式（runs/<runId>.json・index.json）へ変換し、dataブランチへコミット・pushする
// （Issue #98）。dataブランチへの書き込みが必要ない場合（pull_requestトリガー）はJSON変換のみ行う。
//
// 変換ロジック（parseJUnitXml・buildCoverageSummary・buildRunRecord・buildIndexEntry・mergeIndex・
// extractTag）は純粋関数としてexportし、aggregate-test-results.test.mjsから単体テストする。
// git操作（dataブランチへのfetch/commit/push、非fast-forward時のリトライ）はmain()内に閉じ、
// 単体テストの対象外とする。

import { XMLParser } from "fast-xml-parser";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// docs/test-management-app-requirements.md 9.1で実機確認済みの、印（タグ）抽出用の正規表現。
// 属性値全体に対する部分一致とし、先頭一致を仮定しない（describeとitの連結で印が先頭に来ない場合があるため）。
// 自動テスト管理アプリ本体（別Issue）がそのまま使えるよう、この抽出ロジックを再利用可能な形でここに置く
// （runs/<runId>.jsonのスキーマにはタグ専用フィールドを設けず、name属性へタグを含めたまま渡す。9.1参照）
export const TAG_PATTERN = /\[UC-\d+.*?\]\[.*?\]\[.*?\](\[.*?\])?/;

export function extractTag(name) {
  const match = typeof name === "string" ? name.match(TAG_PATTERN) : null;
  return match ? match[0] : null;
}

// 失敗メッセージから「ファイルパス:行番号」に一致する最初のパターンをbest-effortで抽出する
const LOCATION_PATTERN = /([^\s()]+\.(?:tsx?|jsx?|mjs|cjs):\d+(?::\d+)?)/;

function extractLocation(failureMessage) {
  const match = typeof failureMessage === "string" ? failureMessage.match(LOCATION_PATTERN) : null;
  return match ? match[1] : undefined;
}

function toArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

const xmlParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });

function parseTestcase(testcase) {
  const file = testcase["@_classname"];
  const name = testcase["@_name"];
  const durationMs = Math.round(parseFloat(testcase["@_time"] ?? "0") * 1000);

  const entry = { file, name, status: "passed", durationMs };

  const failureOrError = testcase.failure ?? testcase.error;
  if (failureOrError !== undefined) {
    entry.status = "failed";
    const node = Array.isArray(failureOrError) ? failureOrError[0] : failureOrError;
    const text = typeof node === "string" ? node : node?.["#text"];
    const failureMessage = typeof text === "string" ? text.trim() : node?.["@_message"];
    if (failureMessage) {
      entry.failureMessage = failureMessage;
      const location = extractLocation(failureMessage);
      if (location) entry.location = location;
    }
  } else if (testcase.skipped !== undefined) {
    entry.status = "skipped";
  }

  return entry;
}

// JUnit XML文字列を、runs/<runId>.jsonのtests配列に対応するオブジェクト配列へ変換する
export function parseJUnitXml(xmlString) {
  const doc = xmlParser.parse(xmlString);
  const suites = toArray(doc?.testsuites?.testsuite);
  const tests = [];
  for (const suite of suites) {
    for (const testcase of toArray(suite.testcase)) {
      tests.push(parseTestcase(testcase));
    }
  }
  return tests;
}

function toRelativePath(absolutePath, repoRoot) {
  const relative = path.relative(repoRoot, absolutePath);
  return relative.split(path.sep).join("/");
}

// coverage-summary.jsonを、runs/<runId>.jsonのcoverageフィールドへ変換する。
// "total"キーはfiles配列に含めず、overallPercentの算出元としてのみ使う（採用する指標はlines.pctに固定）
export function buildCoverageSummary(coverageSummaryJson, repoRoot) {
  const files = [];
  let overallPercent = 0;
  for (const [key, value] of Object.entries(coverageSummaryJson ?? {})) {
    if (key === "total") {
      overallPercent = value?.lines?.pct ?? 0;
      continue;
    }
    files.push({ path: toRelativePath(key, repoRoot), percent: value?.lines?.pct ?? 0 });
  }
  return { overallPercent, overallPercentMetric: "lines", files };
}

// runs/<runId>.json 1件分を組み立てる
export function buildRunRecord({
  runId,
  workflow,
  trigger,
  commit,
  branch,
  startedAt,
  completedAt,
  conclusion,
  junitXml,
  coverageSummaryJson,
  repoRoot,
}) {
  return {
    runId: String(runId),
    workflow,
    trigger,
    commit,
    branch,
    startedAt,
    completedAt,
    conclusion,
    tests: parseJUnitXml(junitXml),
    coverage: buildCoverageSummary(coverageSummaryJson, repoRoot),
  };
}

// index.jsonのruns配列に載せる要約1件分を、runs/<runId>.jsonから導出する
export function buildIndexEntry(runRecord) {
  const counts = { passed: 0, failed: 0, skipped: 0 };
  for (const test of runRecord.tests) {
    if (test.status === "passed") counts.passed += 1;
    else if (test.status === "failed") counts.failed += 1;
    else if (test.status === "skipped") counts.skipped += 1;
  }
  return {
    runId: runRecord.runId,
    commit: runRecord.commit,
    branch: runRecord.branch,
    completedAt: runRecord.completedAt,
    conclusion: runRecord.conclusion,
    ...counts,
  };
}

// 既存のindex.json（{ runs: [...] }）へ、1実行分のエントリを追記または上書き（同一runId）する
export function mergeIndex(indexJson, entry) {
  const runs = Array.isArray(indexJson?.runs) ? indexJson.runs : [];
  const existingIndex = runs.findIndex((run) => run.runId === entry.runId);
  const nextRuns =
    existingIndex === -1 ? [...runs, entry] : runs.map((run, i) => (i === existingIndex ? entry : run));
  return { runs: nextRuns };
}

// ==== ここから下はgit操作を含み、単体テストの対象外（main()から呼ばれるCLI/CI連携部分） ====

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`環境変数 ${name} が設定されていません`);
  return value;
}

function gitAllowFail(args, options = {}) {
  return spawnSync("git", args, { encoding: "utf-8", ...options });
}

function git(args, options = {}) {
  const result = gitAllowFail(args, options);
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed:\n${result.stderr || result.stdout}`);
  }
  return result;
}

const MAX_PUSH_RETRIES = 5;

function fetchDataBranch(repoRoot) {
  const result = gitAllowFail(["-C", repoRoot, "fetch", "origin", "data:refs/remotes/origin/data", "--depth=1", "--force"]);
  return result.status === 0;
}

function writeRunFiles(worktreeDir, runRecord, indexEntry) {
  const indexPath = path.join(worktreeDir, "index.json");
  const existingIndex = fs.existsSync(indexPath) ? JSON.parse(fs.readFileSync(indexPath, "utf-8")) : { runs: [] };
  const nextIndex = mergeIndex(existingIndex, indexEntry);

  fs.mkdirSync(path.join(worktreeDir, "runs"), { recursive: true });
  fs.writeFileSync(path.join(worktreeDir, "runs", `${runRecord.runId}.json`), `${JSON.stringify(runRecord, null, 2)}\n`);
  fs.writeFileSync(indexPath, `${JSON.stringify(nextIndex, null, 2)}\n`);
}

// design：dataブランチの読み書きは、現在のチェックアウト（テスト実行に使ったワーキングツリー）に
// 影響を与えないよう、専用のgit worktree（OSの一時ディレクトリ配下）で行う（Issue #98の要求）
function publishToDataBranch({ repoRoot, runRecord, indexEntry }) {
  const worktreeDir = fs.mkdtempSync(path.join(os.tmpdir(), "data-branch-"));
  const localBranch = `data-ci-${runRecord.runId}`;

  try {
    const branchExists = fetchDataBranch(repoRoot);
    if (branchExists) {
      git(["-C", repoRoot, "worktree", "add", "-B", localBranch, worktreeDir, "refs/remotes/origin/data"]);
    } else {
      git(["-C", repoRoot, "worktree", "add", "--detach", worktreeDir]);
      git(["-C", worktreeDir, "checkout", "--orphan", localBranch]);
      gitAllowFail(["-C", worktreeDir, "rm", "-rf", "--quiet", "."]);
    }
    git(["-C", worktreeDir, "config", "user.name", "github-actions[bot]"]);
    git(["-C", worktreeDir, "config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com"]);

    for (let attempt = 1; attempt <= MAX_PUSH_RETRIES; attempt += 1) {
      if (attempt > 1 && fetchDataBranch(repoRoot)) {
        git(["-C", worktreeDir, "reset", "--hard", "refs/remotes/origin/data"]);
      }

      writeRunFiles(worktreeDir, runRecord, indexEntry);

      git(["-C", worktreeDir, "add", `runs/${runRecord.runId}.json`, "index.json"]);
      git([
        "-C",
        worktreeDir,
        "commit",
        "--quiet",
        "-m",
        `test run ${runRecord.runId}: passed=${indexEntry.passed} failed=${indexEntry.failed} skipped=${indexEntry.skipped}`,
      ]);

      const pushResult = gitAllowFail(["-C", worktreeDir, "push", "origin", "HEAD:data"]);
      if (pushResult.status === 0) {
        console.log(`dataブランチへ実行結果を書き込みました（runId=${runRecord.runId}, 試行${attempt}回目）`);
        return;
      }
      console.log(`::warning::dataブランチへのpushが競合したため再試行します（${attempt}/${MAX_PUSH_RETRIES}）: ${pushResult.stderr}`);
    }

    console.log(
      `::warning::dataブランチへの書き込みに${MAX_PUSH_RETRIES}回失敗しました。runId=${runRecord.runId}の結果はdataブランチに反映されていません`,
    );
  } finally {
    gitAllowFail(["-C", repoRoot, "worktree", "remove", "--force", worktreeDir]);
    gitAllowFail(["-C", repoRoot, "branch", "-D", localBranch]);
  }
}

async function main() {
  const repoRoot = process.cwd();
  const junitPath = path.join(repoRoot, "test-results", "junit.xml");
  const coveragePath = path.join(repoRoot, "coverage", "coverage-summary.json");

  if (!fs.existsSync(junitPath)) {
    console.log(`::warning::JUnit結果ファイルが見つからないため、テスト結果の集約をスキップします: ${junitPath}`);
    return;
  }

  const runId = requireEnv("RUN_ID");
  const trigger = requireEnv("TRIGGER");
  const commit = requireEnv("COMMIT_SHA");
  const branch = requireEnv("BRANCH_NAME");
  const startedAt = requireEnv("STARTED_AT");
  const runConclusion = requireEnv("RUN_CONCLUSION");
  const conclusion = runConclusion === "success" ? "success" : "failure";
  const completedAt = new Date().toISOString();

  const junitXml = fs.readFileSync(junitPath, "utf-8");
  const coverageSummaryJson = fs.existsSync(coveragePath)
    ? JSON.parse(fs.readFileSync(coveragePath, "utf-8"))
    : {};

  const runRecord = buildRunRecord({
    runId,
    workflow: "test.yml",
    trigger,
    commit,
    branch,
    startedAt,
    completedAt,
    conclusion,
    junitXml,
    coverageSummaryJson,
    repoRoot,
  });
  const indexEntry = buildIndexEntry(runRecord);

  console.log(
    `テスト結果を集約しました（runId=${runId}, conclusion=${conclusion}, passed=${indexEntry.passed}, failed=${indexEntry.failed}, skipped=${indexEntry.skipped}）`,
  );

  if (trigger === "pull_request") {
    console.log("pull_requestトリガーのため、dataブランチへの書き込みをスキップしました（JSON変換のみ実施）");
    return;
  }

  publishToDataBranch({ repoRoot, runRecord, indexEntry });
}

const isMainModule = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (isMainModule) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
