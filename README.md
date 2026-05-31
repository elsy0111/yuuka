# Yuuka - Discord Gemini Secretary Bot & Admin Dashboard

---

## ✨ 主な機能（できること一覧）

『Yuuka』は、Google の最先端 AI である **Gemini API** を活用した、Discord 秘書ボットと Web 管理者ダッシュボードのハイブリッドシステムです。『ブルーアーカイブ』に登場するセミナー会計「**早瀬ユウカ**」が、あなたの秘書としてタスクやスケジュール、家計簿を徹底的に管理・サポートしてくれます。

この README は利用者向け説明だけでなく、実装・運用時の仕様書として扱います。挙動を変える場合は、コード変更と同じコミットで該当仕様も更新してください。

### 🤖 Discord 秘書 Bot 機能

*   **📐 早瀬ユウカによる親身なロールプレイ**
    *   ミレニアムサイエンススクールのセミナー会計「早瀬ユウカ」としての対話。
    *   あなたの困りごとに呆れつつも、論理的かつ親身になって解決策を提示し、実務的に優しくサポートしてくれます（小言や説教はほどほどに調整されています）。
*   **📋 タスク管理 (ToDo)**
    *   タスクの追加・一覧表示・完了・削除を自然な会話から行えます。
    *   期限日（`YYYY-MM-DD`）や優先度（低・中・高）も賢く認識して管理します。
*   **📅 予定管理 (スケジュール / Google カレンダー同期)**
    *   予定の登録・一覧表示・削除を会話を通じて実行可能。
    *   **Google カレンダーとの双方向同期**: 登録された予定は Google カレンダーに自動で同期されます。
    *   **ローカルタイマー・簡易リマインダー**: カレンダーを汚したくない「n分後に教えて」といったタイマーは、カレンダーに同期せず Discord 内で時間通りにメンション通知してくれます。
*   **💰 家計管理 (支出の記録・分析)**
    *   「〇〇に1200円使った」と話しかけるだけで、金額やカテゴリ（食費、日用品、娯楽など9種類）を自動判定して家計簿に記録。
    *   月間の支出サマリーやカテゴリ別支出内訳、直近履歴をチャットから即座に教えてくれます。
*   **📷 レシート解析 (OCR & 自動家計簿登録)**
    *   Discord にレシートの画像を貼り付ける（または返信する）だけで、Gemini が画像を解析。
    *   購入した商品を適切なカテゴリに自動分類し、家計簿へ自動的に一括登録してくれます。
*   **🛠️ 自己開発・Git連携 (エージェント自己拡張用)**
    *   AIエージェントが自らコードを読み書きし、Git ブランチの作成、コミット、マージ、プッシュなどを行って自己拡張するための強力なツール（Function Calling）を内蔵しています。

### Discord 応答仕様

Yuuka の Discord Bot は、以下の順序で受信メッセージを判定します。

*   Bot 自身を含む Bot 投稿は無視します。
*   デフォルト Bot は、Web 管理画面で登録済みの Discord ユーザーからのメッセージだけに応答します。未登録ユーザーの投稿には、メンションされても返信・リアクションしません。
*   ユーザー別の独自 Bot が起動している場合、デフォルト Bot はそのユーザーへの応答をスキップし、独自 Bot 側だけが処理します。
*   独自 Bot は、その Bot の所有者として紐づいたユーザーの投稿だけに応答します。
*   登録済みユーザーからの投稿であれば、サーバー内の通常メッセージでもメンションなしで応答します。DM と Bot への返信も同じ処理経路です。
*   返信メッセージの場合、返信先の本文を文脈として Gemini に渡します。返信先に画像が添付されていて、現在の投稿に画像がない場合は、返信先画像もレシート解析対象になります。
*   メッセージ処理開始時に Unicode 絵文字リアクションを非同期で付けます。`GEMINI_API_KEY` がない場合、絵文字選択は実行されません。
*   リアクションには Discord 側の `Add Reactions` 権限が必要です。返信先取得には `Read Message History` 権限が必要です。
*   Discord Developer Portal では、対象 Bot の `Message Content Intent` を有効化してください。

### 🌐 Web 管理者ダッシュボード

ブラウザからアクセスして、全てのデータを一元管理・視覚化できるプレミアムな管理者ダッシュボードです。

*   **🔒 セキュアな認証システム**
    *   Discord ユーザー ID とパスワードによるログイン。
    *   新規アカウント作成には `config.yaml` の `INVITE_CODES` に設定された招待コードが必要です。招待コードは1回使い切りです。
    *   IPごとのログイン試行レート制限（5回失敗で15分間ロックアウト）、HttpOnly セッションクッキー、Bearer session token により、外部からの不正アクセスを防ぎます。
*   **📊 データ統計 & トレンドの視覚化**
    *   タスクの総数、未完了タスク数、優先度別の未完了タスク数を一目で把握。
    *   直近5日間の「予定登録数」および「支出額」の推移を視覚的なグラフ用データとして集計・表示します。
