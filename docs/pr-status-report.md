# PR状況診断レポート（2026-09-24）

対象：#91・#89・#87・#85・#83（いずれもopen、約20時間前に作成）、およびIssue B1相当のPR #81。
**マージ・クローズ・rebaseは一切行っていない。調査結果のみ。**

## 1. docs/issue-drafts/ の現状

現在6ファイルが存在し、Issue Bは**既に分割済み**（`issue-b-ci-junit-triggers.md`という未分割ファイルは存在しない）。

| ファイル | 対応Issue/PR |
|---|---|
| `issue-a-test-tagging.md` | Issue A → PR #85 |
| `issue-a2-test-tagging-apply.md` | Issue A2 → PR #87 |
| `issue-b1-ci-junit-triggers.md` | Issue B1 → PR #81（**マージ済み**） |
| `issue-b2-flaky-check.md` | Issue B2 → PR #89 |
| `issue-c-eslint-coverage.md` | Issue C → PR #83 |
| `issue-d-e2e-scenario.md` | Issue D → PR #91 |

`issue-b1-ci-junit-triggers.md`・`issue-b2-flaky-check.md`のヘッダーコメントに「`issue-b-ci-junit-triggers.md`を
ユーザーの決定に基づき分割した」旨の記載があり、分割自体は完了している（旧ファイルはリポジトリに残っていない）。

## 2. サマリー表

| PR番号 | Issue | マージ済みか | base commitの新旧 | チェックの状態 | 競合リスク |
|---|---|---|---|---|---|
| #81 | B1（JUnit出力・起動条件） | **✅マージ済み**（2026-09-24T23:05:18Z、マージコミット`beb5b83`） | ― | ― | ― |
| #83 | C（ESLint・カバレッジ） | 未マージ | **新**（`beb5b83`＝B1マージ後を含む。branch上に`Merge remote-tracking branch 'origin/main'`コミットあり） | test/lint/build/preview: 成功、a11y: **失敗**（既知の事前存在問題） | `package.json`で**#91と実競合**（後述） |
| #85 | A（タグ書式ドキュメント） | 未マージ | 旧（`2ceb2cc`＝B1マージ前） | test/build/preview: 成功、a11y: 失敗（既知） | 低（他PRとファイル重複なし） |
| #87 | A2（タグ実適用） | 未マージ | 旧（`2ceb2cc`＝B1マージ前） | test/build/preview: 成功、a11y: 失敗（既知） | 低（他PRとファイル重複なし） |
| #89 | B2（フレーキー検出） | 未マージ | 旧（`2ceb2cc`＝B1マージ前） | test/build/preview: 成功、a11y: 失敗（既知） | なし（新規ファイルのみ） |
| #91 | D（E2Eシナリオ） | 未マージ | **新**（`beb5b83`＝B1マージ後を含む） | test/build/preview/e2e-scenario: 成功、a11y: 失敗（既知） | `package.json`で**#83と実競合**（後述） |

**Issue B1（#80／PR #81）はマージ済み。** マージコミット`beb5b83dd8f970be9b82cdbeed084594b764d3cb`
（"Merge pull request #81 from yoheitaniguchi/issue-80-ci-junit-triggers"）、マージ日時
`2026-09-24T23:05:18Z`。これが現在の`origin/main`のtipである。

### base commitの新旧について（重要な補足）

