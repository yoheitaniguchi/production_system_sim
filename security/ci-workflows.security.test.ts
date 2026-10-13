import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = path.resolve(__dirname, "..");
const WORKFLOWS_DIR = path.join(REPO_ROOT, ".github", "workflows");

const USES_PATTERN = /^\s*-?\s*uses:\s*([^\s#]+)/gm;
// 40桁の16進数（コミットSHA）で終わるものだけを「SHA固定」とみなす
const SHA_PIN_PATTERN = /@[0-9a-f]{40}$/;
// GitHub公式（actions/*, github/*）は比較的信頼度が高いため、本テストではサードパーティ製のみを対象にする
const FIRST_PARTY_PREFIXES = ["actions/", "github/"];

function listWorkflowFiles(): string[] {
  return fs.readdirSync(WORKFLOWS_DIR).filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"));
}

function extractUsesRefs(yamlContent: string): string[] {
  const refs: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = USES_PATTERN.exec(yamlContent)) !== null) {
    refs.push(match[1]);
  }
  return refs;
}

function isThirdParty(actionRef: string): boolean {
  return !FIRST_PARTY_PREFIXES.some((prefix) => actionRef.startsWith(prefix));
}

// SEC-005（docs/security/reports参照）：サードパーティ製のGitHub Actions（peaceiris/actions-gh-pages・
// rossjrw/pr-preview-action等）がバージョンタグ（例: @v4）参照のままで、コミットSHA固定になっていない。
// deploy.yml・pr-preview.ymlは`contents: write`等の強い権限を持つワークフローでこれらを使っており、
// タグの指す内容が後から差し替えられた場合（タグの再作成・アカウント乗っ取り等）に任意コードが実行される
// サプライチェーンリスクがある。
describe("GitHub Actionsワークフロー（SEC-005: サードパーティActionのSHA固定）", () => {
  const files = listWorkflowFiles();
  it("[@security][異常] 検査対象のワークフローファイルが存在する", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    it(`[@security][異常] ${file} が参照するサードパーティActionはコミットSHAで固定されている`, () => {
      const content = fs.readFileSync(path.join(WORKFLOWS_DIR, file), "utf-8");
      const refs = extractUsesRefs(content).filter(isThirdParty);
      const unpinned = refs.filter((ref) => !SHA_PIN_PATTERN.test(ref));
      expect(unpinned, `SHA固定されていないサードパーティAction: ${unpinned.join(", ")}`).toEqual([]);
    });
  }
});

// ---- 以下、文字列・正規表現ベースの簡易YAML解析ヘルパー（新規依存を増やさないため） ----

function readWorkflow(file: string): string {
  return fs.readFileSync(path.join(WORKFLOWS_DIR, file), "utf-8");
}

