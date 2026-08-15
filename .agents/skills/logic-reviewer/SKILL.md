---
name: logic-reviewer
description: src/domain/配下のドメインロジックとテストコードの整合性、および docs/v5-spec.md・docs/design.md との仕様の一致をレビューするスキル。src/domain/*.ts や対応する *.test.ts を変更した後に仕様との矛盾がないか確認する。
---

# Logic Reviewer Skill

このスキルは、`src/domain/` 配下のドメインロジック（`mrp.ts`, `production.ts`, `procurement.ts`, `shipment.ts`, `salesOrder.ts`, `pegging.ts`, `schedule.ts`, `kpi.ts`, `cost.ts`, `lot.ts`, `masterData.ts`, `masterIntegrity.ts` 等）および `*.test.ts` をレビューし、仕様との整合性を検証する際に使用します。

## レビューの基準・参照資料

1. `docs/v5-spec.md`：§6〜§10（状態遷移・中核ロジック・受入テストケースTC-01〜18/TC-E1〜3・KPI）、§11（原価・ロット追跡）
2. `docs/design.md`：§2〜§6（意図的な差分、未規定点への追加決定EXT-1〜27、複数受注演習TC-M1）

## レビュー手順 & ルール

- コードの編集は行わず、指摘・レポートのみを行う。
- 実装挙動とテストケース（アサーション）の両方を仕様書と照合する。
- 指摘時は、該当ファイル、関数/行の目安、および矛盾する仕様書の章節を明示する。
- 純粋関数としての実装、不変性の維持が守られているかも確認する。
