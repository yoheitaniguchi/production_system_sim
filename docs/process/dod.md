# 完了の定義（DoD）

- 根拠：`docs/process/review-report.md` C-2・D-2・D-5
- 本書の位置付け：PRをマージしてよい条件の正本。PRテンプレート（`.github/PULL_REQUEST_TEMPLATE.md`）の
  「完了の定義（DoD）」欄は、本書の項目番号（D1〜D8）に対応するチェックリストである
- 適用範囲：すべてのPR。ドキュメントのみの変更など該当しない項目は、PRに「対象外」と理由を書く

## 項目

| # | 条件 | 確かめ方 |
|---|---|---|
| D1 | Issueの受け入れ条件1件ごとに、それを確かめるテスト（自動テスト、またはPRに記録した操作手順）がある | PR本文「受け入れ条件の充足」 |
| D2 | CIの必須チェック（`test`・`a11y`・`e2e-scenario`）がすべて成功している | `main`のRulesetで機械的に強制（成功するまでマージできない） |
| D3 | ローカルで`npm run lint`・`npm run build`・`npm test`が通っている | PR本文「テスト」 |
| D4 | 追加・変更したテストのタイトルに、`docs/test-tagging.md`の書式でタグ（工程・種類・観点、該当すればUC番号）が付いている | 差分を目視 |
| D5 | 実装レビュー（`src/domain/`変更時は`logic-reviewer`、`src/components/`変更時は`ux-reviewer`）と`/security-review`の指摘に対応した | PR本文「テスト」 |
| D6 | 新しい仕様の解釈・設計判断を`docs/design.md` §3（EXT-xx）に記録した。仕様書（`docs/v5-spec.md`）は直接編集していない | PR本文「確認事項」 |
| D7 | **人の確認**：マージする人が、下記「人が確認する範囲」を確認した | PR本文「人の確認」 |
| D8 | `CHANGELOG.md`に追記し、必要な文書（`CLAUDE.md`・`README.md`・`docs/process/poc-definition.md`）の更新要否を判断した | PR本文「確認事項」 |

## 人が確認する範囲（D7）

AIが書いたコード・テスト・レビュー結果を含め、**成果物の責任はマージする人が持つ**。
ただし全行を読むことは求めない。機械（CI・AIレビュアー）で確かめられることは機械に任せ、人は次の判断だけを確認する。

1. **テストの期待値の出どころ**：受け入れ条件を確かめるテストの期待値が、仕様（`docs/v5-spec.md`・Issue・`docs/design.md`）から
   来ているか。コードの動きから逆算した値になっていないか（`docs/test-process-standard.md` §4.7の注意）
2. **設計判断の妥当性**：`docs/design.md`に追加・変更したEXT-xxの内容に納得できるか
3. **画面の動き**：UI変更がある場合、PRプレビューで主要な操作を1回通した
4. **目的への寄与**：このPRが`docs/process/poc-definition.md`のどの仮説に寄与するか説明できる（寄与しない変更は、
   入れるかどうか自体を見直す）

## マージの手順

- CIの必須チェックがすべて成功するまで待つ（Rulesetにより、成功前はマージできない）
- 上記を満たしたらマージする。マージはリポジトリのオーナーが行い、Claudeはマージしない（`docs/issue-workflow.md` §11）
