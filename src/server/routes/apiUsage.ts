import { getApiUsageSummary } from "../../db/apiUsageRepo.js";
import { config } from "../../config.js";
import { sendError, sendJson } from "../http.js";
import type { RouteHandler } from "../types.js";

// モデル別の無料枠クォータ（Google AI Studio の実測値）
const QUOTA: Record<string, { rpm: number; rpd: number; tpm: number }> = {
  "gemini-3.1-flash-lite": { rpm: 15, rpd: 500, tpm: 250_000 },
  "gemini-2.5-flash": { rpm: 10, rpd: 500, tpm: 250_000 },
  "gemini-2.5-pro": { rpm: 5, rpd: 25, tpm: 250_000 },
  "gemini-2.0-flash-lite": { rpm: 30, rpd: 1500, tpm: 1_000_000 },
  "gemini-2.0-flash": { rpm: 15, rpd: 1500, tpm: 1_000_000 },
  "gemini-1.5-flash": { rpm: 15, rpd: 1500, tpm: 1_000_000 },
  "gemini-1.5-pro": { rpm: 2, rpd: 50, tpm: 32_000 },
};

const DEFAULT_QUOTA = { rpm: 15, rpd: 500, tpm: 250_000 };

export const handleApiUsage: RouteHandler = ({ res, pathname, method }) => {
  if (pathname !== "/api/gemini-usage" || method !== "GET") return false;

  try {
    const summary = getApiUsageSummary();
    const model = config.geminiModel || "gemini-2.0-flash-lite";
    const quota = QUOTA[model] ?? DEFAULT_QUOTA;

    sendJson(res, 200, {
      success: true,
      model,
      usage: summary,
      quota,
    });
  } catch (error) {
    console.error("[api-usage] 取得失敗:", error);
    sendError(res, 500, "使用量データの取得に失敗しました。");
  }

  return true;
};
