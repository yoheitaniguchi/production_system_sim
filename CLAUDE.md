# CLAUDE.md

このファイルはClaude Codeがこのプロジェクトで作業する際に毎回読み込む。簡潔さを優先しているので、
設計判断の根拠や検討の経緯を確認したいときは `docs/design.md`（v5仕様書との差分・追加決定）と
`docs/v5-spec.md`（業務仕様の一次資料）、`docs/architecture-flow.html`（全体アーキテクチャ・データフローの可視化）、
`docs/issue-workflow.md`（Issue駆動開発プロセスの手順）、`docs/test-tagging.md`
（`domain/*.test.ts`への要件ID・工程・テストの種類・観点タグの付与書式）、
`docs/test-process-standard.md`（テスト工程の定義と自動化の方針の標準）、
`docs/test-management-app-requirements.md`（自動テスト管理アプリの要件定義書）、
`docs/process/poc-definition.md`（PoCの目的・仮説・検証しない範囲の正本。機能の優先順位はこれで判断する）、
`docs/process/dod.md`（完了の定義。PRをマージしてよい条件の正本）、および
`docs/security/checklist.md`（セキュリティレビューのチェック観点の正本）を参照すること。

## プロジェクト概要

生産管理（受注〜出荷）のドメイン連携を動かして確かめるための、ミニマムなシミュレーター。
木製イス（v5仕様書 §1.1、2階層BOM・購買3品目・内製2品目・工順3行）を題材に、受注を入力すると
7ドメイン（受注・計画・発注・工程・在庫・出荷・マスタ）へ情報が伝播し出荷に至る様子を、
MRP・工程管理・ペギング・KPIまで含めて可視化する。7ドメイン間のデータの流れ自体も、
BPMN風のプロセス連携図として可視化する（付加価値画面）。

**本リポジトリはPoCであり、目的は次の3つ**（仮説・判定方法・検証しない範囲の正本は`docs/process/poc-definition.md`）：
①生産管理システムの構想検証、②AI駆動開発プロセスの検証、③テスト管理アプリの構想検証。
**このコードは本番化しない**（本番システムを作る場合は作り直し、引き継ぐのは要件・構想とテストの考え方）。
開発者・利用者はリポジトリのオーナー1名で、Claude Codeが作業者として実装・テスト・レビューを担う。

**姉妹リポジトリ`mini-simulator`との関係**：`mini-simulator`は小型コンベア装置を題材にした簡易版
（受注生産・即時発注トリガー・3状態モデルのみ）を実装している。本リポジトリはそのアーキテクチャ
（React + TypeScript + Vite、バックエンドなし、`useReducer`による状態管理、ドメインロジックを純粋関数として
UIから分離する設計）を踏襲しつつ、`docs/v5-spec.md`が定義する本格的なMRP・工程管理（工順・作業区・良品/不良）・
購買/製造/出荷の状態遷移・ペギング・KPIまでを正面から実装する、独立した新規プロジェクトである。
`mini-simulator`のドメインロジック・型定義をそのまま移植することはしない（データモデルの前提が異なるため。
詳細は`docs/design.md`参照）。

## 技術スタック・アーキテクチャ

- React + TypeScript + Vite。**バックエンドサーバーは持たない**（`docs/design.md` §7参照）
- 状態は `useReducer` で一元管理。永続化なし（DBなし）、単一セッション、ページリロードで状態は消える
- ドメインロジックは `src/domain/` 配下にドメインごとのファイルへ分割し、純粋関数として実装してUIから独立させる
  （単一の巨大な`logic.ts`は本プロジェクトのスコープでは肥大化するため採用しない）
- **操作粒度はv5仕様書のユースケース単位**。「次の日へ進む」ボタンだけで全自動進行するのではなく、
  MRP実行・オーダ確定・工程着手/完了・入荷計上・出荷引当/実績などはすべて個別のユーザー操作である
  （`docs/design.md` §7の action一覧を参照）。「日を進める」は日付を+1するだけ

