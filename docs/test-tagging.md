# テストへの要件ID・工程タグ付与

`src/domain/*.test.ts`のうち、`docs/v5-spec.md` §9.3のTC-01〜18・§9.5のTC-E1〜3・`docs/design.md` §6のTC-M1に
対応するテストのdescribe/itタイトルへ付与する、要件ID（UC-xx）・工程・テストの種類・観点のタグの書式を定める
（Issue #84）。自動テスト管理アプリ（PoC）等の外部ツールが、テストのタイトル文字列からUC・工程・テストの種類・
観点を機械的に読み取り、網羅状況を集計できるようにすることが目的。

対象13ファイルへの実際のタグ付与（リネーム）はIssue A2（Issue #84の後続Issue）で行う。本書は書式・判定基準・
対象ファイル一覧の確定のみを扱う。

## 書式

```
[UC-xx][工程][テストの種類][観点] 説明文
```

- UC番号が無いテストは`[工程][テストの種類][観点]`の3つでよい
- 観点が付けにくいテストは`[UC-xx][工程][テストの種類]`のように4つ目（観点）を省略してよい
- TC番号（TC-04等）はタグ化せず、説明文の中にそのまま残す

## 各タグの判定基準

### UCタグ

`docs/v5-spec.md` §8.2のUC-01〜23に対応させる。**そのit()内で`expect()`により直接検証されている操作を基準に
決定する**（v5-spec.mdの「操作」列の文言そのものを基準にはしない）。前提条件を整えるためだけの呼び出し
（例：`releaseMfgOrder`を`startStep`の前提として呼ぶだけで結果を検証しない場合）は対象に含めない。

1つのit()が複数のTC／UCの検証を1回でまとめている場合は、該当する全UCを`/`区切りで列挙する
（例：`[UC-06/UC-07]`）。

対応するUC番号が明確でないテスト（`masterData.test.ts`・`masterIntegrity.test.ts`・`cost.test.ts`・
`lot.test.ts`・`capacity.test.ts`・`dashboard.test.ts`など、v5-spec.mdのUC一覧より後にdesign.mdで追加された
機能）は、UC番号を無理に当てはめず`[工程][テストの種類][観点]`のみとする。

### 工程タグ（単体／結合／総合）

1テストにつき区分は必ず1つとし、複数区分の同時付与はしない。

| 区分 | 判定基準 |
|---|---|
| 単体 | `domain/*.ts`のエクスポート関数を直接呼び出すだけで、`reducer.ts`（`simulationReducer`/`dispatch`）を経由しない |
| 結合 | `reducer.ts`は経由しないが、2つ以上のドメインモジュール（例：`salesOrder.ts`＋`mrp.ts`＋`schedule.ts`）の呼び出し結果を1テストの中でまたいで検証している |
| 総合 | `simulationReducer`/`dispatch`を経由し、UI操作と同じaction単位の連鎖として受注〜出荷（またはそれに準ずる範囲）を通す |

「呼び出し結果を…検証している」とは、その関数呼び出しの戻り値や、それによる状態変化が`expect()`の対象に
なっていることを指す。前提条件を整えるためだけの呼び出し（戻り値を検証しない、後続の操作の材料にするだけの
呼び出し）は数えない。例えば`mrp.test.ts`のTC-04は`createSalesOrder`/`confirmDelivery`（salesOrder.ts）を
前提条件として呼ぶが、`expect()`が検証するのは`runMRP`（mrp.ts）の結果だけなので`[単体]`となる。一方
`multiOrderExercise.test.ts`のTC-M1は`runMRP`（mrp.ts）の結果を`resolveRootPegKey`（pegging.ts）で解決した
値そのものをアサーションの主語にしており、2モジュールの結果を1つの検証にまたがせているため`[結合]`となる。

例：`multiLevelBom.test.ts`は`simulationReducer`経由でマスタ登録〜受注〜MRP〜工程〜出荷〜原価〜ペギングまで
通しているため`[総合]`のみとする（`[結合][総合]`のような同時付与はしない）。

### テストの種類タグ

