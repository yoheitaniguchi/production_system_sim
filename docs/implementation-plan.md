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

### 4.6 Phase 5f 実施結果

- `src/components/KpiDashboard.tsx`：`domain/kpi.ts`の`computeKpi()`が返す12指標を、v5-spec.md §10の
  「主な目線」列に従って組織目線・現場目線の2テーブルに分けて表示。「両方」に分類される3指標（計画達成率・
  製造リードタイム実績・棚卸差異率）は両テーブルに重複表示する（design.md EXT-14として追加決定を記録）
- `src/components/PeggingTracePanel.tsx`：受注明細を選択すると、`domain/pegging.ts`の`traceFromOrder()`が
  返す確定オーダ（フラットな集合）を、各オーダの`pegTo`/`ploNo`の対応関係を手がかりにツリー状へ組み立てて
  表示する（BOM階層の再探索ではなく、既に解決済みの集合を並べ替えるだけの表示専用ロジックとしてコンポーネント
  内に閉じた。domain層の重複にはあたらない）。各オーダの直下に紐づくSTOCK_TXN（ISS/PRD/RCV）も併記する
- `src/App.tsx`：`TABS`配列に「KPI」「ペギング追跡」を追加
- `src/index.css`：ペギングツリー用のスタイル（`.pegging-tree`系）を追加
- Playwrightで、受注→MRP→計画オーダ確定→発注→入荷→製造完了→出荷までの一連の流れを通した上で、
  ペギング追跡タブでSO-001-1を選択し、MO-001（木製イス）→MO-002（座面ASSY）→PO-001（木板）、および
  MO-001の兄弟としてPO-002（脚）・PO-003（ネジ）が正しい階層で表示されること、各オーダにISS/PRD/RCVの
  トランザクションが紐づいて表示されることを確認した。KPIタブでは、納期遵守率100%・回答納期充足率100%・
  受注残0・計画達成率100%・直行率100%（末端オーダのみ集計対象というEXT-12の効果で座面ASSY分は混ざらない）
  に加え、仕入先納期遵守率が66.7%（3件中1件〈木板〉が希望納期D+12より遅いD+13に入荷計上されたため）と
  なることを確認し、KPI算出ロジックが実際のトランザクションと矛盾しないことを検証した。ダークモード表示も
  確認済み
- `npm run build`・`npm test`（50件、ドメイン層は変更していないため件数は変わらず）がともに成功

### 4.7 Phase 5g 実施結果

- `src/domain/processFlow.ts`：v5-spec.md §2.1のドメイン関係図（mermaid）に基づき、受注・計画・発注・
  工程・在庫・出荷・マスタの7ドメイン間の17本のフロー（11本の実データフロー＋マスタから他6ドメインへの
  「前提」点線6本）を定義。`computeActiveFlows()`は、`state.eventLog`の末尾（＝直前の操作）1件の
  `message`／`tableDeltas`から、その操作がどのフローを動かしたかを判定する。`EventLogEntry`に
  action種別のタグを持たせていないため、reducer.tsの各case文が生成するメッセージ文言（固定テンプレート）
  を手がかりにする実装にした（コード内コメントで隠れた依存として明記）。MRP実行は受注・在庫・発注・工程の
  4方向から同時に計画へ供給/需要情報が読まれるため4本同時にハイライトされる、というv5仕様の実際の挙動を
  そのまま反映できる
- `src/domain/processFlow.test.ts`：実際に`simulationReducer`を経由した一連の操作（受注登録・MRP実行・
  計画オーダ確定・入荷計上・工程完了・マスタ変更・エラー）それぞれの直後に`computeActiveFlows()`を呼び、
  期待どおりのフロー/ドメインがハイライトされることを8件のテストで検証（reducer.tsのメッセージ文言と
  processFlow.tsの対応表が食い違えばテストが落ちる仕組み）
- `src/components/ProcessFlowDiagram.tsx`：7ドメインをSVG上のプール（矩形）として配置し、ドメイン間を
  ベジェ曲線＋矢印で結ぶ。直前の操作で動いたフローはアクセント色の実線、マスタからの前提関係は常時薄い
  点線、その他は灰色の点線で表示。診断結果に応じたノードのハイライトも行う