## ディレクトリ構成

```
production_system_sim/
├── CLAUDE.md              # このファイル
├── README.md              # 人間向けの概要
├── CHANGELOG.md           # 実装履歴（Issue・PRごとの記録。PRの中で追記する）
├── docs/
│   ├── v5-spec.md          # v5仕様書（業務仕様の一次資料。原文のまま格納、直接編集しない）
│   ├── design.md           # v5仕様書との差分・未規定点への追加決定・実装方針（★まず読む）
│   ├── implementation-plan.md # 初期の全体計画（Phase 0〜8）。Issueごとの開発計画は下書きPRの本文に書く
│   ├── architecture-flow.html # アーキテクチャ・データフロー可視化ページ
│   ├── issue-workflow.md   # Issue駆動開発プロセス（Issue起票〜開発計画〜各レビュー〜マージ）
│   ├── test-tagging.md     # テストへの要件ID・工程・種類・観点タグの付与書式
│   ├── test-process-standard.md # テスト工程の定義と自動化の方針
│   ├── test-management-app-requirements.md # 自動テスト管理アプリの要件定義書
│   ├── process/            # poc-definition.md（PoC定義）・dod.md（完了の定義）・review-report.md（プロセスレビュー）
│   ├── security/           # checklist.md（セキュリティレビュー観点の正本）・reports/（レビュー結果）
│   └── report/             # 調査・検証レポート *-report.md（記録用。現行仕様の正本ではない）
├── .claude/
│   ├── agents/             # レビュー用サブエージェント（logic/ux/issue-spec/security-reviewer、security-test-writer）
│   ├── commands/           # /security-review
│   ├── hooks/              # security系サブエージェントの権限ガード
│   └── skills/issue-workflow/ # Issue駆動開発の手順（docs/issue-workflow.mdの要約）
├── .github/
│   ├── workflows/          # test.yml（test・a11y・e2e-scenario）・deploy.yml・pr-preview.yml・flaky-check.yml
│   ├── ISSUE_TEMPLATE/feature_request.md
│   └── PULL_REQUEST_TEMPLATE.md # 開発計画・計画レビュー結果・受け入れ条件の充足などの欄を持つ
├── e2e/                    # Playwright：a11y.spec.ts・scenario.spec.ts・security.spec.ts
├── scripts/                # CI連携（aggregate-test-results.mjs）・依存監査（security-audit.mjs）
├── security/               # リポジトリ設定・依存関係のセキュリティテスト（@securityタグ）
├── package.json
├── tsconfig.json
├── vite.config.ts
├── index.html
└── src/
    ├── main.tsx            # エントリポイント
    ├── App.tsx             # 画面本体。タブ切り替えとreducerの保持のみを行う
    ├── types.ts            # ドメインの型定義（design.md §4：v5の13テーブルとの対応）
    ├── theme.ts            # テーマ定義・テーマ切り替え管理
    ├── statusLabels.ts     # 各ドメインのステータス日本語ラベル定義
    ├── csvExport.ts        # 表データのCSV書き出し（buildCsv・downloadCsv。Issue #54）
    ├── fileDownload.ts     # テキストファイルのBlobダウンロード共有ユーティリティ（シナリオ書き出し用。Issue #61）
    ├── index.css           # グローバルスタイル・デザイントークン
    ├── data/
    │   └── masterData.ts   # 初期マスタデータ＝既定プリセット（design.md §1 S2：木製イス、EXT-26）
    ├── domain/             # ドメインロジック本体（design.md §7〜§8）★最重要ディレクトリ
    │   ├── masterData.ts     # マスタCRUD（v5-spec.md §3.7、design.md EXT-20〜EXT-24）
    │   ├── masterIntegrity.ts # BOM循環・参照検査・健全性チェック（v5-spec.md §3.7 最小機能5、EXT-19/21/22）
    │   ├── masterIO.ts       # マスタ一式のJSON入出力（design.md EXT-26）
    │   ├── scenarioIO.ts     # シナリオ（SimulationState全体）のJSON入出力（design.md EXT-40。Issue #61）
    │   ├── mrp.ts            # MRP展開（v5-spec.md §7.1）
    │   ├── production.ts     # 工程着手・完了・バックフラッシュ（v5-spec.md §7.3）
    │   ├── procurement.ts    # 発注・納期回答・入荷計上（v5-spec.md §6.5）
    │   ├── shipment.ts       # 引当・出荷可否判定（v5-spec.md §7.2）
    │   ├── inventory.ts      # 在庫計算・受払照会
    │   ├── salesOrder.ts     # 受注登録・納期回答・取消（v5-spec.md §6.1、design.md EXT-2/3）
    │   ├── pegging.ts        # ペギング追跡（v5-spec.md §7.4）
    │   ├── schedule.ts       # 日程整合チェック・未充足需要（v5-spec.md §7.5）
    │   ├── kpi.ts             # KPI算出（v5-spec.md §10）
    │   ├── cost.ts             # 原価（標準原価積上げ・オーダ別原価差異、v5-spec.md §11.2 Phase 2-A）
    │   ├── lot.ts              # ロット管理（FIFO消費・後方/前方追跡、v5-spec.md §11.3 Phase 2-B、design.md EXT-18）
    │   ├── todayActions.ts     # 本日実行可能な操作の集計（design.md DEV-2の軽量代替案）
    │   ├── exerciseGuide.ts    # 演習ガイド（TC-01〜18の自動判定、v5-spec.md §8.1 D3、design.md DEV-4/EXT-17）
    │   ├── gantt.ts           # 受注一覧ガントチャート用の表示データ計算
    │   ├── capacity.ts        # 能力計画（CRP）の山積み計算（v5-spec.md §11.1 Phase 3、design.md §9・EXT-30〜32）
    │   ├── processFlow.ts     # プロセス連携図（BPMN風）用の表示データ計算
    │   ├── dashboard.ts       # ダッシュボード用の日次スナップショット計算（残高バーンダウン・KPI/アラート件数）
    │   ├── reducer.ts         # useReducer用reducer。actionを各モジュールへディスパッチ
    │   ├── testUtils.ts       # テスト用共通ヘルパー
    │   └── *.test.ts          # 各モジュールに対応する単体テスト
    └── components/         # 画面領域ごとのコンポーネント（design.md §5）
        ├── DashboardPanel.tsx     # ダッシュボード：残高バーンダウンチャート（数量/金額）・KPIサマリー・アラート件数
        ├── ClockControls.tsx      # 時計操作（Day表示・次の日へ進む・リセット）
        ├── AlertBar.tsx           # 日程整合警告・未充足需要（常時再計算、専用ボタン無し）
        ├── TodayActionsBar.tsx    # 本日実行可能な操作のハイライト（クリックでタブ遷移）
        ├── BurgerMenu.tsx         # ハンバーガーメニュー（テーマ切替・シナリオの保存/復元・外部リンク・リセット等）
        ├── SalesOrderPanel.tsx    # 受注：登録・納期回答・取消
        ├── PlanningPanel.tsx      # 計画：MRP実行・計画オーダ一括確定・ペグ先/BOMレベル表示
        ├── ProcurementPanel.tsx   # 発注：仕入先納期回答・入荷計上・注文残
        ├── ProductionPanel.tsx    # 工程：リリース・着手/完了（良品数・不良数）
        ├── InventoryPanel.tsx     # 在庫：現在庫・引当済・出荷可能量の3列
        ├── ShipmentPanel.tsx      # 出荷：引当（出荷指示）・出荷実績登録
        ├── GanttChartPanel.tsx    # 進捗ガント：受注・製造・購買・出荷の計画と実績タイムライン
        ├── MasterDataPage.tsx     # マスタ：レイアウトのみ。各テーブルはmaster/配下へ分割
        ├── master/                # マスタCRUDのテーブル群（design.md §5）
        │   ├── ItemMasterTable.tsx   # 品目（追加・編集・削除。コードは作成後不変）
        │   ├── BomTable.tsx          # BOM（ツリー表示＋行の追加・削除。循環は登録時に拒否）
        │   ├── RoutingTable.tsx      # 工順（BOP）。未完了オーダがある品目は構造変更不可
        │   ├── WorkCenterTable.tsx   # 作業区
        │   ├── PartnerTable.tsx      # 得意先／仕入先（partnerTypeで使い分け）
        │   ├── MasterIOToolbar.tsx   # JSON入出力・既定プリセットに戻す
        │   └── DeleteRowButton.tsx   # 参照中はdisabled＋理由をtitle表示
        ├── EditableField.tsx      # マスタ画面用の編集可能フィールド（数値・テキスト・選択）
        ├── KpiDashboard.tsx       # 分析：KPIダッシュボード（組織目線/現場目線）
        ├── CostPanel.tsx          # 分析：原価（金額指標・品目別標準原価・オーダ別原価差異）
        ├── CostCharts.tsx         # 原価パネルのグラフ（構成比の100%積み上げ横棒・オーダ別原価差異の横棒。design.md EXT-39）
        ├── CapacityPanel.tsx      # 分析：能力（山積み。作業区×日の計画/実績負荷と能力、超過ハイライト）
        ├── CapacityLoadChart.tsx  # 能力パネルの山積みバーグラフ（作業区の帯×日の縦棒。design.md EXT-42）
        ├── Sparkline.tsx          # KPI・ダッシュボード共有のスパークライン（日次推移。design.md EXT-38）
        ├── PeggingTracePanel.tsx  # 分析：ペギング追跡（受注→オーダ→実績）
        ├── LotTracePanel.tsx      # 分析：ロット追跡（後方追跡・前方追跡）
        ├── ExerciseGuidePanel.tsx # 分析：演習ガイド（TC-01〜18の進行状況と次の操作）
        ├── ProcessFlowDiagram.tsx # 受注〜出荷プロセス連携図（BPMN風。ペギング追跡とは別画面）
        ├── ProcessFlowPopup.tsx   # プロセス連携図フローティングポップアップ（ドラッグ移動対応）
        ├── EventLogPanel.tsx      # データ増分ログ（テーブル別行数差分＋業務メッセージ）
        └── ErrorBoundary.tsx      # ルートのError Boundary（描画時の例外でフォールバック画面を出す。main.tsxで使用）
```

