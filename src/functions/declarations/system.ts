import { SchemaType } from "@google/generative-ai";
import type { FunctionDeclaration } from "@google/generative-ai";

export const systemDeclarations: FunctionDeclaration[] = [
  {
    name: "readCodeFile",
    description:
      "サンドボックス内のコードファイルの内容を読み込む。パスはプロジェクトルートからの相対パスで指定します。",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        filePath: {
          type: SchemaType.STRING,
          description: "読み込むファイルのパス (例: src/bot.ts)",
        },
      },
      required: ["filePath"],
    },
  },
  {
    name: "writeCodeFile",
    description:
      "サンドボックス内のコードファイルに新しい内容を書き込み、保存する。ディレクトリがない場合は自動作成されます。",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        filePath: {
          type: SchemaType.STRING,
          description: "保存するファイルのパス (例: src/utils/mathHelper.ts)",
        },
        content: {
          type: SchemaType.STRING,
          description: "書き込む完全なソースコードまたはテキスト内容",
        },
      },
      required: ["filePath", "content"],
    },
  },
  {
    name: "listCodeFiles",
    description:
      "サンドボックス内のファイルを再帰的に一覧取得する。特定のサブディレクトリのみ指定することも可能です。node_modules等は自動的に除外されます。",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        dirPath: {
          type: SchemaType.STRING,
          description: "探索する基準のディレクトリパス (省略時はプロジェクトルート)",
        },
      },
    },
  },
  {
    name: "searchCodeFiles",
    description:
      "サンドボックス内の全ファイルからキーワード（テキスト）を検索する（簡易grep検索）。",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        query: { type: SchemaType.STRING, description: "検索したい文字列・キーワード" },
        dirPath: {
          type: SchemaType.STRING,
          description: "検索対象の基準ディレクトリパス (省略時はプロジェクトルート)",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "verifyCodeChanges",
    description:
      "ホワイトリストに登録された安全なシェルコマンドを実行して、コードのビルドやテスト検証を行う。",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        command: {
          type: SchemaType.STRING,
          description:
            "実行するコマンド (許可: 'npm run build', 'npx tsc', 'npm test', 'git status', 'git diff', 'git diff --cached', 'git log -n 5', および安全な 'curl' コマンド。シェル制御記号を含むものは不可)",
        },
      },
      required: ["command"],
    },
  },
  {
    name: "fetchDynamicPage",
    description:
      "JavaScriptで動的に生成されるSPAなどのウェブページを開き、不要なタグ（スクリプト、スタイル、ナビゲーション、フッター、画像、メタデータ等）を完全に除去して超軽量化したHTMLを取得します（ヘッドレスブラウザを使用）。これにより、トークン消費を最小限に抑えつつ構造化データを正確に把握できます。",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        url: { type: SchemaType.STRING, description: "アクセスするウェブページのURL" },
      },
      required: ["url"],
    },
  },
  {
    name: "takePageScreenshot",
    description:
      "指定されたURLのウェブページ全体のスクリーンショットを撮影し、画像としてサーバーに保存します（ヘッドレスブラウザを使用）。",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        url: {
          type: SchemaType.STRING,
          description: "スクリーンショットを撮影するウェブページのURL",
        },
      },
      required: ["url"],
    },
  },
  {
    name: "searchWeb",
    description:
      "インターネットでキーワード検索を行い、関連するウェブページのタイトル、URL、説明（スニペット）の一覧を取得します。現在の天気、最新ニュース、事実確認年など、リアルタイムの情報を取得する最初のステップとして非常に有効です。必要に応じて、得られたURLから fetchDynamicPage を使って詳細なページ情報をさらに取得・巡回（クロール）し、複数回検索や巡回を繰り返して情報を比較精査することを推奨します。",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        query: {
          type: SchemaType.STRING,
          description:
            "検索に入力するキーワード（例: '東京 明日の天気', 'ブルーアーカイブ 最新ニュース'）",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "browserInteractiveOpen",
    description:
      "インタラクティブブラウザの永続セッションを開始または再利用し、指定されたURLを開きます。ログインや操作を行いたい特定のWebページの最初の手順として呼び出します。",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        url: { type: SchemaType.STRING, description: "アクセスするウェブページのURL" },
      },
      required: ["url"],
    },
  },
  {
    name: "browserInteractiveClick",
    description:
      "インタラクティブブラウザのアクティブなページ上で、指定された要素をクリックします。画面上の操作可能な要素には [ID: 数値] または [Button ID: 数値] のように一意の数値IDがマークダウン内に付与されているため、最優先でその数値ID（例: '3'）を selector 引数に直接指定してください。CSSセレクタやテキストでの指定も可能ですが、数値IDが最も確実で推奨されます。",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        selector: {
          type: SchemaType.STRING,
          description:
            "クリック対象の一意の数値ID（最推奨、例: '3'）、またはCSSセレクタ/要素内のテキスト",
        },
      },
      required: ["selector"],
    },
  },
  {
    name: "browserInteractiveType",
    description:
      "インタラクティブブラウザのアクティブなページ上の指定された入力フィールドにテキストを入力します。画面上の入力フィールドには [Input (text) ID: 数値] のように一意の数値IDがマークダウン内に付与されているため、最優先でその数値ID（例: '2'）を selector 引数に直接指定してください。CSSセレクタやプレースホルダー名での指定も可能ですが、数値IDが最も確実で推奨されます。",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        selector: {
          type: SchemaType.STRING,
          description:
            "入力対象の一意の数値ID（最推奨、例: '2'）、またはCSSセレクタ/プレースホルダー名/name属性の一部",
        },
        text: { type: SchemaType.STRING, description: "入力するテキスト内容" },
      },
      required: ["selector", "text"],
    },
  },
  {
    name: "browserInteractiveWait",
    description:
      "インタラクティブブラウザのアクティブなページ上で、指定された時間（ミリ秒）待機するか、特定のCSSセレクタを持つ要素がDOM上に出現するまで待機します。",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        selector: { type: SchemaType.STRING, description: "出現を待つCSSセレクタ（任意）" },
        timeoutMs: {
          type: SchemaType.NUMBER,
          description: "待機時間（ミリ秒、デフォルト5000ms、任意）",
        },
      },
    },
  },
  {
    name: "browserInteractiveStatus",
    description:
      "現在のインタラクティブブラウザのアクティブな状態（現在のURL、タイトル、最新スクリーンショット画像パス、およびクリーンアップした最新マークダウンコンテンツ）を取得します。クリックやテキスト入力を行った後、画面の反応や遷移結果を確認するために必ず呼び出してください。",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {},
    },
  },
  {
    name: "browserInteractiveClose",
    description:
      "インタラクティブブラウザの永続セッションを終了し、ブラウザを完全にクローズしてリソースを解放します。一連の操作代行がすべて完了した際に最後に呼び出します。",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {},
    },
  },
  {
    name: "checkoutBranch",
    description: "Gitの新規開発用ブランチを作成、または既存ブランチへ切り替える。",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        branchName: {
          type: SchemaType.STRING,
          description: "作成または切り替えるブランチ名 (例: feature/add-new-command)",
        },
      },
      required: ["branchName"],
    },
  },
  {
    name: "commitLocalChanges",
    description: "現在のすべてのコード変更（差分）をGitステージに追加し、ローカルにコミットする。",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        commitMessage: {
          type: SchemaType.STRING,
          description: "コミットメッセージ (例: feat: 新しいサービスを追加)",
        },
      },
      required: ["commitMessage"],
    },
  },
  {
    name: "mergeBranch",
    description:
      "指定されたブランチを指定したターゲットブランチ（通常は 'main'）にローカルでマージする。",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        branchName: {
          type: SchemaType.STRING,
          description: "マージするブランチ名 (例: feature/add-new-command)",
        },
        targetBranch: {
          type: SchemaType.STRING,
          description: "マージ先となるターゲットブランチ名 (デフォルト: main)",
        },
      },
      required: ["branchName"],
    },
  },
  {
    name: "pushChanges",
    description:
      "ローカルブランチの変更をリモートリポジトリ (origin) にプッシュ（保存）する（ローカルのSSH/認証情報を使用します）。",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        branchName: {
          type: SchemaType.STRING,
          description: "プッシュするブランチ名 (例: feature/add-new-command)",
        },
      },
      required: ["branchName"],
    },
  },
  {
    name: "getCredential",
    description:
      "指定されたサービス（例: 'github', 'millennium-portal'）のユーザー名とパスワードを安全にロードして取得します。Webサイトへの自動ログインが必要な場合にのみ呼び出してください。取得したパスワードそのものを先生（ユーザー）とのチャットにそのまま出力してはいけません。",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        service_name: {
          type: SchemaType.STRING,
          description: "サービスの名前（小文字の英数字、ハイフン推奨。例: 'github'）",
        },
      },
      required: ["service_name"],
    },
  },
  {
    name: "listCredentials",
    description:
      "現在登録されている資格情報のインデックス（サービス名とユーザー名）の一覧を取得します。どのようなログイン情報がすでに登録されているか、サービス名を確認したい場合にのみ呼び出してください。パスワードはここには含まれません。",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {},
    },
  },
  {
    name: "reloadDynamicFunctions",
    description:
      "サンドボックス内でビルドされた動的プラグイン関数を再読み込み（ホットリロード）します。新しい関数を実装して 'npm run build' または 'npx tsc' でビルドした後にこの関数を呼び出すことで、即座に新しいツールが利用可能になります。",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {},
    },
  },
  {
    name: "savePlaybook",
    description:
      "AIが行った一連の操作手順（Playbook）に名前やキーワードを付与してMarkdownファイルとして永続的に保存（記憶）します。ユーザーから「今の操作手順を覚えておいて」「『〜〜』という名前で保存して」と指示された際に呼び出します。",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        name: {
          type: SchemaType.STRING,
          description: "手順書の英数字ファイル名 (例: 'example_login', 'tadaden_invoice')",
        },
        title: {
          type: SchemaType.STRING,
          description:
            "手順書の分かりやすい日本語タイトル (例: 'サンプルサイトのログインと請求書取得')",
        },
        keywords: {
          type: SchemaType.ARRAY,
          items: { type: SchemaType.STRING },
          description:
            "次回検索時にヒットさせたい関連キーワードのリスト (例: ['サンプル', 'ログイン', '請求書', '電気代'])",
        },
        description: {
          type: SchemaType.STRING,
          description: "この手順書が何を行うものかの簡単な説明",
        },
        steps: {
          type: SchemaType.STRING,
          description:
            "Markdown形式の具体的な操作手順の各ステップ記述。使用する具体的なAPIツール名や判定ロジックを含めると効果的です。",
        },
      },
      required: ["name", "title", "keywords", "description", "steps"],
    },
  },
  {
    name: "findPlaybooks",
    description:
      "登録されているすべての自動化手順書（Playbook）の一覧、またはキーワード部分一致に関連する手順書とその中身の詳細を検索して取得します。ユーザーからブラウザ自動化や何らかの操作自動化を指示された際、すでに対応する手順書が登録されていないか確認する目的で最初に呼び出します。",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        query: {
          type: SchemaType.STRING,
          description:
            "検索したいキーワードや部分一致の文字列 (例: 'ログイン', 'でんき')。省略した場合はすべての手順書一覧を返します。",
        },
      },
    },
  },
];