- `src/App.tsx`：`TABS`配列に「プロセス連携図」を追加（Phase 5a〜5gで計画していた全10画面が出揃った）
- `src/index.css`：プロセス連携図用のCSS変数（`--pf-*`、ライト/ダーク両対応）と関連クラスを追加
- Playwrightで、初期表示（未操作時は「まだ操作していません。」）→受注登録直後（受注ドメインのみ
  ハイライト）→MRP実行直後（受注・在庫・発注・工程→計画の4本が同時にハイライト）→計画オーダ確定直後
  （計画→発注・計画→工程の2本）→マスタ変更直後（マスタノードのみハイライト、フローは無し）の一連を
  実際にブラウザ操作で確認した。SVGの総幅がパネルの`max-width`を超えるため`.process-flow-scroll`の
  横スクロールで全7ドメインを閲覧できることも確認済み。ダークモード表示も確認済み
- `npm run build`・`npm test`（58件、processFlow.test.tsの8件を追加）がともに成功

---

## 5. Phase 7（先送り事項、Phase1.5以降）

- ~~**演習ガイド（D3）**：v5-spec.md §9のTCを画面上で自動判定・誘導する機能。design.md DEV-4により先送り~~
  → 5.3節のとおり実装済み
- ~~**自動再生機能**：操作粒度がv5準拠の個別ボタン操作になったため、「日を進める」の自動連打の価値が下がる。
  工程・出荷・調達の操作が出揃った段階で、「本日実行可能な操作のハイライト」等の軽量な代替案も含めて再検討する~~
  → 5.1節のとおり軽量な代替案（本日実行可能な操作のハイライト）を実装済み。自動連打機能自体は引き続き
  実装しない方針を維持する
- ~~**Phase 2-A（原価）**：v5-spec.md §11.2の最小設計をそのまま踏襲し、実装着手時に本ファイルへ具体的なタスクを
  追記する。実装コストが「中」（非破壊的）である~~ → 5.2節のとおり実装済み
- ~~**Phase 2-B（トレーサビリティ）**：v5-spec.md §11.3の最小設計をそのまま踏襲し、実装着手時に本ファイルへ
  具体的なタスクを追記する。在庫残高の主キー変更を伴う破壊的変更である点に注意（v5-spec.md §11.3）~~
  → 5.4節のとおり実装済み（design.md EXT-18により、STOCKの主キーは変更せずLOT/LOT_GENEALOGYを並行追加する
  方式を採用し、既存79件のテストを無改造のまま維持した）

### 5.1 自動再生の軽量代替案（DEV-2再検討分）実施結果

- `src/domain/todayActions.ts`：`computeTodayActions()`を新設。受注（納期回答待ち）・計画（計画オーダ確定待ち）・
  発注（納期回答待ち／入荷計上可能）・工程（リリース可能／着手可能／完了入力待ち）・出荷（引当可能／出荷実績登録待ち）
  の9種類の「本日実行可能な操作」を、対応するドメイン関数（`production.ts`/`procurement.ts`/`shipment.ts`）の
  ガード条件と一致させて集計する。工程の着手可否判定は`production.ts`に`canStartStep()`として切り出し、
  `startStep()`と共用することでガード条件の重複を避けた
- `src/components/TodayActionsBar.tsx`：`AlertBar`の直下に「本日実行可能な操作」を横並びのピル表示。
  クリックすると該当ドメインのタブへ遷移する
- `src/App.tsx`：タブボタンに件数バッジ（`app__tab-badge`）を追加。`TodayActionsBar`のクリックによる
  タブ遷移は`TABS`の`id`と`TodayActionDomain`の値を一致させることで実現した
- `src/domain/todayActions.test.ts`（8件）：受注登録直後・MRP実行後・計画オーダ確定後・購買回答納期到達前後・
  製造リリース後・工程着手後・完成品入庫後・出荷実績登録待ちの各段階で期待どおりの操作一覧になることを検証