## コマンド

```bash
npm install
npm run dev          # 開発サーバー起動
npm run build        # 型チェック（tsc）＋ビルド（vite build）
npx tsc --noEmit     # 型チェックのみ実行
npm test             # vitestによる自動テスト全件実行（v5-spec.md §9 TC-01〜18・TC-E1〜3・複数受注演習・
                     # マスタCRUDのガード・4階層BOMの通し演習を含む）
npx vitest run <path> # 特定テストのみ実行（例: npx vitest run src/domain/capacity.test.ts）
npm run test:coverage # vitestのカバレッジ計測（@vitest/coverage-v8。coverage/配下にレポート出力）
npm run lint         # ESLint（eslint.config.js）。CIのtestジョブにも組み込み済み
npm run preview      # build成果物をGitHub Pages相当のbaseパスで動作確認
npm run test:a11y    # Playwright＋axe-coreによるアクセシビリティ自動検査（ライト・ダーク2テーマ×15タブ。
                     # npm run devのdevサーバーを自動起動して実行。初回は npx playwright install --with-deps chromium が必要）
npm run test:e2e:scenario  # 業務シナリオのE2Eテスト（e2e/scenario.spec.ts。CIのe2e-scenarioジョブ）
npm run test:security       # @securityタグ付きvitestテストのみ実行（docs/security/checklist.md参照）
npm run test:e2e:security   # セキュリティ観点のE2Eテスト（e2e/security.spec.ts。存在する場合のみ）
npm run audit:security      # npm audit（本番依存はhigh/critical 0件を必須化）＋依存ライセンス一覧の出力
```

