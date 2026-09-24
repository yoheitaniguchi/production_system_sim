<!--
このファイルは docs/issue-drafts/issue-b-ci-junit-triggers.md をユーザーの決定（目的が異なるため
B1/B2に分割する）に基づき分割したものである。旧ファイルの要件A・Cに対応する。
issue-workflow（.claude/skills/issue-workflow/SKILL.md）の手順4（GitHub Issue起票）に進む前提の
最終下書き。
-->

# [要望] CI結果のJUnit XML出力とワークフロー起動条件の見直し

## 概要

vitestの標準機能でJUnit XML形式のレポーターを追加してCI成果物として保存し、`test.yml`の起動条件（push・手動実行）を見直す。

## 背景・目的

自動テスト管理アプリ（PoC）とこのリポジトリを接続する準備として`.github/workflows/`を調査したところ、次の事実が分かった：

- `test.yml`（`on: pull_request`のみ）はtestジョブで`npm test`（vitest run）を実行するが、結果は標準出力のみで、構造化された結果ファイル（JUnit XML等）を出力・保存していない
- `a11y`ジョブは`playwright-report/`をartifactとして保存しているが、これはHTMLレポートであり、`playwright.config.ts:12`のreporter設定にJUnit出力も無い（Playwright側は別Issue「業務シナリオの自動E2Eテストの新設」で対応する）
- `deploy.yml`も`npm test`を実行するが、成果物は保存していない
- `test.yml`が`pull_request`イベントでしか起動しないため、mainブランチへの直接pushや手動実行での検証ができない

外部の自動テスト管理アプリがCI結果を取り込むには機械可読な結果ファイルが必要であり、現状はそれが無い。この対応により、①外部PoCがCI結果を自動取得できるようになる、②mainへの直接pushや`workflow_dispatch`による手動実行でもテスト状況を確認できるようになり、開発チームがPR作成前に任意のタイミングで検証しやすくなる、という効果が見込める。

（フレーキーテスト検出は目的が異なる別Issueとして分割した。そちらは`docs/issue-drafts/issue-b2-flaky-check.md`を参照）

## 要件

1. `vite.config.ts`の`test`設定にvitest標準搭載の`junit`レポーター（vitest 4.1.10はビルトインで提供しており追加のdevDependencyは不要）を`reporters`オプションで追加し、`npm test`実行時に`test-results/junit.xml`を出力する（`outputFile`オプションで明示的にパス指定する）。既存の`.gitignore`（`/test-results`はPlaywright用に既に除外設定済み）に出力先ディレクトリ名が重なるため、コミット対象に混入しないことを併せて確認する
2. `.github/workflows/test.yml`のtestジョブに`actions/upload-artifact@v4`のステップを追加し、`if: always()`（テスト失敗時も結果ファイルを回収できるように）で上記XMLファイルを保存する。artifact名は`a11y`ジョブの`playwright-report`と衝突しない名前（例：`vitest-junit-report`）にする
3. `test.yml`の`on:`に`push`（対象ブランチは`main`のみ。`deploy.yml`の`on.push.branches: [main]`と同じ条件に揃え、feature branchへの都度実行によるCIコスト増加を避ける）と`workflow_dispatch`を追加する
4. 上記の変更が`deploy.yml`・`pr-preview.yml`の既存動作（ジョブ構成・`on:`条件）に一切影響しないこと、および`test.yml`については`on:`セクションの追加以外（`jobs:`以下のステップ）に変更が無いことを確認する

## 対象範囲外

- Playwright（e2e）側へのJUnitレポーター追加（`docs/issue-drafts/issue-d-e2e-scenario.md`で対応する`test:e2e:scenario`スクリプトの中で個別に追加する。`a11y`ジョブ自体への追加はこのIssueにもそちらにも含まない）
- フレーキーテスト検出用ワークフローの新設（`docs/issue-drafts/issue-b2-flaky-check.md`で対応）
- 自動テスト管理アプリ側でのJUnit XML取り込み設定（このリポジトリ側の対応のみが対象）

## 受け入れ条件

- [ ] `npm test`実行後、`test-results/junit.xml`にJUnit形式の結果ファイルが生成される（追加のdevDependencyインストールが不要であることを`package.json`のdiffで確認する）
- [ ] `test.yml`のtestジョブの実行結果画面（Actions）で、上記ファイルがartifact（`playwright-report`とは別名）として確認できる
- [ ] `test.yml`の`on:`に`push`（`branches: [main]`）・`workflow_dispatch`が追加されている
- [ ] mainブランチへのpush、または`workflow_dispatch`による手動実行でtestジョブが起動しgreenになる。かつ既存の`pull_request`イベントでの起動・green化も従来どおり機能する
- [ ] `deploy.yml`・`pr-preview.yml`のファイルにgit diffが無い（ジョブ構成・`on:`条件とも無変更）
- [ ] `test.yml`について`on:`セクション以外（`jobs:`以下のステップ）にdiffが無い

## 参考資料

- `.github/workflows/test.yml`（`on: pull_request`、L1-25）
- `.github/workflows/deploy.yml`（`on.push.branches: [main]`の書き方の参考、L1-17）
- `.github/workflows/pr-preview.yml`
- `vite.config.ts`（現状`test.exclude`のみ設定済み、reporterは未設定）
- `playwright.config.ts:12`（reporterの`list`/`html`設定。JUnit未設定、本Issueの対象外）
- `package.json`（`test`スクリプト：`vitest run`。`vitest ^4.1.10`は標準で`junit`レポーターを搭載）
- `.gitignore`（`/test-results`が既にPlaywright用に除外設定済み。vitestのJUnit出力先ディレクトリ名の重複に注意）
- `docs/issue-drafts/issue-b2-flaky-check.md`（分割元から切り出したフレーキー検出Issue）