*   **🌐 Google カレンダー連携の動的設定**
    *   同期対象の Google カレンダーIDを Web 画面上からいつでも動的に追加・削除できます（設定ファイル `config.yaml` に自動保存されます）。
*   **👥 マルチユーザー切り替え**
    *   データベースに登録されている Discord ユーザー等のプロファイルを簡単に切り替えて、それぞれのデータを個別に確認・編集できます。
*   **⚙️ 直感的なデータ操作**
    *   タスク、予定、支出データの追加、完了、削除をダッシュボード上からブラウザ操作で素早く行えます。
    *   Web 画面から直接レシート画像をアップロードし、Gemini による自動解析・家計簿登録を実行することも可能です。

### Web/PWA 仕様

*   静的ファイルは `src/public/` から配信します。
*   ログイン/登録後、サーバーは `__Host-yuuka-session` Cookie と session token を返します。ブラウザ側は session token を `localStorage` に保存し、同一オリジンの `/api/` リクエストへ `Authorization: Bearer ...` を自動付与します。
*   Service Worker は `/sw.js` として登録され、`/`, CSS, JS, manifest, icons, `materials/yuka.webp` をプリキャッシュします。
*   GET かつ同一オリジンかつ `/api/` を含まないリクエストだけをキャッシュ対象にします。API、認証、外部リクエストはキャッシュしません。
*   ネットワーク取得時の `Response` は、ブラウザへ返す前に同期的に `clone()` してから Cache Storage に保存します。`Response body is already used` を避けるため、この順序は変えないでください。
*   Google OAuth の「Google 連携認証を開始する」ボタンは、カード幅いっぱいに表示します。

---

## 🚀 セットアップ手順

### 1. リポジトリのクローンと依存関係のインストール

このプロジェクトは **Yarn 4** を標準の package manager とします。`package.json` の `packageManager`、`.yarn/releases/yarn-4.15.0.cjs`、`yarn.lock` をリポジトリに含め、`pnpm-lock.yaml` は使いません。

プロジェクトディレクトリに移動し、依存パッケージをインストールします。

```bash
yarn install --immutable
```

### 2. 設定ファイルの作成

テンプレートファイル `example.yaml` をコピーして、`config.yaml` を作成します。

```bash
cp example.yaml config.yaml
```

`config.yaml` を開き、以下の必要な認証情報・トークンを設定してください。

