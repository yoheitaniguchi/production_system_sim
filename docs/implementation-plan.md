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

## 3.2 Phase 4b（レビュー指摘対応）実施結果

Phase 4完了後、独立したレビュー（汎用エージェントによる、v5-spec.md疑似コードとの1行ずつの突き合わせ・
TC-04/TC-17の手検算）を実施し、以下の指摘に対応した。中核ロジック（`mrp.ts`/`production.ts`/`pegging.ts`）
・design.md EXT-1〜12/DEV-1〜4の反映・`reducer.ts`のaction一覧については問題は見つからなかった。

- **KPI「在庫回転」の近似方法が未文書化**：design.md EXT-13として追加決定を記録した（期間平均の代わりに
  現在の総在庫数量を分母とする近似。分母0の場合はnullを返す）。`kpi.ts`のコード内コメントが誤って
  「EXT-11同様」と参照していたため`EXT-13`に修正。`kpi.test.ts`に、TC-17終了時点でnullになること
  （全品目が出荷・消費済みで手元在庫が無いため）と、在庫が残っている時点での非null値の両方を検証する
  テストを追加した
- **reducer.test.tsのaction網羅漏れ**：`MFG_RELEASE`・`WI_START`・`WI_COMPLETE`・`SHIPMENT_ALLOCATE`・
  `SHIPMENT_SHIP`・`SHIPMENT_CANCEL`・`STOCK_ADJUST`・`SO_CANCEL`は各ドメインモジュールの単体テストでは
  検証済みだったが、reducer経由（`applyAction`のログ生成含む）では未検証だった。既存の一連の流れの
  テストを拡張し、これらすべてをreducer経由で検証するようにした
- **TC-01「PARTNER 3行」の数値差異、MASTER_UPDATE_*の入力値検証欠如**：いずれも既知の割り切りとして
  許容する。前者はmasterData.test.tsのコメントで既に理由付け済み。後者（`leadTimeDays`や`qtyPer`への
  負値・0のガードが無い点）は、Phase 5で画面のフォーム入力欄に妥当な制約（`min`等）を持たせることで
  対応する方針とし、reducer/ドメイン層には現時点では追加しない（UIが無い段階でガードを先回りして
  追加しても検証しようが無いため）
- `npm test`は合計50件が成功

---

## 4. Phase 5（画面実装）の進め方

`design.md` §5の対応表に従い、以下の順で実装する（データが揃わないと表示確認できないため、ドメイン画面は
概ねPhase 2の依存順に対応させる）。Phase 5は他フェーズよりコンポーネント数が多く差分が大きくなるため、
以下のサブフェーズに分けて1つずつPRを発行する。

**Phase 4bで積み残した課題**：`MASTER_UPDATE_ITEM_LEAD_TIME`・`MASTER_UPDATE_BOM_QTY_PER`の入力欄には、
0以下の値を入力できないよう`min`制約を設ける（`EditableField.tsx`実装時に反映する）。
→ Phase 5eで`EditableNumberField`の`min`制約として反映済み（4.5節参照）。

| サブフェーズ | 内容 |
|---|---|
| 5a | 共通シェル：`ClockControls.tsx`・`AlertBar.tsx`・`EventLogPanel.tsx`（データ増分ログ対応）＋タブ切り替えを行う`App.tsx`の骨格 |
| 5b | `SalesOrderPanel.tsx`（受注）・`PlanningPanel.tsx`（計画） |
| 5c | `ProcurementPanel.tsx`（発注）・`ProductionPanel.tsx`（工程、良品/不良入力UI） |
| 5d | `InventoryPanel.tsx`（在庫、3列表示）・`ShipmentPanel.tsx`（出荷、引当/実績を分離） |
| 5e | `MasterDataPage.tsx`（工順マスタ含む）・`EditableField.tsx` |
| 5f | 分析画面：`KpiDashboard.tsx`・`PeggingTracePanel.tsx` |
| 5g | `ProcessFlowDiagram.tsx`（7ドメイン・v5のIPOに合わせて構成）・`domain/processFlow.ts`新設 |

各サブフェーズ実装後、`npm run dev`で実際に操作し、当該画面が関わるv5-spec.md §9の演習をブラウザ操作で
通して、テストの期待値と画面表示が一致することを確認する（5a単体では日送りとログ表示のみの確認になる）。

### 4.1 Phase 5a 実施結果

- `src/components/ClockControls.tsx`：Day表示・次の日へ進む・リセット（自動再生は無し、design.md DEV-2）
- `src/components/AlertBar.tsx`：`domain/schedule.ts`の`checkSchedule()`/`unmetDemand()`を毎回呼び出す
  導出表示。警告が無ければ「警告なし」の緑バー、あれば日程遅延・未充足需要のメッセージを列挙する
