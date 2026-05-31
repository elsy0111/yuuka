import { getApiUsageSummary, getModelQuota, setModelQuota } from "../../db/apiUsageRepo.js";
import { config } from "../../config.js";
import { getUserGeminiConfig } from "../../db/userRepo.js";
import { getSessionDiscordId } from "../session.js";
import { getRequestBody, sendError, sendJson } from "../http.js";
import type { RouteHandler } from "../types.js";

export const handleApiUsage: RouteHandler = async ({ req, res, pathname, method }) => {
  if (!pathname.startsWith("/api/gemini-usage")) return false;

  if (pathname === "/api/gemini-usage" && method === "GET") {
    try {
      const discordId = getSessionDiscordId(req);
      const userCfg = discordId ? getUserGeminiConfig(discordId) : null;
      const model = userCfg?.model || config.geminiModel || "gemini-2.0-flash-lite";
      const summary = getApiUsageSummary(model);
      const quota = getModelQuota(model);
      sendJson(res, 200, { success: true, model, usage: summary, quota });
    } catch (error) {
      console.error("[api-usage] 取得失敗:", error);
      sendError(res, 500, "使用量データの取得に失敗しました。");
    }
    return true;
  }

  if (pathname === "/api/gemini-usage/quota" && method === "POST") {
    try {
      const { model, rpm, rpd, tpm } = JSON.parse(await getRequestBody(req));
      if (!model || rpm == null || rpd == null || tpm == null) {
        sendError(res, 400, "model, rpm, rpd, tpm が必要です。");
        return true;
      }
      setModelQuota(model, { rpm: Number(rpm), rpd: Number(rpd), tpm: Number(tpm) });
      sendJson(res, 200, { success: true, model, quota: { rpm, rpd, tpm } });
    } catch (error) {
      console.error("[api-usage] クォータ更新失敗:", error);
      sendError(res, 500, "クォータの更新に失敗しました。");
    }
    return true;
  }

  return false;
};
