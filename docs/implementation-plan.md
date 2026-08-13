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
| 2 | ドメインロジック本体（9モジュール） | design.md §8、v5-spec.md §6・§7 |
| 3 | reducer・16 action種別の実装 | design.md §7 |
| 4 | 自動テスト（TC-01〜18、TC-E1〜3、複数受注演習） | v5-spec.md §9、design.md §6 |
| 5 | 画面実装（共通シェル・7ドメイン画面・分析2画面・プロセス連携図） | design.md §5 |
| 6 | CI確認（Phase0で追加したワークフローが正しく動くか確認） | — |
| 7（Phase1.5・先送り） | 演習ガイド（D3）・自動再生の再検討、Phase2ロードマップの具体化 | design.md DEV-2・DEV-4、v5-spec.md §11 |

Phase 0〜6を次回以降のセッションのスコープとする。Phase 7は本セッションの実装対象外。

---

## 2. Phase 2（ドメインロジック）の実装順序と依存関係

BOM展開・MRPが他の全ドメインの前提になるため、以下の順で実装した（後続ほど前段のモジュールに依存する。
実装時に判明した依存関係の都合上、`pegging.ts`は`salesOrder.ts`より先に実装した）。

1. `pegging.ts` — `pegKey()`/`traceFromOrder()`（v5-spec.md §7.4）。`salesOrder.ts`の取消カスケードが
   これに依存するため先に実装する
2. `mrp.ts` — `runMRP()`/`explode()`/`firmAllPlannedOrders()`（v5-spec.md §7.1、design.md EXT-1・EXT-6・EXT-9）
3. `procurement.ts` — 仕入先納期回答・入荷計上（v5-spec.md §6.5、design.md EXT-4のガード）
4. `shipment.ts` — 引当・出荷可否判定・出荷実績・`shippableQty()`（v5-spec.md §7.2、design.md EXT-5・DEV-3）。
   `production.ts`のバックフラッシュが`shippableQty()`に依存するため先に実装する
5. `production.ts` — 工程着手・完了・バックフラッシュ（v5-spec.md §7.3、design.md EXT-10）
6. `salesOrder.ts` — 受注登録・納期回答・取消（v5-spec.md §6.1、design.md EXT-2・EXT-3・EXT-7）
7. `schedule.ts` — `checkSchedule()`/`unmetDemand()`（v5-spec.md §7.5）
8. `inventory.ts` — 棚卸調整（v5-spec.md UC-17）。8モジュールでは在庫調整の置き場所が無いことが実装中に
   判明し追加した
9. `kpi.ts` — v5-spec.md §10の12指標（design.md EXT-11・EXT-12）

各モジュールは「呼び出し側が渡した状態を直接書き換える」設計とし、`reducer.ts`側で`structuredClone`してから
渡す（CLAUDE.md記載の方針）。

**実装中に見つかった主な修正**（詳細はdesign.md参照）：
- `pegging.ts`のペグ鎖の遡り方を、v5-spec.md §7.4疑似コードどおり「オーダ自身の`ploNo`」で辿るよう修正
  （実装当初は誤って`moNo`/`poNo`で辿っていた）
- 出荷の引当量を「受注残と出荷可能量の少ない方」に修正（design.md DEV-3。当初は受注残の全量を要求しており、
  TC-15の一部出荷シナリオが成立しなかった）
- KPI「計画達成率」「直行率」を末端の受注確定オーダに限定する集計へ修正（design.md EXT-12。中間のサブアセンブリ
  まで含めるとTC-17の期待値を再現できなかった）

---

## 2.1 Phase 3 実施結果

- `src/domain/reducer.ts`：design.md §7のaction一覧（16種）に、`SHIPMENT_CANCEL`（v5-spec.md §6.6の
  引当解除。design.mdのaction一覧には無いが、`shipment.ts`のcancelShipmentAllocation()に対応する操作として
  追加）と、`MASTER_UPDATE_*`を4種（品目リードタイム・BOM員数・工順標準時間・取引先名称）に分解した合計19種の
  actionを実装した
- データ増分ログ（EXT-8）は、action実行前後でSALES_ORDER〜SHIPMENTまで9テーブルの行数を比較する汎用の差分
  ロジックとして実装（STOCK/PURCHASE_ORDERなど値の「更新」は行数が変わらないため対象外。v5-spec.md §8.2の
  「更新」表記と自然に一致する）
