<!--
このファイルは、自動テスト管理アプリ（PoC）接続readiness調査（docs/poc-readiness-report.md）に基づき、
issue-workflow（.claude/skills/issue-workflow/SKILL.md）の手順1（Issue下書き作成）・3（issue-spec-reviewer
によるレビュー）まで実施した結果のIssue下書きである。GitHub上への実際の起票（手順4）はまだ行っていない。
着手を指示する場合は、末尾「レビュー時の確認事項」に回答したうえで承認してください。
-->

## issue-spec-reviewerによる指摘サマリ

- **曖昧さの解消・分解粒度**：要件1「追加パッケージが必要な場合は明記する」が条件文のまま未確定だった → vitest 4.1.10はJUnitレポーターを標準搭載しており追加devDependency不要と断定できるため明記した。要件4のフレーキー検出ワークフローの頻度・対象ブランチが「要検討」のまま受け入れ条件化されていなかった → 初期値を提案し確認事項に切り出した。
- **内部矛盾**：受け入れ条件の最終項目が「test.ymlのジョブ構成・起動条件に変更が無い」としていたが、要件3自体がtest.ymlの`on:`変更なので矛盾していた → 「`on:`セクション以外は無変更」という条件に書き分けた。
- **要件が複数の独立した変更を一つに束ねている**：(A)JUnit出力＋起動条件見直し（外部PoC連携が目的）と(B)フレーキーテスト検出（テストの不安定性検知が目的）は目的が異なる → 要件をA/Bに分けて明示し、分割要否を「レビュー時の確認事項」に残した。
- **費用対効果**：影響ファイルは`.github/workflows/test.yml`・新規`.github/workflows/flaky-check.yml`・`vite.config.ts`のみ（`Grep`/`Glob`で確認）。判定＝**軽**。

## 改善済み下書き

# [要望] CI結果のJUnit XML出力とワークフロー起動条件の見直し

## 概要

vitestの標準機能でJUnit XML形式のレポーターを追加してCI成果物として保存し、`test.yml`の起動条件（push・手動実行）を見直す。あわせてフレーキーテスト検出用のワークフローを新設する（目的が異なるため分割の要否は末尾「レビュー時の確認事項」を参照）。

## 背景・目的

自動テスト管理アプリ（PoC）とこのリポジトリを接続する準備として`.github/workflows/`を調査したところ、次の事実が分かった：

- `test.yml`（`on: pull_request`のみ）はtestジョブで`npm test`（vitest run）を実行するが、結果は標準出力のみで、構造化された結果ファイル（JUnit XML等）を出力・保存していない
- `a11y`ジョブは`playwright-report/`をartifactとして保存しているが、これはHTMLレポートであり、`playwright.config.ts:12`のreporter設定にJUnit出力も無い（本Issueでは対象外。「対象範囲外」参照）
- `deploy.yml`も`npm test`を実行するが、成果物は保存していない
- `test.yml`が`pull_request`イベントでしか起動しないため、mainブランチへの直接pushや手動実行での検証ができない

外部の自動テスト管理アプリがCI結果を取り込むには機械可読な結果ファイルが必要であり、現状はそれが無い。この対応により、①外部PoCがCI結果を自動取得できるようになる、②mainへの直接pushや`workflow_dispatch`による手動実行でもテスト状況を確認できるようになり、開発チームがPR作成前に任意のタイミングで検証しやすくなる、③フレーキーテスト（実行タイミングによって結果が変わるテスト）を定期実行で早期検知できるようになり、「`npm test`が落ちた＝実装のバグ」と「たまたまテストが不安定だっただけ」の切り分け材料が得られる、という効果が見込める。

## 要件

**A. JUnit出力とtest.ymlの起動条件見直し（外部PoC連携が目的）**

1. `vite.config.ts`の`test`設定にvitest標準搭載の`junit`レポーター（vitest 4.1.10はビルトインで提供しており追加のdevDependencyは不要）を`reporters`オプションで追加し、`npm test`実行時に`test-results/junit.xml`を出力する（`outputFile`オプションで明示的にパス指定する）。既存の`.gitignore`（`/test-results`はPlaywright用に既に除外設定済み）に出力先ディレクトリ名が重なるため、コミット対象に混入しないことを併せて確認する
2. `.github/workflows/test.yml`のtestジョブに`actions/upload-artifact@v4`のステップを追加し、`if: always()`（テスト失敗時も結果ファイルを回収できるように）で上記XMLファイルを保存する。artifact名は`a11y`ジョブの`playwright-report`と衝突しない名前（例：`vitest-junit-report`）にする
3. `test.yml`の`on:`に`push`（対象ブランチは`main`のみ。`deploy.yml`の`on.push.branches: [main]`と同じ条件に揃え、feature branchへの都度実行によるCIコスト増加を避ける）と`workflow_dispatch`を追加する

