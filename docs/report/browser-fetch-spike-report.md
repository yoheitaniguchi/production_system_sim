# ブラウザからのGitHub Actions成果物（artifact）直接取得検証レポート

> **注記**：本レポートは作成時点のスナップショットであり、以後は更新しない。現行の状態は`CLAUDE.md`・`CHANGELOG.md`を参照すること。

検証日時：2026-09-27（UTC）／検証者：Claude Code

> **前提の注記**：本検証の実施を依頼された`docs/test-management-app-requirements.md`は、本リポジトリの
> 現時点（ブランチ`claude/eloquent-einstein-tyoqcv`、全ブランチ・全Issueを確認）にはまだ存在しない
> （`docs/`配下・全ブランチのgit履歴・GitHub Issue一覧のいずれにも見つからなかった）。そのため11.2・11.5の
> 原文は参照できておらず、本レポートは依頼文に記載された内容（CORSの懸念、U-05のA/B案）に基づいて作成した。
> 同ファイルが別途作成された際は、本レポートの結論を転記・整合させることを推奨する。

## 結論（1行まとめ）

- **(a) 成果物一覧の取得（`GET /repos/{owner}/{repo}/actions/artifacts`）**：**ブラウザから直接取得できる**
  （GitHub側が`Access-Control-Allow-Origin: *`を返しており、実機のChromiumで実際に200・JSON本文の取得に成功した）。
- **(b) 成果物のZIP本体の取得（`archive_download_url`）**：**ブラウザから直接取得できない**
  （`api.github.com`自体はCORSを許可しているが、実体は302リダイレクト先のBLOBストレージ
  （本検証では`blob.core.windows.net`）にあり、そのリダイレクト先がCORSヘッダーを返さないため、
  ブラウザの`fetch()`はZIP本体を読み取れない。これは本検証環境固有の制約ではなく、GitHub Actions
  artifactダウンロードの構造上の既知の制約である）。

## 検証対象

- リポジトリ：`yoheitaniguchi/production_system_sim`
- 使用したワークフロー実行：run id `36301368445`（`.github/workflows/test.yml`、2026-09-27T06:52 UTC完了、
  24時間以内の実行が存在したため新規実行はしなかった。ワークフロー全体の`conclusion`は`failure`だが、これは
  `a11y`ジョブ側の既知の未解決違反（Issue #63系）によるものであり、`test`ジョブ自体はJUnit XML成果物を
  正常にアップロードしている）
- 対象artifact：`vitest-junit-report`（id `10925805930`、サイズ 10,625 bytes、
  `archive_download_url`は`https://api.github.com/repos/yoheitaniguchi/production_system_sim/actions/artifacts/10925805930/zip`）
- トークン：このセッションが認証済みの`gh auth token`相当の値（`GH_TOKEN`環境変数。値は伏せる）

## 検証環境に関する重要な注記

このセッションは、全アウトバウンドHTTPS通信がTLS終端型のローカルプロキシ（`127.0.0.1:36641`、
組織のegressポリシーでホストを許可制限）を経由する構成のコンテナ内で動作している。この制約が
今回の検証結果に2点、影響している。

1. **成果物ZIP本体のリダイレクト先ホスト（`*.blob.core.windows.net`、Azure Blob Storage）への
   接続が、このセッションの組織egressポリシーにより拒否された**（`403 CONNECT tunnel failed`、
   `connect_rejected (organization policy)`）。これはCORSとは無関係の、本検証コンテナ固有のネットワーク
   制約であり、一般のブラウザ利用者には当たらない。
2. **このセッションのトークンは、`curl`（非ブラウザ）からのリクエストでは成果物ZIP取得の入口
   （`/actions/artifacts/{id}/zip`）まで認証が通ったが、Chromium（ブラウザ）からの同一リクエストでは
   `401 Unauthorized`になった**（一覧取得APIはブラウザ・非ブラウザどちらでも認証が通った）。
   これは、このセッションのプロキシがGitHub認証情報を要求元に応じて選択的に注入している（Originヘッダーの
   有無等でブラウザ発のリクエストを判別し、成果物本体のダウンロード起点となるエンドポイントでは実効な
   認証情報を渡さない）ためと推測される、**本検証コンテナ固有の制約**であり、GitHub自体のCORS仕様とは別問題。

