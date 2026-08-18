# CLAUDE.md

このファイルはClaude Codeがこのプロジェクトで作業する際に毎回読み込む。簡潔さを優先しているので、
設計判断の根拠や検討の経緯を確認したいときは `docs/design.md`（v5仕様書との差分・追加決定）と
`docs/v5-spec.md`（業務仕様の一次資料）、`docs/architecture-flow.html`（全体アーキテクチャ・データフローの可視化）、
および `docs/issue-workflow.md`（Issue駆動開発プロセスの手順）を参照すること。

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
│   ├── implementation-plan.md
│   └── architecture-flow.html # アーキテクチャ・データフロー可視化ページ
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
    ├── index.css           # グローバルスタイル・デザイントークン
    ├── data/
    │   └── masterData.ts   # 初期マスタデータ＝既定プリセット（design.md §1 S2：木製イス、EXT-26）
    ├── domain/             # ドメインロジック本体（design.md §7〜§8）★最重要ディレクトリ
    │   ├── masterData.ts     # マスタCRUD（v5-spec.md §3.7、design.md EXT-20〜EXT-24）
    │   ├── masterIntegrity.ts # BOM循環・参照検査・健全性チェック（v5-spec.md §3.7 最小機能5、EXT-19/21/22）
    │   ├── masterIO.ts       # マスタ一式のJSON入出力（design.md EXT-26）
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
        ├── BurgerMenu.tsx         # ハンバーガーメニュー（テーマ切替・外部リンク・リセット等）
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
        ├── CapacityPanel.tsx      # 分析：能力（山積み。作業区×日の計画/実績負荷と能力、超過ハイライト）
        ├── PeggingTracePanel.tsx  # 分析：ペギング追跡（受注→オーダ→実績）
        ├── LotTracePanel.tsx      # 分析：ロット追跡（後方追跡・前方追跡）
        ├── ExerciseGuidePanel.tsx # 分析：演習ガイド（TC-01〜18の進行状況と次の操作）
        ├── ProcessFlowDiagram.tsx # 受注〜出荷プロセス連携図（BPMN風。ペギング追跡とは別画面）
        ├── ProcessFlowPopup.tsx   # プロセス連携図フローティングポップアップ（ドラッグ移動対応）
        └── EventLogPanel.tsx      # データ増分ログ（テーブル別行数差分＋業務メッセージ）
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
npm run preview      # build成果物をGitHub Pages相当のbaseパスで動作確認
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
- `src/domain/`：20モジュール（`pegging.ts`・`mrp.ts`・`procurement.ts`・`shipment.ts`・`production.ts`・
  `salesOrder.ts`・`schedule.ts`・`inventory.ts`・`kpi.ts`・`cost.ts`・`lot.ts`・`todayActions.ts`・
  `exerciseGuide.ts`・`processFlow.ts`・`gantt.ts`・`capacity.ts`・`masterData.ts`・`masterIntegrity.ts`・
  `masterIO.ts`・`dashboard.ts`）＋`reducer.ts`（design.md §7の action一覧を実装。`createInitialState()`・
  `simulationReducer()`）を実装済み。`dashboard.ts`の`computeDashboardSnapshot()`は受注残・計画残・発注残・
  製造残・出荷残・在庫の残高（数量・金額）と、KPI/アラート件数を1回で計算する導出関数。金額換算は
  `cost.ts`に追加した`standardCostLookup()`（ctxを1回だけ作って複数品目の原価をまとめて参照する）で
  統一し、原価タブの算出方法と食い違わないようにしている。`reducer.ts`の`upsertDashboardSnapshot()`が
  `applyAction()`とADVANCE_DAYの末尾で毎回呼ばれ、`state.dashboardHistory`の当日分を上書き・日を跨いだら
  追記する（EventLogEntryと同じ「状態に保持する記録」だが、永続化はしない）
- `src/domain/*.test.ts`：168件のテストで、v5-spec.md §9のTC-01〜18・TC-E1〜E3の全シナリオ、
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

## 次にやるべきこと（優先順）

`docs/implementation-plan.md` §5「Phase 7（先送り事項）」・マスタ自由登録・§6「Phase 8：能力計画（CRP）」・
ダッシュボード機能（残高バーンダウン・KPI/アラート件数の可視化）は全項目完了した。次の一手は特に決まって
いないため、着手前にユーザーに優先順位を確認すること。候補：

1. CI（既存ワークフローが全PRで正しく動作していることの継続的な確認）
2. Phase 2-Bで簡略化した点（design.md EXT-18：STOCKの主キーは変更せずLOT/LOT_GENEALOGYを並行追加した）を
   踏まえ、より厳密な実装（STOCKの主キー変更を含む）へ発展させる必要性の検討
3. マスタ自由登録で見送った点：品目コードの改名（EXT-24でカスケードを断念し「削除→再登録」に倒した）、
   マスタのlocalStorage永続化、複数プリセットの同梱、演習ガイドのマスタ非依存化（EXT-27）
4. CRPで任意の拡張候補として切り出した項目（design.md §9.9）：計画オーダ（未確定）段階での山積みプレビュー、
   段取り時間、山積み表のSVGバー化
5. その他、`docs/v5-spec.md` §11に記載のロードマップ上の拡張項目（安全在庫・ロットサイズ、複数受注の競合）の検討
6. ダッシュボード機能で今回スコープ外にした項目：遅延ランキング（`checkSchedule()`の警告を遅延日数順に一覧化）、
   ボトルネック作業区の推移ハイライト（山積み超過の慢性化検知）、KPIのトレンド化（現状は数値カードのみ）、
   アラート件数バッジから該当タブへのワンクリック遷移（現状はAlertBar側の導線のみ）

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
  - `logic-reviewer`（`.claude/agents/logic-reviewer.md`）：`domain/`配下の実装とテストが`v5-spec.md`・`design.md`の仕様と矛盾していないかの確認
  - `ux-reviewer`（`.claude/agents/ux-reviewer.md`）：UI/UXの操作性・アクセシビリティ・テーマ整合性のレビュー
- Issue駆動開発向けのSkillも用意している：`issue-workflow`（`.claude/skills/issue-workflow/SKILL.md`）：
  要望・要件のIssue化からPR作成（`Closes #`連携）・マージ後の対応までの手順を定型化。詳細は
  `docs/issue-workflow.md`参照