- 各ドメイン関数が投げる例外（`SalesOrderError`等）はreducer側でcatchし、`[エラー]`接頭辞付きのメッセージを
  データ増分ログへ記録する。ガード違反前後で既に生じていた状態変化（バックフラッシュ中のHOLD遷移など）は
  ロールバックせずそのまま保持する
- `RESET`（UC-23）はマスタ（編集済みの値を含む）を保持し、トランザクション系テーブルのみ初期化するよう実装
- `src/domain/testUtils.ts`の`createTestState()`は`reducer.ts`の`createInitialState()`を呼ぶ薄いラッパーに
  置き換え、実装の重複を解消した
- `src/domain/reducer.test.ts`（7件）で、action委譲・不変性・RESET時のマスタ保持・エラーハンドリングを検証。
  `npm test`は合計44件が成功

---

## 3. Phase 4（自動テスト）の進め方

**Phase 2の時点で先取りした範囲**：各モジュールの単体テスト（`domain/*.test.ts`、37件）は、TC-02〜TC-09・
TC-11・TC-12・TC-15〜TC-18・TC-E1・TC-E2相当のシナリオをすでにモジュール単位で検証済み。Phase 4では、
これらを維持しつつ次の残課題に対応する。

- TC-01（マスタ初期化の行数検証。design.md DEV-1によりPARTNERが14行相当に分かれる点を明記した上でテスト化）
- TC-10・TC-13・TC-14・TC-E3（未実施）
- 複数受注演習（TC-M1〜）の新設
- 現状は複数の`.test.ts`に分散して検証している一連の流れを、`v5-spec.md`のTC番号に対応付けた通しテストとして
  整理し直すか判断する（モジュール単位のテストのまま維持するか、統合テストファイルを別途起こすか）

1. `v5-spec.md` §9.3のTC-01〜TC-18を、各ドメインモジュールの`*.test.ts`に期待値付きでそのまま書き起こす
2. `v5-spec.md` §9.5のTC-E1〜TC-E3（納期遅延の例外系）を同様に書き起こす
3. `design.md` §6の複数受注演習（TC-M1〜、RM-300を軸にした資源競合シナリオ）を新規に設計し、
   日数表を手検証した上でテストケース化する。二重発注防止、納期昇順優先、追い越しの実害有無を確認する
4. `npm test`が全件passするまで、失敗のたびに「ロジックの不具合かテスト記述の誤りか」を
   `v5-spec.md`・`design.md`と照合して修正するサイクルを回す
5. `logic-reviewer`サブエージェントで、実装完了時点の整合性を最終レビューする

---

## 3.1 Phase 4 実施結果

Phase 2〜3の時点で先取りできていなかったTC-01・TC-10・TC-14・TC-E3・複数受注演習（TC-M1）を追加した。
統合テストファイルへの整理し直しは行わず、各ドメインモジュールの`*.test.ts`に追記する方針を維持した
（モジュール単位の方が、どのロジックの検証かが分かりやすいと判断したため）。

- `src/data/masterData.test.ts`：TC-01を明示的な名前のテストとして追加。design.md DEV-1により
  PARTNERがCustomer 2件+Supplier 3件に分かれる点をコメントで明記した
- `src/domain/procurement.test.ts`：TC-10（PT-400・PT-500の入荷、STOCK_TXN +2）を追加
- `src/domain/mrp.test.ts`：TC-14（不良1個発生後のMRP再実行で5件の計画オーダが再生成される）を追加。
  実装時、材料在庫を`state.stocks.push()`で直接注入すると、対応するPURCHASE_ORDERがORDERED状態のまま
  残り「注文残」として二重にカウントされ、TC-14が再現できないことが判明した。`ackPurchaseOrder()`→
  `receivePurchaseOrder()`を実際に呼んでPOをCLOSEDにするよう修正した
- `src/domain/production.test.ts`：TC-E1〜E3を一連の流れとして追加（納期回答の遅延→日程整合チェックの
  警告→警告を無視して着手した結果のHOLD）
- `src/domain/multiOrderExercise.test.ts`（新設）：design.md §6のTC-M1。木板（RM-300）の手元在庫1枚を、
  受注登録は後だが納期が早い受注（Z）が優先的に使い、登録が先の受注（Y）はその分を新規発注する、という
  形でEXT-1の需要ソート順を検証する。実装中に、`traceFromOrder`と同様の「pegTo鎖をSO_LINEまで遡る」
  ロジックがテストコード側にも必要になったため、`schedule.ts`にあった`resolveRootPegKey()`を
  `pegging.ts`へ移設・export し、PLANNED_ORDER段階（確定前）でも遡れるよう拡張して共用した
- `npm test`は合計48件が成功

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