## デプロイ

- `main`へのpushを契機に`.github/workflows/deploy.yml`が自動ビルドし、`gh-pages`ブランチへpushする
  （`peaceiris/actions-gh-pages`使用。Actionsベースの`actions/deploy-pages`は1回のデプロイでサイト全体を
  丸ごと置き換える方式でPRプレビューと共存できないため採用していない）
- PRの作成・更新時は`.github/workflows/pr-preview.yml`が`gh-pages`ブランチの`pr-preview/pr-<番号>/`配下へ
  配信し、PR上にプレビューURLをコメントする（`rossjrw/pr-preview-action`使用、PRクローズで自動削除）
- `vite.config.ts`の`base`はビルド用途ごとに変える：`npm run dev`はルート配信、通常のbuild/previewは
  `/production_system_sim/`、PRプレビュー用ビルドはCI側が渡す`BASE_PATH`環境変数
  （`/production_system_sim/pr-preview/pr-<番号>/`）を最優先する
- リポジトリのSettings→Pages→Build and deploymentのSourceは「Deploy from a branch」／`gh-pages`／
  `/(root)`に設定する（`gh-pages`ブランチは初回デプロイ時にワークフローが自動作成する）

## 現在の実装状況

実装の経緯（Issue・PRごとの記録）は`CHANGELOG.md`にある。ここには、作業の前提として押さえておくべき現状の要約だけを書く。

