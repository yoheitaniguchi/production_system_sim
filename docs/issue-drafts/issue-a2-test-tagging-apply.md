<!--
このファイルは、Issue A（テストへの要件ID・工程タグ付与の書式策定）で確定した書式を、対象13ファイルの
describe/itタイトルへ実際に適用するための後続Issue下書きである。Issue Aの本文「対象範囲外」で
本Issueへの分離を明記済み。Issue A（docs/test-tagging.mdの新設）がマージされた後に着手する。
-->

# [要望] テストへの要件ID・工程タグの実付与（TC-01〜18・TC-E1〜3・TC-M1対象、13ファイル）

## 概要

Issue A（`docs/test-tagging.md`）で確定した`[UC-xx][工程][テストの種類][観点]`形式のタグを、対象13ファイルのTC-01〜18・TC-E1〜3・TC-M1に対応するdescribe/itタイトルへ実際に付与する。

## 背景・目的

Issue Aで書式・判定基準・対象ファイル一覧を確定した。本Issueはその適用（実際のリネーム）を行う。書式策定と実適用を分けたのは、初回レビューで判明したとおり判定基準を先に固めないと同種の判定揺れが量産されるためであり（Issue A本文「背景・目的」参照）、本Issueは`docs/test-tagging.md`が定める基準に沿って機械的に置換する作業に限定する。

完了すると、外部の自動テスト管理アプリがテストのタイトル文字列からUC・工程・テストの種類・観点を機械的に読み取れるようになり、UC単位・工程単位でのテスト網羅状況の自動集計が可能になる。

## 要件

1. `docs/test-tagging.md`が定める書式・判定基準に従い、次の13ファイルのdescribe/itタイトルへタグを付与する（Issue Aで確定した個別のUC/工程/テストの種類/観点の割り当ては`docs/test-tagging.md`を参照。TC-07・TC-E1〜E3のように同一TC番号でもファイルごとに異なるタグになる箇所があるため、ファイルを機械的に一括置換せず1箇所ずつ`docs/test-tagging.md`の対応表と突き合わせる）：
   - `src/domain/exerciseGuide.test.ts`（TC-01）
   - `src/domain/salesOrder.test.ts`（TC-02〜03）
   - `src/domain/mrp.test.ts`（TC-04、TC-05〜06、TC-14）
   - `src/domain/schedule.test.ts`（TC-07、TC-E1〜E2、TC-13）
   - `src/domain/procurement.test.ts`（TC-07、TC-08、TC-10）
   - `src/domain/production.test.ts`（TC-09、TC-11〜12、TC-E1〜E3）
   - `src/domain/shipment.test.ts`（TC-15〜16）
   - `src/domain/kpi.test.ts`（TC-17）
   - `src/domain/pegging.test.ts`（TC-18）
   - `src/domain/multiOrderExercise.test.ts`（TC-M1）
2. TC番号自体はタグ化せず、リネーム後もdescribe/itの説明文にそのまま残す（例：`it("[UC-06][単体][機能テスト][正常] TC-04: 受注 FG-100 x10 ...")`）
3. リネームはdescribe/itのタイトル文字列のみを対象とし、テスト本体（アサーション・呼び出し）は変更しない
4. リネーム後、`npm test`が全件passすることを確認する（タイトル文字列の変更のみであれば、既存のアサーションに影響しないはず）

## 対象範囲外

- TC-01〜18・TC-E1〜3・TC-M1以外の細かい単体テスト（マスタCRUD個別ケースなど）へのタグ付与
- `docs/test-tagging.md`が定める書式・判定基準自体の見直し（Issue Aのスコープ。基準に疑問が生じた場合はIssue Aを再オープンするか別Issueとする）
- タグを読み取ってUC別・工程別に集計するツール・スクリプトの実装

## 受け入れ条件

- [ ] 対象13ファイルすべてのdescribe/itタイトルが`docs/test-tagging.md`の対応表どおりにリネームされている
- [ ] `npm test`が全件passする（テスト件数・pass件数がリネーム前と同じ）
- [ ] `npx tsc --noEmit`（`npm run build`に含む）が成功する
- [ ] TC-07（`schedule.test.ts`/`procurement.test.ts`）・TC-E1〜E3（`schedule.test.ts`/`production.test.ts`）が、`docs/test-tagging.md`が定める個別のUCタグ（同一TC番号でも異なるタグ）どおりに付与されている

## 参考資料

- `docs/test-tagging.md`（Issue Aで新設される書式・判定基準・対応表）
- `docs/v5-spec.md` §8.2（UC-01〜23）・§9.3（TC-01〜18）・§9.5（TC-E1〜3）
- `docs/design.md` §6（TC-M1）
