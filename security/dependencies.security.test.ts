import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { summarizeAuditReport } from "../scripts/security-audit.mjs";

const REPO_ROOT = path.resolve(__dirname, "..");

// SEC-004（docs/security/reports参照）：.gitignoreに`.env*`の除外が無い。現状は秘密情報を扱う
// 環境変数が存在しないため実害は無いが、将来.envファイルが追加された際にコミットされてしまう
// 予防策が欠けている。
describe(".gitignore（SEC-004: .env系ファイルの除外漏れ）", () => {
  it("[@security][異常] .env*パターンが除外されている", () => {
    const gitignore = fs.readFileSync(path.join(REPO_ROOT, ".gitignore"), "utf-8");
    const hasEnvPattern = gitignore
      .split("\n")
      .map((line) => line.trim())
      .some((line) => line === ".env" || line === ".env*" || line === "*.env" || line === "/.env*");
    expect(hasEnvPattern).toBe(true);
  });
});

// SEC-006（Info、docs/security/reports参照）：本番依存（--omit=dev）にhigh/critical脆弱性が
// 無いことを、audit:securityと同じ集計ロジック（summarizeAuditReport）を使って回帰的に検証する。
// dev依存のみの脆弱性は現時点では許容する（checklist.md §6.3参照）ため、このテストはfailさせない。
describe("npm audit（SEC-006: 本番依存のhigh/critical脆弱性ゲート）", () => {
  it("[@security][正常] 本番依存（--omit=dev）にhigh/critical脆弱性が無い", () => {
    // npm auditは脆弱性検出時に非ゼロで終了するため、spawnSyncでexit codeを無視しJSON本文だけを見る
    // （scripts/security-audit.mjsのrunNpmAuditと同じ方針）
    const result = spawnSync("npm", ["audit", "--omit=dev", "--json"], { cwd: REPO_ROOT, encoding: "utf-8" });
    const summary = summarizeAuditReport(JSON.parse(result.stdout));
    expect(summary.hasBlockingVulnerabilities).toBe(false);
  });
});