`git merge-base`で確認したところ、**#83と#91の2つは、ブランチに`Merge remote-tracking branch 'origin/main' into
test-merge-83/91`という統合コミットが既に積まれており、B1マージ後のmain（`beb5b83`）を取り込み済み**だった
（このコミットはPR本文やIssue下書きには記載が無く、事前の動作検証か何かの過程で作られたと見られる）。
一方**#85・#87・#89の3つは、いずれも分岐点が`2ceb2cc`（B1マージ前のmain）のまま**で、B1の変更
（`vite.config.ts`のjunitレポーター・`test.yml`のon:追加とupload-artifactステップ）を含んでいない。

ただし「baseが旧い」＝「マージ時に衝突する」ではない点に注意。#85・#87・#89がB1と実際に触るファイル・行が
重複するかどうかは3節で個別に確認した。結論から言うと、**この3件はB1とはファイルレベルで一切重複せず、
現状のmainに対してそのままマージしても機械的な衝突は起きない**（詳細は3節）。

## 3. ファイル競合の具体的な確認

### `vite.config.ts`

B1（`9774cb4`）と#83（`fb054ab`）は、どちらも`test: { exclude: [...], ... }`の**同じ挿入位置**
（`exclude: [...configDefaults.exclude, "e2e/**"],`の直後）に新しいキーを追加している。

B1のhunk：
```diff
   test: {
     exclude: [...configDefaults.exclude, "e2e/**"],
+    // 自動テスト管理アプリ（PoC）等の外部ツールがCI結果を機械的に取り込めるよう、JUnit XMLも
+    // 併せて出力する（vitestに標準搭載のreporterで追加devDependencyは不要）。出力先はPlaywright用の
+    // test-results/と共有するが、ファイル名を分けて衝突を避ける
+    reporters: ["default", "junit"],
+    outputFile: {
+      junit: "test-results/junit.xml",
+    },
   },
```

#83のhunk：
```diff
   test: {
     exclude: [...configDefaults.exclude, "e2e/**"],
+    coverage: {
+      provider: "v8",
+      // 人が読むレポート（text/html）に加え、外部ツールが数値を機械的に読み取れる
+      // json-summaryも出力する。CIでの実行・成果物アップロードは今回は行わない
+      reporter: ["text", "html", "json-summary"],
+      exclude: [...configDefaults.exclude, "e2e/**", "src/**/*.test.ts", "src/main.tsx"],
+    },
   },
```

**「同じ箇所への挿入」という意味では競合の可能性が高い形**だが、実際に#83のブランチは既にB1（main）を
取り込み済みで、その結果を見ると`reporters`/`outputFile`（B1）の後に`coverage`（#83）が両方とも残った形で
**衝突なくマージされている**（コンフリクトマーカーは無い。git 3-wayマージが「同じ行の直後に別々のブロックを
追加」を機械的に解決できたケース）。したがって**この組み合わせは実害としては解消済み**と言える。
#91はvite.config.tsを一切変更していないため、#91との衝突は無い。

### `.github/workflows/test.yml`

現在のmain（B1マージ後）の該当ファイルの構造を基準に、3件の変更位置を確認した。

| PR | 変更箇所 | 行の範囲（現行main基準） |
|---|---|---|
| B1（マージ済み） | `on:`セクションに`push`/`workflow_dispatch`追加、`test`ジョブの"Run tests"の後に`Upload vitest JUnit report`ステップ追加 | 3〜7行目、29〜35行目 |
| #83 | `test`ジョブの"Install dependencies"の直後・"Type check & build"の直前に`Lint`ステップ追加 | 20〜24行目付近 |
| #91 | `a11y`ジョブの"Type check (e2e)"の直後に`Cache Playwright browsers`ステップ追加、ファイル末尾に新規`e2e-scenario`ジョブを追加 | 39行目以降・ファイル末尾 |

3件とも触れている行範囲が完全に分離しており（testジョブの前半／testジョブ後半＋a11yジョブ冒頭／a11yジョブ
後半＋新規ジョブ）、**機械的には競合しない**。実際、#83・#91はそれぞれ単独でB1（main）とのマージ後diffを
確認済みで、両方ともコンフリクトなくB1の変更を取り込めている。#83と#91同士もこのファイルでは触れている
ジョブ・行が異なるため、どちらを先にマージしても機械的な衝突は起きないと見込まれる。#89は`test.yml`自体を
変更していない（新規ファイル`flaky-check.yml`のみ）ため無関係。

### `package.json`

**ここが唯一の実質的な競合箇所。** #83と#91は、どちらも`scripts`の**同じ行**
`"test:a11y": "playwright test"`を書き換えている。

#83のhunk：
```diff
     "test": "vitest run",
-    "test:a11y": "playwright test"
+    "test:coverage": "vitest run --coverage",
+    "test:a11y": "playwright test",
+    "lint": "eslint .",
+    "lint:json": "eslint . -f json -o eslint-report.json"
   },
```

#91のhunk：
```diff
     "test": "vitest run",
-    "test:a11y": "playwright test"
+    "test:a11y": "playwright test e2e/a11y.spec.ts",
+    "test:e2e:scenario": "PLAYWRIGHT_JUNIT_OUTPUT_NAME=test-results/e2e-scenario-junit.xml playwright test e2e/scenario.spec.ts --reporter=list,junit"
   },
