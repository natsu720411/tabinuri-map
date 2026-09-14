# AI旅行計画の設定

## 保存とAI生成
「計画を保存」で成功トーストを2.8秒表示します。保存に失敗した場合は成功表示を出さず入力を維持します。最終保存時刻は保存済み計画のupdatedAtから表示します。

AIは行き先・出発日・帰宅日（1〜14日間）が必要です。予定を生成しても保存しません。「この旅程を使う」で入力中の予定だけを置き換え、最後に「計画を保存」で確定します。元の予定を残したい場合はプレビューでキャンセルしてください。生成中もキャンセルできます。

## ローカルで試す（Node.js 22以上）
1. プロジェクト直下の `.env.example` を `.env.local` としてコピーします。
2. `.env.local` の `GEMINI_API_KEY=` の右側にGoogle AI Studioで発行したキーを入力します。チャットやGitHubへ貼らないでください。
3. ターミナル1で `npm run dev:api` を実行します（127.0.0.1:3001）。
4. ターミナル2で `npm run dev` を実行し、表示されたローカルURLを開きます。
5. 「旅の計画」で行き先・日程を入力し「✨ AIで旅程を作る」を押します。

Viteの `/api` リクエストはローカルAPIへ転送します。APIだけを停止した場合はエラー表示になりますが、通常の旅行計画保存は使えます。環境変数変更後はAPIサーバーを再起動してください。`npm run build` はビルド確認専用で、Geminiへの接続確認は行いません。

## Vercelに公開するとき（今回の作業では公開しません）
プロジェクト設定のEnvironment Variablesへ `GEMINI_API_KEY` を登録します。必要な環境（Production / Preview）を選び、反映には再デプロイが必要です。ViteプロジェクトのBuild Commandは `npm run build`、Output Directoryは `dist`、Node.jsは22以上。`api/generate-trip.js` はVercel Functionとして動作します。

`GEMINI_MODEL` は任意です。空欄なら `gemini-2.5-flash` を使います。変更する場合はGemini Developer APIで利用可能なテキスト・構造化出力対応のモデルIDを設定してください。APIキーやモデルを `VITE_` 環境変数にしないでください。

## データと運用
既存localStorageキーと旅行計画のversion 1形式は維持します。AIは希望条件だけをサーバー経由でGoogleへ送り、写真・他の記録・保存済みスケジュールは送りません。アプリのAPIにはリクエスト本文やキーのログ出力、サーバーへの永続保存処理はありません。Google側での取り扱いは利用するGemini APIの規約・プランをご確認ください。

APIは入力サイズ、日数、出力形式、タイムアウトを検証し、インスタンスごとに同一IPから1分5回までに制限します。この制限は全サーバー共通ではなく、認証もありません。一般公開時はVercel側で `/api/generate-trip` のレート制限とGoogle側の利用上限を設定してください。生成内容の正確性は保証されないため、公式の営業時間・料金・営業日を確認してください。

GitHubに送らないもの：本物のAPIキー、`.env`、`.env.local`、その他の `.env.*`、`.vercel/`。値が空欄の `.env.example` は共有可能です。

## 確認
`npm run test:trip-ai` で入力検証、Gemini応答検証、API異常系を実APIを呼ばず確認できます。

公式資料：
- https://ai.google.dev/api/generate-content
- https://ai.google.dev/gemini-api/docs/generate-content/structured-output
- https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash
- https://vercel.com/docs/functions/runtimes/node-js
