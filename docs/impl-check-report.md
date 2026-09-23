# 実装確認レポート（design-additions-draft.md §19〜§21 の【要確認】7件＋追加確認3件）

**確認方法**：`src/`配下のソースコード・`docs/v5-spec.md`・`docs/design.md`を読み、事実の断定が必要な箇所は
一時的な検証コード（`src/domain/__tmp_verify_cancel.test.ts`。確認後に削除済み、リポジトリには残していない）を
`npx vitest run`で実行して確認した。ソースコード・テスト・設定ファイルは変更していない。

## 0. 前提：追記案が参照している名称とこのリポジトリの対応関係（重要）

作業の前提として先に報告する。`design-additions-draft.md`が名指ししているファイル名・関数名・シナリオ名の一部は、
**このリポジトリ（`production_system_sim`）には存在しない**。具体的には：

| 追記案が参照する名称 | このリポジトリでの実際の対応 | 根拠 |
|---|---|---|
| `OrderForm.tsx` | 存在しない。受注登録画面は`src/components/SalesOrderPanel.tsx` | `find`/`Glob`でリポジトリ全体を検索し該当なし |
| `logic.ts`の`createOrder()` | 存在しない。受注登録関数は`src/domain/salesOrder.ts`の`createSalesOrder()` | 同上。`src/domain/`に`logic.ts`は無く、20モジュールに分割されている（`CLAUDE.md`のディレクトリ構成節、`src/domain/salesOrder.ts:15`） |
| `domain/autoPlay.ts` | 存在しない | 同上の検索で該当なし。後述§20参照 |
| 「§17の小型コンベア装置」「受注X」「§9-1」 | このリポジトリの題材は木製イス（`docs/v5-spec.md:95-98`）で、「小型コンベア装置」は姉妹リポジトリ`mini-simulator`の題材である旨が`docs/design.md:26`に明記されている。「受注X」「§9-1」に相当する記述は`docs/v5-spec.md`・`docs/design.md`のいずれにも見当たらない | `docs/design.md:26`、`docs/v5-spec.md:95`（`grep`で「小型コンベア」「受注X」「§9-1」を検索。design.mdの1件のみヒット） |
| 追記案§21が前提とする章立て（§2のIPO表、§7＝手動ステップ方式、§8＝Dnの処理、§9-1、§12〜§18） | `docs/design.md`の実際の章立ては`## §1`〜`## §9`のみ（§1 スコープ確定／§2 v5仕様書に対する意図的な差分／§3 追加決定／§4 データモデル対応／§5 画面構成／§6 演習シナリオ／§7 実装アーキテクチャ／§8 ディレクトリ構成／§9 Phase3：CRP）で、§2はIPO表ではなく「意図的な差分」の一覧、§7は「手動ステップ方式」ではなく実装アーキテクチャの説明であり、§9-1・§12〜§18は存在しない | `grep -n "^## §" docs/design.md`の出力（`docs/design.md:1,35,47,58,100,132,157,169,209,246`） |

一方で、追記案§19が触れている`domain/processFlow.ts`（プロセス連携図）はこのリポジトリに実在し、CLAUDE.mdの実装状況とも一致する。
そのため本レポートでは、**存在しない名称については「該当なし」と明記した上で、このリポジトリの実際の同等機能
（`createSalesOrder()`・`SalesOrderPanel.tsx`など）を使って質問の趣旨に答える**方針を取った。項目2の「§9-1の受注XをD2で取消」
というシナリオも、対応する固有名称が無いため、同じ性質を持つこのリポジトリ自身のシナリオ（受注登録→納期回答→MRP実行→
計画オーダ確定→D2で取消）で検証した。

---

## 結論一覧