```

#83は`"test:a11y"`の値をそのまま残す（カンマを付けるだけ）が、#91は値そのものを
`"playwright test e2e/a11y.spec.ts"`に書き換えている。**同一行を両者が異なる内容に変更しており、
どちらか一方が単純に上位互換というわけでもないため、git的にも意味的にも実際に競合する。**
先にマージされた方の変更（`test:coverage`/`lint`/`lint:json`、または`test:a11y`の書き換え＋
`test:e2e:scenario`）を、後からマージする側が取り込んで手動で1行にまとめる必要がある
（結果は`"test:coverage"`・書き換え後の`"test:a11y": "playwright test e2e/a11y.spec.ts"`・
`"test:e2e:scenario"`・`"lint"`・`"lint:json"`を全て残す形になるはず）。

なお`devDependencies`側は#83のみが変更（ESLint関連の追加）しており、#91は`devDependencies`を
一切変更していないため、そちらでの衝突は無い。

## 4. Issue AとA2の書式整合性（優先度：高）

### #85（Issue A）の最終状態

`docs/test-tagging.md`の内容を確認したところ、**既に4要素の書式`[UC-xx][工程][テストの種類][観点]`に
修正済み**だった。2コミット構成（`06bfaaa`初版→`7dfb995`「工程判定を一貫させ全17件の工程/観点を確定する」で
修正）で、PRの最終diffには古い3要素形式（`正常系／異常系`を含むもの）は残っていない。
「テストの種類」は「機能テスト」等の正式区分、「観点」は「正常／異常／境界」の3種として定義されている。

### #87（Issue A2）の実際のリネーム

`src/domain/*.test.ts`の実diffから代表例を抜粋：

```
- it("TC-17: 不良1個を含む通し演習の結果、期待どおりのKPIになる", () => {
+ it("[UC-20][単体][機能テスト][正常] TC-17: 不良1個を含む通し演習の結果、期待どおりのKPIになる", () => {

- it("TC-04: 受注 FG-100 x10 / 回答納期 D+15 を展開すると5件の計画オーダが期待どおりの値で生成される", () => {
+ it("[UC-06][単体][機能テスト][正常] TC-04: 受注 FG-100 x10 / 回答納期 D+15 を展開すると5件の計画オーダが期待どおりの値で生成される", () => {

- it("TC-E1〜E3: 木板の納期回答が遅れて警告が出たまま製造着手を試みると、部品が無いためHOLDになる", () => {
+ it("[UC-08/UC-13/UC-14][結合][機能テスト][異常] TC-E1〜E3: 木板の納期回答が遅れて警告が出たまま製造着手を試みると、部品が無いためHOLDになる", () => {

- it("TC-13: 完成数が受注数量に満たない場合、不足数量を返す", () => {
+ it("[UC-09][単体][機能テスト][異常] TC-13: 完成数が受注数量に満たない場合、不足数量を返す", () => {
```

10ファイル18箇所のリネーム全件を確認したところ、**全て4要素形式（UC番号が無い2件のみ`docs/test-tagging.md`の
規定どおり3要素`[工程][テストの種類][観点]`）**で、`正常系／異常系`のような古い表記は1件も残っていなかった。

### 結論：#85と#87は食い違っていない

**#85と#87は既に一致しており、書式の食い違いは無かった。** #87のリネーム結果は、UCタグ・工程区分・
テストの種類・観点のすべてが#85の対応表と一致している（例：TC-04→`[UC-06]`単体・正常、TC-E1〜E3
（production.test.ts）→`[UC-08/UC-13/UC-14]`結合・異常、など）。

ただし整合の**取れ方には注意が必要**：#87は`2ceb2cc`（#85が存在する前のmain）から分岐しており、
`docs/test-tagging.md`は**#87のブランチには存在しない**（`git show origin/issue-86-test-tagging-apply:docs/test-tagging.md`
は`fatal: path ... does not exist`）。つまり#87は同じ書式ファイルを参照してリネームしたのではなく、
**同一の作業セッション内の文脈（#85で確定した内容の記憶）に基づいて独立に4要素化した**結果、たまたま
一致している状態である。事実、#87のPR本文にも次の依存関係の注意書きが明記されている：

> **依存関係の注意**: 本PRは#84（PR #85、`docs/test-tagging.md`新設）で確定した書式・対応表に基づいて
> タグを付与しています。`docs/test-tagging.md`はこのブランチには含まれていないため（`main`に対して
> 独立に作業したため）、レビュー・マージの際は#85の内容と付き合わせて確認してください。

したがって「どちらを正としてもう一方を直すか」という判断は**今回は不要**（内容は実質的に一致している）。
ただし#87は`docs/test-tagging.md`というファイル自体を持たないブランチ上でのリネームなので、
**レビュー担当者が#85の内容と#87のリネーム結果を突き合わせて一致を最終確認すること自体は推奨**する
（今回の調査で一致は確認済みだが、機械的な参照関係が無い以上、今後どちらかに再修正が入ると容易に
再び食い違う状態になり得るため）。

## 5. 各PRのチェック失敗の原因

5件すべてで`test`（型チェック・ビルド・vitest。#83のみ`lint`も含む）・`preview`ジョブは成功しており、
`a11y`ジョブのみが失敗している。#91はさらに新規`e2e-scenario`ジョブも成功している。

`a11y`ジョブの失敗ログ（例：#85）を確認したところ、失敗テストは
`e2e/a11y.spec.ts:40 › 各タブでcritical/serious相当の違反がないこと`（ライト・ダーク両テーマ）であり、
これは**CLAUDE.mdに記載済みの既知の事前存在問題**（マスタタブのlabel／select-name違反、Issue #63で
「個別Issue化して別途対応する方針」とされたまま未着手のもの）と一致する。5件のいずれもUI/コンポーネントを
変更していない（CI設定・ドキュメント・テストタイトル・新規E2Eテストのみ）ため、**この失敗は各PRの変更に
起因するものではなく、現在のmain自体が抱えているbaseline上の既知の失敗がそのままPRにも反映されている
だけ**と判断できる。テストコード自体の不具合でも、他PRの変更が無いことによる依存の欠如でも、lint/ビルドの
設定不備でもない。

## 6. 安全にマージするための順番の案

3節・4節の結果から導かれる制約は次の2点のみ：

- **実質的な競合は`package.json`の`test:a11y`行、#83と#91の間だけ**（vite.config.tsは既に解消済み、
  test.ymlは機械的に無競合、#85/#87/#89は他のどのPRともファイルが重複しない）
- 4節のとおり、#85と#87の書式は既に一致しているため、マージ順を決める前に「どちらを正とするか」の
  判断は不要（レビューでの最終確認は推奨）

これを踏まえた提案順：

1. **#81（Issue B1）**：マージ済み・対応不要
2. **#85（Issue A）**：他PRと無競合。`docs/test-tagging.md`を新設し、後続のA2の参照先を確定させる
   意味でも先頭に置く
3. **#87（Issue A2）**：他PRと無競合。#85の後に置くのは技術的な必須要件ではないが、PR本文が
   「#85の内容と付き合わせて確認してほしい」と明記しているため、レビューのしやすさの観点で#85の直後が良い
4. **#89（Issue B2）**：他のどのPRとも無関係（新規ファイルのみ）。任意のタイミングで良いが、ここでまとめて片付ける
5. **#83（Issue C）**：既にB1を取り込み済みでvite.config.ts・test.ymlともクリーンにマージできる見込み
6. **#91（Issue D）**：**#83のマージ後、`main`を取り込み直した上で`package.json`の`test:a11y`行を
   手動で一本化する作業が必要**（`test:coverage`・書き換え後の`test:a11y`（`e2e/a11y.spec.ts`明示指定）・
   `test:e2e:scenario`・`lint`・`lint:json`を全て残す）。この手動解消を経てからマージする

上記のうち5→6（#83→#91）の順序だけは、`package.json`の実競合を避けるために意味を持つ（逆順でも
手動解消の作業自体は同様に必要になるので、どちらを先にしても構わないが、Issue番号の若い方＝#83を
先にする方が自然）。1〜4の順序（#85・#87・#89の内部順）はファイルの重複が無いため厳密には自由だが、
レビューのしやすさを優先して上記の並びを提案する。