- Playwrightで、受注登録→納期回答→MRP実行→計画オーダ確定→発注タブへのピルクリック遷移、という一連の流れを
  実際にブラウザ操作で確認した。タブバッジ（受注・計画・発注・工程）が件数どおりに表示されること、ダークモード
  表示も確認済み。「本日実行可能な操作」のピルと行内操作ボタン（例：「納期回答」）はテキストが部分一致するため、
  Playwrightの`has-text`セレクタでは誤ってピル側をクリックしてしまう場合がある点に留意（実装上の問題ではなく
  テスト記述上の注意点）
- `npm run build`・`npm test`（67件、todayActions.test.tsの8件を追加）がともに成功

### 5.2 Phase 2-A（原価）実施結果

- `src/types.ts`：`WorkCenter`（作業区マスタ、賃率）を新設し`SimulationState.workCenters`に追加。`ItemMaster`に
  `purchasePrice`・`salesPrice`（design.md EXT-15）を追加
- `src/data/masterData.ts`：3作業区とも賃率2,000円/時（v5-spec.md §11.2の計算例に合わせる）、
  RM-300/PT-400/PT-500の`purchasePrice`（800/250/20）、FG-100の`salesPrice`（6,000円、design.md EXT-15の仮置き）
- `src/domain/cost.ts`：`rollupCost()`（v5-spec.md §11.2疑似コードそのまま）・`computeAllItemCosts()`・
  `computeMfgOrderCost()`（オーダ別の投入材料費/投入加工費/完成品振替額/原価差異）・`inventoryValue()`・
  `backlogValue()`・`scrapLossValue()`を実装。`computeMfgOrderCost()`は「第1工程完了＝投入確定」「最終工程完了＝
  完成品振替確定」というproduction.tsのバックフラッシュ/完成入庫のタイミングと同じ条件で判定する
- `src/domain/cost.test.ts`（10件）：v5-spec.md §11.2の計算例（木製イス材料費2,560・加工費1,400・標準原価3,960）、
  および「原価差異の可視化」の不良1個の例（原価差異3,960円）を実際にドメイン関数へ流し込んで再現・検証した
- `src/components/CostPanel.tsx`（新設、「原価」タブ）：組織目線の金額指標（在庫金額・受注残高・不良損失額）、
  品目別標準原価、製造オーダ別原価差異の3テーブルを表示。design.md EXT-16のとおり、既存の`KpiDashboard.tsx`
  （数量ベース12指標、TC-17等でテスト済み）は変更せず独立した画面として追加した
- `src/components/MasterDataPage.tsx`：品目マスタに購入単価・売価の編集列（`EditableNumberField`、min=0）、
  新規「作業区マスタ」テーブル（賃率の編集）を追加
- `src/domain/reducer.ts`：`MASTER_UPDATE_ITEM_PURCHASE_PRICE`・`MASTER_UPDATE_ITEM_SALES_PRICE`・
  `MASTER_UPDATE_WORK_CENTER_RATE`を追加（既存のMASTER_UPDATE_*と同じパターン）。RESET（UC-23）でも
  `workCenters`をマスタとして保持するよう対応
- Playwrightで、原価タブの品目別標準原価がv5-spec.md §11.2の表と一致すること、マスタタブで購入単価・売価・
  作業区賃率が編集可能であること、受注登録から計画オーダ確定までの流れで受注残高（金額）が60,000円
  （10個×6,000円）になることを実際にブラウザ操作で確認した
- `npm run build`・`npm test`（77件、cost.test.tsの10件を追加）がともに成功

### 5.3 演習ガイド（D3）実施結果

- `src/domain/exerciseGuide.ts`：v5-spec.md §9.3のTC-01〜TC-18をそのままステップ一覧とし、各ステップの完了を
  現在の`SimulationState`から自動判定する`computeGuideProgress()`・次の未完了ステップを返す`currentGuideStep()`
  を実装。TC-04・TC-06・TC-14（3回のMRP実行）は`PLANNED_ORDER`が揮発データで区別できないため、
  `processFlow.ts`と同じ手法（`eventLog.message`の固定テンプレートを手がかりにする）で判定する
  （design.md EXT-17に設計判断を記録）