| # | 項目 | 結論（1行） |
|---|---|---|
| 1 | 受注登録の入力チェック | 数量0・負数は`createSalesOrder()`が例外を投げ登録されない。納期が過去日でも拒否する検証は無い。必須項目未入力はUI上到達しない（プルダウンは常に選択済み） |
| 2 | 取消済み受注の発注済み材料 | 未入荷（`receivedQty===0`）のPOは取消に連動して`CANCELED`になり入荷できなくなる。所要数もMRP再実行で除外される。受領済み（`receivedQty>0`）のPOがあれば取消自体が拒否される |
| 3 | 同納期の受注の順序 | MRP展開（`explode`への需要投入順）は「必要日昇順・同着は受注番号昇順」の比較関数が実装済み。引当（`allocateShipment`）・出荷実績登録（`shipOut`）自体には自動的な順序ロジックが無く、操作者がどの行のボタンを押すかに委ねられる |
| 4 | 発注済み購買品のリードタイム変更 | 入荷予定日（`dueDay`・`confirmDay`）は発注確定時の値としてPOレコードに固定保存され、以後マスタを参照し直すことはない。マスタ側のリードタイム変更に制限は無く、次回のMRP実行から新しい値が使われる |
| 5 | プロセス連携図の流れ | 実装は「計画」を含む7ドメイン・17本のフロー定義を持つ。追記案の6ドメイン・10本の表とはドメイン数・矢印の向き・ラベルの多くが一致しない。「何も動かなかった」旨のメッセージ表示は実装されている（ただし判定単位は「日」ではなく「直前の1操作」） |
| 6 | リセット | マスタの編集内容は保持され、初期値には戻らない。トランザクション（受注・オーダ・在庫・ログ）のみ初期化される。自動テストで確認済み |
| 7 | 自動再生 | 実装されていない。`docs/design.md`のDEV-2で「Phase1では実装しない」と明記されており、`domain/autoPlay.ts`・速度設定UIとも存在しない |
| 8 | Playwright E2Eテスト | `e2e/a11y.spec.ts`の1ファイルのみ。`test()`定義は1件だが2テーマ分ループ実行されるため実行時は2ケース（各ケース内で全タブをループ検査） |
| 9 | ESLint・カバレッジ設定 | いずれも未導入（設定ファイル・依存パッケージとも無し）。`package.json`の`scripts`はdev/build/preview/test/test:a11yの5件 |
| 10 | Vitestテスト件数・CI起動条件 | 25ファイル・184件（`npx vitest run`実行結果）。`.github/workflows/test.yml`は`on: pull_request`のみで起動する |

---

## 1. 受注登録時の入力チェック（UC-01-3）

### 現在の振る舞い

- 受注登録の実処理は`src/domain/salesOrder.ts`の`createSalesOrder()`（`OrderForm.tsx`/`logic.ts`の`createOrder()`はこのリポジトリに存在しない。UI側の実体は`src/components/SalesOrderPanel.tsx`）。
- **数量0・数量が負**：`createSalesOrder()`内で`if (input.qty <= 0) throw new SalesOrderError("数量は1以上で入力してください");`（`src/domain/salesOrder.ts:24`）。0・負数のどちらも同じ条件で弾かれ、登録されない。
- **納期が今日より前**：`createSalesOrder()`に`requestDay`（希望納期）を検証するコードは無い（`src/domain/salesOrder.ts:7-42`を全文確認したが該当チェックは無い）。一時的な検証コードで、`state.day = 10`のときに`requestDay: 0`を渡して`createSalesOrder()`を呼び出したところ、例外を投げずに`soLines`へ`requestDay: 0`のまま登録された（過去日でも拒否されない）。
  - UI（`SalesOrderPanel.tsx:68-73`）の希望納期入力欄には`min={state.day}`が指定されているが、これはHTML標準の`<input type="number">`の制約であり、`handleCreate`（`SalesOrderPanel.tsx:31-35`）は`e.preventDefault()`の後`qty`のみを検査して`requestDay`は検査していない。ブラウザのネイティブ制約検証に依存した見た目上の制限であり、`createSalesOrder()`自体には対応するガードが無い。
- **必須項目が未入力**：得意先・品目の選択欄は`<select>`で、初期値は`state.customers[0]`・`state.items[0]`（`SalesOrderPanel.tsx:13-24`）。マスタに1件以上登録があれば必ずいずれかが選択された状態になり、UI操作だけで空欄にすることはできない。`handleCreate`は`if (!customerId || !itemId || qty <= 0) return;`（`SalesOrderPanel.tsx:33`）で空文字列をガードしているが、これは「マスタに得意先・品目が1件も無い」という状況でのみ成立し、その場合はエラーメッセージを出さず黙って`dispatch`しない（画面上に理由は表示されない）。
  - `createSalesOrder()`自体にも防御的なチェックがあり、存在しない`customerId`・`itemId`を渡すと`SalesOrderError`（「得意先が見つかりません」「品目が見つかりません」）を投げる（`src/domain/salesOrder.ts:18-23`）。
- エラー時の表示：`reducer.ts`の`applyAction()`が`createSalesOrder()`の例外を捕捉し、`[エラー] ${message}`という文言でイベントログに1行追加する（`src/domain/reducer.ts:144-150`）。`EventLogPanel.tsx:21`はメッセージをそのまま表示するため、数量0・負数のケースは「登録されず、理由が表示される」という追記案の想定どおりになる。一方、納期過去日のケースはそもそも例外が発生しないため、この経路には乗らない。

### 根拠

- `src/domain/salesOrder.ts:1-42`（`createSalesOrder()`全文）
- `src/components/SalesOrderPanel.tsx:12-78`（フォーム部分）
- `src/domain/reducer.ts:141-153`（`applyAction()`のエラー処理）
- `src/components/EventLogPanel.tsx:21`
- 一時検証（削除済み）：`state.day=10`で`requestDay:0`の受注登録が例外なく成立することを`npx vitest run`で確認

