import { SchemaType } from "@google/generative-ai";
import type { FunctionDeclaration } from "@google/generative-ai";

export const scheduleDeclarations: FunctionDeclaration[] = [
  {
    name: "addSchedule",
    description: "新しい予定・スケジュールを登録する",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        title: { type: SchemaType.STRING, description: "予定のタイトル" },
        start_at: {
          type: SchemaType.STRING,
          description: "開始日時 (ISO 8601形式、例: 2026-05-28T10:00:00)",
        },
        end_at: {
          type: SchemaType.STRING,
          description: "終了日時 (ISO 8601形式、任意)",
        },
        remind_before_minutes: {
          type: SchemaType.NUMBER,
          description: "何分前にリマインドするか (デフォルト30分)",
        },
        description: { type: SchemaType.STRING, description: "予定の詳細（任意）" },
        calendar_id: {
          type: SchemaType.STRING,
          description: "登録先GoogleカレンダーのID（任意。目的に最も適したカレンダーIDを選択し設定します）",
        },
        local_only: {
          type: SchemaType.BOOLEAN,
          description: "Googleカレンダーに同期せず、ボットのローカル通知のみに留めるか（簡易タイマーやリマインダーならtrueを設定します）",
        },
      },
      required: ["title", "start_at"],
    },
  },
  {
    name: "listSchedules",
    description: "今後の予定一覧を取得する",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        days: {
          type: SchemaType.NUMBER,
          description: "何日先までの予定を表示するか (デフォルト7日)",
        },
      },
    },
  },
  {
    name: "deleteSchedule",
    description: "予定を削除する",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        schedule_id: { type: SchemaType.NUMBER, description: "削除する予定のID" },
      },
      required: ["schedule_id"],
    },
  },
];