- `src/domain/exerciseGuide.test.ts`（2件）：初期状態でTC-01のみ完了していること、v5-spec.md §9.1の正常系
  シーケンスを`simulationReducer`経由で一通り流すと全18ステップが完了することを検証。ドメイン関数を直接
  呼ぶとeventLogが記録されずTC-04等の判定が動かないことが実装中に判明し、`processFlow.test.ts`と同じ
  reducer経由のテストパターンに合わせて修正した
- `src/components/ExerciseGuidePanel.tsx`（新設、「演習ガイド」タブ）：「次にやること」ボックスで最初の
  未完了ステップの操作方法・期待結果を強調表示し、その下に全18ステップの状態一覧表を表示する
- `src/App.tsx`：`TABS`配列に「演習ガイド」を追加（v5-spec.md §8.1の分析画面 D1(KPI)→D2(ペギング追跡)→
  D3(演習ガイド)の順序に合わせ、ペギング追跡とプロセス連携図の間に配置）
- Playwrightで、受注登録・納期回答の直後に演習ガイドタブでTC-01〜TC-03がチェック済みになり「次にやること」
  がTC-04に切り替わることを実際にブラウザ操作で確認した。ダークモード表示も確認済み
- `npm run build`・`npm test`（79件、exerciseGuide.test.tsの2件を追加）がともに成功

### 5.4 Phase 2-B（トレーサビリティ）実施結果

- `src/types.ts`：`Lot`（ロットの実体）・`LotGenealogy`（消費ロットと生成ロットの親子関係）を新設。
  `StockTxn`に`lotNo?: string`を追加（どのロットが動いたか）。design.md EXT-18のとおり、既存の
  `Stock{itemId, onHand, allocated}`（品目単位のfungibleな残高）の主キーは変更せず維持し、`lots`・
  `lotGenealogy`・`nextLotSeq`を並行して追加した
- `src/domain/lot.ts`（新設）：`createLot()`（入庫のたびのロット採番）、`consumeFifo()`（作成日昇順・
  同日はlotNo昇順のFIFO消費。複数ロットにまたがる場合は分割して返す）、`traceBackward()`／`traceForward()`
  （後方・前方追跡、v5-spec.md §11.3）を実装。ロット台帳の残数量で不足する場合（ロット台帳に基づかない
  在庫を消費する場合）はエラーにせず`lotNo`未設定として扱う（design.md EXT-18）
- `src/domain/procurement.ts`・`production.ts`・`shipment.ts`・`inventory.ts`：入庫（RCV）・完成入庫（PRD）・
  棚卸プラス調整（ADJ+）でロットを生成し、出庫（ISS／SHP）・棚卸マイナス調整（ADJ-）でFIFO消費して
  STOCK_TXNに`lotNo`を付与する。`production.ts`の`completeStep()`は、最終工程完了時に完成品ロットを生成し、
  その製造オーダのISSトランザクション（第1工程のバックフラッシュで記録済み）から`LOT_GENEALOGY`を記録する
- `src/domain/reducer.ts`：`TABLE_LABELS`に`LOT`・`LOT_GENEALOGY`を追加し、データ増分ログ（EXT-8）にも
  ロット関連の行数差分が表示されるようにした
- `src/components/LotTracePanel.tsx`（新設、「ロット追跡」タブ）：ロットを選択すると後方追跡（このロットは
  何を使ったか）・前方追跡（このロットはどの製品になったか）を表示する。`src/components/PeggingTracePanel.tsx`
  のSTOCK_TXN表示にも`lotNo`を追記し、ペギング（計画上の意図）とロット系譜（実際の消費事実）の違いが
  同一画面上で対比できるようにした
- `src/domain/lot.test.ts`（新設、5件）：FIFO消費の順序・複数ロットへの分割・ロット台帳に基づかない在庫の
  扱い・`adjustStock()`経由のロット生成/消費・入荷から製造までの一連の流れでの後方/前方追跡を検証。
  既存79件は無改造のまま全てpassすることを確認した（design.md EXT-18の設計判断どおり）
- Playwrightで、受注→MRP→計画オーダ確定→木板入荷→座面ASSY製造完了までを実際にブラウザ操作で通し、
  データ増分ログに`LOT +1`・`LOT_GENEALOGY +1`が表示されること、ロット追跡タブで座面ASSYロットから
  木板ロットへの後方追跡が正しく表示されること、ペギング追跡タブのSTOCK_TXN表示にロット番号が付記される
  ことを確認した。ダークモード表示も確認済み