### 追記案との違い

- 追記案UC-01-3は「数量が0、納期が今日より前などの不正な値を入力して登録する」→「登録されず、理由が表示される」を期待値の案としているが、**納期が今日より前の値は現状拒否されない**。数量0・負数のみ拒否される。
- 追記案が参照する`OrderForm.tsx`・`logic.ts`の`createOrder()`はこのリポジトリに存在しない（§0参照）。

### 確認できなかった点

- ブラウザの`<input type="number" min=...>`のネイティブ制約検証が実際のブラウザ操作でどこまでフォーム送信をブロックするか（ブラウザ実装依存の挙動のため、コードの読み取りだけでは断定できない）。ヘッドレスブラウザ等での実機検証はしていない。

---

## 2. 取消した受注のために発注済みだった材料（UC-02-5）

### 現在の振る舞い

- 受注取消は`src/domain/salesOrder.ts`の`cancelSalesOrder()`が行う。
- ペグ先（`traceFromOrder()`で辿れる紐づくMFG_ORDER/PURCHASE_ORDER）のいずれかに**実績**（着手実績`actualStartDay != null`、または入荷実績`receivedQty > 0`）が1件でもあれば、取消そのものが`SalesOrderError`で拒否される（`src/domain/salesOrder.ts:73-80`）。つまり「材料が既に入荷済み」の場合は取消できない。
- 実績が無い（＝まだ入荷していない）場合は取消が成立し、そのとき**ペグ先の未完了なMFG_ORDER・PURCHASE_ORDERを連鎖的に`CANCELED`にする**（`src/domain/salesOrder.ts:82-87`）。これは発注中のPOの状態（`ORDERED`・`ACKED`のいずれでも、`CLOSED`・`CANCELED`以外なら）を`CANCELED`へ変える。
- `CANCELED`になったPOは、その後`ackPurchaseOrder()`（`ORDERED`以外は拒否、`src/domain/procurement.ts:11-13`）・`receivePurchaseOrder()`（`ACKED`/`PARTIAL`以外は拒否、`src/domain/procurement.ts:25-27`）のどちらも実行できなくなる。すなわち**入荷日を迎えても入荷計上できない**。
- MRP実行（`runMRP()`）は`status !== "CLOSED" && status !== "CANCELED"`の受注明細だけを需要として扱う（`src/domain/mrp.ts:139`）。取消済みの受注はここで除外されるため、以後の発注要否判定（正味所要量計算）から確実に外れる。
- 一時検証コードで、木製イス受注（qty1・希望納期D20）をD0に登録→納期回答→MRP実行→計画オーダ確定まで進め、D2の時点で`cancelSalesOrder()`を呼んだところ：
  - 発注済みのRM-300（板材、`dueDay:17`）のPOが`ORDERED`→`CANCELED`になった
  - 取消後に`runMRP()`を再実行すると、`plannedOrders`は空配列になった（取消済み受注からの新規所要は発生しない）
  - `day`を`dueDay`（17）まで進めて`ackPurchaseOrder()`・`receivePurchaseOrder()`を呼ぶと、いずれも`ProcurementError`（「発注済（ORDERED）以外は納期回答できません」）を投げて失敗し、材料在庫（`state.stocks`）にRM-300のレコードは作られなかった

### 根拠

- `src/domain/salesOrder.ts:63-89`（`cancelSalesOrder()`全文）
- `src/domain/procurement.ts:8-57`（`ackPurchaseOrder()`・`receivePurchaseOrder()`）
- `src/domain/mrp.ts:134-162`（`runMRP()`の需要フィルタ・ソート）
- `docs/design.md:62`（EXT-2：連鎖CANCELEDの追加決定）
- 一時検証（`src/domain/__tmp_verify_cancel.test.ts`、確認後削除）を`npx vitest run`で実行し、上記の状態遷移を確認済み

### 追記案との違い

- 追記案UC-02-5の期待値案は「発注はそのまま残って入荷し、材料在庫に計上される」だが、**実際は発注（PO）自体が`CANCELED`へ連鎖的に変わり、入荷できなくなる**。「発注残がそのまま残って入荷する」という前提は成立しない。
- 「取消した受注の所要数は、以後の発注要否の判定（§5）から除かれる」という部分は実装と一致する。
- 「§9-1の受注X」というシナリオ自体はこのリポジトリに存在しないため（§0参照）、同種の代替シナリオ（木製イスの受注、D0登録・D2取消）で検証した。

### 確認できなかった点

