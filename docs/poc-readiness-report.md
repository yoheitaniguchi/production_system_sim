# 自動テスト管理アプリ（PoC）接続 readiness 調査報告

作成日：2026-09-23
調査範囲：本リポジトリ（`production_system_sim`）の読み取りのみ。コード・テスト・設定ファイルの変更は行っていない。

## 調査結果サマリー

| # | 調査項目 | 結果 |
|---|---|---|
| 1 | テストへの要件ID・工程タグ | **未付与**。describe/itタイトルにTC番号（TC-04等）が手動の文字列として埋め込まれている箇所はあるが、UC-01〜23との対応・工程区分（単体/結合/総合）・テストの種類を示す機械可読な印は無い |
| 2 | CIワークフロー | 3ワークフロー（test.yml／deploy.yml／pr-preview.yml）を確認。**構造化された結果ファイル（JUnit XML等）の出力・保存は無し**（`a11y`ジョブのみPlaywrightのHTMLレポートをartifact保存）。`test.yml`の起動条件は`pull_request`のみ |
| 3 | ESLint／カバレッジ | **両方とも未導入**。設定ファイル・依存パッケージともに存在しない |
| 4 | e2e/配下 | `e2e/a11y.spec.ts` の1ファイルのみ存在。**業務シナリオを操作するE2Eテストは無い**（アクセシビリティ検査のみ） |
| 5 | 非機能目標値 | 対応ブラウザ・画面サイズ・研修利用法についての**数値目標の記述は見つからず**。「対象読者：開発チームメンバー・教材」という定性的な記述のみ |

---

## 1. テストへの要件ID・工程タグの付与状況

### 現在の状況

- `src/domain/*.test.ts`（24ファイル）のdescribe/itタイトルには、`docs/v5-spec.md` §9.3・§9.5が定めるTC-01〜18・TC-E1〜3や、`docs/design.md` §6が定めるTC-M1の番号が、開発者が手動で埋め込んだ文字列プレフィックスとして存在する場合がある（例：`"TC-04: 受注 FG-100 x10 ..."`）。
- しかし、`docs/v5-spec.md` §8.2が定めるUC-01〜23との対応、工程区分（単体/結合/総合）、テストの種類（正常系/異常系等）を示す構造化されたタグ（`[UC-06]`のような接頭辞、vitestのtag機能、カスタムメタデータ等）は**一件も存在しない**。
- TC番号の付与自体にも表記ゆれ・重複がある：
  - **TC-07が2箇所で別内容に重複して使われている**：`src/domain/schedule.test.ts:10`（「希望どおりの納期回答なら警告は出ない」）と`src/domain/procurement.test.ts:18`（「納期回答を登録するとACKEDになる」）。v5-spec.md上のTC-07は「PO 3件に納期回答（希望どおり）」（`docs/v5-spec.md:1163`）であり、後者（procurement.test.ts）がより忠実、前者（schedule.test.ts）はTC-07の結果として生じる副次的な検証（日程整合チェック警告0件）に同じ番号を流用している。
  - TC-E1〜E3も、`schedule.test.ts:21`が「TC-E1〜E2」、`production.test.ts:116`が「TC-E1〜E3」とラベル付けしており、E1が2ファイルにまたがって参照されている（内容は前提条件の再現であり矛盾はないが、番号の対応は分散している）。

### 根拠：TC-01〜18・TC-E1〜3・TC-M1 とテストファイル／関数の対応表

