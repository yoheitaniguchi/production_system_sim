import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

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

// SEC-006（本番依存のhigh/critical脆弱性ゲート）は、npm registryへの通信を伴うためvitestから外し、
// CIの dependency-audit ジョブ（.github/workflows/test.yml、`npm run audit:security`）で検証する。
// 集計ロジック（summarizeAuditReport）の単体テストは scripts/security-audit.test.mjs にある。
