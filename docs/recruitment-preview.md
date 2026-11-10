# パート募集のプレビュー

既存のトップページ・通常メニュー・サイトマップを変えずに、`recruitment-preview.html` を直接開いて募集表示を確認します。検索登録を抑える `noindex, nofollow` を付けています。認証による閲覧制限ではありません。

## 情報の管理先

- 団員総数：既存トップと同じ、管理用Supabase `site_settings.current_members` を閲覧時に取得。
- パート別現在人数：ポータル用Supabase `profiles` の `part` と `category` をDB内で集計する読み取りRPC `recruitment_member_counts` から取得。
- パート別目標人数・募集強化・コメント：microCMSのリスト形式API `recruitment`。各パートを1レコードとして編集し、追加API枠は全体で1つ。
- 表示：ブラウザでパートIDを照合し、`max(目標人数 - 現在人数, 0)` を計算。

パート別集計は `category` が `regular` または `regular_student` の団員に限ります。準団員・スタッフ・賛助・休団中は含みません。団員総数の既存集計は変更しないため、パート別人数の合計と一致するとは限りません。

目標人数の初期値は**確認用の仮値**です。「サンプル人数で試す」を押すと、現在人数にもサンプル値を使って募集計算を確認できます。実データ表示と明確に区別し、初期表示は実データ用の接続を使います。公開済みの正式な募集方針を示すものではなく、ページ上のプレビュー表示も残します。目標人数は「追加で欲しい人数」ではなく「最終的な目標人数」を入力してください。

## 編集・反映

1. microCMSの `募集パート（プレビュー）` で、対象パートの目標人数・募集強化・コメントを編集して公開。
2. Webhookで既存のGitHub Actionsを起動し、`scripts/sync-recruitment.mjs` が公開データだけを `recruitment-content.js` へ同期。
3. 変更時に生成物をコミットし、GitHub Pagesの再公開を依頼。
4. プレビューを再読み込み。Supabaseの現在人数は閲覧時に取得するので、団員情報の更新にはmicroCMS再公開が不要。

新しいパートを追加するときは、共通パートIDの定義、CMSの選択肢、集計RPCを合わせて更新します。選択肢の日本語名を自由入力する方式にはしていません。

## 表示と取得失敗

- 現在人数が目標未満：あと○名を募集。募集強化がONなら強化表示。
- 目標到達・超過、または目標0：募集休止。募集強化がONでも不足していなければ強化しません。
- 現在人数の取得失敗・不完全な集計：人数と募集人数を `—`、状況を「確認中」と表示。0人へ置き換えず、古い人数で募集判定もしません。
- microCMSの取得失敗や不正な目標値：同期を失敗させ、直前の公開用ファイルを維持。
- microCMS側で公開済みの募集レコードが0件：空の一覧へ同期。

## Supabaseの設定

[`supabase/migrations/202611100001_recruitment_counts.sql`](../supabase/migrations/202611100001_recruitment_counts.sql) を**ポータル側**のプロジェクト `iaqbkriorspsjldodhjy` へ適用します。管理用の別プロジェクトには適用しません。

個人名・メール・IDなどのプロフィール自体を公開ページへ渡しません。関数は引数なし、固定のパート集合・固定の会員区分でDB内集計し、パートIDと人数だけを返します。既存テーブル・団員データ・RLSポリシーは変更しません。未対応のパートIDが在籍中の団員に存在すると、利用可能な集計として返さず確認待ちにします。

既存のGitHub Secretを利用した構造確認はユーザーの明示承認を得て実行しましたが、ポータルプロジェクトへのアクセスが403で拒否されました。団員レコード・集計人数は取得していません。確認用ワークフローは削除し、上記SQLをデータベース管理者に適用してもらう構成としています。現時点ではこのSQLは未適用で、実人数の表示は設定待ちです。

## ローカルで確認

```sh
node --env-file=.env scripts/sync-recruitment.mjs
node scripts/serve-demo.mjs
node --test tests/recruitment.test.mjs tests/sync-news.test.mjs
```

`http://127.0.0.1:4173/recruitment-preview.html` を開きます。公開用（anon）キーは既存サイトと同じものだけを使用します。microCMSキーはローカルの `.env` とGitHub Actions Secretsに保存し、配信するJavaScriptに含めません。

CMS項目の定義は [`microcms/recruitment-schema.json`](../microcms/recruitment-schema.json)、初回登録用の確認データは [`microcms/recruitment-import.csv`](../microcms/recruitment-import.csv) にあります。CSVインポート時はWebhookが送信されないため、初回はActionsを手動実行します。
