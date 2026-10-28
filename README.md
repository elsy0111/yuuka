# Yuuka

『ブルーアーカイブ』のセミナー会計・早瀬ユウカを秘書に据えた、Discord ボットと Web 管理画面です。Gemini API で会話しながら、家計や予定の記録を引き受けます。

## できること

- Discord で話しかけるだけで、支出・働いた時間・サブスク・予定・タスクを記録し、確認する
- レシート画像から支出をまとめて登録する
- サブスク（月払い・年払い）を支払日に家計簿へ自動で記録する
- 予定を Google カレンダーと同期し、自分のデータを Google Drive にバックアップする
- Web ページの閲覧や操作を代わりに行う
- Web 管理画面（PWA）で記録を閲覧・編集し、各種設定を行う

## 必要なもの

- Node.js 22 と Yarn 4
- Rust（ビルド時に同梱のクローラーをコンパイルする）
- Redis（任意。なくても SQLite だけで動く）
- Chromium が動く環境（ブラウザ操作を使う場合）

## セットアップ

```bash
corepack enable
yarn install --immutable
cp example.yaml config.yaml
```

`config.yaml` に Discord のボットトークンなどを設定します。各項目の意味は `example.yaml` に書いてあります。Discord Developer Portal では、ボットの Message Content Intent を有効にしてください。

## 起動

```bash
yarn dev                  # 開発用（変更を監視して再起動）
yarn build && yarn start  # 本番用
```

`http://localhost:7854` で管理画面が開きます。初回は `config.yaml` の招待コードでアカウントを作り、Discord のユーザー ID でログインします。ボットは、ここで登録したユーザーにだけ応答します。

## 開発

```bash
yarn format:check
yarn lint
yarn typecheck
yarn test
```

## デプロイ

`main` に push すると、GitHub Actions がチェックとビルドを行い、VPS 上の PM2 プロセスを更新します。必要な Secrets は `.github/workflows/deploy.yml` を見て、GitHub の `production` Environment に設定してください。

サーバー上で手動で更新するときは `scripts/update.sh` を実行します。

## 免責事項

本プロジェクトは、株式会社 Yostar および Nexon Games 社のゲーム『ブルーアーカイブ -Blue Archive-』の非公式ファンメイド作品です。キャラクター「早瀬ユウカ」、意匠、世界観などの著作権その他の知的財産権は、すべて原著作者に帰属します。ファンによる非営利の創作物として、公式の「ブルーアーカイブ 二次創作ガイドライン」に準拠して公開しています。

## ライセンス

プログラムコードは [MIT License](LICENSE) で公開しています。