| TC番号 | v5-spec.md上の内容（§9.3/§9.5、design.md §6） | ファイル:行 | describe/it |
|---|---|---|---|
| TC-01 | マスタ初期化 | `src/domain/exerciseGuide.test.ts:19` | `it("初期状態ではTC-01のみ完了している", ...)` |
| TC-02〜03 | 受注登録／納期回答 | `src/domain/salesOrder.test.ts:9` | `it("TC-02〜03: 受注登録すると1受注1明細（RECEIVED）が作られ、納期回答するとCONFIRMEDになる", ...)` |
| TC-04 | MRP実行 | `src/domain/mrp.test.ts:11` | `it("TC-04: 受注 FG-100 x10 / 回答納期 D+15 を展開すると5件の計画オーダが期待どおりの値で生成される", ...)` |
| TC-05〜06 | 計画オーダ確定／MRP再実行 | `src/domain/mrp.test.ts:68` | `it("TC-05〜06: 確定するとPLANNED_ORDERは実体化し、再実行しても確定オーダの分は再計画されない", ...)` |
| TC-07 | PO 3件に納期回答 | `src/domain/procurement.test.ts:18`（本文に忠実） / `src/domain/schedule.test.ts:10`（重複、副次検証） | `it("TC-07: 納期回答を登録するとACKEDになる", ...)` / `it("TC-07: 希望どおりの納期回答なら警告は出ない", ...)` |
| TC-08 | 入荷計上（RM-300） | `src/domain/procurement.test.ts:35` | `it("TC-08: 入荷予定日以降に入荷計上するとRCVトランザクションが起票され在庫が増える", ...)` |
| TC-09 | SA-200着手→完了 | `src/domain/production.test.ts:27` | `it("TC-09: 部品が十分ならバックフラッシュで消費し完成入庫する（良品のみ）", ...)` |
| TC-10 | PT-400・PT-500入荷 | `src/domain/procurement.test.ts:57` | `it("TC-10: PT-400・PT-500の入荷予定日にまとめて入荷計上すると、STOCK_TXNが2件（RCV +40 / +80）起票される", ...)` |
| TC-11〜12 | FG-100着手→完了（工程10・20） | `src/domain/production.test.ts:63` | `it("TC-11〜12: 良品数と不良数を分けて登録し、不良分は完成入庫されない。次工程の投入数は前工程の良品数", ...)` |
| TC-13 | 未充足需要チェック | `src/domain/schedule.test.ts:38` | `it("TC-13: 完成数が受注数量に満たない場合、不足数量を返す", ...)` |
| TC-14 | MRP再実行（不良後） | `src/domain/mrp.test.ts:107` | `it("TC-14: 不良1個の発生後にMRPを再実行すると、不足1個分の計画オーダ5件が再生成される", ...)` |
| TC-15〜16 | 出荷指示／出荷実績登録 | `src/domain/shipment.test.ts:15` | `it("TC-15〜16: 受注残(10)に出荷可能量(9)が満たない場合、出荷可能な分だけ一部出荷として引き当てる（design.md DEV-3）", ...)` |
| TC-17 | KPI確認 | `src/domain/kpi.test.ts:14` | `it("TC-17: 不良1個を含む通し演習の結果、期待どおりのKPIになる", ...)` |
| TC-18 | ペギング追跡 | `src/domain/pegging.test.ts:9` | `it("TC-18: 受注確定後、全階層の確定オーダ（MFG_ORDER2件・PURCHASE_ORDER3件）を辿れる", ...)` |
| TC-E1〜E2 | RM-300納期遅延→警告／ペギングで受注を特定 | `src/domain/schedule.test.ts:21` | `it("TC-E1〜E2: 木板の納期回答が遅れると、親（座面ASSY）の着手日に対する遅延警告が出て受注まで辿れる", ...)` |
| TC-E1〜E3 | （E3含め再掲）警告のまま着手→HOLD | `src/domain/production.test.ts:116` | `it("TC-E1〜E3: 木板の納期回答が遅れて警告が出たまま製造着手を試みると、部品が無いためHOLDになる", ...)` |
| TC-M1 | 複数受注の資源競合演習（design.md §6） | `src/domain/multiOrderExercise.test.ts:19-20` | `describe("複数受注の資源競合演習（design.md §6 TC-M1）", ...)` → `it("納期が早いZが手元在庫（木板1枚）を優先的に使い、Yは全量を新規発注する", ...)` |

補足：TC-01〜16の通し実行は`src/domain/gantt.test.ts:73`、TC-01〜18の通し実行は`src/domain/lot.test.ts:135`でも別途検証されているが、これらは個々のTC番号への1対1対応ではなく「通し演習」としての検証のため、上表には含めていない。