#### 主な設定項目:
*   **`DISCORD_TOKEN`**: [Discord Developer Portal](https://discord.com/developers/applications) で取得したBotトークン（必須）。
*   **`DB_PATH`**: SQLite データベースファイルの保存パス（デフォルト: `./data/yuuka.db`）。
*   **`REDIS_URL`**: インメモリデータキャッシュ用の Redis 接続 URL。
*   **`REMINDER_CRON`**: リマインダーをチェックする間隔（cron形式、デフォルトは毎分 `* * * * *`）。
*   **`PORT` / `HOST`**: 管理画面サーバーがリスンするポートとホスト名設定。
*   **`ADMIN_DISCORD_ID`**: 招待コードを管理できる Discord ユーザーID。このIDでログインしたWeb画面でのみ、招待コードの一覧表示・発行・削除ができます。
*   **`INVITE_CODES`**: 新規ユーザー登録時に必要となる招待コードのリスト。
*   **`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`**: システム全体で共有するデフォルトの Google OAuth2 認証情報。
*   **`BASE_URL`**: Google OAuth 認証などのリダイレクト先となる、外部からアクセス可能な HTTPS ベース URL。

※ ユーザー個別の Gemini API キーや Google OAuth 設定、連携カレンダー ID 等は、システム起動後に管理画面ダッシュボードから安全に設定・管理できます。

### 3. Discord Bot 側の必須設定

Discord Developer Portal とサーバー招待時の設定も必要です。

*   Bot Token を `DISCORD_TOKEN` に設定します。
*   Privileged Gateway Intents で `Message Content Intent` を有効化します。
*   サーバーで少なくとも `View Channel`, `Send Messages`, `Read Message History`, `Add Reactions` を付与します。
*   登録済みユーザーだけが応答対象です。初回利用者は Web 管理画面でアカウント登録し、Discord ユーザー ID を `users.discord_id` として保持する必要があります。

### 4. Runtime prerequisites

ローカル開発・VPS 運用では以下が必要です。

*   Node.js 22 系。CI も Node.js 22 で動作確認します。
*   Yarn 4。Corepack が使える環境では `corepack enable` 後に `yarn install --immutable` を使います。
*   Rust/Cargo。`yarn build` は `src/rust_crawler` を release build し、生成された `yuuka-crawler` を `dist/bin/` にコピーします。
*   SQLite ネイティブ依存。`better-sqlite3` を利用します。
*   Redis。`REDIS_URL` に接続できない場合は SQLite の永続化を主に使いますが、チャット履歴キャッシュ等の高速化には Redis を使います。
*   Puppeteer/Chromium 実行環境。VPS でブラウザ操作機能を使う場合は、Chromium の実行に必要な OS パッケージも用意してください。
*   Google OAuth を使う場合、`BASE_URL` は Google から到達可能な HTTPS URL にしてください。

---

## 🏃 起動と開発

### 開発モード (ホットリロード有効)
コードの変更を監視し、自動でサーバーが再起動します。

```bash
yarn dev
```

### プロダクションビルド & 起動
TypeScript のコンパイルを行い、本番環境用として最適化されたビルドを起動します。

```bash
# コンパイル (dist/ 以下に出力されます)
yarn build

# 本番サーバーの起動
yarn start
```

起動後、ブラウザで `http://localhost:7854` (または `config.yaml` で設定したポート/ホスト) にアクセスすると、管理者用ダッシュボードが開きます。登録済みの Discord ユーザー ID とパスワードでログインしてください。初回は招待コードを使ってアカウントを作成します。

### 品質チェック

Formatter/Linter は **Biome** です。CI と同じチェックは以下です。

```bash
yarn format:check
yarn lint
yarn tsc --noEmit
```

`yarn lint` は `--error-on-warnings` を付けて実行されます。Biome の recommended lint で warning が出ても CI は落ちます。意図的に緩める場合は、README と `biome.json` に理由を書いてください。

自動整形は以下です。

```bash
yarn format
```

---

## CI 仕様

GitHub Actions は `.github/workflows/checks.yml` で定義します。

*   `main` への push と pull request で実行します。
*   Node.js 22 を使います。
*   Corepack を有効化し、Yarn 4 で `yarn install --immutable` を実行します。
*   `yarn format:check` と `yarn lint` を実行します。
*   CI では Rust crawler の release build や本番起動までは実行しません。必要になったら別 job として追加してください。

---

## ⚙️ systemd による常時稼働 (Linux環境)

同梱されている `yuuka.service` テンプレートを利用して、Linuxサーバー上でサービスとしてデーモン化できます。

1.  `yuuka.service` ファイルをお使いの環境のパス (例: `WorkingDirectory` や `ExecStart` のNode.jsパスなど) に合わせて編集します。
2.  サービスファイルを配置します：
    ```bash
    sudo cp yuuka.service /etc/systemd/system/yuuka.service
    ```
3.  デーモンをリロードしてサービスを有効化・起動します：
    ```bash
    sudo systemctl daemon-reload
    sudo systemctl enable yuuka.service
    sudo systemctl start yuuka.service
    ```
4.  ステータスの確認：
    ```bash
    sudo systemctl status yuuka.service
    ```

### VPS 運用メモ

本番運用では、`node dist/index.js` を手動で直接起動し続けるより、systemd 管理に寄せてください。手動起動の Node プロセスは stdout/stderr が shell や socket に接続され、`journalctl -u yuuka` で現在ログを追えないことがあります。

正常起動時のログ目安:

```text
🚀 Yuuka 起動中...
✅ データベースマイグレーション完了
✅ Redis への接続が完了しました。インメモリDBキャッシュを有効にします。
🌐 Yuuka 管理画面サーバー起動完了: http://127.0.0.1:7854
✅ yuuka#6022 としてログインしました
⏰ リマインダーサービス開始
✨ Yuuka が起動しました！
```

反応しない場合の確認:

```bash
ps -axo pid,etime,command | grep -Ei 'node|tsx|yuuka|dist/index|src/index' | grep -v grep
systemctl status yuuka --no-pager -l
journalctl -u yuuka -n 120 --no-pager
ss -ltnp | grep ':7854'
git -C /home/elsy/yuuka rev-parse --short HEAD
```

`yuuka.service` が inactive なのに `node /home/elsy/yuuka/dist/index.js` が動いている場合、手動起動プロセスが残っています。ポート 7854 の競合やログ欠落の原因になるため、プロセスを止めて systemd で起動し直してください。

```bash
pkill -f '/home/elsy/yuuka/dist/index.js'
sudo systemctl daemon-reload
sudo systemctl enable --now yuuka
sudo systemctl status yuuka --no-pager -l
journalctl -u yuuka -n 80 --no-pager
```

登録ユーザーの確認:

```bash
node --input-type=module - <<'NODE'
import Database from 'better-sqlite3';
const db = new Database('/home/elsy/yuuka/data/yuuka.db', { readonly: true });
console.log(db.prepare('select discord_id, username from users order by created_at desc').all());
NODE
```

---

## 📄 免責事項とライセンス（ファンメイド作品）

### ⚠️ 二次創作に関する免責事項
本プロジェクトは、株式会社YostarおよびNexon Games社が提供するスマートフォン向けゲーム『ブルーアーカイブ -Blue Archive-』の非公式ファンメイド作品です。
使用されているキャラクター「早瀬ユウカ」、意匠、世界観等の著作権およびその他一切の知的財産権は、すべて原著作者（Nexon Games / Yostar等）に帰属します。
本プロジェクトはファンによる非営利目的の創作物であり、公式の「ブルーアーカイブ 二次創作ガイドライン」を尊重し、それに準拠する形で公開されています。

### ⚖️ ソフトウェアライセンス
このプロジェクトのプログラムコード自体は [MIT License](LICENSE) の下で公開されています。
