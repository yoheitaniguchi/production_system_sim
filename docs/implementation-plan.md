# 実装計画

**作成日**: 2026-08-13
**版数**: v1（`docs/v5-spec.md` 完全準拠版の実装計画）
**目的**: `docs/v5-spec.md`（業務仕様の一次資料）と`docs/design.md`（v5仕様書との差分・未規定点への追加決定・
実装方針）を踏まえた、本プロジェクトの実装計画をまとめる。

**前提**: 本リポジトリは仕様確定フェーズのみが完了しており、コードは未着手（`package.json`すら存在しない）。
姉妹リポジトリ`mini-simulator`のディレクトリ構成・アーキテクチャ（React + TypeScript + Vite、バックエンドなし、
`useReducer`）をパターンとして参照するが、コードそのものを移植するわけではない（データモデルの前提が
異なるため。詳細は`docs/design.md`参照）。

---

## 0. Phase 0：プロジェクト初期化

- `npm create vite@latest . -- --template react-ts` 相当の構成（`package.json`, `tsconfig.json`,
  `vite.config.ts`, `index.html`）を作成する
- `vitest` を導入し、`npm test` で`domain/`配下の単体テストを実行できるようにする
- `.github/workflows/test.yml` を追加し、`pull_request`イベントで `npm ci` → `npm run build`（型チェック）→
  `npm test` を自動実行する

---

## 1. フェーズ計画

| Phase | 内容 | 対応するdesign.md/v5-spec.md |
|---|---|---|
| 0 | プロジェクト初期化（本書§0） | — |
| 1 | 型定義（`types.ts`）・初期マスタデータ（木製イス、`masterData.ts`） | design.md §4、v5-spec.md §1.1・§4 |
| 2 | ドメインロジック本体（8モジュール） | design.md §8、v5-spec.md §6・§7 |
| 3 | reducer・16 action種別の実装 | design.md §7 |
| 4 | 自動テスト（TC-01〜18、TC-E1〜3、複数受注演習） | v5-spec.md §9、design.md §6 |
| 5 | 画面実装（共通シェル・7ドメイン画面・分析2画面・プロセス連携図） | design.md §5 |
| 6 | CI確認（Phase0で追加したワークフローが正しく動くか確認） | — |
| 7（Phase1.5・先送り） | 演習ガイド（D3）・自動再生の再検討、Phase2ロードマップの具体化 | design.md DEV-2・DEV-4、v5-spec.md §11 |

Phase 0〜6を次回以降のセッションのスコープとする。Phase 7は本セッションの実装対象外。

---

## 2. Phase 2（ドメインロジック）の実装順序と依存関係

BOM展開・MRPが他の全ドメインの前提になるため、以下の順で実装する（後続ほど前段のモジュールに依存する）。

1. `salesOrder.ts` — 受注登録・納期回答・取消（v5-spec.md §6.1）。取消はEXT-2/3のカスケードを含むため、
   このモジュールは`mrp.ts`（ペグ先探索）に依存する形で最後に実装してもよい
2. `mrp.ts` — `runMRP()`/`explode()`（v5-spec.md §7.1、design.md EXT-1の需要ソート順を実装）。
   オーダ確定（Firm）処理（`PLANNED_ORDER`→`MFG_ORDER`/`PURCHASE_ORDER`/`WORK_INSTRUCTION`生成）もここに含める
3. `procurement.ts` — 仕入先納期回答・入荷計上（v5-spec.md §6.5、design.md EXT-4のガード）
4. `production.ts` — 工程着手・完了・バックフラッシュ（v5-spec.md §7.3、投入数ベースの消費）
5. `shipment.ts` — 引当・出荷可否判定・出荷実績（v5-spec.md §7.2）
6. `pegging.ts` — `traceFromOrder()`（v5-spec.md §7.4）
7. `schedule.ts` — `checkSchedule()`/`unmetDemand()`（v5-spec.md §7.5）
8. `kpi.ts` — v5-spec.md §10の12指標

各モジュールは「呼び出し側が渡した状態を直接書き換える」設計とし、`reducer.ts`側で`structuredClone`してから
渡す（CLAUDE.md記載の方針）。

---

## 3. Phase 4（自動テスト）の進め方

1. `v5-spec.md` §9.3のTC-01〜TC-18を、各ドメインモジュールの`*.test.ts`に期待値付きでそのまま書き起こす
2. `v5-spec.md` §9.5のTC-E1〜TC-E3（納期遅延の例外系）を同様に書き起こす
3. `design.md` §6の複数受注演習（TC-M1〜、RM-300を軸にした資源競合シナリオ）を新規に設計し、
   日数表を手検証した上でテストケース化する。二重発注防止、納期昇順優先、追い越しの実害有無を確認する
4. `npm test`が全件passするまで、失敗のたびに「ロジックの不具合かテスト記述の誤りか」を
   `v5-spec.md`・`design.md`と照合して修正するサイクルを回す
5. `logic-reviewer`サブエージェントで、実装完了時点の整合性を最終レビューする

---

## 4. Phase 5（画面実装）の進め方

`design.md` §5の対応表に従い、以下の順で実装する（データが揃わないと表示確認できないため、ドメイン画面は
概ねPhase 2の依存順に対応させる）。

1. 共通シェル：`ClockControls.tsx`・`AlertBar.tsx`・`EventLogPanel.tsx`（データ増分ログ対応）
2. `SalesOrderPanel.tsx`（受注）→ `PlanningPanel.tsx`（計画）→ `ProcurementPanel.tsx`（発注）→
   `ProductionPanel.tsx`（工程、良品/不良入力UI）→ `InventoryPanel.tsx`（在庫、3列表示）→
   `ShipmentPanel.tsx`（出荷、引当/実績を分離）
3. `MasterDataPage.tsx`（工順マスタ含む）
4. 分析画面：`KpiDashboard.tsx`・`PeggingTracePanel.tsx`
5. `ProcessFlowDiagram.tsx`（7ドメイン・v5のIPOに合わせて構成）

各画面実装後、v5-spec.md §9の演習をブラウザ操作で通し、テストの期待値と画面表示が一致することを確認する。

---

## 5. Phase 7（先送り事項、Phase1.5以降）

- **演習ガイド（D3）**：v5-spec.md §9のTCを画面上で自動判定・誘導する機能。design.md DEV-4により先送り
- **自動再生機能**：操作粒度がv5準拠の個別ボタン操作になったため、「日を進める」の自動連打の価値が下がる。
  工程・出荷・調達の操作が出揃った段階で、「本日実行可能な操作のハイライト」等の軽量な代替案も含めて再検討する
- **Phase 2-A（原価）・Phase 2-B（トレーサビリティ）**：v5-spec.md §11.2・§11.3の最小設計をそのまま踏襲し、
  実装着手時に本ファイルへ具体的なタスクを追記する。原価はPhase 2-Aの実装コストが「中」（非破壊的）である一方、
  トレーサビリティは在庫残高の主キー変更を伴う破壊的変更である点に注意（v5-spec.md §11.3）