この2点により、「ブラウザがリダイレクト先のBLOBストレージから実際にバイト列を読み取れるか」を
このコンテナ内で最後まで実機確認することはできなかった。ただし、GitHub側（`api.github.com`）が
実際に返すCORSヘッダーは`curl`で直接確認できており、この制約の影響を受けない事実として結論に使っている
（詳細は下記）。またこの制約から独立して、一般に広く報告されている既知の事実（後述）とも整合する。

## (3) ブラウザでの結果（Playwright + Chromium、`http://localhost:8843`から`fetch()`）

| 項目 | (a) 一覧取得 | (b) ZIP取得（リダイレクト追従あり） | (b) ZIP取得（リダイレクト追従なし＝`redirect:"manual"`） |
|---|---|---|---|
| fetchの成否（例外/reject） | 成功（例外なし） | 成功（例外なし。**401という応答自体は取得できた**） | 成功（例外なし） |
| HTTPステータス | 200 | 401 Unauthorized | 401 Unauthorized |
| `response.type` | `cors` | `cors` | `cors` |
| JSからの`Access-Control-Allow-Origin`ヘッダー参照 | `null`（※注1） | `null` | `null` |
| リダイレクト発生 | なし | なし（認証エラーで302に到達せず） | なし |
| `response.blob()` | 成功（21,913 bytes、一覧JSON） | 成功（120 bytes、GitHubの401エラーJSON） | 未実施（manual時は仕様上ボディを読まない） |
| ブラウザConsoleのCORS関連エラー | なし | なし（"blocked by CORS policy"という文言は出力されなかった） | なし |
| `requestfailed`イベント | なし | なし | なし |

※注1：`response.headers`からJSが読める値は「CORS-safelisted応答ヘッダー」＋
`Access-Control-Expose-Headers`で明示公開された値に限られる。GitHubは
`Access-Control-Allow-Origin`自体をこの公開リストに含めていないため、fetchが`cors`型で正常に
解決した（＝ブラウザ内部のCORS判定は通過した）にもかかわらず、JSからは`null`に見える。
これは(4)の`curl`で生ヘッダーを見て初めて確認できた。

**重要な所見**：(a)一覧取得はブラウザから完全に成功した（CORSにブロックされず、実データを読み取れた）。
(b)は上記「検証環境に関する重要な注記」の2番目の制約（プロキシの認証情報スコープ）により401で止まり、
CORS自体が働く前に認証エラーで終わったため、**ブラウザ内での「302リダイレクト→BLOBストレージ本体の
読み取り」というCORSが本来問題になる段階まで到達できなかった**。ブラウザConsole上にも
「blocked by CORS policy」という文言は一度も出力されていない（出力されたのは
`Failed to load resource: the server responded with a status of 401 (Unauthorized)`のみ）。

## (4) 比較：ブラウザを介さない場合（`curl`、同一トークン）の結果

| 項目 | (a) 一覧取得 | (b) ZIP取得（`-L`なし） | (b) ZIP取得（`-L`あり＝リダイレクト追従） |
|---|---|---|---|
| HTTPステータス | 200 OK | **302 Found**（ブラウザでは401だった同一エンドポイントが、curlでは認証を通過） | 1st hop 302 → 2nd hop（`*.blob.core.windows.net`へのCONNECT）で**このコンテナのegressポリシーにより403拒否** |
| `Access-Control-Allow-Origin`（生ヘッダー） | `*` | `*` | （到達できずヘッダー未取得） |
| `Location`ヘッダー | – | `https://productionresultssa4.blob.core.windows.net/actions-results/...zip?...`（SAS付き署名URL） | – |
| 備考 | `Github-Authentication-Token-Expiration`ヘッダーも返り、実際の認証が通っていることを確認 | GitHub側は成果物本体を直接返さず、必ずBLOBストレージへリダイレクトする構造であることを確認 | この403は組織のegressポリシーによるものであり、CORS（そもそも`curl`はCORSを評価しない）とは無関係 |

