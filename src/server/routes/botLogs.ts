import { listBotLogs, type BotLogLevel } from "../../db/botLogRepo.js";
import { sendError, sendJson } from "../http.js";
import type { RouteHandler } from "../types.js";

const LEVELS = new Set(["debug", "info", "warn", "error"]);

export const handleBotLogs: RouteHandler = ({ res, parsedUrl, pathname, method }) => {
  if (pathname !== "/api/bot-logs" || method !== "GET") return false;

  const rawLevel = parsedUrl.searchParams.get("level") || undefined;
  if (rawLevel && !LEVELS.has(rawLevel)) {
    sendError(res, 400, "level は debug/info/warn/error のいずれかです。");
    return true;
  }

  const rawLimit = parsedUrl.searchParams.get("limit");
  const limit = rawLimit ? Number.parseInt(rawLimit, 10) : 200;
  const userId = parsedUrl.searchParams.get("userId") || undefined;

  try {
    sendJson(res, 200, {
      success: true,
      logs: listBotLogs({
        limit,
        userId,
        level: rawLevel as BotLogLevel | undefined,
      }),
    });
  } catch (error) {
    console.error("[bot-logs] ログ取得に失敗しました:", error);
    sendError(res, 500, "Botログの取得に失敗しました。");
  }

  return true;
};
