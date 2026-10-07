# CLAUDE.md

このファイルはClaude Codeがこのプロジェクトで作業する際に毎回読み込む。簡潔さを優先しているので、
設計判断の根拠や検討の経緯を確認したいときは `docs/design.md`（v5仕様書との差分・追加決定）と
`docs/v5-spec.md`（業務仕様の一次資料）、`docs/architecture-flow.html`（全体アーキテクチャ・データフローの可視化）、
`docs/issue-workflow.md`（Issue駆動開発プロセスの手順）、`docs/test-tagging.md`
（`domain/*.test.ts`への要件ID・工程・テストの種類・観点タグの付与書式）、
`docs/test-process-standard.md`（テスト工程の定義と自動化の方針の標準）、
`docs/test-management-app-requirements.md`（自動テスト管理アプリの要件定義書）、および
`docs/security/checklist.md`（セキュリティレビューのチェック観点の正本）を参照すること。

## プロジェクト概要

生産管理（受注〜出荷）のドメイン連携を学ぶための、動くミニマムシミュレーター。
木製イス（v5仕様書 §1.1、2階層BOM・購買3品目・内製2品目・工順3行）を題材に、受注を入力すると
7ドメイン（受注・計画・発注・工程・在庫・出荷・マスタ）へ情報が伝播し出荷に至る様子を、
MRP・工程管理・ペギング・KPIまで含めて可視化する。7ドメイン間のデータの流れ自体も、
BPMN風のプロセス連携図として可視化する（付加価値画面）。

対象読者は開発チームメンバー。商用製品ではなく教材。

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
  （単一の巨大な`logic.ts`は本プロジェクトのスコープでは肥大化するため採用しない。`docs/design.md` §8参照）
- **操作粒度はv5仕様書のユースケース単位**。「次の日へ進む」ボタンだけで全自動進行するのではなく、
  MRP実行・オーダ確定・工程着手/完了・入荷計上・出荷引当/実績などはすべて個別のユーザー操作である
  （`docs/design.md` §7の action一覧を参照）。「日を進める」は日付を+1するだけ

## ディレクトリ構成