- 発注が**既に仕入先納期回答済み（`ACKED`、`confirmDay`設定済み）だが未入荷**の状態で取消した場合の挙動は、コード上は`ORDERED`と同じ条件分岐（`CLOSED`・`CANCELED`以外なら連鎖`CANCELED`）に入るため同様に`CANCELED`になるはずだが、この状態遷移そのものを一時検証コードで再現して確認してはいない（静的なコード読解のみ）。

---

## 3. 納期が同じ受注どうしの順序（UC-09-4）

### 現在の振る舞い

- **MRP展開（計画段階の資材競合）**：`runMRP()`は受注明細を需要リストに変換したあと、`.sort((a, b) => a.due - b.due || a.soNo.localeCompare(b.soNo))`で並べ替えてから`explode()`へ順に投入する（`src/domain/mrp.ts:138-147`）。`due`（`confirmDay ?? requestDay`）が同じ場合は`soNo`の文字列比較（`SO-001`のようにゼロ埋め連番のため昇順＝登録順と一致）で決まる。複数の確定済みMFG_ORDERが同じ下位品目を取り合う場合も同じ規則（`dueDay`昇順・同着は`moNo`昇順）でソートしている（`src/domain/mrp.ts:112-117`）。
- **引当（`allocateShipment()`）**：`src/domain/shipment.ts:18-47`を全文確認したが、複数の受注明細を比較・ソートする処理は無い。この関数は`soNo`・`lineNo`を1件指定して呼び出す個別操作であり（design.mdが定めるとおり引当は個別のユーザー操作）、どの受注を先に引き当てるかはUI上で操作者がどの行のボタンを押すか次第になる。
- **出荷実績登録（`shipOut()`）**も同様に`shipNo`を1件指定する個別操作で、自動的な順序ロジックは無い（`src/domain/shipment.ts:50-85`）。
- 画面側（`src/components/ShipmentPanel.tsx:15-17`）も`state.soLines.filter(...)`のみでソートは行っておらず、一覧は登録順（配列の格納順）のまま表示される。

### 根拠

- `src/domain/mrp.ts:112-117,138-147`（比較関数の実装）
- `src/domain/shipment.ts:1-99`（全文。`.sort`が無いことを確認）
- `src/components/ShipmentPanel.tsx:15-17`
- `docs/design.md:62`（EXT-1のテキスト：「需要（due＝confirm_day）の昇順にソートしてから explode() を呼ぶ。同着の場合は受注登録順（so_no昇順）とする」）
- `grep -rn "\.sort\("`によるリポジトリ全体の検索結果（`src/domain/salesOrder.ts`・`src/domain/shipment.ts`に`.sort`が無いことを確認）

### 追記案との違い

- 追記案UC-09-4は「引当」を試行する場面の順序を問うているが、このリポジトリでは**引当自体に自動比較・ソートの仕組みが無い**（MRP展開にはある）。「引当と出荷のそれぞれで」何の順になるかという問い方に対しては、引当・出荷は「順序」という概念を実装として持たず、操作者の操作順に依存する、というのが実態に近い回答になる。

### 確認できなかった点

- 実際のUI操作で、同一納期の複数受注が表示される際の**行の並び順**（`state.soLines`配列内の順序が登録順から変化する操作が無いか）を全画面・全操作について網羅的に確認したわけではない（`ShipmentPanel.tsx`・`SalesOrderPanel.tsx`は未ソートであることを確認したのみ）。

---

## 4. 発注済みの購買品のリードタイムを変えたとき（UC-10-4）

### 現在の振る舞い

- 計画オーダ生成時（`explode()`、`src/domain/mrp.ts:33-88`）に、`item.leadTimeDays`（その時点のマスタ値）を使って`startDay = dueDay - item.leadTimeDays`（`mrp.ts:67`）を計算し、`PlannedOrder.dueDay`として保存する。
- 計画オーダ確定（`firmAllPlannedOrders()`）時、購買品は`PurchaseOrder`レコードに`dueDay: plo.dueDay`（`src/domain/mrp.ts:234`）という**数値**をそのままコピーする。以後、この`po.dueDay`はマスタの`leadTimeDays`への参照ではなく、確定時点で決まった固定値として保持される。
- 仕入先納期回答（`ackPurchaseOrder()`）で`po.confirmDay`を設定でき（`src/domain/procurement.ts:8-16`）、これも一度設定されると固定値。
- 入荷計上（`receivePurchaseOrder()`）の日付ガードは`const promisedDay = po.confirmDay ?? po.dueDay;`（`src/domain/procurement.ts:28`）であり、`state.items`から`leadTimeDays`を再取得する処理は無い。
- マスタの品目編集（`updateItem()`、`src/domain/masterData.ts:109-113`）は`leadTimeDays`の変更を非負整数であること以外に制限なく受け付ける。未完了の購買オーダが存在するかどうかによる制限は無い（EXT-20の「禁止」対象一覧＝BOM循環／工順ゼロ内製品目の計画オーダ確定／未完了オーダがある品目の工順の**構造**変更／参照中マスタの削除／前提を満たさない区分変更、のいずれにも`leadTimeDays`は含まれない）。
- 変更後の`leadTimeDays`は、次に`runMRP()`が呼ばれたとき（`ctx.items = state.items`を参照する`explode()`が新しい値を読む）から新しい計画オーダに反映される。既に確定済みのPOの`dueDay`・`confirmDay`は変更されない。

