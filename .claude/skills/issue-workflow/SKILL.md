---
name: issue-workflow
description: 要望・要件をGitHub Issueとして起票し、そのIssueを元にブランチ作成・実装・PR作成（Closes #連携）までを定型手順で進める。ユーザーが「Issueにまとめて」「Issueを元にPRを作って」「複数のIssueを並行して実装して」等、Issue駆動での開発を依頼したときに使う。
---

要望・要件をIssue駆動で開発するときは、以下の手順に従う。詳細な背景・理由づけは
`docs/issue-workflow.md`を参照すること。

1. **Issue下書き**：`.github/ISSUE_TEMPLATE/feature_request.md`の構成（概要／背景・目的／要件／
   対象範囲外／受け入れ条件／参考資料）に沿って内容を埋めた下書きを作成する。
   受け入れ条件は`npm test`等で検証可能な粒度で書く
2. **仕様レビュー**：作成した下書きを`issue-spec-reviewer`サブエージェントに渡し、目的・効果の明確さ／
   要件の分解粒度／開発方針との整合性／費用対効果／テンプレート必須項目の充足を確認させ、改善済みの
   下書きを得る。このレビュー後の下書きをチャット上に提示する
3. **承認ゲート**：ユーザーの承認を得るまでIssueを起票せず、4以降（ブランチ作成・実装・PR作成）へも
   進めない。修正依頼があれば下書きに反映し再提示する（軽微な修正であればレビューをやり直さなくてよい）
4. **Issue作成**：承認が得られたら、その内容でGitHub Issueとして起票する
5. **ブランチ作成**：Issue番号がわかるブランチ名で作業する（Claude Code on the webのセッションでは
   払い出されたブランチをそのまま使う）
6. **実装**：`CLAUDE.md`の既存ルールを踏襲する。仕様の解釈・追加決定が必要な場合は
   `docs/design.md` §3に追記し、`docs/v5-spec.md`本体は直接編集しない
7. **実装レビュー**：`src/domain/`を変更したら`logic-reviewer`サブエージェント、`src/components/`を
   変更したら`ux-reviewer`サブエージェントでレビューする
8. **PR作成**：`.github/PULL_REQUEST_TEMPLATE.md`を使い、先頭に`Closes #<Issue番号>`を書いて
   Issueと自動リンクする。CI（型チェック・ビルド・`npm test`）がgreenであることを確認する
9. **マージ後**：Issueが自動クローズされたことを確認し、`CLAUDE.md`「現在の実装状況」
   「次にやるべきこと」の更新要否を判断する

複数のIssueを同時並行で実装するよう依頼された場合は、5（ブランチ作成）に入る前に
`docs/issue-workflow.md` §10の手順に従う：対象Issueのfootprint（影響しそうなファイル）を確認し、
重ならないIssueだけを同時並行にする。並行実行するIssueは、別ブランチ・別セッション（`create_session`）
または別worktreeなど、作業領域を分離すること。