### 確認できなかった点

- 依頼文中の「テストの種類は標準書3章の区分に合わせる」という指示にある**「標準書」がこのリポジトリ内に見当たらない**。`docs/`配下の全Markdownファイル・README.md・CLAUDE.md・GEMINI.mdを「標準書」で検索したが1件もヒットしなかった。自動テスト管理アプリ側が別途保持する外部文書と推測されるが、本リポジトリの調査だけでは「標準書3章」が定めるテスト種類の区分名を特定できない。
- UC-01〜23とTC-01〜18等の対応関係は、v5-spec.md本文に明示的な対応表が無いため、TC番号の説明文とUC番号の定義文（`docs/v5-spec.md:1057-1079`）を突き合わせた**調査側の暫定解釈**である（Issue案Aの下書きに対応表として記載し、レビューを受けている）。

---

## 2. `.github/workflows/` 配下のワークフロー

| ワークフロー | `on:` | 実行コマンド | 結果ファイルの出力・保存 |
|---|---|---|---|
| `test.yml`（`test`ジョブ） | `pull_request`（`.github/workflows/test.yml:3-4`） | `npm ci` → `npm run build`（tsc+vite build） → `npm test`（`vitest run`） | **無し**（標準出力のみ、artifact保存ステップ無し） |
| `test.yml`（`a11y`ジョブ） | 同上（同一ワークフロー内） | `npm ci` → `npx tsc -p e2e --noEmit` → `npx playwright install --with-deps chromium` → `npm run test:a11y`（`playwright test`） | **HTMLレポートのみ保存**：`actions/upload-artifact@v4`で`playwright-report/`を14日間保持（`.github/workflows/test.yml:48-54`）。JUnit XML等の機械可読形式は出力していない（`playwright.config.ts:12`のreporterは`["list"]`/`["html", ...]`のみ） |
| `deploy.yml` | `push`（`branches: [main]`）＋`workflow_dispatch`（`.github/workflows/deploy.yml:4-6`） | `npm ci` → `npm run build && npm test` → `peaceiris/actions-gh-pages@v4`でgh-pagesへデプロイ | 無し（デプロイのみが成果物） |
| `pr-preview.yml` | `pull_request`（`types: [opened, reopened, synchronize, closed]`、`.github/workflows/pr-preview.yml:3-5`） | `npm ci` → `npm run build`（`BASE_PATH`環境変数付き） → `rossjrw/pr-preview-action@v1`でgh-pagesのpr-preview/配下へ配信 | 無し（プレビュー配信のみが成果物） |

### 確認できなかった点

- 上記3ワークフローの直近の実行履歴（成功/失敗の推移、実行時間）はGitHub Actions側の情報であり、リポジトリのファイル調査だけでは確認していない。

---

## 3. ESLint・カバレッジ計測の導入状況

### 現在の状況

- **ESLint**：`package.json`のdependencies/devDependencies（`package.json:13-27`）にESLint関連パッケージは無い。`.eslintrc*`・`eslint.config.*`いずれの設定ファイルもリポジトリ内に存在しない（Globで検索し0件）。
- **カバレッジ計測**：`vite.config.ts`（全17行）の`test`設定に`coverage`ブロックは無い。`package.json`のdevDependenciesにも`@vitest/coverage-v8`等のカバレッジプロバイダは含まれていない。
- `npm run lint`・`npm run test:coverage`に相当するスクリプトは`package.json`の`scripts`（`package.json:6-11`：`dev`/`build`/`preview`/`test`/`test:a11y`のみ）に無い。
- CLAUDE.md・docs/配下のいずれにも、ESLintやカバレッジを検討した上で見送ったという記述は無く（「標準書」検索と同様に「ESLint」「lint」「coverage」「カバレッジ」で全文検索したが0件）、**意図的な不採用ではなく単に未着手**と判断できる。

### 確認できなかった点