- **業務機能**：v5仕様書の受注〜出荷（7ドメイン）、MRP・工程管理・ペギング・KPIに加え、原価（Phase 2-A）・
  ロット追跡（Phase 2-B）・能力計画（CRP。段取り時間・確定前プレビューを含む）・ダッシュボード・演習ガイド・
  マスタの自由登録（フルCRUD＋JSON入出力）・シナリオ（状態全体）の保存と復元まで実装済み
- **画面**：15タブ（ダッシュボード／受注／計画／発注／工程／在庫／出荷／マスタ／KPI／原価／能力／ペギング追跡／
  ロット追跡／進捗ガント／演習ガイド）と、プロセス連携図のフローティングポップアップ
- **マスタのプリセット**：木製イス（既定、2階層BOM）と自転車（4階層BOM）。演習ガイドのTC-01〜18の自動判定は
  木製イスでのみ動く（EXT-27）
- **テスト**：`npm test`（vitest、約300件）が、v5-spec.md §9のTC-01〜18・TC-E1〜E3、design.md §6の複数受注演習（TC-M1）、
  4階層BOMの通し演習などを検証する。E2Eは`e2e/`配下（a11y・業務シナリオ・セキュリティ）
- **CI**：`.github/workflows/test.yml`の`test`・`a11y`・`e2e-scenario`の3ジョブは、`main`のRulesetにより
  マージ前の成功が必須。`test`ジョブはテスト結果をJSONに集約して`data`ブランチへ書き込む
- **開発プロセス**：Issue → 下書きPRに開発計画 → 計画レビュー → 実装 → 実装レビュー → PRレビュー → マージ
  （`docs/issue-workflow.md`）。マージ条件は`docs/process/dod.md`。計画レビューのモードは運用実績がまだ少ないため、
  適用したIssueで機能したかを確認すること

## 次にやるべきこと（優先順）

**優先順位は`docs/process/poc-definition.md`の3つの仮説に寄与するかどうかで判断する。** 着手前に、どの仮説に
答えるための作業かを確認し、どれにも寄与しない場合はユーザーに優先順位を確認すること。
プロセス改善の残り項目は`docs/process/review-report.md` §5（改善ロードマップ）にある。