### 根拠

- `src/domain/mrp.ts:33-88`（`explode()`、`startDay`の計算）
- `src/domain/mrp.ts:222-239`（`firmAllPlannedOrders()`の購買オーダ生成部分、`dueDay: plo.dueDay`）
- `src/domain/procurement.ts:8-31`（`ackPurchaseOrder()`・`receivePurchaseOrder()`の日付判定）
- `src/domain/masterData.ts:109-113`（`leadTimeDays`のpatch処理。ガードは非負整数チェックのみ）
- `docs/design.md`のEXT-20一覧（CLAUDE.mdに引用されている「禁止／警告」の線引き。`leadTimeDays`単体の変更は含まれない）

### 追記案との違い

- 追記案UC-10-4の期待値案「発注済みの分の入荷日は変わらず、変更後の値は次の発注から使われる」は、確認した実装の挙動と一致する。

### 確認できなかった点

- 「発注済みの分の入荷日は変わらない」ことを一時検証コードで直接再現してはいない（`po.dueDay`・`po.confirmDay`がプリミティブな数値としてコピーされ、以後`state.items`を参照し直すコードパスが存在しないことをコード読解で確認したのみ）。

---

## 5. プロセス連携図の流れ（UC-13、追記案§19）

### 現在の振る舞い

`src/domain/processFlow.ts`が定義する`FLOWS`（`processFlow.ts:34-52`）を表にすると次のとおり。

| id | 送り元 | 送り先 | ラベル | 備考 |
|---|---|---|---|---|
| salesOrder-planning | 受注 | 計画 | 独立需要 | |
| inventory-planning | 在庫 | 計画 | 現在庫 | |
| planning-procurement | 計画 | 発注 | 購買計画オーダ | |
| planning-production | 計画 | 工程 | 製造計画オーダ | |
| procurement-planning | 発注 | 計画 | 注文残＝入庫予定 | |
| production-planning | 工程 | 計画 | 仕掛＝製造予定 | |
| procurement-inventory | 発注 | 在庫 | 入庫実績 | |
| production-inventory | 工程 | 在庫 | 部品出庫・完成入庫 | |
| salesOrder-shipment | 受注 | 出荷 | 出荷指示 | |
| inventory-shipment | 在庫 | 出荷 | 引当・出荷出庫 | |
| shipment-salesOrder | 出荷 | 受注 | 出荷実績 | |
| master-salesOrder 等6本 | マスタ | 受注・計画・発注・工程・在庫・出荷（各1本） | 前提 | 常時表示の点線（`static: true`） |

ドメインは`DomainId`型に定義された7つ：受注・**計画**・発注・工程・在庫・出荷・マスタ（`processFlow.ts:11-21`）。

「何も起きなかった操作の表示」：`ProcessFlowDiagram.tsx`は`computeActiveFlows()`が返す`lastMessage`と、その操作が動かした`flowIds`から作る`activeFlowDefs`を見て、
- まだ一度も操作していない（`lastMessage === null`）→「まだ操作していません。」
- 直前の操作はあったが、ドメイン間フローに該当しなかった（`activeFlowDefs.length === 0`）→「「（直前の操作メッセージ）」では、ドメイン間で動いたモノ・データはありませんでした。」

という2種類のメッセージを出し分けている（`src/components/ProcessFlowDiagram.tsx:240-246`）。

ただし判定の単位は**「日」ではなく「直前の1操作（EventLogEntry）」**である。`ADVANCE_DAY`（「次の日へ進む」）はイベントログに何も追加しない（`src/domain/reducer.ts:233-238`）。このアプリでは入荷計上・工程着手/完了・引当・出荷実績・MRP実行・オーダ確定はすべて個別のユーザー操作であり、「次の日へ進む」は日付を+1するだけで業務処理を一切行わない（`CLAUDE.md`にも明記）。そのためプロセス連携図の「直前に動いた流れ」は「直前の1操作」を指しており、「1日の間に何も操作しなかった」場合と「次の日へ進むを押した直後」は区別されず、単に一つ前の操作の結果が表示され続ける。

### 根拠

