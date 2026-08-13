# CLAUDE.md

このファイルはClaude Codeがこのプロジェクトで作業する際に毎回読み込む。簡潔さを優先しているので、
設計判断の根拠や検討の経緯を確認したいときは `docs/design.md`（v5仕様書との差分・追加決定）と
`docs/v5-spec.md`（業務仕様の一次資料）を参照すること。

## プロジェクト概要

生産管理（受注〜出荷）のドメイン連携を学ぶための、動くミニマムシミュレーター。
木製イス（v5仕様書 §1.1、2階層BOM・購買3品目・内製2品目・工順3行）を題材に、受注を入力すると
7ドメイン（受注・計画・発注・工程・在庫・出荷・マスタ）へ情報が伝播し出荷に至る様子を、
MRP・工程管理・ペギング・KPIまで含めて可視化する。

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
│   └── implementation-plan.md
├── package.json
├── tsconfig.json
├── vite.config.ts
├── index.html
└── src/
    ├── main.tsx            # エントリポイント
    ├── App.tsx             # 画面本体。タブ切り替えとreducerの保持のみを行う
    ├── types.ts            # ドメインの型定義（design.md §4：v5の13テーブルとの対応）
    ├── data/
    │   └── masterData.ts   # 初期マスタデータ（design.md §1 S2：木製イス）
    ├── domain/             # ドメインロジック本体（design.md §7〜§8）★最重要ディレクトリ
    │   ├── mrp.ts            # MRP展開（v5-spec.md §7.1）
    │   ├── production.ts     # 工程着手・完了・バックフラッシュ（v5-spec.md §7.3）
    │   ├── procurement.ts    # 発注・納期回答・入荷計上（v5-spec.md §6.5）
    │   ├── shipment.ts       # 引当・出荷可否判定（v5-spec.md §7.2）
    │   ├── salesOrder.ts     # 受注登録・納期回答・取消（v5-spec.md §6.1、design.md EXT-2/3）
    │   ├── pegging.ts        # ペギング追跡（v5-spec.md §7.4）
    │   ├── schedule.ts       # 日程整合チェック・未充足需要（v5-spec.md §7.5）
    │   ├── kpi.ts             # KPI算出（v5-spec.md §10）
    │   ├── gantt.ts           # 受注一覧ガントチャート用の表示データ計算
    │   ├── processFlow.ts     # プロセス連携図（BPMN風）用の表示データ計算
    │   ├── reducer.ts         # useReducer用reducer。actionを各モジュールへディスパッチ
    │   └── *.test.ts          # 各モジュールに対応する単体テスト
    └── components/         # 画面領域ごとのコンポーネント（design.md §5）
        ├── ClockControls.tsx      # 時計操作（Day表示・次の日へ進む・リセット）
        ├── AlertBar.tsx           # 日程整合警告・未充足需要（常時再計算、専用ボタン無し）
        ├── SalesOrderPanel.tsx    # 受注：登録・納期回答・取消
        ├── PlanningPanel.tsx      # 計画：MRP実行・計画オーダ一括確定・ペグ先/BOMレベル表示
        ├── ProcurementPanel.tsx   # 発注：仕入先納期回答・入荷計上・注文残
        ├── ProductionPanel.tsx    # 工程：リリース・着手/完了（良品数・不良数）
        ├── InventoryPanel.tsx     # 在庫：現在庫・引当済・出荷可能量の3列
        ├── ShipmentPanel.tsx      # 出荷：引当（出荷指示）・出荷実績登録
        ├── MasterDataPage.tsx     # マスタ：品目・BOM・工順・取引先
        ├── EditableField.tsx      # マスタ画面用の編集可能フィールド
        ├── KpiDashboard.tsx       # 分析：KPIダッシュボード（組織目線/現場目線）
        ├── PeggingTracePanel.tsx  # 分析：ペギング追跡（受注→オーダ→実績）
        ├── ProcessFlowDiagram.tsx # 受注〜出荷プロセス連携図（BPMN風。ペギング追跡とは別画面）
        └── EventLogPanel.tsx      # データ増分ログ（テーブル別行数差分＋業務メッセージ）