- `npm run build`・`npm test`（84件、lot.test.tsの5件を追加）がともに成功

---

## 6. Phase 8：能力計画（CRP、v5-spec.md §11.1ロードマップ Phase 3）の実行可能タスク

`docs/design.md` §9（Phase 3：能力計画（CRP）最小設計）で仕様を確定した。v5仕様書には最小設計が無く
（Phase 2-A/2-Bと違い§11.2/§11.3相当の記述が無い）、design.md側で新規に設計した点はPhase 7（§5）の
各項目と同じ位置づけである。本節はそれを実装可能な単位に分解する。

**前提**：本節は計画のみであり、実装はまだ行っていない。着手時はサブフェーズごとに1つずつPRを分ける
ことを推奨する（Phase 5のサブフェーズ分割と同じ狙い。既存の検証済みテスト・画面への影響を最小化しながら
差分をレビューしやすくするため）。

| サブフェーズ | 内容 | 主な変更ファイル |
|---|---|---|
| 8a | マスタ拡張：`WorkCenter.capacityMinPerDay`の追加とガード | `types.ts`・`data/masterData.ts`・`domain/masterData.ts`・`domain/masterIO.ts`・`domain/masterIntegrity.ts`・`components/master/WorkCenterTable.tsx` |
| 8b | ドメインロジック本体：山積み計算 | `domain/capacity.ts`（新設）・`domain/capacity.test.ts`（新設） |
| 8c | 画面：能力パネル＋AlertBar連携 | `components/CapacityPanel.tsx`（新設）・`components/AlertBar.tsx`・`App.tsx` |
| 8d | ドキュメント更新 | `CLAUDE.md`・本ファイル（実施結果の追記） |

### 8a. マスタ拡張

1. `src/types.ts`：`WorkCenter`に`capacityMinPerDay: number`を追加（design.md EXT-32）。コメントで
   「1日あたり稼働可能分数、`stdTimeMin`と単位を揃える」ことを明記する
2. `src/data/masterData.ts`：`initialWorkCenters`の3行（WC-CUT/WC-ASM/WC-INS）に`capacityMinPerDay: 240`を
   追加する（design.md §9.5の教育的意図——既定シナリオ単体でWC-ASMが山積み超過になる値——をコード側
   コメントにも一言残す）
3. `src/domain/masterData.ts`：
   - `addWorkCenter()`（319行目付近）に`if (input.capacityMinPerDay < 0) throw ...`を追加（`ratePerHour`と
     同じパターン）
   - `updateWorkCenter()`（324行目付近）の`patch`型に`capacityMinPerDay?: number`を追加し、同様のガードを
     追加する
4. `src/domain/masterIO.ts`：作業区パース処理（170行目付近、`ratePerHour: requireNonNegative(...)`の並び）に
   `capacityMinPerDay: requireNonNegative(record, "capacityMinPerDay", where)`を追加する。design.md EXT-32の
   とおり欠落時のデフォルト補完はしない（検証エラーになることを`masterIO.test.ts`に追記して明示する）
5. `src/domain/masterIntegrity.ts`：`validateMaster()`に警告を追加する——稼働能力0の作業区が工順
   （`routingSteps`）で使用されている場合、`level: "警告"`（データ破損ではなく「常に超過表示になる」ことの
   案内のため、エラーにはしない）
6. `src/components/master/WorkCenterTable.tsx`：
   - 一覧テーブルに「能力（分/日）」列を追加する（`EditableNumberField`、`min={0}`）
   - 新規追加フォームの`draft`初期値に`capacityMinPerDay: 480`を追加する（実働8時間、UIから追加する作業区の
     現実的な既定値。既定プリセットの240分はTC-19相当の演習効果を狙った意図的な値であり、新規追加時の
     既定値とは別に扱う。design.md §9.5参照）

想定`npm test`件数への影響：`masterData.test.ts`・`masterIO.test.ts`・`masterIntegrity.test.ts`へ数件追加
（既存の`ratePerHour`関連テストと対になる形）。

