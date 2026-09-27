<!--
このファイルは、issue-workflow（.claude/skills/issue-workflow/SKILL.md）の手順1（Issue下書き作成）・
3（issue-spec-reviewerによるレビュー）まで実施した下書きである。手順4（GitHub Issue起票）はまだ行っていない。
-->

## issue-spec-reviewerによる指摘サマリ（反映済み）

1. **JSONスキーマの粒度不足（coverage.files）**：`coverage/coverage-summary.json`は「ファイルパスをキーとし、`lines`/`statements`/`functions`/`branches`それぞれに`{total, covered, skipped, pct}`を持つオブジェクト」＋全体集計用の`"total"`キーを含む構造であり、当初案の`{ "path": ..., "percent": 0 }`という単一の`percent`がどの指標のpctを採用するのか規定していなかった → `lines.pct`を採用することを明記し、`overallPercentMetric`フィールドで自己文書化するよう修正した。
2. **同時書き込みの競合対処が実装可能な粒度まで具体化されていなかった** → `runs/<runId>.json`と`index.json`を同一コミットにまとめる方針を明記し、fetch→reset→再マージ→再push（最大5回リトライ）の具体的な手順に修正した。
3. **前提確認の抜け（ブランチ保護ルール）**：`data`ブランチへ`GITHUB_TOKEN`で直接pushする設計が、リポジトリのブランチ保護ルールと衝突しないかの確認が抜けていた → 「実装前に確認する前提条件」として追加した。
4. **受け入れ条件の一部が`npm test`等では検証不能**だった（実際のCI実行・push操作を伴う項目）→ 「自動テストで検証するもの」と「実際のワークフロー実行で確認するもの（手動確認）」に分けて整理した。
5. **軽微な整合性の粗**：`trigger`列挙の`schedule`（現状の`test.yml`に存在しないトリガー）を削除し、`durationMs`・`location`の抽出方法を一文で明記した。

## 改善済み下書き

# [要望] CIテスト結果のJSON集約とデータ用ブランチへの書き込み（Issue E）

## 概要

`test.yml`の`test`ジョブ完了時に、JUnit XML・カバレッジ（json-summary）の出力をアプリが読みやすいJSON形式へ変換し、リポジトリ内の専用データ用ブランチ（`data`）へコミットするステップを追加する。あわせて、実行の一覧をアプリが少ないAPI呼び出し回数で取得できるよう、索引ファイル（`index.json`）も同時に更新する。

## 背景・目的

`docs/test-management-app-requirements.md`（U-05）の決定により、自動テスト管理アプリ（本リポジトリ内の新フォルダに作る予定、同書11.1参照）は、ブラウザから直接GitHub Actionsの成果物（ZIP）を取得することができないことが確認済みである（`docs/browser-fetch-spike-report.md`、PR #94でmain入り済み）。GitHubの成果物ダウンロードは必ず別ストレージへの転送を経由する作りになっており、転送先がブラウザからの読み取りを許可していないためである。

そのため、結果の集約はCI側（ブラウザを介さない側）で行う必要がある。本Issueは、その集約処理（JSON変換とデータ用ブランチへの書き込み）を`test.yml`に追加するものである。これにより、アプリ側はデータ用ブランチのJSONファイルを読むだけで済むようになり、GitHubトークンをブラウザに置く必要性も小さくなる（`docs/test-management-app-requirements.md` 11.2 I-04参照）。

## 要件

### 実装前に確認する前提条件

- リポジトリのブランチ保護ルールが、`GITHUB_TOKEN`による`data`ブランチへの直接push（PRを経由しない）を妨げないことを確認する。妨げる設定になっている場合は、`data`ブランチを保護ルールの対象外にするか、ルールを緩和する変更をあわせて行う

### 集約対象のジョブとタイミング

- `test.yml`の`test`ジョブ（型チェック・ビルド・`npm test`を実行するジョブ）の完了時点で行う。現状`test`ジョブは`npm test`（`vitest run`、カバレッジ計測なし）を実行しているため、本Issueの範囲でカバレッジのjson-summaryも出力されるよう、`test`ジョブのテスト実行コマンドを`vitest run --coverage`（`npm run test:coverage`相当）に変更する。`vite.config.ts`の`coverage.reporter`には既に`json-summary`が含まれているため、出力先の追加設定は不要（既定では`coverage/coverage-summary.json`に出力される）
- `a11y`・`e2e-scenario`ジョブの結果は本Issueの対象外とする（対象範囲外を参照）

### JSON変換ステップ