- 特になし（設定ファイル・依存パッケージともに不在であることを直接確認できたため）。

---

## 4. `e2e/` 配下のテストファイル一覧

| ファイル | 内容 |
|---|---|
| `e2e/a11y.spec.ts` | **アクセシビリティ検査**。`@axe-core/playwright`を使用。ライト（material-light）・ダーク（deep-gray）の2テーマ×`App.tsx`の全タブ（DOMから`nav.app__tabs button.app__tab:not([aria-pressed])`を動的取得、`e2e/a11y.spec.ts:43`）を対象に`AxeBuilder`を実行。critical/serious相当の違反が1件でもあればテスト失敗、minor/moderateはJSON添付のみ（`e2e/a11y.spec.ts:9,17,81`）。業務データの登録・処理結果の検証は行っていない |
| `e2e/tsconfig.json` | テストファイルではなく、e2e配下専用のTypeScript設定（メインの`tsconfig.json`から独立） |

業務シナリオ（受注登録・MRP実行・出荷等の一連の操作をブラウザ上で行い結果を検証するテスト）は**e2e/配下に1件も存在しない**。CLAUDE.mdの「現在の実装状況」に「実際にブラウザで確認済み」という記述が複数あるが、これらは実装時の手動確認（開発時にPlaywrightで操作しスクリーンショットで確認した記録）であり、CI上で継続的に自動実行される回帰テストとしては存在しない。

### 確認できなかった点

- 特になし。

---

## 5. 非機能要件（対応ブラウザ・画面サイズ・研修での使い方）に相当する記述

### 現在の状況

- `docs/v5-spec.md`・`docs/design.md`・`CLAUDE.md`・`GEMINI.md`・`README.md`・`.github/ISSUE_TEMPLATE/feature_request.md`・`.github/PULL_REQUEST_TEMPLATE.md`を「ブラウザ」「画面幅」「解像度」「研修」「対象読者」等のキーワードで検索したが、**数値目標を伴う非機能要件の記述は見つからなかった**。
- 見つかったのは以下のような定性的な記述のみ：
  - 対象読者は「自チームの開発メンバー」（`docs/v5-spec.md:11`）、CLAUDE.mdでも「対象読者は開発チームメンバー。商用製品ではなく教材」（`CLAUDE.md:16`）
  - `.github/PULL_REQUEST_TEMPLATE.md:21`に「UI変更がある場合、ブラウザでライト・ダーク両テーマの動作を確認した」というチェック項目はあるが、対象ブラウザ名・バージョンの指定は無い
  - `.claude/agents/ux-reviewer.md:58`に「画面幅が狭い環境（タブ数が多い・表が広い）でナビゲーションやテーブルが崩れる余地が無いか」というレビュー観点の記述はあるが、これは値の入っていないレビュー基準であり、具体的な画面幅の目標値ではない
  - `playwright.config.ts:23`のテスト対象は`devices["Desktop Chrome"]`の1プロジェクトのみで、他ブラウザ・モバイル/タブレット相当のプロジェクトは定義されていない（対応ブラウザを事実上「Chromeのみ」に絞っている実装上の選択はあるが、これを目標値として明記した文書は無い）
- 「研修での使い方」（受講者数、セッション時間、実施環境等）に相当する記述は一切見つからなかった。

### 確認できなかった点

- 想定される研修での具体的な使い方（対象人数・実施頻度・使用端末等）がリポジトリ外（口頭伝達やこのPoCプロジェクトの別資料）で決まっている可能性があるが、本リポジトリの調査だけでは判定できない。

---

## Issue案A〜Dの下書き作成状況

`issue-workflow`（`.claude/skills/issue-workflow/SKILL.md`）の手順1（Issue下書き作成）・3（`issue-spec-reviewer`によるレビュー）まで実施した。手順4（GitHub Issueとしての実際の起票）は本タスクの制約により行っていない。