次の16種類から選ぶ：機能テスト／性能テスト／ユーザビリティテスト／セキュリティテスト／リグレッションテスト／
構成テスト／シナリオテスト／ロングランテスト／負荷テスト／ストレステスト／静的解析／レビュー／画面部品テスト／
E2Eテスト／スモークテスト／確認テスト。

このリポジトリの`domain/*.test.ts`は業務ロジックの検証がほとんどのため、対象13ファイルは実質的にすべて
**機能テスト**になる見込みである。異なる種類に該当するテストがあれば個別に判断する。

### 観点タグ

正常／異常／境界の3種類。読み取り専用の確認や通し演習など、観点で分けにくいテストは省略してよい。

## 書式の具体例

1. `src/domain/mrp.test.ts:11`
   ```
   it("TC-04: 受注 FG-100 x10 / 回答納期 D+15 を展開すると5件の計画オーダが期待どおりの値で生成される", ...)
   ```
   ↓
   ```
   it("[UC-06][単体][機能テスト][正常] TC-04: 受注 FG-100 x10 / 回答納期 D+15 を展開すると5件の計画オーダが期待どおりの値で生成される", ...)
   ```

2. `src/domain/schedule.test.ts:21`（複数UCの列挙。`checkSchedule()`1関数の戻り値のみを検証しているため工程は`[単体]`）
   ```
   it("TC-E1〜E2: 木板の納期回答が遅れると、親（座面ASSY）の着手日に対する遅延警告が出て受注まで辿れる", ...)
   ```
   ↓
   ```
   it("[UC-08/UC-21][単体][機能テスト][異常] TC-E1〜E2: 木板の納期回答が遅れると、親（座面ASSY）の着手日に対する遅延警告が出て受注まで辿れる", ...)
   ```

3. `src/domain/procurement.test.ts:18` と `src/domain/schedule.test.ts:10`（同一TC番号でもUCタグが異なる例。
   後述「TC-07・TC-E1〜E3の重複採番」参照）
   ```
   // procurement.test.ts:18
   it("TC-07: 納期回答を登録するとACKEDになる", ...)
   → it("[UC-10][単体][機能テスト][正常] TC-07: 納期回答を登録するとACKEDになる", ...)

   // schedule.test.ts:10
   it("TC-07: 希望どおりの納期回答なら警告は出ない", ...)
   → it("[UC-08][単体][機能テスト][正常] TC-07: 希望どおりの納期回答なら警告は出ない", ...)
   ```

4. UC番号が明確でない例（`multiLevelBom.test.ts`。通し演習で観点が分けにくいため4つ目の印を省略）
   ```
   describe("4階層BOMをマスタ操作だけで組み立てて通す", ...)
   ```
   ↓
   ```
   describe("[総合][機能テスト] 4階層BOMをマスタ操作だけで組み立てて通す", ...)
   ```

## TC-07・TC-E1〜E3の重複採番

同じTC番号が複数ファイルに現れる箇所があるが、各テストが実際に`expect()`で検証している内容が異なるため、
下記「対象ファイル一覧」のTC→UC対応をそのまま両方に当てはめず、ファイル・行ごとに個別判定する。

| ファイル:行 | TC番号 | 検証内容 | UCタグ | 工程 |
|---|---|---|---|---|
| `schedule.test.ts:10` | TC-07 | `checkSchedule()`が警告0件であることのみを検証 | `[UC-08]` | 単体 |
| `procurement.test.ts:18` | TC-07 | `ackPurchaseOrder()`の結果がACKEDになることを検証 | `[UC-10]` | 単体 |
| `schedule.test.ts:21` | TC-E1〜E2 | `checkSchedule()`の警告1件と、`affectedSoLine`で受注まで辿れることを検証（TC-E2「警告からペギングを辿る」に相当）。検証しているのは`checkSchedule()`1関数の戻り値のみ | `[UC-08/UC-21]` | 単体 |
| `production.test.ts:116` | TC-E1〜E3 | `checkSchedule()`の警告1件（schedule.ts）に加え、部品未入荷のまま着手→完了を試み`MFG_ORDER`がHOLDになること（production.ts）を検証。2モジュールの結果を検証するため結合 | `[UC-08/UC-13/UC-14]` | 結合 |

