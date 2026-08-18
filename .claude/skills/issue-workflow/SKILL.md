---
name: issue-workflow
description: 要望・要件をGitHub Issueとして起票し、そのIssueを元にブランチ作成・実装・PR作成（Closes #連携）までを定型手順で進める。ユーザーが「Issueにまとめて」「Issueを元にPRを作って」等、Issue駆動での開発を依頼したときに使う。
---

要望・要件をIssue駆動で開発するときは、以下の手順に従う。詳細な背景・理由づけは
`docs/issue-workflow.md`を参照すること。

1. **Issue作成**：`.github/ISSUE_TEMPLATE/feature_request.md`の構成（概要／背景・目的／要件／
   対象範囲外／受け入れ条件／参考資料）に沿って内容を埋め、GitHub Issueとして起票する。
   受け入れ条件は`npm test`等で検証可能な粒度で書く
2. **ブランチ作成**：Issue番号がわかるブランチ名で作業する（Claude Code on the webのセッションでは
   払い出されたブランチをそのまま使う）
3. **実装**：`CLAUDE.md`の既存ルールを踏襲する。仕様の解釈・追加決定が必要な場合は
   `docs/design.md` §3に追記し、`docs/v5-spec.md`本体は直接編集しない
4. **レビュー**：`src/domain/`を変更したら`logic-reviewer`サブエージェント、`src/components/`を
   変更したら`ux-reviewer`サブエージェントでレビューする
5. **PR作成**：`.github/PULL_REQUEST_TEMPLATE.md`を使い、先頭に`Closes #<Issue番号>`を書いて
   Issueと自動リンクする。CI（型チェック・ビルド・`npm test`）がgreenであることを確認する
6. **マージ後**：Issueが自動クローズされたことを確認し、`CLAUDE.md`「現在の実装状況」
   「次にやるべきこと」の更新要否を判断する
