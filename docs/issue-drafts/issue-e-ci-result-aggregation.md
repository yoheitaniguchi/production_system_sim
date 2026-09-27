<!--
issue-workflow（.claude/skills/issue-workflow/SKILL.md）の手順1〜3（下書き作成・issue-spec-reviewerに
よるレビュー）までの下書き。手順4（実際のGitHub Issue起票）はユーザーの承認待ちのため未実施。
-->

# [要望] CI結果のJSON集約とデータ用ブランチへの書き込み

## 概要

`test.yml`の`test`ジョブ完了時に、JUnit XML・カバレッジの結果を自動テスト管理アプリが読みやすいJSON形式へ変換し、リポジトリ内の専用データ用ブランチへコミットする処理を追加する。

## 背景・目的

自動テスト管理アプリ（`docs/test-management-app-requirements.md` 11.1参照。本リポジトリ内の新フォルダに実装予定）がCI結果を取り込むには、機械可読な結果ファイルが必要である。

`docs/browser-fetch-spike-report.md`の技術検証により、ブラウザからGitHub Actionsの成果物（ZIP）を直接取得することはCORSの制約でできないことが確認済みである（同要件定義書 11.2「【決定済み】ブラウザから結果ファイルを直接取得できるかの検証結果」）。そのため、「CI側（ブラウザを介さない側）で結果をJSON形式に集約し、データ用ブランチに書き込み、アプリはそれを読むだけにする」という構成が決定済みであり（同 11.1「構成の選択肢」、11.2 I-04、11.2「シミュレータのリポジトリ側で必要な準備」#4'）、本Issueはその準備作業（シミュレータリポジトリ側の対応）にあたる。

この対応により、①自動テスト管理アプリがCORSの制約を受けずにCI結果を取得できるようになる、②`index.json`（一覧・索引用ファイル）を用意することでアプリが少ないAPI呼び出し回数で実行履歴を把握できるようになる（同要件定義書 N-105：GitHubのAPI呼び出し回数の上限対策）、という効果が見込める。

## 要件

1. `.github/workflows/test.yml`の`test`ジョブに、既存の`npm test`実行後（JUnit XML出力後）の新しいステップとして、カバレッジ計測付きでテストを実行し直すのではなく、`npm test`をカバレッジ計測込み（`vitest run --coverage`相当）で実行するよう変更し、`test-results/junit.xml`と`coverage/coverage-summary.json`の両方が同じ実行から出力されるようにする（現状の`test`ジョブは`npm test`のみでカバレッジ計測を行っておらず、`npm run test:coverage`相当のコマンドに置き換える必要がある）
2. `test`ジョブの末尾に、JUnit XML（`test-results/junit.xml`）とカバレッジのjson-summary（`coverage/coverage-summary.json`）を読み取り、下記スキーマのJSONへ変換するステップを追加する。変換処理はNode.jsスクリプトとして`scripts/`配下（新設）に置き、依存パッケージが必要な場合はvitest本体が依存する軽量なXMLパーサ（例：`fast-xml-parser`。新規devDependency追加は最小限にする）を検討する
3. 変換したJSONを、データ用ブランチ`test-results-data`（本Issueで新設。空コミットで作成する）の`runs/<runId>.json`（`runId`はGitHub Actionsの`github.run_id`）へコミットする。書き込みには`test`ジョブに付与する`permissions: contents: write`を使う
4. 上記と同じステップで、一覧・索引用ファイル`index.json`（実行ID・コミット・ブランチ・トリガー種別・開始/終了日時・合否件数・カバレッジの概算値のみを持つ軽量な配列）に今回の実行のエントリを追記し、同じコミットでデータ用ブランチへ書き込む（N-105対策：アプリが実行一覧を`runs/`配下の全件走査ではなく`index.json`1ファイルの取得で把握できるようにする）
5. 複数のワークフロー実行が同時にデータ用ブランチへ書き込もうとする競合への対処として、`runs/<runId>.json`は実行ごとに異なるファイル名のため競合しないが、`index.json`は共有ファイルのため書き込み前にデータ用ブランチを`git pull --rebase`し、pushが`non-fast-forward`で失敗した場合は最大5回まで再試行（都度pullし直して`index.json`への追記を再適用）する。全て失敗した場合はジョブを失敗させ、次回の実行やリトライで解消されるようにする
6. JSONのスキーマは、ユーザーの依頼メッセージに記載された案をもとに以下に確定する（変更点は末尾の表を参照）
7. 上記の変更が、既存の`test`ジョブのテスト実行結果（pass/fail）自体・`a11y`/`e2e-scenario`ジョブ・`deploy.yml`・`pr-preview.yml`の動作に影響しないことを確認する

### JSONスキーマ（確定案）