いずれも`ackPurchaseOrder`の呼び出し自体は前提条件としてのみ使われ別途アサーションが無いため、UC-10は
`procurement.test.ts:18`にのみ付与する。

## 対象ファイル一覧とTC→UC対応

テストの種類はいずれも機能テスト（前述のとおり対象13ファイルは実質的に全て機能テストになる見込みのため、
以下の表では省略し工程・観点のみ示す）。

| TC番号 | v5-spec.md上の内容 | ファイル:行 | UCタグ | 工程 | 観点 |
|---|---|---|---|---|---|
| TC-01 | マスタ初期化 | `src/domain/exerciseGuide.test.ts:19` | （UC無し） | 単体 | 正常 |
| TC-02〜03 | 受注登録／納期回答 | `src/domain/salesOrder.test.ts:9` | `[UC-04/UC-05]` | 単体 | 正常 |
| TC-04 | MRP実行 | `src/domain/mrp.test.ts:11` | `[UC-06]` | 単体 | 正常 |
| TC-05〜06 | 計画オーダ確定／MRP再実行 | `src/domain/mrp.test.ts:68` | `[UC-06/UC-07]` | 単体 | 正常 |
| TC-07 | PO納期回答 | `src/domain/procurement.test.ts:18` | `[UC-10]` | 単体 | 正常 |
| TC-07 | （日程整合の副次検証） | `src/domain/schedule.test.ts:10` | `[UC-08]` | 単体 | 正常 |
| TC-08 | 入荷計上（RM-300） | `src/domain/procurement.test.ts:35` | `[UC-11]` | 単体 | 正常 |
| TC-09 | SA-200着手→完了 | `src/domain/production.test.ts:27` | `[UC-13/UC-14]` | 単体 | 正常 |
| TC-10 | PT-400・PT-500入荷 | `src/domain/procurement.test.ts:57` | `[UC-11]` | 単体 | 正常 |
| TC-11〜12 | FG-100着手→完了（工程10・20） | `src/domain/production.test.ts:63` | `[UC-13/UC-14]` | 単体 | 正常 |
| TC-13 | 未充足需要チェック | `src/domain/schedule.test.ts:38` | `[UC-09]` | 単体 | 異常 |
| TC-14 | MRP再実行（不良後） | `src/domain/mrp.test.ts:107` | `[UC-06]` | 単体 | 異常 |
| TC-15〜16 | 出荷指示／出荷実績登録 | `src/domain/shipment.test.ts:15` | `[UC-18/UC-19]` | 単体 | 境界 |
| TC-17 | KPI確認 | `src/domain/kpi.test.ts:14` | `[UC-20]` | 単体 | 正常 |
| TC-18 | ペギング追跡 | `src/domain/pegging.test.ts:9` | `[UC-21]` | 単体 | 正常 |
| TC-E1〜E2 | RM-300納期遅延→警告／ペギングで受注を特定 | `src/domain/schedule.test.ts:21` | `[UC-08/UC-21]` | 単体 | 異常 |
| TC-E1〜E3 | 警告のまま着手→HOLD | `src/domain/production.test.ts:116` | `[UC-08/UC-13/UC-14]` | 結合 | 異常 |
| TC-M1 | 複数受注の資源競合演習（design.md §6） | `src/domain/multiOrderExercise.test.ts:20` | （UC無し） | 結合 | 境界 |

観点の判断メモ：
- TC-13・TC-14は、未充足需要・不良発生という業務上の「不足」を扱うため異常とした
- TC-15〜16は、受注残(10)に対し出荷可能量(9)が1個足りない一部出荷（部分出荷）の分岐を検証しているため境界とした
- TC-M1は、手元在庫（木板1枚）が一方の受注の所要をちょうど満たし他方には満たない、という資源の過不足の境目を検証しているため境界とした

## 対象範囲外

- 本書の書式・判定基準に沿った実際のリネーム（Issue A2で実施）
- TC-01〜18・TC-E1〜3・TC-M1以外の細かい単体テスト（マスタCRUD個別ケースなど）への網羅的なタグ付与
- 決定した書式をCIやテストレポートで自動集計・可視化する仕組みの実装
