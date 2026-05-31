import { type BotLogLevel, clearBotLogs, listBotLogs } from "../../db/botLogRepo.js";
import { sendError, sendJson } from "../http.js";
import type { RouteHandler } from "../types.js";

const LEVELS = new Set(["debug", "info", "warn", "error"]);

export const handleBotLogs: RouteHandler = ({ res, parsedUrl, pathname, method }) => {
  if (pathname !== "/api/bot-logs") return false;

  if (method === "DELETE") {
    try {
      clearBotLogs();
      sendJson(res, 200, { success: true });
    } catch (error) {
      console.error("[bot-logs] ログ削除に失敗しました:", error);
      sendError(res, 500, "Botログの削除に失敗しました。");
    }
    return true;
  }

  if (method !== "GET") return false;

  const rawLevel = parsedUrl.searchParams.get("level") || undefined;
  if (rawLevel && !LEVELS.has(rawLevel)) {
    sendError(res, 400, "level は debug/info/warn/error のいずれかです。");
    return true;
  }

  const rawLimit = parsedUrl.searchParams.get("limit");
  // limit=0 or search mode → no limit (全件取得)
  const hasSearch = !!parsedUrl.searchParams.get("search");
  const limit = hasSearch ? 0 : rawLimit ? Number.parseInt(rawLimit, 10) : 10;
  const userId = parsedUrl.searchParams.get("userId") || undefined;

  try {
    sendJson(res, 200, {
      success: true,
      logs: listBotLogs({
        limit,
        userId,
        level: rawLevel as BotLogLevel | undefined,
        includeSystem: true,
      }),
    });
  } catch (error) {
    console.error("[bot-logs] ログ取得に失敗しました:", error);
    sendError(res, 500, "Botログの取得に失敗しました。");
  }

  return true;
};