- `test`ジョブの末尾（`npm test`実行後、既存の「Upload vitest JUnit report」ステップの前後いずれか）に、JUnit XML（`test-results/junit.xml`）とカバレッジのjson-summary（`coverage/coverage-summary.json`）を読み取り、下記スキーマのJSONへ変換するステップを追加する
- 変換処理はNode.jsスクリプト（例：`scripts/aggregate-test-results.mjs` または `.github/scripts/`配下）として実装し、ワークフローYAML内にインラインで書かない（可読性・単体テストのしやすさのため）
- JUnit XMLの`name`属性からの印（タグ）抽出は、`docs/test-management-app-requirements.md` 9.1の実機確認済みルールに合わせ、属性値全体に対する正規表現の部分一致で行う（例：`\[UC-\d+.*?\]\[.*?\]\[.*?\](\[.*?\])?`）。本リポジトリの`domain/*.test.ts`は`docs/test-tagging.md`が定める`[UC-xx][工程][テストの種類][観点]`形式で既にタグ付け済み（Issue A/A2、PR #85・#87でmain入り済み）のため、この抽出ロジックをそのまま適用できる
- `durationMs`はJUnit XMLの`time`属性（秒、小数）を1000倍して丸めた整数値とする
- `failureMessage`は`<failure>`/`<error>`要素のテキストから取得する。`location`は同テキストから`ファイルパス:行番号`に一致する最初のパターンをbest-effortで抽出し、見つからない場合はフィールド自体を省略する（厳密なスタックトレース解析はスコープ外とする）
- `test`失敗時（`if: always()`相当）もJSON変換・書き込みを行い、失敗した実行の記録も残す

### JSONスキーマ

`runs/<runId>.json`（1実行1ファイル）：

```json
{
  "runId": "<GitHub ActionsのrunId>",
  "workflow": "test.yml",
  "trigger": "push | pull_request | workflow_dispatch",
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
      "location": "<エラー発生箇所。抽出できた場合のみ>"
    }
  ],
  "coverage": {
    "overallPercent": 0,
    "overallPercentMetric": "lines",
    "files": [{ "path": "<ファイルパス（リポジトリルートからの相対パス）>", "percent": 0 }]
  }
}
```

- ユーザー提示のスキーマから`conclusion`（ワークフロー全体の合否。`index.json`の一覧表示・完了判定の材料として`test.yml`のジョブ結果から機械的に求められるため）を追加した
- `trigger`の列挙値から`schedule`は含めない（現状の`test.yml`に`schedule`トリガーは存在しないため）。将来フレーキー検出用ワークフロー（`docs/test-management-app-requirements.md` 11.2 準備7）を追加する際に値を拡張する
- `coverage.overallPercent`・`files[].percent`は、`coverage-summary.json`の各エントリが持つ`lines`/`statements`/`functions`/`branches`のうち**`lines.pct`を採用する**ことを明記し（他指標は今回は扱わない）、`overallPercentMetric`フィールドでどの指標を採用したかを自己文書化する。`coverage-summary.json`の`"total"`キーは`files`配列には含めず`overallPercent`の算出元としてのみ使う。ファイルパスは`coverage-summary.json`が返す絶対パスをリポジトリルートからの相対パスに変換する

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
- `runs/<runId>.json`の追加と`index.json`の更新は**同一コミット**にまとめる（1実行につき1コミット）
- `pull_request`トリガーの実行（フォークからのPRを含む）でも書き込みを行うかどうかは、フォークPRでは`GITHUB_TOKEN`の書き込み権限が制限される点を踏まえ、`push`（`main`向け）と`workflow_dispatch`に限定する。`pull_request`トリガーではJSON変換のみ行い、書き込みはスキップする（アプリの主要な利用シーンは`main`へのpush、および手動実行であるため実用上の支障はない）

### 同時書き込みの競合への対処

- 複数の実行が同時に`data`ブランチへ書き込もうとする場合、`runs/<runId>.json`は実行ごとに別ファイルのため内容としては衝突しないが、`index.json`を含む同一コミットで`git push`するため、push自体は非fast-forwardで失敗しうる
- 対処手順（スクリプト内で実装する具体的なアルゴリズム）：
  1. ローカルで`runs/<runId>.json`の内容とJSON変換結果（自分の実行分のエントリ）をメモリ上に保持しておく（git操作から独立させる）
  2. `git fetch origin data` → ローカルの作業ブランチを`origin/data`の最新コミットにリセットする
  3. リセット後の`index.json`を読み直し、自分の実行分のエントリを追記（または同じ`runId`が既にあれば上書き）する。`runs/<runId>.json`は1で保持した内容をそのまま書き出す
  4. `runs/<runId>.json`と`index.json`の変更を1コミットにまとめてコミットする
  5. `git push origin HEAD:data`を実行する。非fast-forwardで失敗したら2へ戻る（最大5回まで）
  6. 5回のリトライを使い切って解決しない場合、ジョブは失敗させずワークフローの警告（`::warning::`）を出力して終了する。この場合`runs/<runId>.json`はデータ用ブランチに反映されない可能性があるため、「取り込めなかった実行がある」ことがログから分かるようにする（`docs/test-management-app-requirements.md` 9.3の「取り込めなかった場合、その実行についてエラーを表示し、ほかの実行の取り込みは続ける」という考え方に倣う）