- `src/domain/processFlow.ts:1-131`（全文）
- `src/components/ProcessFlowDiagram.tsx:132,240-246`
- `src/domain/reducer.ts:233-238`（`ADVANCE_DAY`がイベントログを追加しないこと）

### 追記案との違い

- 追記案は「ドメイン：受注・マスタ・調達・在庫・生産・出荷の6つ」としているが、実装は**「計画」を加えた7ドメイン**を持つ。
- 追記案の「受注→生産：引当の対象となる受注（納期順）」「生産→調達：不足数量（発注要求）」「在庫→生産：材料在庫、下位品目の完成品在庫」「生産→受注：受注ステータスの更新（引当中）」「出荷→在庫：出庫実績」は、いずれも実装の`FLOWS`に**直接対応する行が無い**。実装では受注・在庫・発注・工程はいずれも直接つながらず、必ず「計画」を経由する（例：受注の需要は`salesOrder→planning`、在庫は`inventory→planning`で計画に集約され、`planning→procurement`／`planning→production`として払い出される）。また`production→salesOrder`（受注ステータス更新）・`shipment→inventory`（出庫実績）という向きの矢印はFLOWSに存在しない。
- マスタからの「前提」フローは、追記案が「生産・調達」の2ドメイン宛としているのに対し、実装は**受注を含む6ドメイン全て**（マスタ以外の全ドメイン）宛に張られている。
- 「調達→在庫：入荷実績」「生産→在庫：消費・仕掛・完成の実績」「在庫→出荷：完成品在庫」「出荷→受注：受注ステータスの更新（出荷済）」は概念としては対応する実装行がある（`procurement-inventory`／`production-inventory`／`inventory-shipment`／`shipment-salesOrder`）が、ラベル文言は完全一致ではない（例：「入荷実績」に対し実装は「入庫実績」）。
- 「何も起きなかった日の表示」は実装済みだが、単位が「日」ではなく「直前の1操作」である点が追記案の想定（「次の日へ進む」に紐づく日次の概念）と異なる。

### 確認できなかった点

- `docs/v5-spec.md §2.1`のmermaid図（`processFlow.ts`のコメントが根拠として挙げている）と`FLOWS`定義とが完全に対応しているかどうかは、mermaid図側を本レポートでは図として厳密突合していない（テキストの`grep`による部分確認に留めた）。

---

## 6. リセット（UC-14-1）

### 現在の振る舞い

`RESET`アクションは、`state.items`・`state.bom`・`state.routingSteps`・`state.customers`・`state.suppliers`・`state.workCenters`（＝マスタ一式、編集済みの値を含む）を`structuredClone`でそのまま引き継ぎ、それ以外（受注・オーダ・在庫・出荷・イベントログ・ダッシュボード履歴等のトランザクション）だけを初期状態に戻す（`emptyStateWithMasters()`を呼ぶ）。コード中のコメントに「v5-spec.md UC-23：全トランザクションを初期化する。マスタ（編集済みの値を含む）は保持する」と明記されている。

自動テスト`src/domain/reducer.test.ts:158-180`が、`MASTER_UPDATE_ITEM`でRM-300の`leadTimeDays`を3に変更→受注登録→`ADVANCE_DAY`→`RESET`という操作列のあと、`next.items.find(...).leadTimeDays`が**3のまま**（初期値の5には戻らない）であることを検証しており、`npx vitest run`で実際にパスすることを確認した。

### 根拠

- `src/domain/reducer.ts:222-231`（`RESET`ケース本体とコメント）
- `src/domain/reducer.test.ts:158-180`（RESETがマスタ編集を保持することの自動テスト）
- 上記テストを含む`npx vitest run`の全体実行結果：184件全てpassed

### 追記案との違い

- 追記案UC-14-1は「マスタの編集内容も初期値に戻すか」を未確定の【要確認】としているが、実装は明確に**「戻さない（保持する）」**という決定済みの仕様になっている。

### 確認できなかった点

- 特になし（コード・コメント・自動テストの三点が一致しており、確認済みと判断した）。

---

## 7. 自動再生（UC-14、追記案§20）

### 現在の振る舞い

自動再生機能はこのリポジトリに**実装されていない**。