/** コメント行・行末コメントを除いた行配列を返す（文字列中の#は本リポジトリのワークフローでは考慮不要） */
function stripComments(yamlContent: string): string[] {
  return yamlContent
    .split(/\r?\n/)
    .map((line) => (/^\s*#/.test(line) ? "" : line.replace(/\s+#.*$/, "")));
}

/** トップレベル`jobs:`配下の各ジョブ（2スペースインデントのキー）ごとに本文の行を切り出す */
function extractJobs(yamlContent: string): Map<string, string[]> {
  const lines = stripComments(yamlContent);
  const jobs = new Map<string, string[]>();
  const jobsStart = lines.findIndex((l) => /^jobs:\s*$/.test(l));
  if (jobsStart < 0) return jobs;
  let current: string | null = null;
  for (let i = jobsStart + 1; i < lines.length; i++) {
    const line = lines[i];
    if (/^\S/.test(line)) break; // 次のトップレベルキー
    const m = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(line);
    if (m) {
      current = m[1];
      jobs.set(current, []);
      continue;
    }
    if (current) jobs.get(current)!.push(line);
  }
  return jobs;
}

/** トップレベル（インデント0）の`permissions:`ブロックを返す。無ければnull */
function extractTopLevelPermissions(yamlContent: string): string | null {
  const lines = stripComments(yamlContent);
  const idx = lines.findIndex((l) => /^permissions:/.test(l));
  if (idx < 0) return null;
  const block = [lines[idx]];
  for (let i = idx + 1; i < lines.length; i++) {
    if (/^\S/.test(lines[i])) break;
    block.push(lines[i]);
  }
  return block.join("\n");
}

const AUDIT_RUN_PATTERN = /^\s*(?:-\s*)?run:\s*npm run audit:security\b(.*)$/;

// SEC-001（docs/security/reports参照）：本番依存のhigh/critical脆弱性ゲート（旧SEC-006）をvitestから
// test.ymlの`dependency-audit`ジョブへ移した。ゲートとして機能するには、(1)ジョブが存在してPRで起動し、
// (2)失敗が`continue-on-error`や`|| true`で握りつぶされず、(3)スクリプト側が脆弱性検出時に非ゼロ終了する
// 必要がある。なお「mainのRulesetの必須チェックに含まれていること」はリポジトリ設定であり、
// リポジトリ内のファイルからは検査できない（テスト不能。レビューレポート側で人手確認とする）。
describe("GitHub Actionsワークフロー（SEC-001: 依存脆弱性ゲートのCIジョブ）", () => {
  const content = readWorkflow("test.yml");
  const jobs = extractJobs(content);
  const auditJobs = [...jobs.entries()].filter(([, body]) => body.some((l) => AUDIT_RUN_PATTERN.test(l)));

  it("[@security][異常] test.ymlに`npm run audit:security`を実行するジョブが存在する", () => {
    expect(auditJobs.map(([name]) => name), "audit:securityを実行するジョブが見つからない").not.toEqual([]);
  });

  it("[@security][異常] test.ymlはpull_requestトリガーで起動する（PR時に脆弱性ゲートが走る）", () => {
    expect(content).toMatch(/^on:\s*\n(?:\s+.*\n)*?\s+pull_request:/m);
  });

  it("[@security][異常] 脆弱性ゲートのジョブ・ステップは失敗を握りつぶしていない（continue-on-error・|| true・if条件なし）", () => {
    for (const [name, body] of auditJobs) {
      const text = body.join("\n");
      expect(text, `${name}: continue-on-errorで失敗が無視される`).not.toMatch(/continue-on-error:\s*(true|\$\{\{)/);
      // ジョブ単位のif（4スペースインデント）でスキップされうる構成になっていないこと
      expect(body.some((l) => /^ {4}if:/.test(l)), `${name}: ジョブにif条件があり実行がスキップされうる`).toBe(false);
      for (const line of body) {
        const m = AUDIT_RUN_PATTERN.exec(line);
        if (m) {
          expect(m[1], `${name}: audit:securityの終了コードが握りつぶされている`).not.toMatch(/\|\||;\s*exit 0|\|\s*true/);
        }
      }
    }
  });

  it("[@security][異常] audit:securityスクリプトは脆弱性検出時に非ゼロ終了する実装になっている", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "package.json"), "utf-8"));
    expect(pkg.scripts?.["audit:security"]).toBe("node scripts/security-audit.mjs");
    const script = fs.readFileSync(path.join(REPO_ROOT, "scripts", "security-audit.mjs"), "utf-8");
    expect(script).toMatch(/process\.exit(?:Code\s*=\s*1|\(1\))/);
  });
});

// SEC-002（docs/security/reports参照）：test.yml・flaky-check.ymlにトップレベルの`permissions:`が無く、
// `contents: write`を明示した`test`ジョブ以外はリポジトリ既定のGITHUB_TOKEN権限に従う。既定が
// Read and writeの場合、不要な書き込み権限が付与される。全ワークフローがトップレベルで最小権限を明示し、
// 書き込みが必要なジョブだけジョブ単位で付与する状態を期待する。
describe("GitHub Actionsワークフロー（SEC-002: トップレベルpermissionsの明示）", () => {
  const files = listWorkflowFiles();
  for (const file of files) {
    it(`[@security][異常] ${file} はトップレベルでpermissionsを明示している（write-allでない）`, () => {
      const perms = extractTopLevelPermissions(readWorkflow(file));
      expect(perms, `${file}: トップレベルのpermissions:が無く、リポジトリ既定のトークン権限に従う`).not.toBeNull();
      expect(perms!).not.toMatch(/write-all/);
    });
  }
});