**B. フレーキーテスト検出ワークフローの新設（テストの不安定性検知が目的。Aとは独立した目的のため分割要否を要確認）**

4. 同一コミットに対して`npm test`を3回連続実行し、結果（成功/失敗・失敗したテスト名）が毎回一致するかを確認する「フレーキーテスト検出」ワークフローを、既存の`test.yml`とは別ファイル`.github/workflows/flaky-check.yml`として新設する。初期値として`schedule:`は平日1日1回（例：`cron: "0 21 * * 1-5"`＝日本時間06:00、mainブランチの最新コミットを対象）、動作確認用に`workflow_dispatch:`も付ける（頻度・曜日は運用開始後の見直しを前提とした初期値。確定は「レビュー時の確認事項」参照）

**C. 既存ワークフローへの非影響確認**

5. 上記A・Bの変更が`deploy.yml`・`pr-preview.yml`の既存動作（ジョブ構成・`on:`条件）に一切影響しないこと、および`test.yml`については`on:`セクションの追加以外（`jobs:`以下のステップ）に変更が無いことを確認する

## 対象範囲外

- Playwright（e2e、`a11y`ジョブ）側へのJUnitレポーター追加（vitest側のみを対象とする。必要なら別Issue）
- フレーキーテストが実際に検出された場合の原因調査・テスト側の修正
- フレーキーテスト検出結果の自動通知（Slack等）・自動Issue起票の仕組み化（まずはワークフロー実行結果をActions画面で目視確認することから始める）
- 自動テスト管理アプリ側でのJUnit XML取り込み設定（このリポジトリ側の対応のみが対象）

## 受け入れ条件

- [ ] `npm test`実行後、`test-results/junit.xml`にJUnit形式の結果ファイルが生成される（追加のdevDependencyインストールが不要であることを`package.json`のdiffで確認する）
- [ ] `test.yml`のtestジョブの実行結果画面（Actions）で、上記ファイルがartifact（`playwright-report`とは別名）として確認できる
- [ ] `test.yml`の`on:`に`push`（`branches: [main]`）・`workflow_dispatch`が追加されている
- [ ] mainブランチへのpush、または`workflow_dispatch`による手動実行でtestジョブが起動しgreenになる。かつ既存の`pull_request`イベントでの起動・green化も従来どおり機能する
- [ ] 新設した`.github/workflows/flaky-check.yml`が`schedule:`（確定した頻度）で定期実行され、`npm test`を3回連続実行して結果一致を確認する。`workflow_dispatch`による手動実行もできる
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
- `CLAUDE.md`「次にやるべきこと」表・CI継続確認の行（隣接する運用改善タスクとしての位置づけ）
- `docs/issue-workflow.md` §8「PR作成」（CI green確認のプロセスとの関係）

## レビュー時の確認事項

1. **Issue分割の要否**：要件A（JUnit出力＋起動条件見直し、外部PoC連携が目的）と要件B（フレーキーテスト検出、テストの不安定性検知が目的）は目的が異なる独立した変更です。1つのPRで一気に実装するか、AとBを別Issueに分割して段階的に進めるか、方針を確認してください。
2. **フレーキー検出ワークフローの頻度・対象ブランチ**：上記では初期値として「平日1日1回・mainブランチのみ」を提案しましたが、GitHub Actionsの実行時間コストや検知したい粒度（PRごとに回すか、定期実行のみで十分か）はプロジェクト運用判断のため、確定値をご指示ください。
3. **外部PoCとの接続範囲の確認**：本Issueは「CI結果ファイルを外部で取り込めるようにする」ところまでが対象で、このリポジトリ自体に新たなバックエンド・永続化・認証等を持ち込むものではない、という理解で相違ないか確認させてください（`CLAUDE.md`が定める「バックエンドを持たない・永続化なし」という方針への抵触は無いという前提で下書きを作成しています）。
