import { SchemaType } from "@google/generative-ai";
import type { FunctionDeclaration } from "@google/generative-ai";

export const expenseDeclarations: FunctionDeclaration[] = [
  {
    name: "addExpense",
    description:
      "支出を家計簿に記録する。カテゴリは: 食費, 日用品, 交通費, 光熱費, 通信費, 医療費, 娯楽, 衣服, その他。" +
      "【重要】ユーザーが明示していない情報（purchase_source等）を推測・憶測して呼び出すことは禁止。不明な場合は必ずユーザーに確認してから呼び出すこと。" +
      "割引があった場合のみdescriptionに (割引〇〇円引き) を記載。purchase_sourceはユーザーが明示した店舗名・場所のみ使用すること。",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        amount: {
          type: SchemaType.NUMBER,
          description: "金額（円、整数）。割引後の実際に支払った金額",
        },
        category: {
          type: SchemaType.STRING,
          description: "カテゴリ: 食費, 日用品, 交通費, 光熱費, 通信費, 医療費, 娯楽, 衣服, その他",
        },
        description: {
          type: SchemaType.STRING,
          description:
            "支出のメモ・説明（任意）。ユーザーが述べた内容のみ記載。割引がある場合は「(割引〇〇円引き)」を含める",
        },
        date: {
          type: SchemaType.STRING,
          description: "支出日 (YYYY-MM-DD形式、デフォルト今日)",
        },
        purchase_source: {
          type: SchemaType.STRING,
          description:
            "購入した場所・店舗名。ユーザーが明示した名前のみ使用（例: イオン、ファミリーマート、自販機）。不明な場合はユーザーに確認してから呼び出すこと",
        },
      },
      required: ["amount", "category", "purchase_source"],
    },
  },
  {
    name: "saveMemory",
    description:
      "先生から教わった事実・定型情報をDBに記憶として保存する。" +
      "例: 「大学片道バス330円」「家賃は毎月55000円」「ガス代は電気ガス会社から引き落とし」など。" +
      "先生が「〇〇を覚えておいて」「今後〇〇は〇〇として記録して」と言った場合に呼び出す。",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        content: {
          type: SchemaType.STRING,
          description: "記憶する内容（例: '大学片道バス330円'）",
        },
        module: {
          type: SchemaType.STRING,
          description:
            "関連モジュール: expenses（家計）, schedules（予定）, tasks（タスク）, general（汎用）",
        },
      },
      required: ["content"],
    },
  },
  {
    name: "searchMemories",
    description:
      "DBに保存された記憶・知識をキーワード検索する。" +
      "家計記録・予定登録・タスク追加の前に、関連する事実がないか自主的に検索して補完に活用すること。" +
      "例: バスの費用を記録する前に searchMemories('バス') を呼んで定型金額を確認する。",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        query: {
          type: SchemaType.STRING,
          description: "検索キーワード（例: 'バス', '家賃', 'ガス'）",
        },
        module: {
          type: SchemaType.STRING,
          description: "絞り込むモジュール（任意）: expenses, schedules, tasks, general",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "listMemories",
    description:
      "保存されているすべての記憶の一覧を取得する。先生が「何を覚えてる？」と聞いた時などに呼び出す。",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        module: {
          type: SchemaType.STRING,
          description: "絞り込むモジュール（任意）: expenses, schedules, tasks, general",
        },
      },
      required: [],
    },
  },
  {
    name: "deleteMemory",
    description: "保存された記憶をIDで削除する。先生が「〇〇の記憶を消して」と言った時に呼び出す。",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        id: {
          type: SchemaType.NUMBER,
          description: "削除する記憶のID（listMemoriesで確認できる）",
        },
      },
      required: ["id"],
    },
  },
  {
    name: "getMonthlySummary",
    description: "月間の支出サマリーを取得する",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        year: { type: SchemaType.NUMBER, description: "年 (デフォルト今年)" },
        month: { type: SchemaType.NUMBER, description: "月 (デフォルト今月)" },
      },
    },
  },
  {
    name: "getCategoryBreakdown",
    description: "月間のカテゴリ別支出内訳を取得する",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        year: { type: SchemaType.NUMBER, description: "年 (デフォルト今年)" },
        month: { type: SchemaType.NUMBER, description: "月 (デフォルト今月)" },
      },
    },
  },
  {
    name: "listRecentExpenses",
    description: "直近の支出履歴を取得する",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        count: { type: SchemaType.NUMBER, description: "取得件数 (デフォルト10件)" },
      },
    },
  },
];
