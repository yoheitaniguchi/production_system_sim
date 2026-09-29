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