残るオープンIssueは5件（#55・#64・#65・#68・#69）で、いずれもIssue自身の「レビュー時の確認事項」が着手前の
ユーザー判断を明示的に求めているため、実装に着手せず判断待ちとしている。マスタのlocalStorage永続化（Issue #55）は、
「永続化なし・単一セッション」という設計方針そのものの転換と、複数学習者が同一ブラウザを共有する場合の
永続化ポリシー（誰の入力を保存するか）が論点でコメント済み。

以下は既存の先送り事項（マスタ自由登録・CRP・v5-spec.md §11ロードマップ・ダッシュボード）に費用対効果を
付記した候補と、現状の実装（21ドメインモジュール・15画面）を踏まえて新規に提案する候補を、
ドメイン・件名・費用対効果・概要で整理したものである。費用対効果が高い（＝既存資産の再利用度が高く
実装コストが低い）順に並べている。新規提案分には行末に「（新規提案）」を付した。

| ドメイン | 件名 | 費用対効果 | 概要 |
|---|---|---|---|
| 基盤（CI） | CI継続確認 | 高（追加実装コストがほぼゼロで、リグレッション検知という効果を維持できる） | `.github/workflows/`（test.yml［test・a11y・e2e-scenario］・deploy.yml・pr-preview.yml・flaky-check.yml）が全PRで正しく動作し続けているかの継続確認。実装ではなく運用確認タスク |
| マスタ／基盤 | マスタのlocalStorage永続化（Issue #55、保留中） | 中（実装コスト自体は中程度だが、CLAUDE.md記載の「永続化なし・単一セッション」という設計方針そのものの転換になるため、着手前に方針変更の可否をユーザーに確認する必要がある） | ブラウザリロードでマスタ編集内容が失われる現状を、localStorageへの自動保存で解消する案。JSON入出力（`masterIO.ts`）を土台にできる |
| マスタ | 品目コードの改名機能（Issue #64、要否検討・判断待ち） | 低（実装コスト大：BOM・工順・受注・各種オーダ等、全参照箇所への一括カスケード更新が必要／効果小：EXT-24で「削除→再登録」という代替運用が既に確立しており実用上困らない） | EXT-24で一度カスケード更新を断念した経緯がある。改めて着手する場合は全参照テーブルの一括更新ロジックが必要 |
| 演習ガイド／マスタ | 演習ガイドのマスタ非依存化（Issue #65、EXT-27・判断待ち） | 低〜中（現状はCHAIR_PRESETの品目コード・数量に依存したハードコード判定のため、`exerciseGuide.ts`の判定ロジック全面書き換えが必要。複数プリセットは同梱済み（EXT-34）で、自転車プリセットでは演習ガイドが判定不能になるため、一般化の価値が出る状態になっている） | TC-01〜18の自動判定を、マスタが自由に差し替わっても機能するよう一般化する |
| 計画（MRP） | 安全在庫・ロットサイズ（Issue #68は安全在庫のみ。v5-spec.md §11 Phase 4・判断待ち） | 低（v5-spec.mdにもdesign.mdにも最小設計が未着手で、CRPのとき（design.md §9新設）と同様の設計フェーズが先に必要。正味所要量計算というMRP展開ロジックの中核に触れるため、他ドメイン全体への影響範囲も大きい） | 初期在庫ゼロ・正味所要量＝オーダ数量という現状の単純化を外し、安全在庫・発注点方式やロットまとめ・最小発注単位を扱えるようにする |
| マスタ | ECO・BOM有効日対応（Issue #69、設計検討のみ・判断待ち） | 低（v5-spec.md §11.1で「2-Bと同時に検討」とされたまま未着手。BOM構造へバージョン・有効日の概念を持ち込む必要があり、`masterIntegrity.ts`のBOM循環検査・`mrp.ts`の展開ロジック双方に影響する中規模の設計変更が必要。v5-spec.md本文でも対象外寄りの扱いで教材としての優先度は低い） | 「いつ時点のBOMで計算したか」の再現性を扱う。BOM変更履歴と有効日を持たせ、過去時点のBOMでの原価・所要量計算を再現できるようにする |

