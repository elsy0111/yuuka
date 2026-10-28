import type { FunctionDeclaration } from "@google/generative-ai";
import { SchemaType } from "@google/generative-ai";
export const subscriptionDeclarations: FunctionDeclaration[] = [
  {
    name: "add_subscription",
    description: "サブスク（月払い・年払いの定期支払い）を登録する",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        name: { type: SchemaType.STRING, description: "サービス名" },
        amount: { type: SchemaType.NUMBER, description: "1回あたりの支払額（円）" },
        billing_cycle: {
          type: SchemaType.STRING,
          format: "enum",
          enum: ["monthly", "yearly"],
          description: "monthlyは月払い、yearlyは年払い",
        },
        start_date: {
          type: SchemaType.STRING,
          description: "初回または直近の支払日（YYYY-MM-DD）。省略時は今日",
        },
        description: { type: SchemaType.STRING },
      },
      required: ["name", "amount", "billing_cycle"],
    },
  },
  {
    name: "list_subscriptions",
    description: "登録済みのサブスク一覧と次回支払日、月額・年額の合計を取得する",
    parameters: { type: SchemaType.OBJECT, properties: {} },
  },
  {
    name: "update_subscription",
    description:
      "登録済みのサブスクを変更する。指定しない項目は維持する。list_subscriptionsでIDを確認。",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        id: { type: SchemaType.NUMBER },
        name: { type: SchemaType.STRING },
        amount: { type: SchemaType.NUMBER, description: "1回あたりの支払額（円）" },
        billing_cycle: {
          type: SchemaType.STRING,
          format: "enum",
          enum: ["monthly", "yearly"],
          description: "monthlyは月払い、yearlyは年払い",
        },
        start_date: { type: SchemaType.STRING, description: "YYYY-MM-DD" },
        description: { type: SchemaType.STRING },
      },
      required: ["id"],
    },
  },
  {
    name: "delete_subscription",
    description: "サブスクを削除する。list_subscriptionsでIDを確認。",
    parameters: {
      type: SchemaType.OBJECT,
      properties: { id: { type: SchemaType.NUMBER } },
      required: ["id"],
    },
  },
];
