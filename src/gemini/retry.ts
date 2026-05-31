import { type Content, GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "../config.js";
import { recordApiUsage } from "../db/apiUsageRepo.js";
import { getUserGeminiConfig } from "../db/userRepo.js";
import { getAllFunctionDeclarations } from "../functions/index.js";
import { buildSystemInstruction } from "./systemInstruction.js";

export const genAI = new GoogleGenerativeAI(config.geminiApiKey);

/** ユーザーのDB設定モデル名を取得。未設定なら global config にフォールバック */
export function resolveModelForUser(userId?: string): string {
  if (userId) {
    const userCfg = getUserGeminiConfig(userId);
    if (userCfg?.model) return userCfg.model;
  }
  return config.geminiModel;
}

/** レート制限エラーかどうか判定 */
export function isRateLimitError(error: unknown): boolean {
  if (error && typeof error === "object" && "status" in error) {
    return (error as { status: number }).status === 429;
  }
  return false;
}

/** サーバー側の一時的なエラー(503など)かどうか判定 */
export function isServerError(error: unknown): boolean {
  if (error && typeof error === "object" && "status" in error) {
    const status = (error as { status: number }).status;
    return status === 500 || status === 502 || status === 503 || status === 504;
  }
  return false;
}

/** 指定ミリ秒待機 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * リトライ付きでGemini APIを呼び出す
 */
export async function generateWithRetry(
  contents: Content[],
  maxRetries: number = 3,
  userId?: string,
): Promise<import("@google/generative-ai").GenerateContentResult> {
  const modelName = resolveModelForUser(userId);
  // 毎回最新の日時でsystem instructionを更新
  const model = genAI.getGenerativeModel({
    model: modelName,
    systemInstruction: await buildSystemInstruction(),
    tools: [{ functionDeclarations: getAllFunctionDeclarations() }],
  });

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await model.generateContent({ contents });
      // トークン使用量を記録
      const usage = result.response.usageMetadata;
      if (usage) {
        recordApiUsage(
          modelName,
          usage.promptTokenCount ?? 0,
          usage.candidatesTokenCount ?? 0,
          userId,
        );
      }
      return result;
    } catch (error) {
      if ((isRateLimitError(error) || isServerError(error)) && attempt < maxRetries) {
        // RetryInfo からリトライ待機時間を取得、なければ指数バックオフ
        let waitMs = Math.min(1000 * 2 ** (attempt + 1), 60000);

        const errorDetails = (
          error as { errorDetails?: Array<{ "@type": string; retryDelay?: string }> }
        ).errorDetails;
        if (errorDetails) {
          const retryInfo = errorDetails.find(
            (d) => d["@type"] === "type.googleapis.com/google.rpc.RetryInfo",
          );
          if (retryInfo?.retryDelay) {
            const seconds = parseInt(retryInfo.retryDelay.replace("s", ""), 10);
            if (!Number.isNaN(seconds)) {
              waitMs = (seconds + 1) * 1000;
            }
          }
        }

        const errorType = isRateLimitError(error) ? "レート制限(枯渇)" : "サーバー高負荷";
        console.log(
          `⏳ ${errorType} (${attempt + 1}/${maxRetries})、${Math.ceil(waitMs / 1000)}秒後にリトライ...`,
        );
        await sleep(waitMs);
        continue;
      }
      throw error;
    }
  }
  throw new Error("リトライ上限に達しました");
}