### 8b. ドメインロジック本体

1. `src/domain/capacity.ts`（新設）：design.md §9.4の疑似コードをそのまま実装する。エクスポート：
   - `computeCapacityLoad(state: SimulationState): CapacityLoadEntry[]`
   - `capacityOverloads(state: SimulationState): CapacityLoadEntry[]`

   `schedule.ts`・`kpi.ts`と同じく状態を変更しない導出関数とする。他モジュールからは呼ばれない独立モジュール
   （design.md §9.10）
2. `src/domain/capacity.test.ts`（新設）：design.md §9.5の計算例（TC-04〜05を`runMRP()`→
   `firmAllPlannedOrders()`で実際に流し込み、WC-ASMがD+13に300分/240分で超過、WC-CUT/WC-INSは超過しない
   こと）を検証する。あわせて次の観点を検証する：
   - 未着手工程の計画負荷が`mo.planQty`基準で計上されること（design.md C2-1の回帰テスト。`wi.inputQty`が
     0のままの後工程でも負荷が0にならないことを確認する）
   - 着手済み工程は実績負荷（`actualMin`）側に計上され、計画負荷とは二重計上されないこと
   - DONE後も実績負荷が実着手日に残り続けること
   - CANCELEDの製造オーダは計画負荷に算入されないこと

### 8c. 画面

1. `src/components/CapacityPanel.tsx`（新設）：`computeCapacityLoad()`を作業区×日のテーブルで表示し、
   超過セルを警告色でハイライトする（`CostPanel.tsx`・`KpiDashboard.tsx`と同じ`.panel__table`パターンを
   踏襲する。SVGバー化はdesign.md §9.9の任意拡張）
2. `src/components/AlertBar.tsx`：`capacityOverloads(state)`を追加し、既存の日程遅延・未充足需要と並べて
   「作業区負荷超過：{workCenter} D+{day} 必要{required}分 / 能力{capacity}分（{超過分}分超過）」を表示する
   （design.md EXT-31）。`AlertNavigateTarget`型に`"capacity"`を追加する
3. `src/App.tsx`：`TABS`配列に`{ id: "capacity", label: "能力", Component: CapacityPanel }`を分析タブ群に
   追加する（KPI・原価の並びが自然。位置はKpiDashboard/CostPanelの後、PeggingTracePanelの前を推奨）。
   `onNavigate={(tabId) => setActiveTab(tabId)}`は`tabId`をそのまま`TABS`の`id`として使う実装のため、
   `AlertNavigateTarget`に`"capacity"`を追加してTABSに同名のタブを用意すれば、AlertBar側の追加実装は
   警告オブジェクトの生成のみで済む

Playwrightでの確認観点（Phase 5と同じ形式で実施する）：受注登録→MRP実行→計画オーダ確定（TC-04〜05相当）の
直後に、警告バーへWC-ASMの超過警告が表示されること、能力タブでWC-CUT/ASM/INSそれぞれの負荷・能力・判定が
一覧できること、ダークモード表示。

### 8d. ドキュメント更新

- `CLAUDE.md`の「現在の実装状況」に`capacity.ts`等のモジュール追加を反映し、「次にやるべきこと」から
  CRPの項目を実施済みへ更新する
- 本ファイルに「### 6.1 Phase 8 実施結果」を追記する（既存Phaseの実施結果と同じ形式）

### 実装しないこと（design.md §9.2・§9.9の再掲）

- 有限能力スケジューリング（山崩し・平準化・自動リスケジュール）
- 稼働日カレンダー・複数直・段取り時間
- 計画オーダ（未確定）段階での山積みプレビュー
- KPIダッシュボード（`kpi.ts`）への統合

---

## 6.1 Phase 8 実施結果

サブフェーズ8a〜8dをこの順で実装した。設計（§9）からの逸脱は無し。

