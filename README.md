# production_system_sim

生産管理（受注〜出荷）のドメイン連携を学ぶための、動くミニマムシミュレーター。詳細は `CLAUDE.md` を参照。

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
