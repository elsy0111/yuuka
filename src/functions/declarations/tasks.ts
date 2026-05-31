import type { FunctionDeclaration } from "@google/generative-ai";
import { SchemaType } from "@google/generative-ai";

export const taskDeclarations: FunctionDeclaration[] = [
  {
    name: "addTask",
    description: "新しいタスク（ToDo）を追加する",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        title: { type: SchemaType.STRING, description: "タスクのタイトル" },
        description: { type: SchemaType.STRING, description: "タスクの詳細説明（任意）" },
        due_date: {
          type: SchemaType.STRING,
          description: "期限日 (YYYY-MM-DD形式、任意)",
        },
        priority: {
          type: SchemaType.NUMBER,
          description: "優先度 (0=低, 1=中, 2=高、デフォルト0)",
        },
      },
      required: ["title"],
    },
  },
  {
    name: "listTasks",
    description: "タスク一覧を取得する",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        status: {
          type: SchemaType.STRING,
          description:
            "フィルタするステータス (pending=未完了, done=完了, all=全て、デフォルトpending)",
        },
      },
    },
  },
  {
    name: "completeTask",
    description: "タスクを完了にする",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        task_id: { type: SchemaType.NUMBER, description: "完了にするタスクのID" },
      },
      required: ["task_id"],
    },
  },
  {
    name: "reopenTask",
    description: "完了済みのタスクを未完了（pending）に戻す",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        task_id: { type: SchemaType.NUMBER, description: "未完了に戻すタスクのID" },
      },
      required: ["task_id"],
    },
  },
  {
    name: "deleteTask",
    description: "タスクを削除する",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        task_id: { type: SchemaType.NUMBER, description: "削除するタスクのID" },
      },
      required: ["task_id"],
    },
  },
];