- `src/types.ts`：`WorkCenter`に`capacityMinPerDay: number`を追加（EXT-32）
- `src/data/masterData.ts`：`initialWorkCenters`の3行（WC-CUT/WC-ASM/WC-INS）を`capacityMinPerDay: 240`に統一
- `src/domain/masterData.ts`：`addWorkCenter()`に稼働能力の0以上ガードを追加。`updateWorkCenter()`は
  `updateRoutingStep()`と同じ「patchの各フィールドを個別に判定してchangesメッセージを組み立てる」形へ
  作り直し（従来は`{ratePerHour: number}`必須の単一フィールドpatchだった）、`ratePerHour`・
  `capacityMinPerDay`をそれぞれ単独でも同時でも更新できるようにした。`domain/reducer.ts`の
  `MASTER_UPDATE_WORK_CENTER`アクション型も`patch`を両フィールドoptionalへ変更した
- `src/domain/masterIO.ts`：作業区のインポート検証に`capacityMinPerDay: requireNonNegative(...)`を追加。
  設計どおり欠落時のデフォルト補完はせず、検証エラーとして拒否する（EXT-32）
- `src/domain/masterIntegrity.ts`：`validateMaster()`に「稼働能力0の作業区が工順で使用されている」警告を追加
- `src/components/master/WorkCenterTable.tsx`：「能力（分/日）」列を追加（`EditableNumberField`、min=0）。
  新規追加フォームの既定値は480分（実働8時間、§9.5のとおりプリセットの240分とは別扱い）
- `src/domain/capacity.ts`（新設）：§9.4の疑似コードどおり`computeCapacityLoad()`・`capacityOverloads()`を
  実装。1件のWORK_INSTRUCTIONは着手済みか否かで計画負荷・実績負荷のどちらか一方にのみ計上され、二重計上は
  起きない
- `src/domain/capacity.test.ts`（新設、6件）：§9.5の計算例（TC-04〜05の確定結果だけでWC-ASMがD+13に
  300分/240分で山積み超過になり、WC-CUT・WC-INSは超過しないこと）、§9.6 C2-1の回帰（未着手の後工程が
  `mo.planQty`基準で計上されること）、計画負荷→実績負荷への移行で二重計上されないこと、DONE後も実績負荷が
  残り続けること、CANCELEDオーダが計画負荷から除外されることを検証した
- 既存の`WorkCenter`リテラルを持つテスト（`masterData.test.ts`・`masterIO.test.ts`・`multiLevelBom.test.ts`）
  に`capacityMinPerDay`を追加し、あわせて`updateWorkCenter()`の新規テスト（賃率・能力の個別更新、負値拒否）
  ・`masterIO.test.ts`の新規テスト（負の`capacityMinPerDay`拒否、欠落時の拒否＝EXT-32の回帰）を追加した
- `src/components/CapacityPanel.tsx`（新設、「能力」タブ）：作業区×日のテーブルで計画負荷・実績負荷・能力・
  判定を表示し、超過行を警告色でハイライトする（`.capacity-panel__row--overload`、既存の`--warn-bg`/
  `--warn-border`トークンを再利用し6テーマ全てに対応）
- `src/components/AlertBar.tsx`：`capacityOverloads(state)`を追加し、既存の警告と並べて
  「作業区負荷超過：{workCenter} D+{day} 必要{required}分 / 能力{capacity}分（{超過分}分超過）」を表示する。
  `AlertNavigateTarget`に`"capacity"`を追加
- `src/App.tsx`：`TABS`配列に「能力」タブ（`CostPanel`の後、`PeggingTracePanel`の前）を追加
- `src/index.css`：`.capacity-panel__row--overload`を追加
- Playwright（`/opt/pw-browsers`のChromiumをplaywright経由で起動）で、受注登録（FG-100 x10）→納期回答→
  MRP実行→計画オーダ確定（TC-04〜05相当）の一連の流れを実際にブラウザ操作で通し、警告バーに
  「作業区負荷超過：WC-ASM D+13 必要300分 / 能力240分（60分超過）」が表示されること、能力タブで
  WC-CUT（180/240・OK）・WC-ASM（300/240・超過60分）・WC-INS（120/240・OK）が§9.5の計算例どおりに
  表示され超過行がハイライトされることを確認した。ライト（マテリアル・クリーン）・ダーク（トゥルーブラック）
  両テーマでの表示も確認済み
- `npm run build`・`npm test`（164件、`capacity.test.ts`の6件と既存テストへの追加4件を含む）がともに成功
