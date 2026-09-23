<!--
このファイルは、自動テスト管理アプリ（PoC）接続readiness調査（docs/poc-readiness-report.md）に基づき、
issue-workflow（.claude/skills/issue-workflow/SKILL.md）の手順1（Issue下書き作成）・3（issue-spec-reviewer
によるレビュー）まで実施した結果のIssue下書きである。GitHub上への実際の起票（手順4）はまだ行っていない。
着手を指示する場合は、末尾「レビュー時の確認事項」に回答したうえで承認してください。
-->

## issue-spec-reviewerによる指摘サマリ

- **目的・効果の明確化**：背景・目的が「設定ファイルが無いことの確認結果」の言い換えに留まり、導入効果が書かれていなかった → 本リポジトリ自身への効果（PRレビュー前のローカル機械検出、テスト網羅状況の可視化）を明記した。「自動テスト管理アプリ（PoC）との接続」という動機はdocs/配下に記載が無い外部前提のため、実施判断の主根拠からは外した。
- **曖昧さの解消**：受け入れ条件「終了コード0、または警告一覧」が二択で曖昧だった → 「errorはバグ直結ルールに限定しexit code 0を必達、それ以外はwarn」という一貫した基準に分解した。CIへの組み込み要否が欠落していた → lintのみ`test.yml`の`test`ジョブに追加する要件を新設し、coverageのCI組み込みは対象範囲外に明記した。
- **開発方針との整合性**：Issue #63→#72の「新規導入した自動検査で見つかった既存の指摘は個別Issue化する」という前例と整合しており問題なし。
- **費用対効果**：`src/domain/`（20ファイル）・`src/components/`（29ファイル）を実際に変更するものではなく、設定/ドキュメントファイルに閉じる。判定＝**軽〜中**。

## 改善済み下書き

## 概要

ESLintと`@vitest/coverage-v8`を新規導入し、`npm run lint`・`npm run test:coverage`を追加する。あわせてCIの`test`ジョブへのlint組み込みと、`CLAUDE.md`「コマンド」節への追記を行う。

## 背景・目的

現状、`package.json`にESLint関連の依存パッケージが無く、`.eslintrc*`・`eslint.config.*`のいずれの設定ファイルも存在しない（`Glob`で確認済み）。そのため、未使用変数・importの整理漏れといった機械的に検出可能な問題が人手のレビューのみに依存している。同様に`vite.config.ts`にはvitestの`test.coverage`設定が無く、既存168件のテスト（`src/domain/*.test.ts`ほか、`Glob`で25ファイル確認）が20個のドメインモジュール・29個のコンポーネントをどの程度網羅しているかを定量的に把握する手段が無い。

これらを導入すると、本リポジトリ自身にとって次の2つの効果が見込める。
1. 開発チームメンバーがPRを出す前にローカルで`npm run lint`を実行し、機械的に検出可能な問題を自己修正できるようになり、レビューコストが下がる。
2. `npm run test:coverage`により、TC-01〜18等の既存テストがどのドメインファイルを実際に網羅していないかが可視化され、「動く仕様書」としての本教材の信頼性・次にテストを追加すべき箇所の判断材料が得られる。

なお調査の発端は「自動テスト管理アプリ（PoC）とこのリポジトリを接続する準備」だが、これは本リポジトリの`docs/`配下に現時点で記載の無い外部の取り組みである。本Issueの実施可否・優先度は上記(1)(2)の本リポジトリ自身への効果だけで判断できるため、外部PoCとの接続自体を前提条件とはしない（詳細は末尾「レビュー時の確認事項」参照）。

## 要件

### A. ESLint導入
1. ESLintをdevDependencyとして追加する。ESLint 9系のflat config（`eslint.config.js`）を使い、`@typescript-eslint`のrecommended（型情報を要さない基本ルールセット）と`eslint-plugin-react-hooks`のrecommendedをベースにする
2. error扱いにするルールは「バグに直結するもの」（未定義変数・react-hooksのルール違反等）に限定する。大量の既存修正を伴うルール（未使用変数・`any`禁止など）は初期導入時は`warn`または`off`にとどめ、どのルールをどちらに分類したかの一覧をPR説明に記載する
3. `package.json`に`"lint": "eslint ."`を追加する

