import type { ChatMessage, ImageData } from "../gemini.js";
import { processMessage } from "../gemini.js";

export async function parseReceipt(
  userId: string,
  images: ImageData[],
  additionalText?: string,
  onStatusChange?: (status: "thinking" | "writing" | "idle") => void,
): Promise<string> {
  const defaultText =
    images.length > 1
      ? `${images.length}枚の画像が添付されています。レシートがあれば内容を読み取って、各商品を適切なカテゴリに分類して家計簿に記録してください。`
      : "この画像はレシートです。内容を読み取って、各商品を適切なカテゴリに分類して家計簿に記録してください。";
  const message: ChatMessage = {
    text: additionalText || defaultText,
    imagesData: images,
  };
  return processMessage(userId, message, onStatusChange);
}