```

## コマンド

```
npm install
npm run dev       # 開発サーバー起動
npm run build     # 型チェック＋ビルド
npm test          # vitestによる自動テスト実行（v5-spec.md §9 TC-01〜18・TC-E1〜3・複数受注演習を含む）
```

## 現在の実装状況

**Phase 0（プロジェクト初期化）完了。Phase 1以降は未着手。** Vite + React + TypeScriptの雛形、
`.github/workflows/test.yml`（PR時に`npm run build`・`npm test`を自動実行）、vitestの疎通確認用
スモークテスト（`src/setup.smoke.test.ts`、Phase 4でドメインテストに置き換え次第削除）のみが存在する状態。
`src/App.tsx`は環境構築確認用の最小UI。実装計画は `docs/implementation-plan.md` を参照。

## 次にやるべきこと（優先順）

`docs/implementation-plan.md` のPhase 1〜7を参照。概要は以下の通り。

1. 型定義（`types.ts`）・初期マスタデータ（木製イス）の実装
2. ドメインロジック本体（`domain/`配下、design.md §8のモジュール分割）
3. reducer・action一覧の実装（design.md §7）
4. v5仕様書 §9 の受入テストケース（TC-01〜18、TC-E1〜3）＋複数受注演習（design.md §6）の自動テスト化
5. 7ドメイン画面＋共通シェル（時計・警告バー・データ増分ログ）＋分析画面（KPI・ペギング追跡）の実装
6. CI（Phase 0で追加済みのワークフローが正しく動くことを確認）

演習ガイド（design.md DEV-4により先送り）・自動再生機能（DEV-2により先送り）はPhase1.5以降の課題として
`docs/implementation-plan.md` に記載する。

## 実装時に確認すべき設計判断（design.mdの要点）

- **在庫モデル**：受注ごとに仕掛品/完成品を二値ペグするような簡略化はせず、v5仕様書準拠で品目単位の
  fungibleな残高管理（STOCK/STOCK_TXN）に統一する。ペギングは追跡専用の別レイヤ（design.md §4コラム）
- **操作粒度**：MRP実行・オーダ確定・工程着手/完了・入荷計上・出荷引当/実績はすべて個別のユーザー操作
  （design.md §7の action一覧）。「日を進める」ボタンに業務処理は紐付かない
- **v5仕様書が未規定の点への追加決定（EXT-1〜8）**：MRP展開の需要処理順序、取消時のカスケード、
  取消ガードの厳密な判定基準、入荷計上のタイミング制約、納期回答の算出方法など。詳細はdesign.md §3

## コーディング上の注意

- ドメインロジックの関数群は、呼び出し側（`reducer.ts`）が渡した状態のクローンを直接書き換える設計にする
  （`reducer.ts`側で`structuredClone`してから渡す）。この層の外側（UI等）からは純粋関数として扱うこと
- BOMの階層探索・所要量計算（MRP展開・バックフラッシュ）は`domain/mrp.ts`・`domain/production.ts`に集約する。
  UI側でBOM階層を独自に辿るロジックを重複させないこと
- `docs/v5-spec.md` は原文のまま保持する一次資料であり、直接編集しない。v5仕様書自体への疑問・矛盾点が
  見つかった場合は`docs/design.md` §3（追加決定）に解釈を追記する形で解消する

## ロジック検証ループ（v5仕様書 §9 の自動テスト化）

- `docs/v5-spec.md` §9.3（TC-01〜18）・§9.5（TC-E1〜3）の期待値、および`docs/design.md` §6の複数受注演習を、
  各`domain/*.test.ts`にそのままテストケースとして書き起こし、`npm test`（vitest）で自動検証する
- テストが落ちたら、ドメインロジックの不具合かテスト記述の誤りかを`docs/v5-spec.md`と`docs/design.md`の
  仕様と照らして判断し、ロジック側の不具合なら修正して再度`npm test`を回すサイクルを、全件passするまで
  繰り返す運用とする
- レビュー専用のサブエージェント`logic-reviewer`（`.claude/agents/logic-reviewer.md`）を用意し、
  `domain/`配下の実装とテストが`v5-spec.md`・`design.md`の仕様と矛盾していないかの確認に使う
