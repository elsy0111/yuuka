import { getDb } from "../db/database.js";
import { addExpense, CATEGORIES, type Expense } from "../db/expenseRepo.js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { resolveApiKeyForUser, resolveModelForUser } from "../gemini/retry.js";
import { recordApiUsage } from "../db/apiUsageRepo.js";

export interface ReceiptItem {
  amount: number;
  category: string;
  description: string;
  date?: string;
  purchaseSource?: string;
}
export type ReceiptExtractor = (
  userId: string,
  image: string,
  mime: string,
  prompt?: string,
) => Promise<ReceiptItem[]>;

async function defaultExtractor(
  userId: string,
  image: string,
  mime: string,
  prompt?: string,
): Promise<ReceiptItem[]> {
  const modelName = resolveModelForUser(userId),
    apiKey = resolveApiKeyForUser(userId);
  if (!apiKey) throw new Error("Gemini APIキーが設定されていません。");
  const model = new GoogleGenerativeAI(apiKey).getGenerativeModel({
    model: modelName,
    generationConfig: { responseMimeType: "application/json" },
    systemInstruction:
      "レシート画像から実際に支払った個別明細だけを抽出し、JSONのみを返してください。合計金額を重複して項目化しないでください。categoryは食費、日用品、交通費、光熱費、通信費、医療費、娯楽、衣服、その他から選択。日付はYYYY-MM-DD、不明なら省略。形式は {items:[{amount:number,category:string,description:string,date?:string,purchaseSource?:string}]}。",
  });
  const result = await model.generateContent([
    { text: prompt || "レシートの支出明細を抽出してください。" },
    { inlineData: { data: image, mimeType: mime } },
  ]);
  const usage = result.response.usageMetadata;
  recordApiUsage(modelName, usage?.promptTokenCount ?? 0, usage?.candidatesTokenCount ?? 0, userId);
  const parsed = JSON.parse(result.response.text()) as { items?: ReceiptItem[] };
  return parsed.items ?? [];
}

const categories = new Set<string>(CATEGORIES);
function validItem(item: ReceiptItem): boolean {
  if (
    !item ||
    !Number.isSafeInteger(item.amount) ||
    item.amount <= 0 ||
    !categories.has(item.category) ||
    typeof item.description !== "string" ||
    item.description.length > 500 ||
    (item.purchaseSource !== undefined &&
      (typeof item.purchaseSource !== "string" || item.purchaseSource.length > 500))
  )
    return false;
  if (item.date !== undefined) {
    const timestamp = typeof item.date === "string" ? Date.parse(`${item.date}T00:00:00Z`) : NaN;
    if (
      !/^[1-9]\d{3}-\d{2}-\d{2}$/.test(item.date) ||
      !Number.isFinite(timestamp) ||
      new Date(timestamp).toISOString().slice(0, 10) !== item.date
    )
      return false;
  }
  return true;
}
export async function processWebReceipt(
  userId: string,
  image: string,
  mime: string,
  prompt: string | undefined,
  extractor?: ReceiptExtractor,
): Promise<{ expenses: Expense[]; total: number }> {
  if (
    typeof image !== "string" ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(image) ||
    image.length > 10 * 1024 * 1024 ||
    typeof mime !== "string" ||
    !/^image\/(jpeg|png|webp|heic|heif)$/.test(mime) ||
    (prompt !== undefined && (typeof prompt !== "string" || prompt.length > 2000))
  )
    throw new TypeError("画像データが不正です。");
  const items = await (extractor ?? defaultExtractor)(userId, image, mime, prompt);
  if (!Array.isArray(items) || items.length === 0 || items.length > 100 || !items.every(validItem))
    throw new Error("有効な支出項目を抽出できませんでした。");
  const db = getDb();
  const tx = db.transaction(() =>
    items.map((item: ReceiptItem) =>
      addExpense(
        userId,
        item.amount,
        item.category,
        item.description,
        item.date,
        "receipt",
        item.purchaseSource?.trim() || "不明",
      ),
    ),
  );
  const expenses = tx() as Expense[];
  return { expenses, total: expenses.reduce((sum, e) => sum + e.amount, 0) };
}
