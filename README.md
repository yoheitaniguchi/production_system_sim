# production_system_sim

生産管理（受注〜出荷）のドメイン連携を学ぶための、動くミニマムシミュレーター。詳細は `CLAUDE.md` を参照。

## ローカル実行

```
npm install
npm run dev
```

## 公開版

`main` ブランチへの push を契機に GitHub Actions（`.github/workflows/deploy.yml`）が自動ビルドし、
GitHub Pages へデプロイする。公開URL: `https://<owner>.github.io/production_system_sim/`
（リポジトリの Settings → Pages → Build and deployment → Source を「GitHub Actions」に設定した後、有効になる）。