- `domain/autoPlay.ts`というファイルは存在しない（リポジトリ全体を検索して該当なし）。
- 時計操作コンポーネント`src/components/ClockControls.tsx`は「次の日へ進む」ボタンと「リセット」ボタンの2つのみを持ち、速度設定・自動再生の開始/停止に相当するUI要素は無い（`ClockControls.tsx`全文4〜28行を確認）。ファイル冒頭のコメントに「自動再生は無し、design.md DEV-2」と明記されている。
- `docs/design.md`のDEV-2は「自動再生機能は実装しない｜`mini-simulator`にある『次の日へ進む』を一定間隔で自動連打する機能は、Phase1では実装しない」と明記しており（`docs/design.md:52`）、CLAUDE.mdの実装状況記述にもこの決定が反映されている。
- 代わりに、design.mdのDEV-2に基づく「軽量な代替案」として`src/domain/todayActions.ts`（本日実行可能な操作の集計）と`src/components/TodayActionsBar.tsx`が実装されている（各ファイル冒頭のコメントに「design.md DEV-2：自動再生の軽量代替案」と明記）。これは自動で日を進める機能ではなく、現在の状態で実行可能な操作を一覧・ハイライトしてクリックで該当タブへ遷移させるだけの機能である。

自動再生自体が存在しないため、以下の3点は「不明」ではなく「機能が無いため該当する状態・条件が存在しない」。

- 速度の段階の具体的な値：該当するUIや定義（`domain/autoPlay.ts`）が無いため、対応する値は存在しない。
- 自動で止まる条件（全受注が出荷済／取消済になったときなど）：自動再生ループ自体が無いため、該当する停止条件は存在しない。
- 自動再生中の受注登録・取消・マスタ編集の可否：自動再生中という状態が発生しないため、該当する挙動は存在しない。「次の日へ進む」は単発の操作であり、実行中に他の操作をブロックする仕組みも見当たらない（`ClockControls.tsx`のボタンは`onClick`で同期的に`dispatch`を呼ぶだけで、非同期の実行中状態を持たない）。

### 根拠

- `src/components/ClockControls.tsx:1-31`（全文）
- `docs/design.md:52`（DEV-2）
- `src/domain/todayActions.ts:1`、`src/components/TodayActionsBar.tsx:1`（冒頭コメント）
- リポジトリ全体を`autoPlay`／`setInterval`／`自動再生`で検索した結果（該当は上記のコメント参照のみで、実装コードは無い）

### 追記案との違い

- 追記案§20は自動再生（速度0.3秒〜1.2秒の各段階で`ADVANCE_DAY`を繰り返す）が「実装済み」であることを前提に、確定していない詳細（速度の値・停止条件・操作可否）だけを【要確認】としているが、実際には**自動再生機能自体がこのリポジトリには実装されておらず、design.md（DEV-2）で明示的に「実装しない」と決定されている**。前提が現状の実装と異なる。

### 確認できなかった点

- 特になし。「実装されていないこと」自体は複数の一次資料（コード不在・コメント・design.mdの決定事項）が一致しており、確認済みと判断した。

---

## 8. Playwright E2Eテスト

### 現在の振る舞い

- E2Eテストファイルは`e2e/a11y.spec.ts`の1ファイルのみ（`e2e/tsconfig.json`は型チェック専用の設定でテスト本体ではない）。
- `test.describe()`は`THEMES`（`material-light`・`deep-gray`の2件、`e2e/a11y.spec.ts:11-14`）をループして生成されるため、`test()`の定義自体は1件（`e2e/a11y.spec.ts:40`）だが、**実行時には2テストケース**になる（テーマごとに1件）。
- 各テストケース内では、画面のタブボタン（`nav.app__tabs button.app__tab:not([aria-pressed])`）をDOMから動的に数えて全件ループし、各タブでaxe-coreによる検査を行う（`e2e/a11y.spec.ts:43-73`）。タブ件数はCLAUDE.mdの記載では15。
- `playwright.config.ts`の`testDir`は`./e2e`のみで、他のディレクトリにPlaywrightテストは無い（リポジトリ全体を`*.spec.ts`で検索し`e2e/a11y.spec.ts`のみ該当）。

### 根拠

- `e2e/a11y.spec.ts:1-84`（全文）
- `playwright.config.ts:8`（`testDir: "./e2e"`）
- `find . -iname "*.spec.ts"`の検索結果（該当1件）

### 追記案との違い

- 該当なし（追記案はE2Eテストの有無・件数に直接言及していない）。

### 確認できなかった点

- 特になし。

---

## 9. ESLintの設定、カバレッジ計測の設定、package.jsonのscripts

### 現在の振る舞い

- **ESLint**：設定ファイル（`.eslintrc*`・`eslint.config.*`）はリポジトリ内に存在しない。`package.json`の`dependencies`・`devDependencies`にも`eslint`は含まれない。
- **カバレッジ計測**：`vite.config.ts`の`test`ブロックに`coverage`設定は無い（`exclude`のみ）。`package.json`に`test:coverage`等のscriptも無い。`@vitest/coverage-v8`・`@vitest/coverage-istanbul`はvitest本体の**任意（optional）peerDependency**として`package-lock.json`に記載が現れるだけで、`node_modules/@vitest/`配下には実体がインストールされていない（`npm install`後に確認）。
- **package.jsonのscripts一覧**（`package.json:6-12`）：
  - `dev`: `vite`
  - `build`: `tsc && vite build`
  - `preview`: `vite preview`
  - `test`: `vitest run`
  - `test:a11y`: `playwright test`

