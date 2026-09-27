# [要望] CIテスト結果のJSON集約とデータ用ブランチへの書き込み（Issue E）

## 概要

`test.yml`の`test`ジョブ完了時に、JUnit XML・カバレッジ（json-summary）の出力をアプリが読みやすいJSON形式へ変換し、リポジトリ内の専用データ用ブランチ（`data`）へコミットするステップを追加する。あわせて、実行の一覧をアプリが少ないAPI呼び出し回数で取得できるよう、索引ファイル（`index.json`）も同時に更新する。

## 背景・目的

`docs/test-management-app-requirements.md`（U-05）の決定により、自動テスト管理アプリ（本リポジトリ内の新フォルダに作る予定、同書11.1参照）は、ブラウザから直接GitHub Actionsの成果物（ZIP）を取得することができないことが確認済みである（`docs/browser-fetch-spike-report.md`、PR #94でmain入り済み）。GitHubの成果物ダウンロードは必ず別ストレージへの転送を経由する作りになっており、転送先がブラウザからの読み取りを許可していないためである。

そのため、結果の集約はCI側（ブラウザを介さない側）で行う必要がある。本Issueは、その集約処理（JSON変換とデータ用ブランチへの書き込み）を`test.yml`に追加するものである。これにより、アプリ側はデータ用ブランチのJSONファイルを読むだけで済むようになり、GitHubトークンをブラウザに置く必要性も小さくなる（`docs/test-management-app-requirements.md` 11.2 I-04参照）。

## 要件

### 集約対象のジョブとタイミング

- `test.yml`の`test`ジョブ（型チェック・ビルド・`npm test`を実行するジョブ）の完了時点で行う。現状`test`ジョブは`npm test`（`vitest run`、カバレッジ計測なし）を実行しているため、本Issueの範囲でカバレッジのjson-summaryも出力されるよう、`test`ジョブのテスト実行コマンドを`vitest run --coverage`（`npm run test:coverage`相当）に変更する。`vite.config.ts`の`coverage.reporter`には既に`json-summary`が含まれているため、出力先の追加設定は不要（既定では`coverage/coverage-summary.json`に出力される）
- `a11y`・`e2e-scenario`ジョブの結果は本Issueの対象外とする（対象範囲外を参照）

### JSON変換ステップ

- `test`ジョブの末尾（`npm test`実行後、既存の「Upload vitest JUnit report」ステップの前後いずれか）に、JUnit XML（`test-results/junit.xml`）とカバレッジのjson-summary（`coverage/coverage-summary.json`）を読み取り、下記スキーマのJSONへ変換するステップを追加する
- 変換処理はNode.jsスクリプト（例：`scripts/aggregate-test-results.mjs` または `.github/scripts/`配下）として実装し、ワークフローYAML内にインラインで書かない（可読性・単体テストのしやすさのため）
- JUnit XMLの`name`属性からの印（タグ）抽出は、`docs/test-management-app-requirements.md` 9.1の実機確認済みルールに合わせ、属性値全体に対する正規表現の部分一致で行う（例：`\[UC-\d+.*?\]\[.*?\]\[.*?\](\[.*?\])?`）。本リポジトリの`domain/*.test.ts`は`docs/test-tagging.md`が定める`[UC-xx][工程][テストの種類][観点]`形式で既にタグ付け済み（Issue A/A2、PR #85・#87でmain入り済み）のため、この抽出ロジックをそのまま適用できる
- `test`失敗時（`if: always()`相当）もJSON変換・書き込みを行い、失敗した実行の記録も残す

### JSONスキーマ

`runs/<runId>.json`（1実行1ファイル）：

```json
{
  "runId": "<GitHub ActionsのrunId>",
  "workflow": "test.yml",
  "trigger": "push | pull_request | workflow_dispatch | schedule",
  "commit": "<コミットSHA>",
  "branch": "<ブランチ名>",
  "startedAt": "<ISO8601>",
  "completedAt": "<ISO8601>",
  "conclusion": "success | failure",
  "tests": [
    {
      "file": "<テストファイルのパス>",
      "name": "<テストの名前（describe > it の連結。印を含む）>",
      "status": "passed | failed | skipped",
      "durationMs": 0,
      "failureMessage": "<失敗時のみ>",
      "location": "<エラー発生箇所。分かる場合のみ>"
    }
  ],
  "coverage": {
    "overallPercent": 0,
    "files": [{ "path": "<ファイルパス>", "percent": 0 }]
  }
}
```

- ユーザー提示のスキーマから`conclusion`（ワークフロー全体の合否。`index.json`の一覧表示・完了判定の材料として`test.yml`のジョブ結果から機械的に求められるため）を追加した。それ以外はユーザー提示のスキーマのまま採用する

`index.json`（実行の一覧・索引。全実行を通じて1ファイル）：

```json
{
  "runs": [
    {
      "runId": "<GitHub ActionsのrunId>",
      "commit": "<コミットSHA>",
      "branch": "<ブランチ名>",
      "completedAt": "<ISO8601>",
      "conclusion": "success | failure",
      "passed": 0,
      "failed": 0,
      "skipped": 0
    }
  ]
}
```