## 実装時に確認すべき設計判断（design.mdの要点）

- **在庫モデル**：受注ごとに仕掛品/完成品を二値ペグするような簡略化はせず、v5仕様書準拠で品目単位の
  fungibleな残高管理（STOCK/STOCK_TXN）に統一する。ペギングは追跡専用の別レイヤ（design.md §4コラム）
- **操作粒度**：MRP実行・オーダ確定・工程着手/完了・入荷計上・出荷引当/実績はすべて個別のユーザー操作
  （design.md §7の action一覧）。「日を進める」ボタンに業務処理は紐付かない
- **v5仕様書が未規定の点への追加決定（EXT-1〜12）**：MRP展開の需要処理順序、取消時のカスケード、
  取消ガードの厳密な判定基準、入荷計上のタイミング制約、納期回答の算出方法、KPIの集計対象など。詳細はdesign.md §3
- **マスタ編集の「禁止」と「警告」の線引き（EXT-20）**：復旧不能・原因不明の停止を生むものだけを禁止する。
  禁止＝BOM循環／工順ゼロの内製品目の計画オーダ確定／未完了オーダがある品目の工順の**構造**変更／
  参照中マスタの削除／前提を満たさない区分変更。警告のみ＝仕掛中オーダがある品目のBOM編集（EXT-23）。
  コード（品目・作業区・取引先）は作成後不変で、改名は削除→再登録（EXT-24）

## コーディング上の注意

- ドメインロジックの関数群は、呼び出し側（`reducer.ts`）が渡した状態のクローンを直接書き換える設計にする
  （`reducer.ts`側で`structuredClone`してから渡す）。この層の外側（UI等）からは純粋関数として扱うこと
- BOMの階層探索・所要量計算（MRP展開・バックフラッシュ）は`domain/mrp.ts`・`domain/production.ts`に集約する。
  UI側でBOM階層を独自に辿るロジックを重複させないこと（BOMツリー表示は`domain/masterIntegrity.ts`の
  `buildBomIndex()`を使う）
- **BOMを再帰的に辿るコードを新しく書くときは、必ず訪問済み集合または深さ上限を持たせること**
  （design.md EXT-19）。マスタが自由に編集できるため循環したデータが入りうる。永続化が無いので、
  無限再帰でブラウザが固まると演習内容がすべて失われる
- **マスタ編集のガードは`domain/masterData.ts`に集約する**。UI側（`components/master/*`）は
  `masterIntegrity.ts`の検査関数を「ボタンを無効化して理由を見せる」目的でのみ使い、
  独自の判定ロジックを持たないこと
- **`SimulationState`へフィールドを追加したら、`domain/scenarioIO.ts`の`TABLE_SPECS`も更新すること**
  （シナリオJSONの復元が未知キーとして拒否する。design.md EXT-40）
- **テーマ（色）**：新しい色は`index.css`のデザイントークンとして6テーマすべてに定義する。`--warn-border`は枠線用で、
  警告の文字色には`--warn-text`を使う（コントラスト不足の再発防止。Issue #72）
- **CIの権限**：`permissions.contents: write`は`test.yml`の`test`ジョブ（`data`ブランチへのテスト結果書き込み）だけに
  付与している。他のジョブ・ワークフローへ広げないこと（Issue #98）
- `docs/v5-spec.md` は原文のまま保持する一次資料であり、直接編集しない。v5仕様書自体への疑問・矛盾点が
  見つかった場合は`docs/design.md` §3（追加決定）に解釈を追記する形で解消する

## ロジック検証ループ（v5仕様書 §9 の自動テスト化）