### B. カバレッジ計測導入
4. `@vitest/coverage-v8`をdevDependencyとして追加する（インストール済みの`vitest`（`^4.1.10`）と対応するメジャーバージョンを選ぶ）。`vite.config.ts`の`test`設定（L14-16付近）に`coverage`ブロック（`provider: "v8"`、`reporter: ["text", "html"]`、`e2e/**`・`*.test.ts`自体は計測対象から除外）を追加する
5. `package.json`に`"test:coverage": "vitest run --coverage"`を追加する

### C. ドキュメント・CI反映
6. `CLAUDE.md`「コマンド」節に`npm run lint`・`npm run test:coverage`の説明を追記する
7. `.github/workflows/test.yml`の`test`ジョブに`npm run lint`の実行ステップを追加し、CI上でもerror扱いの検出を防ぐ。`npm run test:coverage`のCIジョブ追加は本Issueのスコープに含めない（対象範囲外参照）

## 対象範囲外

- 導入時にESLintが検出する既存コードの警告（warn扱い分）の実際の修正（別Issue化する。Issue #63→#72の対応パターンを踏襲する）
- カバレッジ目標値（%）の設定、および目標未達時にCIを失敗させる仕組み
- `npm run test:coverage`のCIジョブへの追加・カバレッジレポートのCI成果物アップロード
- Playwright（e2e）側のカバレッジ計測
- 外部の「自動テスト管理アプリ（PoC）」との具体的な連携方法・データ受け渡し形式の設計（必要になった時点で改めてIssue化する）

## 受け入れ条件

- [ ] `npm run lint`をリポジトリルートで実行すると終了コード0で完了する（`src/`配下の既存コードに対するerror扱いの検出が0件。warn扱いの検出が残る場合はその一覧を本Issueまたはフォローアップコメントに記録する）
- [ ] `npm run test:coverage`を実行すると`coverage/`配下にレポート（`coverage/index.html`を含む）が生成され、既存の`npm test`と同じテスト件数・pass件数になる
- [ ] `CLAUDE.md`「コマンド」節に`npm run lint`・`npm run test:coverage`の1行説明が追記されている
- [ ] `.github/workflows/test.yml`の`test`ジョブに`npm run lint`のステップが追加されており、CI上で実行される
- [ ] 追加後も既存の`npm test`・`npm run build`・`npm run test:a11y`が変更前と同じ結果（pass件数・終了コード）で成功する

## 参考資料

- `package.json`（`dependencies`/`devDependencies`、L13-27）
- `vite.config.ts`（`test`設定、L14-16）
- `CLAUDE.md`「コマンド」節
- `.github/workflows/test.yml`（`test`ジョブ）
- Issue #63・#72（アクセシビリティ自動テスト化の際に採った「検出された既存の指摘は個別Issue化する」という方針）

## レビュー時の確認事項

- 背景説明にある「自動テスト管理アプリ（PoC）とこのリポジトリを接続する準備」は、本リポジトリの`docs/`配下に現時点で記載の無い外部の取り組みです。本下書きは本リポジトリ内で完結する効果（PRレビューコスト低減・テスト網羅状況の可視化）だけで実施判断できる内容にしましたが、外部PoCとの接続を前提とした追加要件（特定フォーマットでのレポート出力、外部ツールが読む固定パス等）が別途あるなら、要件への反映要否をユーザーに確認してください。
- ESLint導入（A）とカバレッジ導入（B）は技術的に独立した変更です。本下書きでは1 Issueにまとめていますが、実装時にESLintのルールチューニングが想定より重くなる場合は、Bだけ先に別Issue/別PRとして切り出すことも検討してください。
- `test.yml`の`test`ジョブへの`npm run lint`追加（要件7）はレビュー側の提案です。「導入だけして誰も実行しない」状態を避け、CIによるリグレッション検知という効果を確実にする狙いですが、CI実行時間の増加を許容するかはユーザー判断としてください。