| Issue案 | 下書きを作成したか | ファイルパス | 作成しなかった場合の理由 |
|---|---|---|---|
| A：テストへの要件ID・工程タグの付与 | 作成した | `docs/issue-drafts/issue-a-test-tagging.md` | — |
| B：CI結果のJUnit XML出力とワークフロー起動条件の見直し | 作成した | `docs/issue-drafts/issue-b-ci-junit-triggers.md` | — |
| C：ESLintとカバレッジ計測の導入 | 作成した | `docs/issue-drafts/issue-c-eslint-coverage.md` | — |
| D：業務シナリオの自動E2Eテストの新設 | 作成した（縮小版スコープに絞って提案） | `docs/issue-drafts/issue-d-e2e-scenario.md` | — |

上記4件はいずれも、調査で確認した不足点（テスト・タグ／CI成果物／静的解析・カバレッジ／業務シナリオE2E）に対応しており、見送るべき理由（既に存在する、対応不要と判断できる等）は見つからなかったため全件を下書きした。各ファイルは`issue-spec-reviewer`によるレビュー後の改善版であり、レビュー時の指摘サマリを冒頭に、レビューでも解決できない論点があれば「レビュー時の確認事項」として本文末尾に記載している。**いずれも下書きの段階であり、GitHub上への実際の起票は行っていない。着手の要否・優先順位はユーザーの判断を仰ぐ。**

レビュー時に判明した主な指摘（詳細は各下書きファイル冒頭の「issue-spec-reviewerによる指摘サマリ」参照）：
- **Issue案A**：TC-07（`schedule.test.ts`/`procurement.test.ts`）・TC-E1〜E3（`schedule.test.ts`/`production.test.ts`）は、実際のテスト内容を確認すると検証している操作が異なり、同じTC番号でも一律に同じUC番号を割り当てるのは誤りであることが判明した（下書き内で個別方針に修正済み）。また工程区分（単体/結合/総合）・UCタグの決定基準が当初未定義だったため、判定基準を追加した。
- **Issue案B**：vitest 4.1.10はJUnitレポーターを標準搭載しており追加パッケージは不要と判明。また「JUnit出力・起動条件見直し」と「フレーキーテスト検出」は目的が異なる独立した変更であるため、分割要否をレビュー時の確認事項として残した。
- **Issue案C**：背景・目的が外部PoC都合に寄りすぎていたため、本リポジトリ自身への効果（PRレビュー前のローカル機械検出、テスト網羅状況の可視化）を主目的に据え直した。
- **Issue案D**：`playwright.config.ts`の`testDir`と`package.json`の`test:a11y`スクリプト（対象ファイル無指定）を確認した結果、新規E2Eファイルを追加すると既存の`a11y`ジョブが道連れに実行してしまう技術的な矛盾が判明したため、npm scriptをファイル単位で明示指定する要件を追加した。また「フルスコープ版か縮小版か」を未決定のまま起票する曖昧さがあったため、下書きの時点で縮小版（TC-02〜18のうち12ステップ）に確定し、フルスコープ化は別Issue候補として対象範囲外に切り出した。

## 付記：本調査自体のPRのCI結果について

本報告書・Issue下書きをまとめたブランチ（`claude/poc-readiness-assessment-0p8sge`）をPRとして提出したところ、
`.github/workflows/test.yml`の`a11y`ジョブが失敗した。原因は本PRの変更（ドキュメントファイルの追加のみ）とは
無関係で、`src/components/master/`配下フォームのlabel／select-name違反（マスタタブ、43件・16件、critical）が
既に存在するためである。CLAUDE.md「アクセシビリティの自動テスト化（Issue #63）」の節に「マスタタブの
label／select-name違反（critical）はIssue #63の対象範囲外として残っており、`a11y`ジョブは当面red（failure）
になる想定」と明記されているとおりの既知の状態であり、実際に本PRと無関係な別の直近PR（docsのみの変更）でも
同一ジョブが同様に失敗していることを、GitHub Actionsの実行履歴で確認した。本タスクはソースコード変更を
禁止されているため、この既存の未修正違反自体への対応は行っていない（Issue案A〜Dのいずれの対象でもない、
別の既知の課題である）。