- `docs/v5-spec.md` §9.3（TC-01〜18）・§9.5（TC-E1〜3）の期待値、および`docs/design.md` §6の複数受注演習を、
  各`domain/*.test.ts`にそのままテストケースとして書き起こし、`npm test`（vitest）で自動検証する
- テストが落ちたら、ドメインロジックの不具合かテスト記述の誤りかを`docs/v5-spec.md`と`docs/design.md`の
  仕様と照らして判断し、ロジック側の不具合なら修正して再度`npm test`を回すサイクルを、全件passするまで
  繰り返す運用とする
- レビュー専用のサブエージェントを用意している：
  - `logic-reviewer`（`.claude/agents/logic-reviewer.md`）：`domain/`配下の実装とテストが`v5-spec.md`・`design.md`の仕様と矛盾していないかの確認。
    計画レビューでは開発計画とIssueの要件との整合性・合理性を確認する
  - `ux-reviewer`（`.claude/agents/ux-reviewer.md`）：UI/UXの操作性・アクセシビリティ・テーマ整合性のレビュー。
    計画レビューでは開発計画に含まれる画面・導線の設計を確認する
  - `issue-spec-reviewer`（`.claude/agents/issue-spec-reviewer.md`）：Issue下書きの目的・効果の明確さ／要件の
    分解粒度／開発方針との整合性／費用対効果／テンプレート必須項目の充足を確認し、改善済み下書きを生成する
    （`issue-workflow`のIssue下書き作成直後に自動で使う）
- Issue駆動開発向けのSkillも用意している：`issue-workflow`（`.claude/skills/issue-workflow/SKILL.md`）：
  要望・要件のIssue化→開発計画（下書きPRの本文）→計画レビュー（`logic-reviewer`・`ux-reviewer`・
  `security-reviewer`）→実装→実装レビュー→PRレビュー（`/code-review`とユーザーの両方）→マージ後の対応までの
  手順を定型化。詳細は`docs/issue-workflow.md`参照

## セキュリティレビュー

**まとまった実装（Issue1件分の機能追加・依存関係の変更・CI設定の変更等）を終えたら、`/security-review`
スラッシュコマンド（`.claude/commands/security-review.md`）を実行すること。** 引数無しなら
`git diff main...HEAD`の変更ファイルのみ、`--all`ならリポジトリ全体（src・設定ファイル・CI・依存関係）を
対象にする。この実行は`docs/issue-workflow.md` §8（実装レビュー）の一部であり、PRテンプレートの
「テスト」欄でも実施をチェックする。なお`security-reviewer`は、実装前の計画レビュー（同 §6）でも
開発計画の安全性・堅牢性の確認に使う（この場合はレポートファイルを作らない）。

- チェック観点の正本は`docs/security/checklist.md`（コードレベル／E2Eレベル／非機能面の3部構成）
- レビューは`security-reviewer`（`.claude/agents/security-reviewer.md`）が行う。読み取り専用
  （Bashはサブエージェント自身のフックで監査コマンドのみに制限済み）で、本番コードは変更できない
- 指摘（severityがInfo以外）ごとに`security-test-writer`（`.claude/agents/security-test-writer.md`）が
  再現・回帰用テストを追加する。テストファイル以外は編集できない（フックで強制）ため、こちらも本番コードは
  変更できない
- `npm run test:security`（`@securityタグ`付きvitestテストのみ実行）・`npm run test:e2e:security`
  （`e2e/security.spec.ts`が存在する場合）・`npm run audit:security`（`npm audit`のhigh/critical
  ゲート＋依存ライセンス一覧）で検証する
- テスト失敗＝脆弱性の顕在化として扱い、修正案を提示して**人の承認を得てから**本番コードを修正する
  （承認前に自動修正はしない）
- レビュー結果は`docs/security/reports/review-YYYYMMDD-HHMM.md`に出力する