- `index.json`は実行ID・コミット・日時・合否件数のみを持つ軽量な一覧とし、アプリが一覧画面（`docs/test-management-app-requirements.md` 11.4 G-01・G-05）を少ないAPI呼び出し回数で表示できるようにする（同書N-105）
- 保持件数の上限は設けず、`docs/test-management-app-requirements.md` 10.1が示す想定規模（PoC2週間で300回程度の実行）の範囲では`index.json`の肥大化は軽微と判断する。データ用ブランチのリポジトリ肥大化そのものは同書U-01が既知のリスクとして残す方針であり、本Issueで別途対応しない

### データ用ブランチへの書き込み

- ブランチ名は`data`とする（案。リポジトリの既定ブランチ運用と衝突しない専用ブランチ）
- 書き込みには`test`ジョブに付与する`GITHUB_TOKEN`の権限（`permissions: contents: write`）を使う。他ジョブ（`a11y`・`e2e-scenario`）や既存の`deploy.yml`・`pr-preview.yml`のジョブには権限を追加しない
- `data`ブランチが存在しない場合は、変換ステップの中で初回作成する（空コミットまたは`runs/`・`index.json`のみを含む初回コミット）
- `pull_request`トリガーの実行（フォークからのPRを含む）でも書き込みを行うかどうかは、フォークPRでは`GITHUB_TOKEN`の書き込み権限が制限される点を踏まえ、`push`（`main`向け）と`workflow_dispatch`に限定する。`pull_request`トリガーではJSON変換のみ行い、書き込みはスキップする（アプリの主要な利用シーンは`main`へのpush、および手動実行であるため実用上の支障はない）

### 同時書き込みの競合への対処

- 複数の実行が同時に`data`ブランチへ書き込もうとする場合、`runs/<runId>.json`は実行ごとに別ファイルのため衝突しない。衝突しうるのは`index.json`の更新のみである
- 対処方針：`git push`が非fast-forwardで失敗した場合、`git fetch`＋`git rebase`（またはリモートの最新`index.json`を取得して自分の実行分のエントリだけを追記し直す）→再pushを、上限を決めて（例：5回）リトライする。リトライを使い切って解決しない場合はジョブを失敗させず、警告を残して`runs/<runId>.json`の書き込みだけは確定させる（`index.json`の更新漏れは次回実行時に補完される想定とし、9.3の「取り込めなかった場合、その実行についてエラーを表示し、ほかの実行の取り込みは続ける」という考え方に倣う）

## 対象範囲外

- 過去の実行履歴のバックフィル（別Issueとする）
- 自動テスト管理アプリ本体（本リポジトリ内の新フォルダへの実装）そのもの（別Issueとする）
- 静的解析結果（型チェック・ESLint）の書き出し（`docs/test-management-app-requirements.md` U-06、別途検討）
- `a11y`・`e2e-scenario`ジョブの結果の集約（本Issueは`test`ジョブのみを対象とする。将来必要になれば別Issueとする）
- アプリからのワークフロー手動起動（`docs/test-management-app-requirements.md` F-201）や、フレーキー検出用ワークフロー（同書11.2 準備7）の新設
- `index.json`の肥大化・データ用ブランチのリポジトリサイズ増大への抜本対応（同書U-01が既知のリスクとして残す方針）

## 受け入れ条件

- [ ] `test`ジョブが`vitest run --coverage`（またはカバレッジのjson-summaryを出力する同等の変更）を実行し、`coverage/coverage-summary.json`が生成される
- [ ] `test`ジョブの完了後（成功・失敗いずれの場合も）、`data`ブランチに`runs/<runId>.json`が新規追加される
- [ ] 追加された`runs/<runId>.json`が、上記スキーマに沿っており、実際のJUnit XML・カバレッジの内容（合否件数・失敗メッセージ・カバレッジ率）と一致する
- [ ] `docs/test-tagging.md`が定めるタグ形式（`[UC-xx][工程][テストの種類][観点]`）を含むテスト名から、印が正しく抽出できる（部分一致の正規表現で、先頭一致を仮定していないことをテストで確認する）
- [ ] `test`ジョブの完了後、`index.json`に当該実行のエントリ（実行ID・コミット・日時・合否件数）が追記される
- [ ] `pull_request`トリガーの実行では、JSON変換は行われるが`data`ブランチへの書き込みは行われない（またはスキップされたことがログで確認できる）
- [ ] 変換スクリプトに対する単体テスト（Vitest）があり、JUnit XMLのパース・印の抽出・スキーマへの変換が正しく行われることを検証している
- [ ] 既存のPRチェック（`test`ジョブ内の既存ステップ、`a11y`・`e2e-scenario`ジョブ）・デプロイ（`deploy.yml`・`pr-preview.yml`）の動作に影響がないこと

## 参考資料

- `docs/test-management-app-requirements.md` 9.1（印の抽出方法）・9.3（結果の取り込みと分類の流れ）・10.1 N-105（GitHubの利用の上限）・11.1（技術的制約）・11.2（外部連携の概要、I-04）・11.5 U-01・U-05（データの保存先・結果ファイルの取得方法の決定事項）
- `docs/test-process-standard.md`（テスト工程の定義。本Issueが扱うのは自動テストの結果集約であり、工程区分自体の定義は本書に準拠する）
- `docs/browser-fetch-spike-report.md`（ブラウザからのGitHub Actions成果物直接取得が技術的に不可能と確認したPR #94の検証レポート）
- `docs/test-tagging.md`（`domain/*.test.ts`のタグ形式。印の抽出ロジックの前提）
- `.github/workflows/test.yml`（変更対象のワークフロー）
- `vite.config.ts`（Vitestのjunit/coverageレポーター設定）
