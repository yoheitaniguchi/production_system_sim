<!--
このファイルは docs/issue-drafts/issue-b-ci-junit-triggers.md をユーザーの決定（目的が異なるため
B1/B2に分割する）に基づき分割したものである。旧ファイルの要件Bに対応する。フレーキー検出の頻度は
下書きの初期値（平日1日1回・mainブランチ）のまま確定とする決定を反映済み。
issue-workflow（.claude/skills/issue-workflow/SKILL.md）の手順4（GitHub Issue起票）に進む前提の
最終下書き。
-->

# [要望] フレーキーテスト検出ワークフローの新設

## 概要

同一コミットに対して`npm test`を複数回実行し、結果が毎回一致するかを確認する「フレーキーテスト検出」ワークフローを新設する。既存の`test.yml`とは別ファイルとし、`schedule:`で定期実行する。

## 背景・目的

自動テスト管理アプリ（PoC）とこのリポジトリを接続する準備として`.github/workflows/`を調査したところ、実行タイミングによって結果が変わりうる「フレーキーテスト」を検知する仕組みが無いことが分かった。現状の`test.yml`は`pull_request`イベントで1回実行されるのみで、たまたま1回通っただけなのか、安定して通るのかを区別できない。

これを新設すると、フレーキーテストを定期実行で早期検知できるようになり、「`npm test`が落ちた＝実装のバグ」と「たまたまテストが不安定だっただけ」の切り分け材料が得られる。これは`docs/issue-drafts/issue-b1-ci-junit-triggers.md`（外部PoC連携が目的のJUnit出力・起動条件見直し）とは目的が異なるため、別Issueとして分割した。

## 要件

1. 同一コミットに対して`npm test`を3回連続実行し、結果（成功/失敗・失敗したテスト名）が毎回一致するかを確認する「フレーキーテスト検出」ワークフローを、既存の`test.yml`とは別ファイル`.github/workflows/flaky-check.yml`として新設する
2. `schedule:`は平日1日1回（`cron: "0 21 * * 1-5"`＝日本時間06:00）、対象はmainブランチの最新コミットとする（初期値として確定。運用開始後の見直しは妨げない）
3. 動作確認用に`workflow_dispatch:`も付ける
4. 上記の変更が`test.yml`・`deploy.yml`・`pr-preview.yml`の既存動作（ジョブ構成・`on:`条件・実行結果）に一切影響しないことを確認する（新規ファイルの追加のみで、既存ワークフローファイルへの変更は無い）

## 対象範囲外

- フレーキーテストが実際に検出された場合の原因調査・テスト側の修正
- フレーキーテスト検出結果の自動通知（Slack等）・自動Issue起票の仕組み化（まずはワークフロー実行結果をActions画面で目視確認することから始める）
- JUnit XML出力・`test.yml`の起動条件見直し（`docs/issue-drafts/issue-b1-ci-junit-triggers.md`で対応済み。本Issueは新規ワークフローの追加のみ）

## 受け入れ条件

- [ ] `.github/workflows/flaky-check.yml`が新設され、`npm test`を3回連続実行して結果一致を確認する
- [ ] `schedule:`が`cron: "0 21 * * 1-5"`（平日1日1回）で定期実行される
- [ ] `workflow_dispatch:`による手動実行もできる
- [ ] `test.yml`・`deploy.yml`・`pr-preview.yml`のファイルにgit diffが無い（新規ファイル追加のみ）

## 参考資料

- `.github/workflows/test.yml`（既存ワークフローの構成パターンの参考）
- `package.json`（`test`スクリプト：`vitest run`）
- `docs/issue-drafts/issue-b1-ci-junit-triggers.md`（分割元。外部PoC連携が目的のJUnit出力・起動条件見直し）