## 対象範囲外

- 過去の実行履歴のバックフィル（別Issueとする）
- 自動テスト管理アプリ本体（本リポジトリ内の新フォルダへの実装）そのもの（別Issueとする）
- 静的解析結果（型チェック・ESLint）の書き出し（`docs/test-management-app-requirements.md` U-06、別途検討）
- `a11y`・`e2e-scenario`ジョブの結果の集約（本Issueは`test`ジョブのみを対象とする。将来必要になれば別Issueとする）
- アプリからのワークフロー手動起動（`docs/test-management-app-requirements.md` F-201）や、フレーキー検出用ワークフロー（同書11.2 準備7）の新設
- `index.json`の肥大化・データ用ブランチのリポジトリサイズ増大への抜本対応（同書U-01が既知のリスクとして残す方針）
- カバレッジ指標のうち`lines.pct`以外（`statements`/`functions`/`branches`）の集約・表示（必要になれば別Issueとする）

## 受け入れ条件

自動テスト（変換スクリプト単体）で検証するもの：

- [ ] 変換スクリプトに対するVitestの単体テストがあり、サンプルのJUnit XML・`coverage-summary.json`（`"total"`キーを含むもの）を入力として、スキーマへの変換（`coverage.files`から`"total"`が除外されること、`percent`が`lines.pct`由来であること、ファイルパスが相対パスに変換されることを含む）が正しく行われることを検証している
- [ ] 変換スクリプトの単体テストで、`docs/test-tagging.md`が定めるタグ形式（`[UC-xx][工程][テストの種類][観点]`）を含むテスト名から、印が正しく抽出できることを確認している（部分一致の正規表現で、先頭一致を仮定していないことを含む）
- [ ] 変換スクリプトの単体テストで、`index.json`のマージ処理（同一`runId`が既に存在する場合の上書き、新規追加時の追記）が正しく行われることを検証している

実際のワークフロー実行で確認するもの（手動確認）：

- [ ] `test`ジョブが`vitest run --coverage`（またはカバレッジのjson-summaryを出力する同等の変更）を実行し、`coverage/coverage-summary.json`が生成される
- [ ] `main`へのpush、または`workflow_dispatch`による`test`ジョブの完了後（成功・失敗いずれの場合も）、`data`ブランチに`runs/<runId>.json`が新規追加され、`index.json`に当該実行のエントリが同一コミットで追記される
- [ ] 追加された`runs/<runId>.json`が、実際のJUnit XML・カバレッジの内容（合否件数・失敗メッセージ・カバレッジ率）と一致する
- [ ] `pull_request`トリガーの実行では、JSON変換は行われるが`data`ブランチへの書き込みは行われない（スキップされたことがジョブログで確認できる）
- [ ] リポジトリのブランチ保護ルールが`data`ブランチへの`GITHUB_TOKEN`による直接pushを妨げないことを確認済みである（妨げる設定だった場合は本Issueの中で調整する）
- [ ] 既存のPRチェック（`test`ジョブ内の既存ステップ、`a11y`・`e2e-scenario`ジョブ）・デプロイ（`deploy.yml`・`pr-preview.yml`）の動作に影響がないこと

## 参考資料

- `docs/test-management-app-requirements.md` 9.1（印の抽出方法）・9.3（結果の取り込みと分類の流れ）・10.1 N-105（GitHubの利用の上限）・11.1（技術的制約）・11.2（外部連携の概要、I-04）・11.5 U-01・U-05（データの保存先・結果ファイルの取得方法の決定事項）
- `docs/test-process-standard.md`（テスト工程の定義。本Issueが扱うのは自動テストの結果集約であり、工程区分自体の定義は本書に準拠する）
- `docs/browser-fetch-spike-report.md`（ブラウザからのGitHub Actions成果物直接取得が技術的に不可能と確認したPR #94の検証レポート）
- `docs/test-tagging.md`（`domain/*.test.ts`のタグ形式。印の抽出ロジックの前提）
- `.github/workflows/test.yml`（変更対象のワークフロー）
- `vite.config.ts`（Vitestのjunit/coverageレポーター設定）

## レビュー時の確認事項

- `data`ブランチへのCIからの直接push（`permissions: contents: write`）が、リポジトリのブランチ保護ルールと矛盾しないかは、GitHub側の設定を実際に確認しないと判断できない（このレビューでは設定自体を参照できていない）。矛盾する場合、保護ルールの調整をこのIssueに含めるか別Issueにするかはユーザー判断が必要
- 同時書き込みの競合対処（fetch→reset→再マージ→再push、最大5回リトライ）は方針として実装可能な粒度まで具体化したが、実際にどの程度の頻度で衝突が起きるか（PoC規模＝1日20回程度の実行）を踏まえるとリトライ上限5回で十分かは、実装後の運用実績で見直しが必要になる可能性がある