`curl`は3回連続で同じ結果（200／302）を再現し、ブラウザとの差（401 vs 302）が一時的なトークンの
失効等ではなく、リクエスト元の違い（ブラウザ発のOriginヘッダー等の有無）に起因することを確認した。

## CORSに関するエラーメッセージについて

本検証では、ブラウザConsole・`requestfailed`イベントのいずれにも、「blocked by CORS policy」に
類する文言は一度も出力されなかった。これは、(a)ではCORSチェック自体を問題なく通過したため、
(b)では上記の認証エラー（401、本検証コンテナ固有の制約）でCORSチェック以前に処理が止まったため、
それぞれ理由が異なる。したがって**本検証単独では「BLOBストレージ本体がCORSヘッダーを返さないことによる
明示的なブラウザブロック」を実機のConsoleログとして再現できていない**。この点は下記の外部情報で補完した。

### 外部情報による補完（本検証コンテナの制約を超えて確認できる既知の事実）

Web検索で確認できた、GitHub Actions／GitHubの成果物・リリースアセット取得に関する既知の報告：

- GitHubのダウンロード用URLは（本検証で確認したのと同様に）BLOBストレージ（S3やAzure Blob等）への
  302リダイレクトであり、**リダイレクト先のセカンダリドメインにはGitHubが意図的にCORSヘッダーを付与していない**
  （セキュリティ上の理由によるものと報告されている）。この結果、ブラウザから`fetch()`でリダイレクトを
  手動追従してもリダイレクト先の応答が拒否され、バイト列を取得できない
  （[GitHub community discussion #106849](https://github.com/orgs/community/discussions/106849)、
  [How to Fetch Files From a GitHub Release (Without CORS Errors)](https://corsfix.com/blog/fetch-github-release)）。
- 回避策として一般に提示されているのは、①サーバー側（CI等）でリダイレクトを追従して本体を取得し
  フロントエンドへ中継する方法、②CORSプロキシを介在させる方法の2つであり、いずれも
  「ブラウザが直接BLOBストレージから取得することはできない」という前提に立っている。

本検証で直接確認できた事実（`api.github.com`自体は一覧取得・ZIP取得起点の両方で`Access-Control-Allow-Origin: *`
を返す）と、この外部情報（リダイレクト先のBLOBストレージにはCORSヘッダーが付与されない）を合わせると、
「(b)成果物のZIP本体はブラウザから直接取得できない」という結論は、本検証コンテナ固有の制約
（egressポリシー・認証情報スコープ）を差し引いても揺るがないと判断した。

## U-05（結果ファイルの取得方法と全体構成）への結論

- **A：ブラウザが直接取得する構成** → **技術的に成立しない**。(a)成果物一覧の取得はブラウザから
  直接可能だが、実際に必要なJUnit XML本体（(b)）はBLOBストレージのリダイレクト先がCORSを許可しない
  ため、ブラウザの`fetch()`では読み取れない。一覧取得だけでは「テスト結果の内容」を表示できず、
  U-05の目的（結果ファイルの取得）を満たせない。
- **B：CI側で集約する構成** → **技術的に成立する**。CI（GitHub Actions）側、またはCIから起動される
  サーバーサイド・非ブラウザのプロセス（`curl`／Node.js等）であれば、`Access-Control-Allow-Origin`の
  制約を受けずにリダイレクトを追従して成果物ZIP本体を取得できる（本検証の(4)で`curl`が
  `/actions/artifacts/{id}/zip`への302応答と署名付きURLを問題なく取得できたことで確認済み。
  署名付きURL自体への到達は本コンテナのegressポリシーで確認できなかったが、これは本コンテナ固有の
  制約であり、GitHub Actionsのジョブ実行環境やCI外の通常のサーバー環境では制約されない）。

**結論**：自動テスト管理アプリの設計は、B（CI側またはサーバーサイドで成果物を集約・変換し、
フロントエンドにはその結果を配信する構成）を前提に進めるべきである。