```json
{
  "runId": "<GitHub ActionsのrunId（github.run_id）>",
  "workflow": "test.yml",
  "trigger": "push | pull_request | workflow_dispatch",
  "commit": "<コミットSHA>",
  "branch": "<ブランチ名。pull_requestの場合はPRのheadブランチ名>",
  "startedAt": "<ISO8601>",
  "completedAt": "<ISO8601>",
  "tests": [
    {
      "file": "<テストファイルのパス>",
      "name": "<テストの名前（describe > it の連結。印を含む）>",
      "status": "passed | failed | skipped",
      "durationMs": 0,
      "failureMessage": "<失敗時のみ>",
      "location": "<エラー発生箇所。JUnit XMLから判別できる場合のみ>"
    }
  ],
  "coverage": {
    "overallPercent": 0,
    "files": [{ "path": "<ファイルパス>", "percent": 0 }]
  }
}
```

- `trigger`の選択肢から`schedule`を除いた（`test.yml`の`on:`に現状`schedule`が無いため。追加時は本Issueのスコープ外で別途対応）
- `coverage.overallPercent`・`files[].percent`は、`coverage-summary.json`の`lines.pct`（行カバレッジ）を採用する（v8プロバイダのjson-summaryが持つ4指標statements/branches/functions/linesのうち、最も一般的に使われる指標のため。他指標が必要になった場合は後続Issueでフィールドを追加する）

### index.jsonのスキーマ（新規）

```json
{
  "runs": [
    {
      "runId": "<runId>",
      "commit": "<コミットSHA>",
      "branch": "<ブランチ名>",
      "trigger": "push | pull_request | workflow_dispatch",
      "completedAt": "<ISO8601>",
      "passed": 0,
      "failed": 0,
      "skipped": 0,
      "coveragePercent": 0
    }
  ]
}
```

- 配列は`completedAt`降順（新しい実行が先頭）で保持する
- 件数の上限は設けない（教材規模のリポジトリであり件数増加の速度が遅いため）。将来的に肥大化が問題になった場合は別Issueで古いエントリの間引きを検討する

## 対象範囲外

- 過去の実行履歴のバックフィル（別Issueとする）
- 自動テスト管理アプリ本体（新しいフォルダの実装）そのもの（別Issueとする）
- 静的解析結果（型チェック・ESLint）の書き出し（U-06、別途検討）
- Playwright（`a11y`・`e2e-scenario`ジョブ）の結果を同じJSONへ集約すること（本Issueは`test`ジョブのVitest結果・カバレッジのみを対象とする。Playwright結果の集約は別Issueとする）
- カバレッジの4指標（statements/branches/functions/lines）のうちlines以外を`coverage`に含めること

## 受け入れ条件

- [ ] `test`ジョブの完了後、データ用ブランチ`test-results-data`に`runs/<runId>.json`が追加されること
- [ ] 同じコミットで`index.json`に今回の実行のエントリが追記されていること（先頭が最新の実行になっていること）
- [ ] 生成された`runs/<runId>.json`が、上記スキーマに沿っており、実際のJUnit XML・カバレッジjson-summaryの内容と一致すること（テスト件数・合否・カバレッジ数値を突き合わせて確認する）
- [ ] 既存のPRチェック・デプロイ（`deploy.yml`・`pr-preview.yml`）の動作に影響しないこと（ジョブ構成・`on:`条件に差分が無いこと）
- [ ] `test`ジョブ自体のpass/fail判定が、カバレッジ計測込みの実行に変更した後も従来どおり機能すること
- [ ] 短時間に複数のワークフロー実行が完了した場合でも、リトライにより`index.json`への追記が両方とも反映されること（一方が失われないこと）

## 参考資料

- `docs/test-management-app-requirements.md` 11.1（技術的制約）・11.2（外部連携の概要、I-04、シミュレータのリポジトリ側で必要な準備#4'）・11.5（U-05）
- `docs/browser-fetch-spike-report.md`（ブラウザからのGitHub Actions成果物直接取得が技術的にできないことの検証結果）
- `.github/workflows/test.yml`（`test`ジョブ、JUnit XML出力ステップは`docs/issue-drafts/issue-b1-ci-junit-triggers.md`で対応済み）
- `vite.config.ts`（`coverage.reporter`に`json-summary`は設定済みだが、CIの`npm test`ではカバレッジ計測自体を実行していない）
- `package.json`（`test:coverage`スクリプトが`--coverage`付き実行の既存例）

## レビュー時の確認事項

- データ用ブランチ名を`test-results-data`と仮置きした（ユーザーの依頼メッセージの例示は`data`）。短すぎて用途が分かりにくいと判断したための変更だが、命名はユーザー承認時に確定させたい
- カバレッジ計測をCIの`test`ジョブに常時組み込む（`npm test`→`--coverage`付き実行への変更）ことで、testジョブの実行時間がわずかに増加する見込み。既存の`test`ジョブの合否判定への影響は無い想定だが、許容できるか確認したい
- `index.json`の競合対策をgitのpull-rebase-retryで実装する案としたが、実行頻度が低い教材規模のリポジトリであれば十分と判断した。将来的に実行頻度が増える場合はGitHub Contents APIのSHA突き合わせ方式への切り替えを検討する