- `src/components/EventLogPanel.tsx`：`state.eventLog`を新しい順に表示。EXT-8のテーブル別行数差分も併記
- `src/App.tsx`：`useReducer(simulationReducer, undefined, createInitialState)`でreducerを保持し、
  上記3コンポーネントを結線した。ドメイン画面・分析画面はまだタブとして存在せず、プレースホルダ表示のみ
  （Phase 5bでタブ切り替えを導入する予定）
- `src/index.css`：システムフォント・`prefers-color-scheme`によるライト/ダーク対応の最小限のスタイル。
  mini-simulatorにあるような複数プリセットのテーマ切替は本プロジェクトのスコープに含めない
- Playwright（`/opt/pw-browsers`の既存Chromiumバイナリを使用）でブラウザ動作を確認：初期表示・
  「次の日へ進む」を3回クリックしてD+3になること・ADVANCE_DAYではログが増えないこと・ダークモードでの
  表示、をスクリーンショット付きで確認済み
- `npm run build`・`npm test`（50件、ドメイン層は変更していないため件数は変わらず）がともに成功

### 4.2 Phase 5b 実施結果

- `src/components/SalesOrderPanel.tsx`：得意先・品目・数量・希望納期を入力する受注登録フォームと、
  受注一覧テーブル。各行に「納期回答」（回答納期を編集して確定）・「取消」（未出荷かつCLOSED/CANCELED
  でない場合のみ表示）を配置
- `src/components/PlanningPanel.tsx`：「MRPを実行」「計画オーダを確定」の2ボタンと、計画オーダ一覧
  （品目・数量・区分・必要日・着手/発注日・ペグ先・BOMレベル）
- `src/App.tsx`：タブ切り替え（`TABS`配列にid/label/Componentを持たせ、Phase 5c以降はここに追記していく
  だけで済む構成にした）を導入し、「受注」「計画」タブを追加。プレースホルダ表示は削除した
- `src/index.css`：タブ（`.app__tabs`/`.app__tab`）・パネル共通のフォーム/テーブルスタイル
  （`.panel__form`/`.panel__table`等）を追加。以降のドメイン画面もこのクラス名を再利用する想定
- Playwrightで、v5-spec.md TC-02（受注登録）→TC-03（納期回答）→TC-04（MRP実行、5件の計画オーダが
  期待どおりの品目・数量・日付・ペグ先・BOMレベルになること）→TC-05（計画オーダ確定、データ増分ログが
  `PLANNED_ORDER -5 / MFG_ORDER +2 / WORK_INSTRUCTION +3 / PURCHASE_ORDER +3`になること）までを実際に
  ブラウザ操作で通し、スクリーンショットで確認した。受注登録直後に警告バーが「未充足需要：木製イス が
  10個不足しています」と表示され、MRP確定後に「警告なし」に変わることも確認できた（`unmetDemand()`が
  期待どおり動作している証拠）。ダークモード表示も確認済み
- `npm run build`・`npm test`（50件、ドメイン層は変更していないため件数は変わらず）がともに成功

### 4.3 Phase 5c 実施結果

- `src/components/ProcurementPanel.tsx`：購買オーダ一覧（ペグ先・仕入先・品目・数量・発注日・希望納期・
  回答納期・入荷済数・状態）。ORDERED行に「納期回答」（回答納期を編集して確定）、ACKED/PARTIAL行に
  「入荷計上」を配置。EXT-4の日程ガード（現在日が回答納期に達していない）はドメイン層のエラーに任せず、
  ボタン自体を`disabled`にして`title`属性で理由を示すUXにした（エラーログに頼らず未然に防ぐ）
- `src/components/ProductionPanel.tsx`：製造オーダ単位に`.panel__group`でグルーピングし、各グループの
  見出しに品目・数量・ペグ先・着手日・完了予定・状態を表示、FIRM状態のときのみ「リリース」ボタンを配置。
  グループ内に工程（作業指示）テーブルを持たせ、WAIT行に「着手」、WIP行に良品数・不良数の入力欄と「完了」
  ボタンを配置。良品数＋不良数が投入数と一致しない間は「完了」ボタンを`disabled`にし、v5-spec.md §7.3の
  制約（`completeStep`が投げる`ProductionError`）を画面側でも先回りして防いだ
- `src/App.tsx`：`TABS`配列に「発注」「工程」を追加
- `src/index.css`：`ProductionPanel`のオーダ単位グルーピング用に`.panel__group`を追加
- Playwrightで、TC-08〜TC-14相当の一連の流れ（受注→MRP→計画オーダ確定→3件の購買オーダを納期回答→
  入荷予定日前は「入荷計上」ボタンが無効化されていることを確認→日を進めて入荷計上→座面ASSY（MO-002）
  をリリース・着手・完了（バックフラッシュで木板を消費し座面ASSY在庫が生成されること）→木製イス
  （MO-001）をリリースし工程10着手・完了（バックフラッシュで座面ASSY・脚・ネジを消費）→工程20着手・
  完了でMO-001がDONEになること）を実際にブラウザ操作で通し、スクリーンショットで確認した。ダークモード
  表示も確認済み
