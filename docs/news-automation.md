# お知らせの自動反映

microCMSのお知らせAPIからWebhookで元リポジトリ `higashiosakawinds-prog/higasui` のGitHub Actionsを起動し、公開記事を取得します。公開・更新・公開停止・削除を通知対象にします。下書きは取得しません。定期実行はありません。

APIキーは元リポジトリのActions Secret `MICROCMS_API_KEY` に保存しています。ワークフローは公開データだけを `news-content.js` に書き出し、変更時だけコミットします。ブラウザへAPIキーを送らず、閲覧のたびにmicroCMS APIを呼ぶこともありません。

自動コミットだけではGitHub Pagesのビルドが起動しないため、ワークフローが明示的にPagesビルドを依頼します。既存のmainブランチ直下からの公開設定を維持します。取得に失敗したときは以前のデータを保ち、ワークフローを失敗させます。ビルド依頼の失敗は次のWebhookまたは手動実行で再試行します。

## 編集者の操作

1. microCMSの[お知らせ](https://higasui.microcms.io/apis/news)を編集し、公開します。
2. 自動同期とPagesの公開処理を待ち、[お知らせ一覧](https://higashiosakawinds-prog.github.io/higasui/news.html)を再読み込みします。

Webhook受信後、Actionsの待ち時間とPagesへの配信に数分かかる場合があります。既存トップや通常メニューへの導線は追加していません。

## 費用と保守

- 現在の公開リポジトリでは標準の `ubuntu-latest` ランナーを使うGitHub Actionsは無料です。外部の有料サービスや追加サーバーは使いません。microCMSのWebhookからGitHub Actionsを起動するための専用GitHubトークンを使用します。
- 記事を操作したときだけ同期します。記事100件までは各回1回のAPIリクエストです。変更があるときだけPagesの再公開を依頼します。
- microCMSのHobby無料プランの範囲で利用します。データ転送量には上限があり、上限超過時はAPIを利用できなくなります。記事数・画像サイズ・アクセス増加時は[料金プラン](https://microcms.io/pricing)を確認してください。将来の料金体系変更まで無料を保証するものではありません。
- 専用GitHubトークンの有効期限が切れた場合は、microCMSのWebhook設定内のトークンを更新してください。通知失敗時はmicroCMSのWebhook履歴を確認します。microCMSはWebhook送信失敗を自動再試行しないため、手動同期で復旧します。
- リポジトリを非公開に変更すると、GitHub ActionsとPagesの料金・利用条件が変わります。

## 手動実行・失敗の確認

[Actionsの実行履歴](https://github.com/higashiosakawinds-prog/higasui/actions/workflows/sync-news.yml)で結果を確認できます。`Run workflow` でWebhook通知が失敗した場合などに手動で同期でき、`force_rebuild` を有効にするとデータに変更がなくてもPagesを再公開します。

APIキーを変更した場合は、GitHubの `Settings > Secrets and variables > Actions > MICROCMS_API_KEY` を更新してください。microCMS側では公開記事のGET権限だけを維持します。

公式資料：[GitHub Actionsの料金](https://docs.github.com/en/billing/concepts/product-billing/github-actions)、[microCMSのWebhook設定](https://document.microcms.io/manual/webhook-setting)、[Pagesビルド依頼API](https://docs.github.com/en/rest/pages/pages#request-a-github-pages-build)。

## microCMSのWebhook設定

お知らせAPIの `API設定 > Webhook` でGitHub Actions連携を追加します。

- リポジトリのユーザー名：`higashiosakawinds-prog`
- リポジトリ名：`higasui`
- トリガーイベント名：`microcms_news_update`
- 通知対象：コンテンツの公開・更新、公開終了、削除
- GitHubトークン：このリポジトリのrepository_dispatch APIを呼べる専用トークン

GitHubトークンはmicroCMSのWebhook設定だけに保存し、ソースや公開データへ書き込みません。APIキーとは別の認証情報です。GitHubで作成したトークンの値をチャットに送る必要はありません。
