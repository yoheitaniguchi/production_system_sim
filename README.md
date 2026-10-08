# production_system_sim

生産管理（受注〜出荷）のドメイン連携を動かして確かめるための、ミニマムなシミュレーター。

このリポジトリはPoCで、次の3つを検証している（詳細は `docs/process/poc-definition.md`）。

1. 生産管理システムの構想検証：7ドメインの連携を動かして、本番システムに必要な要件の要否を判断する
2. AI駆動開発プロセスの検証：実装・テスト・レビューをAIと機械検証に任せても品質を保てるか
3. テスト管理アプリの構想検証：CIのテスト結果から、要件ごとのテストの網羅状況を把握できるか

このコードは本番化しない。開発の手順は `docs/issue-workflow.md`、作業ルールは `CLAUDE.md`、実装の経緯は `CHANGELOG.md` を参照。

起動時の題材は木製イス（2階層BOM）だが、マスタタブから品目・BOM・工順（BOP）・作業区・取引先を
自由に登録して別の製品構成を試せる。作った題材はJSONで書き出し／読み込みでき、
「既定プリセットに戻す」でいつでも木製イスへ復元できる。

## ローカル実行

```
npm install
npm run dev
```

## 公開版

`main` ブランチへの push を契機に GitHub Actions（`.github/workflows/deploy.yml`）が自動ビルドし、
`gh-pages` ブランチへ配信する。公開URL: `https://<owner>.github.io/production_system_sim/`
（リポジトリの Settings → Pages → Build and deployment → Source を「Deploy from a branch」、
ブランチを `gh-pages` / `/ (root)` に設定した後、有効になる。`gh-pages` ブランチは初回デプロイ時に自動作成される）。

## PRプレビュー

PRを作成・更新すると `.github/workflows/pr-preview.yml` が `gh-pages` ブランチの
`pr-preview/pr-<番号>/` 配下へビルド成果物を配信し、PR上にプレビューURLをコメントする
（`rossjrw/pr-preview-action`使用）。公開版のデプロイ（`gh-pages`ブランチのルート）とは
別ディレクトリに配信されるため、双方が上書きし合うことはない。PRをクローズすると自動的に
プレビューを削除する。