### 根拠

- リポジトリ全体を`*eslint*`で検索（該当ファイル無し）
- `package.json`全文（`eslint`の記載無し）
- `vite.config.ts:1-17`（`coverage`設定無し）
- `package-lock.json`中の`@vitest/coverage-v8`・`@vitest/coverage-istanbul`の記載箇所（vitestの`optional: true`なpeerDependency定義としてのみ出現）
- `ls node_modules/@vitest/`の実行結果（`coverage-v8`・`coverage-istanbul`ディレクトリが無いことを確認）

### 追記案との違い

- 該当なし（追記案はESLint・カバレッジに直接言及していない。CLAUDE.mdのコマンド一覧にも`npx tsc --noEmit`はあるがESLint・カバレッジのコマンドは無く、実装と整合している）。

### 確認できなかった点

- 特になし。

---

## 10. Vitestのテスト件数、.github/workflows/test.ymlの起動条件

### 現在の振る舞い

`npx vitest run`（読み取り専用の実行。ソース・テストは変更していない）の実行結果は**25ファイル・184件、全件passed**。ファイルごとの内訳（テスト件数の多い順）：

| ファイル | 件数 |
|---|---|
| src/domain/masterIO.test.ts | 24 |
| src/domain/masterData.test.ts | 22 |
| src/domain/masterIntegrity.test.ts | 16 |
| src/domain/production.test.ts | 11 |
| src/domain/cost.test.ts | 10 |
| src/domain/processFlow.test.ts | 9 |
| src/domain/reducer.test.ts | 9 |
| src/data/masterData.test.ts | 8 |
| src/domain/gantt.test.ts | 8 |
| src/domain/todayActions.test.ts | 8 |
| src/domain/lot.test.ts | 7 |
| src/domain/capacity.test.ts | 6 |
| src/domain/mrp.test.ts | 5 |
| src/domain/multiLevelBom.test.ts | 5 |
| src/domain/procurement.test.ts | 5 |
| src/domain/bicyclePreset.test.ts | 4 |
| src/domain/salesOrder.test.ts | 4 |
| src/domain/schedule.test.ts | 4 |
| src/domain/shipment.test.ts | 4 |
| src/domain/dashboard.test.ts | 3 |
| src/domain/kpi.test.ts | 3 |
| src/domain/pegging.test.ts | 3 |
| src/domain/exerciseGuide.test.ts | 2 |
| src/domain/inventory.test.ts | 2 |
| src/domain/multiOrderExercise.test.ts | 2 |
| **合計** | **184** |

`.github/workflows/test.yml`の起動条件（`on:`）は次の1行のみ：

```yaml
on:
  pull_request:
```

`push`・`schedule`・`workflow_dispatch`等の指定は無い。同ファイルには`test`ジョブ（型チェック・ビルド・vitest）と`a11y`ジョブ（Playwright）の2ジョブがあり、いずれも同じ`on: pull_request`の下で動く。

### 根拠

- `npx vitest run --reporter=json`の実行結果（一時的に生成したJSON出力を集計。ファイル自体はコミットしていない）
- `.github/workflows/test.yml:1-3`（`on:`ブロック）

### 追記案との違い

- 該当なし（追記案はテスト件数・CI起動条件に直接言及していない）。

### 確認できなかった点

- 特になし。

---

## 補足（仕様としてどうあるべきかの意見。事実の報告とは分離）

- 項目1・2・7は、追記案が前提としている挙動（納期の過去日チェック、発注残の温存、自動再生の存在）と実装が食い違っている。追記案をdesign.mdへ反映する前に、この3点は「実装に追記案を合わせる」か「実装を追記案の想定に合わせて変更する」かの方針決定が必要と考えられる。
- 項目5は差分が大きく（ドメイン数・矢印の向き・ラベルのいずれも一致しない）、追記案の表をそのまま設計書に載せると実装と乖離した記述になる。`processFlow.ts`の`FLOWS`定義をそのまま転記するか、`FLOWS`側を追記案の意図に合わせて見直すかの判断が必要と考えられる。
- 項目0で述べたとおり、`design-additions-draft.md`は`OrderForm.tsx`・`logic.ts`・`autoPlay.ts`・「小型コンベア装置」「受注X」といった、姉妹リポジトリ`mini-simulator`側の用語・シナリオを多く含んでいるように見える。design.mdへの追記作業に入る前に、このドラフト自体がどちらのリポジトリ向けに書かれたものかを確認した方がよいと考えられる。
