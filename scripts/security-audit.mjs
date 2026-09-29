#!/usr/bin/env node
// `npm run audit:security`（docs/security/checklist.md §6.3「依存パッケージの脆弱性・ライセンス」）が
// 呼び出す非機能チェックスクリプト。`npm test`（vitestのdomain単体テスト）や`npm run test:security`
// （@securityタグのvitestテスト）とは別枠とし、依存関係の脆弱性・ライセンスという「コードの外」の
// チェックをここに集約する。
//
// 集計ロジック（summarizeAuditReport・classifyLicense・summarizeLicenses）は純粋関数としてexportし、
// security-audit.test.mjsから単体テストする。`npm audit`の実行・node_modulesの走査（副作用）は
// main()内に閉じ、単体テストの対象外とする（scripts/aggregate-test-results.mjsと同じ分離方針）。
//
// 本番依存（--omit=dev）にhigh/critical脆弱性が1件でもあればexit 1にする。dev依存の脆弱性・
// ライセンスの指摘は現時点では報告のみでビルドを失敗させない（docs/security/checklist.md §6.3参照）。

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const STRONG_COPYLEFT = ["GPL", "AGPL", "LGPL"];

/** `npm audit --json`の出力から重大度別件数と、high/critical判定を取り出す */
export function summarizeAuditReport(auditJson) {
  const counts = auditJson?.metadata?.vulnerabilities ?? {};
  const high = counts.high ?? 0;
  const critical = counts.critical ?? 0;
  const moderate = counts.moderate ?? 0;
  const low = counts.low ?? 0;
  const info = counts.info ?? 0;
  return {
    critical,
    high,
    moderate,
    low,
    info,
    total: counts.total ?? critical + high + moderate + low + info,
    hasBlockingVulnerabilities: critical > 0 || high > 0,
  };
}

/** SPDX風のライセンス文字列1件を分類する（大文字小文字は無視、OR式は先頭要素で代表させる） */
export function classifyLicense(license) {
  if (!license || typeof license !== "string" || !license.trim()) return "unknown";
  const upper = license.toUpperCase();
  if (STRONG_COPYLEFT.some((tag) => upper.includes(tag))) return "copyleft-strong";
  return "permissive-or-other";
}

/** {name, version, license}の配列から、分類ごとの件数と要注意パッケージの一覧を作る */
export function summarizeLicenses(records) {
  const byClass = { "copyleft-strong": [], unknown: [], "permissive-or-other": 0 };
  for (const record of records) {
    const cls = classifyLicense(record.license);
    if (cls === "permissive-or-other") {
      byClass["permissive-or-other"] += 1;
    } else {
      byClass[cls].push(record);
    }
  }
  return byClass;
}

function runNpmAudit(args) {
  const result = spawnSync("npm", ["audit", "--json", ...args], { encoding: "utf-8" });
  // npm auditは脆弱性が見つかると非ゼロで終了するため、stdoutのJSONだけを見る（exit codeは無視する）
  try {
    return JSON.parse(result.stdout);
  } catch {
    console.error("npm auditの出力をJSONとして解釈できませんでした:");
    console.error(result.stdout || result.stderr);
    process.exitCode = 1;
    return null;
  }
}

/** node_modules直下・スコープ付きパッケージ・ネストしたnode_modulesを再帰的に集めてlicenseを読む */
function collectInstalledLicenses(rootDir) {
  const records = [];
  const seen = new Set();

  function walk(nodeModulesDir) {
    if (!fs.existsSync(nodeModulesDir)) return;
    for (const entry of fs.readdirSync(nodeModulesDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith(".")) continue;
      if (entry.name.startsWith("@")) {
        const scopeDir = path.join(nodeModulesDir, entry.name);
        for (const scoped of fs.readdirSync(scopeDir, { withFileTypes: true })) {
          if (scoped.isDirectory()) readPackage(scopeDir, scoped.name);
        }
        continue;
      }
      readPackage(nodeModulesDir, entry.name);
    }
  }

  function readPackage(dir, name) {
    const pkgDir = path.join(dir, name);
    const pkgJsonPath = path.join(pkgDir, "package.json");
    if (!fs.existsSync(pkgJsonPath)) return;
    let pkg;
    try {
      pkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8"));
    } catch {
      return;
    }
    const key = `${pkg.name ?? name}@${pkg.version ?? "?"}`;
    if (!seen.has(key)) {
      seen.add(key);
      const license = typeof pkg.license === "string" ? pkg.license : pkg.license?.type;
      records.push({ name: pkg.name ?? name, version: pkg.version ?? "?", license });
    }
    walk(path.join(pkgDir, "node_modules"));
  }

  walk(path.join(rootDir, "node_modules"));
  return records;
}

function main() {
  const rootDir = process.cwd();

  console.log("=== npm audit（本番依存のみ、--omit=dev） ===");
  const prodAudit = runNpmAudit(["--omit=dev"]);
  if (prodAudit) {
    const prodSummary = summarizeAuditReport(prodAudit);
    console.log(
      `critical=${prodSummary.critical} high=${prodSummary.high} moderate=${prodSummary.moderate} low=${prodSummary.low} info=${prodSummary.info}`,
    );
    if (prodSummary.hasBlockingVulnerabilities) {
      console.error("本番依存にhigh/critical脆弱性が検出されました。npm audit --omit=devの詳細を確認してください。");
      process.exitCode = 1;
    } else {
      console.log("本番依存にhigh/critical脆弱性はありません。");
    }
  }

  console.log("\n=== npm audit（dev依存を含む全体、参考情報） ===");
  const allAudit = runNpmAudit([]);
  if (allAudit) {
    const allSummary = summarizeAuditReport(allAudit);
    console.log(
      `critical=${allSummary.critical} high=${allSummary.high} moderate=${allSummary.moderate} low=${allSummary.low} info=${allSummary.info}`,
    );
    console.log("（dev依存の脆弱性は現時点ではビルドを失敗させません。docs/security/checklist.md §6.3参照）");
  }

  console.log("\n=== ライセンス一覧（node_modules走査、参考情報） ===");
  const records = collectInstalledLicenses(rootDir);
  const licenseSummary = summarizeLicenses(records);
  console.log(`検査対象パッケージ数: ${records.length}`);
  console.log(`permissiveまたはその他: ${licenseSummary["permissive-or-other"]}件`);
  console.log(`ライセンス不明: ${licenseSummary.unknown.length}件`);
  if (licenseSummary.unknown.length > 0) {
    for (const r of licenseSummary.unknown.slice(0, 20)) console.log(`  - ${r.name}@${r.version}`);
    if (licenseSummary.unknown.length > 20) console.log(`  ...ほか${licenseSummary.unknown.length - 20}件`);
  }
  console.log(`強いコピーレフト（GPL/AGPL/LGPL系）: ${licenseSummary["copyleft-strong"].length}件`);
  for (const r of licenseSummary["copyleft-strong"]) {
    console.log(`  - ${r.name}@${r.version} (${r.license})`);
  }
  console.log(
    "（本リポジトリはGitHub Pagesで静的ファイルとして公開される教材アプリ。強いコピーレフトのビルド時依存が" +
      "配布物に含まれるかは個別に要確認。ここでは一覧化のみ行い、ビルドは失敗させない）",
  );
}

const isMainModule = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (isMainModule) {
  main();
}