```
production_system_sim/
├── CLAUDE.md              # このファイル
├── README.md              # 人間向けの概要
├── docs/
│   ├── v5-spec.md          # v5仕様書（業務仕様の一次資料。原文のまま格納、直接編集しない）
│   ├── design.md           # v5仕様書との差分・未規定点への追加決定・実装方針（★まず読む）
│   ├── implementation-plan.md # 初期の全体計画（Phase 0〜8）。Issueごとの開発計画は下書きPRの本文に書く
│   ├── architecture-flow.html # アーキテクチャ・データフロー可視化ページ
│   ├── issue-workflow.md   # Issue駆動開発プロセス（Issue起票〜開発計画〜各レビュー〜マージ）
│   ├── test-tagging.md     # テストへの要件ID・工程・種類・観点タグの付与書式
│   ├── test-process-standard.md # テスト工程の定義と自動化の方針
│   ├── test-management-app-requirements.md # 自動テスト管理アプリの要件定義書
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

**Phase 0〜5（プロジェクト初期化・型定義/初期マスタデータ・ドメインロジック本体・reducer・自動テスト拡充・
画面実装）に加え、`docs/implementation-plan.md` §5「Phase 7（先送り事項）」の全項目
（自動再生の軽量代替案・Phase 2-A原価・演習ガイドD3・Phase 2-Bトレーサビリティ）も完了。
さらに品目・BOM・工順（BOP）・作業区・取引先の自由登録（フルCRUD＋JSON入出力、design.md EXT-19〜EXT-27）と、
`docs/implementation-plan.md` §6「Phase 8：能力計画（CRP、v5-spec.md §11.1ロードマップ Phase 3）」
（`WorkCenter.capacityMinPerDay`の追加、`domain/capacity.ts`の山積み計算、`CapacityPanel.tsx`・
`AlertBar.tsx`連携。design.md §9・EXT-30〜32）も完了。さらにダッシュボード機能
（受注残・計画残・発注残・製造残・出荷残・在庫の残高バーンダウンチャート［数量/金額切替］、
KPIサマリーカード、アラート件数の可視化。`domain/dashboard.ts`・`DashboardPanel.tsx`）も完了。**

- `src/types.ts`：design.md §4の対応表どおり、v5仕様書の13テーブルをTypeScript型に落とした（`SimulationState`を含む）。
  Phase 2-A/2-Bで`WorkCenter`・`Lot`・`LotGenealogy`と、`ItemMaster`/`StockTxn`への拡張フィールドを追加。
  マスタ自由登録で`MasterSnapshot`（JSON入出力・プリセット定義用）を追加。ダッシュボード機能で
  `DashboardSnapshot`（`BacklogMetric`・`DashboardBacklog`・`DashboardAlertCounts`・`DashboardKpiHighlights`）と
  `SimulationState.dashboardHistory`を追加（EventLogEntryと同じく状態に保持する記録用の型）
- `src/data/masterData.ts`：v5-spec.md §1.1（木製イス）の品目5・BOM4行・工順3行・作業区3件。
  顧客2件（design.md §6の複数受注演習用）・仕入先3件（BUY品目ごとに1件、`defaultSupplierId`で対応付け）。
  これらは`CHAIR_PRESET`として既定プリセットにまとめてあり、`createInitialState()`の戻り値は従来どおり
- `src/domain/`：21モジュール（`pegging.ts`・`mrp.ts`・`procurement.ts`・`shipment.ts`・`production.ts`・
  `salesOrder.ts`・`schedule.ts`・`inventory.ts`・`kpi.ts`・`cost.ts`・`lot.ts`・`todayActions.ts`・
  `exerciseGuide.ts`・`processFlow.ts`・`gantt.ts`・`capacity.ts`・`masterData.ts`・`masterIntegrity.ts`・
  `masterIO.ts`・`scenarioIO.ts`・`dashboard.ts`）＋`reducer.ts`（design.md §7の action一覧を実装。`createInitialState()`・
  `simulationReducer()`）を実装済み。`dashboard.ts`の`computeDashboardSnapshot()`は受注残・計画残・発注残・
  製造残・出荷残・在庫の残高（数量・金額）と、KPI/アラート件数を1回で計算する導出関数。金額換算は
  `cost.ts`に追加した`standardCostLookup()`（ctxを1回だけ作って複数品目の原価をまとめて参照する）で
  統一し、原価タブの算出方法と食い違わないようにしている。`reducer.ts`の`upsertDashboardSnapshot()`が
  `applyAction()`とADVANCE_DAYの末尾で毎回呼ばれ、`state.dashboardHistory`の当日分を上書き・日を跨いだら
  追記する（EventLogEntryと同じ「状態に保持する記録」だが、永続化はしない）
- `src/domain/*.test.ts`ほか（`npm test`全体で34ファイル・311件）：v5-spec.md §9のTC-01〜18・TC-E1〜E3の全シナリオ、
  reducerの委譲・不変性・エラーハンドリング・RESET時のマスタ保持、`processFlow.ts`のフロー判定、
  §11.2の原価計算例・§11.3のロット系譜（後方/前方追跡）を検証済み。design.md §6の複数受注演習も
  TC-M1として`multiOrderExercise.test.ts`で検証済み。マスタ自由登録は`masterData.test.ts`・
  `masterIntegrity.test.ts`・`masterIO.test.ts`でガードを個別に、`multiLevelBom.test.ts`で
  **4階層BOMをマスタ操作だけで組み立てて受注〜出荷まで通す**通し演習として検証済み。`gantt.ts`は
  `gantt.test.ts`でTC-01〜16の通し進行に沿って計画バー・実績バー・遅延（DELAYED）判定を検証済み（design.md EXT-29）。
  `capacity.ts`は`capacity.test.ts`でdesign.md §9.5の計算例（TC-04〜05の確定結果だけでWC-ASMがD+13に
  300分/240分で山積み超過になること）・未着手工程がmo.planQty基準で計上されること（C2-1回帰）・
  計画負荷と実績負荷が二重計上されないこと・CANCELEDオーダが除外されることを検証済み
- `src/App.tsx`：`useReducer`でreducerを保持し、共通シェル（`ClockControls`・`AlertBar`・`TodayActionsBar`・
  `EventLogPanel`）と、15個のタブ（ダッシュボード／受注／計画／発注／工程／在庫／出荷／マスタ／KPI／原価／能力／
  ペギング追跡／ロット追跡／進捗ガント／演習ガイド）を実装済み。ダッシュボードは俯瞰画面としてタブの先頭
  （既定タブ）に置いている。プロセス連携図（`ProcessFlowDiagram.tsx`）はタブではなく
  `ProcessFlowPopup.tsx`によるフローティングポップアップとして表示し、他タブを操作しながら常時参照できる
  （タブ切り替えでアンマウントされずApp直下に置く）。ヘッダー部分のドラッグで自由に移動でき（Pointer Events、
  範囲制限なし）、閉じるボタンとEscキーの両方で閉じられる。SVGは`viewBox`＋`width:100%`で追従させ、PC画面での
  横スクロールを不要にした。イベントログ履歴を戻る/進むボタンで遡って表示できる（`domain/processFlow.ts`の
  `computeActiveFlows()`にindex引数を追加し、末尾以外のEventLogEntryも指定できるようにした。最新まで
  進むと自動追従状態に復帰する）。進捗ガント（`GanttChartPanel.tsx`）は受注1行の要約バーを既定表示とし、
  行頭の展開ボタンで購買・製造・出荷オーダの内訳（`traceFromOrder()`と同じ集合）を子行に展開する。
  計画（破線の枠バー）と実績（塗りバー）を同じ行に重ね、実績が計画終了日を超えると遅延色に変わる
  （既存の`--color-accent`/`--pf-active`/`--warn-*`トークンを再利用し6テーマ全てに対応）。各画面はPlaywrightで
  v5-spec.md TC-02〜19相当の操作・§11.2/§11.3相当の操作を実際にブラウザで確認済み（ライト/ダーク両テーマ）。
  マスタ自由登録も、4階層マスタのJSONインポート→受注〜出荷の通し操作・循環BOMの登録拒否・
  参照中マスタの削除ブロックをブラウザで確認済み。能力タブも、TC-04〜05の操作直後にAlertBarへ
  「作業区負荷超過：WC-ASM D+13 必要300分 / 能力240分（60分超過）」が表示されること、能力タブで
  WC-CUT（180/240・OK）／WC-ASM（300/240・超過）／WC-INS（120/240・OK）が一覧できハイライトされること
  をブラウザで確認済み（ライト/ダーク両テーマ）。ダッシュボードタブも、受注登録→MRP実行→計画オーダ確定→
  日を進める、の一連の操作後に残高バーンダウンチャート（数量/金額切替）へ受注残・発注残・製造残・在庫が
  正しく反映されること、KPIサマリーカードが推移データ不足時に「―」表示になること、アラート件数バッジが
  能力超過1件を警告色でハイライトすることを、ライト（マテリアル・クリーン）・ダーク（トゥルーブラック）
  両テーマでブラウザ確認済み。系列色は6テーマ全てに`--chart-planned`/`--chart-purchase`/`--chart-shipment`/
  `--chart-inventory`の4トークンを追加し（受注残=`--color-accent`、製造残=`--pf-active`を再利用）、
  `index.css`のテーマブロックごとに定義した

在庫モデルの厳密化検討（次にやるべきこと旧②、design.md EXT-18追記）も完了した。STOCKの主キーを
`item_code + lot_no`の複合キーへ変える破壊的変更（v5-spec.md §11.3が示す案）は、MRP・引当が本来ロット非依存
であるべきこと（v5-spec.md §7.1）・実運用コードパスでは既に「品目ごとのLot.qty合計 === Stock.onHand」の
不変条件が成立していること・費用対効果の3点から**見送る**と結論し、design.md EXT-18に追記した。代わりに
破壊的変更なしで可能な厳密化を2点実施した：`Lot`に`originalQty`（入庫・完成入庫時点の元数量、不変）を追加し
`LotTracePanel.tsx`で残数量と併記するようにした（EXT-18が予告していた拡張）。また`domain/lot.test.ts`に、
①TC-01〜18相当の一連の操作を通しで流し各チェックポイントで上記不変条件を突き合わせる検証テストと、
②部品消費が複数ロットにまたがる場合に生成ロットの系譜へ消費した全ロットが記録されることを確認するテスト
（従来は単発ロットのケースしか検証していなかった）を追加した

アクセシビリティの自動テスト化（Issue #63）も完了した。`ux-reviewer`が担ってきた静的レビューを補完する
E2E検査基盤として、Playwright（`@playwright/test`）とaxe-core（`@axe-core/playwright`）をdevDependencyに
新規導入した。`playwright.config.ts`は`npm run dev`（base "/"）を対象に起動し、`e2e/a11y.spec.ts`が
ライト（マテリアル・クリーン）・ダーク（ディープグレー）の2テーマ×`App.tsx`の`TABS`（DOMから動的取得する
ため新規タブ追加時も自動で検査対象に入る）で`AxeBuilder`を実行する。重大度ゲートはcritical/serious相当の
違反が1件でもあればテスト失敗、minor/moderateは`testInfo.attach()`でJSONレポートに記録するのみで
失敗させない（`npm run test:a11y`または`npx playwright test`で実行。初回は
`npx playwright install --with-deps chromium`が必要）。CI（`.github/workflows/test.yml`）には既存の
`test`ジョブ（型チェック・ビルド・vitest）とは分離した`a11y`ジョブを新設し、ブラウザインストールの
追加コストが既存ジョブへ影響しないようにした。`e2e/`配下は`*.spec.ts`という命名がvitestの既定`include`と
衝突するため、`vite.config.ts`の`test.exclude`で除外し、型チェックも`e2e/tsconfig.json`を新設して
メインの`tsconfig.json`（`npm run build`が使う方）から独立させている（Playwright関連の型チェックが
既存ビルドジョブへ影響しないようにする意図と、`a11y`ジョブ内で`npx tsc -p e2e --noEmit`として実行する
意図の両方）。**なお実装時にこの検査を実行したところ、現状の画面にcolor-contrast（serious、ほぼ全タブ）・
label／select-name（マスタタブのフォーム部品、critical）に該当する実際の違反が検出された。Issue #63の
対象範囲外（「検出された全指摘の即時修正」は個別Issue化して別途対応する方針）に従い、本PRでは修正せず
フォローアップIssueを起票する運用とした。そのため`a11y`ジョブは当面red（failure）になる想定で、
既存の`test`ジョブ（型チェック・ビルド・vitest）とは独立しているため他ジョブやデプロイ（`deploy.yml`は
`a11y`ジョブを参照しない）には影響しない**

Issue #63のフォローアップとして起票された、ほぼ全タブのcolor-contrast違反（WCAG AA未達）の解消（Issue #72）
も完了した。実行結果から根本原因を3つに整理した：①`.panel__empty`・`.panel__hint`・`.process-flow-legend`・
`.pegging-tree__txns`・`.event-log__deltas`・`.event-log__empty`がテーマトークンを使わず literal な
`color: gray`を直書きしていた（既存の`--color-text-muted`に統一）。②`.app__tab--active`（太字）が
`--color-accent`（#1976d2）を`--color-bg`上で使っており、material-lightテーマでのみコントラスト比4.28
（要件4.5未達）だった（`--color-accent`を`#1565c0`に変更。`:root`のライトデフォルトと
`[data-theme="material-light"]`のみ、他4テーマは今回検証対象外のため未変更）。③本来「枠線」用途の
`--warn-border`が、警告背景（`--warn-bg`）やパネル背景（`--color-surface`）上の「テキスト色」としても
再利用されており、特にダークテーマでコントラスト不足だった（`.guide__expected`・
`.capacity-panel__row--overload td:last-child`・`.master__note--warn`・`.gantt__status-badge--delayed`・
`.dashboard__alert-badge--warn`の5箇所）。新規トークン`--warn-text`を6テーマ全てに追加し（値はWCAGの
相対輝度式で4.5:1を満たすよう算出。material-light: #8a6100、warm-paper/glass-light: #6b4a00、
deep-gray/true-black/midnight-blue: #ffca28）、上記5箇所を置き換えた（`--warn-border`自体は枠線用途で
そのまま残す）。`npm run test:a11y`で修正後は両テーマともcolor-contrast由来のserious違反が0件になった
ことを確認済み。マスタタブのlabel／select-name違反（critical）はIssue #72のスコープ外（Issue #63が
起票時に個別Issue化する方針とした別問題）として残っており、`a11y`ジョブは当面その分のみでred（failure）
のままになる想定

CIテスト結果のJSON集約とデータ用ブランチへの書き込み（Issue #98）も完了した。
`docs/test-management-app-requirements.md`（U-05：ブラウザがGitHub Actionsの成果物ZIPを直接取得できないと
試作で確認済み。U-01：データ保存先はGitHubリポジトリのJSON、専用データ用ブランチに決定済み）を受け、
将来別Issueで実装する自動テスト管理アプリがブラウザから読み込めるよう、CI側（`test`ジョブ）で結果を
集約する仕組みを新設した。`test`ジョブのテスト実行コマンドを`npm run test:coverage`
（`vitest run --coverage`。カバレッジのjson-summaryも出力）に変更し、テスト実行の前後に開始・終了時刻を
記録するステップを追加した。変換処理は`scripts/aggregate-test-results.mjs`（Node.js、ESM）に実装し、
JUnit XML（`test-results/junit.xml`）のパースには`fast-xml-parser`を新規devDependencyとして追加した
（実体参照・エンティティのエスケープを自前の正規表現で扱う不安を避けるため）。パース・スキーマ変換・
印（タグ）抽出・`index.json`のマージという純粋関数群（`parseJUnitXml`・`buildCoverageSummary`・
`buildRunRecord`・`buildIndexEntry`・`mergeIndex`・`extractTag`）と、dataブランチへのgit操作
（`main()`内、`child_process.spawnSync`によるgit worktree操作）を明確に分離し、前者のみ
`scripts/aggregate-test-results.test.mjs`でvitest単体テストする設計とした（後者はローカルの一時bare
リポジトリを使った手動シナリオ確認で、非fast-forward時の再取得→再構築→再push（最大5回）の
リトライが実際に機能することを確認済み。5回失敗時はジョブを失敗させず`::warning::`を出す）。
`index.json`・`runs/<runId>.json`の書き込みは、テスト実行に使ったチェックアウトとは別の一時ディレクトリに
作る専用のgit worktreeで行い、メインの作業ツリーには影響を与えない。`pull_request`トリガーではJSON変換の
み行い、dataブランチへの書き込みはスクリプト内の判定でスキップする（フォークPRでの`GITHUB_TOKEN`権限
制限を踏まえた設計）。`data`ブランチへの書き込み権限（`permissions.contents: write`）は`test`ジョブのみに
付与し、`a11y`・`e2e-scenario`ジョブや`deploy.yml`・`pr-preview.yml`には追加していない。カバレッジ計測の
対象（`vite.config.ts`の`coverage.exclude`）に`scripts/**`を追加し、CI連携用スクリプト自身はアプリの
ドメインロジックのカバレッジ計測・集計対象に含めないようにした。自動テスト管理アプリ本体の実装、
過去の実行履歴のバックフィル、静的解析結果の書き出しは本Issueの対象外（別Issueとする方針）

マスタタブのアクセシビリティ違反（label/select-name、critical）の解消（Issue #100）も完了した。
Issue #63実装時の`npm run test:a11y`で検出されたcritical違反（label 43件・select-name 16件）のうち、
Issue #72（color-contrast）とは別種の残課題として起票されたもの。原因は`EditableField.tsx`の3コンポーネント
（`EditableNumberField`・`EditableTextField`・`EditableSelectField`）が`<input>`/`<select>`にアクセシブルな
名前を持たず、また各マスタテーブル（`ItemMasterTable`・`BomTable`・`RoutingTable`・`WorkCenterTable`・
`PartnerTable`）の「新規行追加」フォームが同コンポーネントを介さない素の`<input>`/`<select>`を直接記述して
いたこと。対応として、`EditableField.tsx`の3コンポーネントのProps型に必須prop`ariaLabel: string`を追加し
（オプショナルにすると呼び出し漏れを`tsc`で機械的に検出できなくなるため必須にした）、全呼び出し箇所と
「新規行追加」フォームの素のinput/selectに、列見出し＋行を一意に識別する情報を組み合わせた`aria-label`を
付与した。識別子は`ItemMasterTable`・`WorkCenterTable`・`PartnerTable`では可視セルと同じ品目コード／
作業区コード／取引先番号を使い、`BomTable`・`RoutingTable`は可視セルが品目名を表示しているため
品目名＋品目コードの組み合わせ（design.mdでも使っている既存の`名前（コード）`という表記慣習を踏襲）にして、
視覚情報と読み上げ情報を一致させた（`ux-reviewer`レビューで可視セルとの不一致を指摘され修正）。
`MasterIOToolbar.tsx`のJSONインポート用`<input type="file">`にも`aria-label`を追加した（同要素はCSSで
`display: none`のため実際にはアクセシビリティツリーから除外されており支援技術に届く機会は無いが、
Issue #100の要件どおり追加し、追加自体に害は無いため残した）。`npm run test:a11y`を実行し、ライト・ダーク
両テーマで全タブ（マスタタブ含む）のcritical/serious相当の違反が0件になったことを確認済み。これにより
Issue #63・#72から続いた`a11y`ジョブのフォローアップは全て完了し、`a11y`ジョブは全面的にgreenになる見込み

ダッシュボードの日程遅延ランキング（Issue #51）も完了した。`domain/schedule.ts`に、`checkSchedule()`が返す
`ScheduleAlert[]`を`delayDays`降順に並べ替える`sortAlertsByDelay()`を追加した（`delayDays`が同値の場合は
Array.prototype.sortの安定ソート保証により元の順序を保つ）。`DashboardPanel.tsx`の「アラート件数」
セクション直後に「日程遅延ランキング」テーブル（発生源・対象オーダ・遅延日数・影響を受ける受注）を追加し、
`AlertBar.tsx`と同様に`checkSchedule(state)`をその都度直接計算する設計とした（`dashboardHistory`への
履歴化はしない。アラート件数バッジの件数だけが`dashboardHistory`由来という2つの鮮度モデルが混在する点は
ファイル冒頭コメントに明記した）。警告0件時は「日程遅延はありません。」を表示する

ダッシュボードのアラート件数バッジからのワンクリック遷移（Issue #52）・演習ガイドの演習完了レポート
（Issue #53）・KPI/原価/能力タブの表データCSVエクスポート（Issue #54）も完了した。`DashboardPanel.tsx`の
アラート件数バッジは`<span>`から、件数>0のときだけ`<button>`（`AlertBar.tsx`と同じ遷移先マッピング：
日程遅延/未充足需要→計画、マスタ不整合→マスタ、能力超過→能力）へ変え、`aria-label`で遷移先を明記した。
`App.tsx`はダッシュボードタブの描画のみ分岐させ、遷移後は遷移先タブボタンへ明示的にフォーカスを移す
（バッジは`<main>`の中身ごとアンマウントされフォーカスを失うため。`AlertBar`/`TodayActionsBar`は
`<main>`の外にあり影響を受けない）。演習完了レポートは`domain/exerciseGuide.ts`の`computeGuideSummary()`
が所要日数・発生した警告件数（延べ）・主要KPI最終値を集計し、`ExerciseGuidePanel.tsx`の全ステップ完了
表示に「算出方法」列付きで追加表示する。CSVエクスポートは`src/csvExport.ts`（`buildCsv()`・
`downloadCsv()`・`todayDateStamp()`。ドメインロジックではないため`theme.ts`・`statusLabels.ts`と同様
`src`直下に配置）を新設し、`KpiDashboard.tsx`（組織目線/現場目線）・`CostPanel.tsx`（金額指標/品目別標準
原価/オーダ別原価差異）・`CapacityPanel.tsx`（山積み表）にCSVエクスポートボタンを配置した。画面表示用の
書式（%・円）ではなく生の数値を出力し単位は列見出し側に持たせる（例：「納期遵守率(%)」）。同一画面内で
複数個並ぶボタンには表単位で区別できる`aria-label`を付け、`.panel__toolbar`でラップして既存の
「見出し→ツールバー→表」という構造・余白に揃えた

計画オーダ段階での山積みプレビュー（Issue #57）・複数受注の競合における優先順位付け（Issue #58）・
ボトルネック作業区の推移ハイライト（Issue #59）・KPIのトレンド化（Issue #60）も完了した（design.md
EXT-35〜38）。`capacity.ts`に`computePlannedOrderLoad()`（未確定のPLANNED_ORDERから作業区×日の見込み負荷
`previewMin`を計算する、`computeCapacityLoad()`とは別の計算経路）と`computeChronicBottlenecks()`
（`CHRONIC_BOTTLENECK_THRESHOLD_DAYS`＝既定3日以上連続で山積み超過している作業区を検出）を追加し、
`CapacityPanel.tsx`の確定前プレビューセクションと`DashboardPanel.tsx`の「慢性的なボトルネック作業区」
セクションでそれぞれ表示する。`Customer`に`priorityRank?: number`（省略時0扱い）を追加し、`runMRP()`の
需要ソートを「優先度ランク降順を最優先、同ランクなら従来のEXT-1（必要日昇順・受注番号昇順）」の2段構えに
変更した（`masterData.ts`の`updateCustomerPriorityRank()`・`PartnerTable.tsx`の得意先専用列から編集する）。
`DashboardKpiHighlights`（`types.ts`）を主要4指標から`KpiSnapshot`と同一の12指標へ拡張し、`dashboard.ts`に
`extractKpiSeries(history, key)`を新設、`DashboardPanel.tsx`と`KpiDashboard.tsx`が共有の`Sparkline`
コンポーネント（`components/Sparkline.tsx`として切り出し）で日次推移を表示する。4件とも既存テスト
（TC-01〜18・TC-M1含む）が無変更で通ることを確認済み（`priorityRank`未設定時はEXT-1のみだった従来の
ソート順とビット単位で一致）で、`logic-reviewer`・`ux-reviewer`レビューの指摘（Sparklineの
`aria-hidden`固定によるスクリーンリーダー情報欠落の解消、コンポーネント固有CSSクラスの転用中止、
冗長な列の統合、ヒントテキストの整理等）を反映済み

複数プリセットの同梱（Issue #56、design.md EXT-34）・原価パネルのグラフ化（Issue #62、EXT-39）・シナリオ
（`SimulationState`全体）のJSON保存・復元（Issue #61、EXT-40）・段取り時間の追加（Issue #66、EXT-41）・山積み表の
SVGバー化（Issue #67、EXT-42）も完了した。いずれも`logic-reviewer`・`ux-reviewer`レビューの指摘を反映済み。

- **複数プリセット（#56）**：`data/masterData.ts`に第2プリセット`BICYCLE_PRESET`（自転車、4階層BOM）を追加し、
  `MasterPreset`型・`MASTER_PRESETS`・`resolveMasterPreset()`・`resolveActivePresetId()`でプリセットを識別する。
  `MasterIOToolbar.tsx`から切替でき、切替は全トランザクションの初期化を伴う。演習ガイド（TC-01〜18の自動判定）は
  既定プリセット（木製イス）以外では判定不能のまま（EXT-27）
- **原価グラフ（#62）**：`cost.ts`に`computeItemCostComposition()`・`computeMfgOrderVarianceSeries()`、
  `CostCharts.tsx`（材料費/加工費の100%積み上げ横棒・製造オーダ別原価差異の横棒。未完了オーダの暫定値は薄い塗り＋
  破線で確定値と区別）。専用トークン`--chart-cost-labor`・`--chart-cost-variance`を6テーマに追加
- **シナリオ保存・復元（#61）**：`scenarioIO.ts`の`serializeScenario()`・`parseScenario()`。形式は
  `{ kind: "production-system-sim-scenario", version: 1, state }`。宣言的スキーマ`TABLE_SPECS`（19テーブル）で
  型検証し、マスタの値域は`parseMasterSnapshot()`に委譲、日次履歴の不変条件と採番シーケンス（実データの最大番号＋1
  以上）も検証する。all-or-nothingで、エラーは件数上限つきでまとめて返す。`SCENARIO_IMPORT`actionは現在の状態を
  丸ごと置き換え、イベントログへは追記しない。`BurgerMenu.tsx`に「シナリオの保存・復元」の導線（復元時は確認あり）。
  **`SimulationState`へフィールドを追加したら`TABLE_SPECS`も更新すること**。トランザクション間の参照整合性の網羅的な
  検証は対象外（必要になれば別Issue）
- **段取り時間（#66）**：`RoutingStep.setupMin?`（省略時0）。`capacity.ts`の負荷は「数量×標準時間＋段取り時間」で、
  段取りは数量に比例させず**作業指示1件（製造オーダ1件の当該工程）につき1回だけ**加算する（確定前プレビューも同様）。
  原価（`cost.ts`）には反映しない。JSON入出力は欠落を許容する（未設定＝0。`capacityMinPerDay`（EXT-32）とは逆の
  判断で、`priorityRank`（EXT-36）と同じ後方互換）。製造オーダを分割すると分割数ぶんだけ段取りが加算される。
  既定プリセットは段取り未設定のままで、design.md §9.5の計算例は不変
- **山積みバーグラフ（#67）**：`capacity.ts`の`buildCapacityChartModel()`（表示データの整形。超過の定義は表・
  AlertBarと同じ）と`CapacityLoadChart.tsx`。作業区の帯（マスタ順）を縦に並べ、日を横軸に計画負荷（破線の枠）・
  実績負荷（塗り）・能力（破線の横線）を縦棒で示し、超過セルは`--warn-*`＋「超過 +N分」の文字で強調する。表は残し、
  その上に併記する。作業区名はSVGの外の固定列に置く。スクロール領域はフォーカス可能なリージョン（原価グラフにも
  同様に付与）。負荷ありの能力タブをaxeへ通すe2eケースを`e2e/a11y.spec.ts`に追加した（初期状態ではグラフが描画
  されず従来の検査対象外だったため）

セキュリティレビュー基盤の構築と初回の全体レビュー（PR #118）も完了した。`security-reviewer`・
`security-test-writer`サブエージェントと`/security-review`コマンドを新設し（詳細は下の「セキュリティレビュー」節）、
初回レビューの指摘（Medium 1件・Low 4件。`docs/security/reports/review-20260929-0340.md`）に対し、承認を得て
次の本番コードを修正した：CSV数式インジェクション対策（`csvExport.ts`でセル先頭の`=`/`+`/`-`/`@`を無害化）、
シナリオJSONの未知キー（`__proto__`含む）の拒否（`scenarioIO.ts`）、localStorageアクセス例外の保護（`theme.ts`）と
ルートへのError Boundary導入（`ErrorBoundary.tsx`・`main.tsx`）、`.gitignore`への`.env`追加、サードパーティActionの
コミットSHA固定（`deploy.yml`・`pr-preview.yml`）。回帰テストは`*.security.test.ts`・`security/`配下・
`e2e/security.spec.ts`にある

開発フローの改訂（PR #119）も完了した。Issue起票後に、開発計画を**下書き（draft）PRの本文**に書き、
`logic-reviewer`（要件との整合性・合理性）・`ux-reviewer`（UI/UX）・`security-reviewer`（安全性・堅牢性）で
計画レビューしてから実装する。実装後は実装レビュー（`/security-review`を含む）を経てReady for reviewにし、
PRレビューはClaude（`/code-review`＋5観点の確認結果コメント）とユーザーの両方が行い、マージはユーザーが行う。
3つのレビュアーには「計画レビュー」のモードを追加し、PRテンプレートに開発計画・計画レビュー結果・受け入れ条件の
充足などの欄を追加した。手順の正本は`docs/issue-workflow.md`（Skillは`issue-workflow`）。なお計画レビューの
モードは実際のIssueでの運用実績がまだ無いため、最初に適用するIssueで機能するかを確認すること

## 次にやるべきこと（優先順）

`docs/implementation-plan.md` §5「Phase 7（先送り事項）」・マスタ自由登録・§6「Phase 8：能力計画（CRP）」・
ダッシュボード機能（残高バーンダウン・KPI/アラート件数の可視化）・在庫モデルの厳密化検討（旧②、
design.md EXT-18追記。STOCKの主キー変更は見送りと結論）・アクセシビリティの自動テスト化（Issue #63、
CI基盤の新設。検出された実違反の修正は個別Issue化して別途対応）・ほぼ全タブのcolor-contrast違反の解消
（Issue #72）・マスタタブのlabel/select-name違反の解消（Issue #100）・ダッシュボードの日程遅延ランキング
（Issue #51）・アラート件数バッジからのワンクリック遷移（Issue #52）・演習完了レポート（Issue #53）・
表データのCSVエクスポート（Issue #54）・計画オーダ段階での山積みプレビュー（Issue #57）・複数受注の競合
における優先順位付け（Issue #58）・ボトルネック作業区の推移ハイライト（Issue #59）・KPIのトレンド化
（Issue #60）・複数プリセットの同梱（Issue #56）・原価パネルのグラフ化（Issue #62）・シナリオのフルスナップ
ショット保存・復元（Issue #61）・段取り時間の追加（Issue #66）・山積み表のSVGバー化（Issue #67）・セキュリティレビュー
基盤の構築（PR #118）・開発フローの改訂（PR #119）は全項目完了した。
残るオープンIssueは5件（#55・#64・#65・#68・#69）で、いずれもIssue自身の「レビュー時の確認事項」が着手前の
ユーザー判断を明示的に求めているため、実装に着手せず判断待ちとしている。マスタのlocalStorage永続化（Issue #55）は、
CLAUDE.md記載の「永続化なし・単一セッション」という設計方針そのものの転換と、複数学習者が同一ブラウザを共有する場合の
永続化ポリシー（誰の入力を保存するか）が論点でコメント済み。次の一手は特に決まっていないため、着手前にユーザーに
優先順位を確認すること。

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