- `npm run build`・`npm test`（50件、ドメイン層は変更していないため件数は変わらず）がともに成功

### 4.4 Phase 5d 実施結果

- `src/components/InventoryPanel.tsx`：全品目を対象に現在庫・引当済・出荷可能量の3列を表示するテーブル
  （出荷可能量は`domain/shipment.ts`の`shippableQty()`を再利用し、UI側でBOM/在庫ロジックを重複させない
  というCLAUDE.mdの方針を維持した）。棚卸調整（UC-17）フォームを配置し`STOCK_ADJUST`をdispatch
- `src/components/ShipmentPanel.tsx`：「引当（出荷指示）」テーブルと「出荷指示一覧」テーブルを分離。
  前者はCONFIRMED/PARTIALの受注明細を対象に受注残・出荷可能量を表示し「引当」ボタン（出荷可能量0なら
  disabled）、後者はALLOCATED状態の出荷指示に「出荷実績登録」「引当解除」ボタンを配置
- `src/App.tsx`：`TABS`配列に「在庫」「出荷」を追加
- `src/index.css`：パネル内の複数テーブルを区切る`h3`見出しスタイルを追加
- Playwrightで、Phase 5cまでの流れ（受注→MRP→計画オーダ確定→発注→入荷→座面ASSY/木製イスの製造完了）に
  続けて、在庫タブで現在庫10・引当済0・出荷可能量10を確認→棚卸調整で+5して15になることを確認（UC-17）
  →出荷タブで引当（出荷可能量10個の受注残10個を全量引当）→出荷実績登録→受注タブでSO-001がshippedQty
  10・状態CLOSEDになることを確認→在庫タブで現在庫が15-10=5に減っていることを確認、という一連の流れを
  実際にブラウザ操作で通した。ダークモード表示も確認済み
- `npm run build`・`npm test`（50件、ドメイン層は変更していないため件数は変わらず）がともに成功

### 4.5 Phase 5e 実施結果

- `src/components/EditableField.tsx`：`EditableNumberField`（blur時にのみコミット、`min`未満・非数値は
  コミットせず表示を確定済みの値へ戻す）・`EditableTextField`（空文字はコミットしない）を実装。
  Phase 4bで独立レビューにより指摘され先送りしていた「`MASTER_UPDATE_*`系の入力値検証欠如」を、
  ここで`min`制約付きの数値入力欄として反映した
- `src/components/MasterDataPage.tsx`：品目（標準リードタイムのみ編集可）・BOM（員数のみ編集可）・
  工順（標準時間のみ編集可、工程の追加削除は不可）・得意先/仕入先（名称のみ編集可）の4テーブルを配置。
  区分・BOM構造・工程構成・新規追加はUI上そもそも編集不可とした（design.md §5・mini-simulatorの
  マスタ画面の編集可否方針を踏襲）
- `src/App.tsx`：`TABS`配列に「マスタ」を追加
- `src/index.css`：`EditableField`用の入力欄スタイル（`.editable-field__number`/`.editable-field__text`）
  を追加
- Playwrightで、品目の標準リードタイムを2→4に変更（反映されることを確認）→0を入力してblur（min=1
  未満のため元の値4に戻ることを確認）→BOM（脚の員数4→6）→工順（木製イス工程10の標準時間30→45）→
  得意先名の変更、を実際にブラウザ操作で通し、いずれも即座に画面へ反映されることを確認した。
  ダークモード表示も確認済み
- `npm run build`・`npm test`（50件、ドメイン層は変更していないため件数は変わらず）がともに成功

---

## 5. Phase 7（先送り事項、Phase1.5以降）

- **演習ガイド（D3）**：v5-spec.md §9のTCを画面上で自動判定・誘導する機能。design.md DEV-4により先送り
- **自動再生機能**：操作粒度がv5準拠の個別ボタン操作になったため、「日を進める」の自動連打の価値が下がる。
  工程・出荷・調達の操作が出揃った段階で、「本日実行可能な操作のハイライト」等の軽量な代替案も含めて再検討する
- **Phase 2-A（原価）・Phase 2-B（トレーサビリティ）**：v5-spec.md §11.2・§11.3の最小設計をそのまま踏襲し、
  実装着手時に本ファイルへ具体的なタスクを追記する。原価はPhase 2-Aの実装コストが「中」（非破壊的）である一方、
  トレーサビリティは在庫残高の主キー変更を伴う破壊的変更である点に注意（v5-spec.md §11.3）
