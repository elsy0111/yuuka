import type { FunctionDeclaration } from "@google/generative-ai";
import { SchemaType } from "@google/generative-ai";
export const workDeclarations: FunctionDeclaration[] = [
  {
    name: "update_work_entry",
    description:
      "記録済みの労働時間・日付・メモを訂正する。指定しない項目と記録当時の時給は維持する。get_work_summaryでIDを確認。",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        id: { type: SchemaType.NUMBER },
        hours: { type: SchemaType.NUMBER, description: "変更後の時間。2時間半は2.5" },
        date: { type: SchemaType.STRING, description: "YYYY-MM-DD" },
        description: { type: SchemaType.STRING },
      },
      required: ["id"],
    },
  },
  {
    name: "set_hourly_rate",
    description: "時給を設定する",
    parameters: {
      type: SchemaType.OBJECT,
      properties: { hourly_rate: { type: SchemaType.NUMBER } },
      required: ["hourly_rate"],
    },
  },
  {
    name: "add_work_entry",
    description: "労働時間を記録する",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        hours: { type: SchemaType.NUMBER },
        date: { type: SchemaType.STRING },
        description: { type: SchemaType.STRING },
      },
      required: ["hours"],
    },
  },
  {
    name: "get_work_summary",
    description: "指定月の労働記録と合計を取得する。month省略時は今月",
    parameters: {
      type: SchemaType.OBJECT,
      properties: { month: { type: SchemaType.STRING, description: "YYYY-MM" } },
    },
  },
  {
    name: "delete_work_entry",
    description: "労働記録を削除する",
    parameters: {
      type: SchemaType.OBJECT,
      properties: { id: { type: SchemaType.NUMBER } },
      required: ["id"],
    },
  },
];
