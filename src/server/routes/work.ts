import {
  addEntry,
  deleteEntry,
  monthlyWork,
  publicEntry,
  setRate,
  validateEntry,
  WorkValidationError,
} from "../../db/workRepo.js";
import { getRequestBody, sendError, sendJson } from "../http.js";
import { getSessionDiscordId } from "../session.js";
import type { RouteHandler } from "../types.js";

export const handleWork: RouteHandler = async ({ req, res, pathname, method }) => {
  if (pathname !== "/api/work" && !pathname.startsWith("/api/work/")) return false;
  const user = getSessionDiscordId(req);
  if (!user) {
    sendError(res, 401, "認証されていません。");
    return true;
  }
  try {
    if (pathname === "/api/work" && method === "GET") {
      sendJson(res, 200, { success: true, ...monthlyWork(user) });
      return true;
    }
    if (
      method !== "POST" ||
      !["/api/work/rate", "/api/work/entries", "/api/work/delete"].includes(pathname)
    ) {
      sendError(res, 404, "APIエンドポイントが見つかりません。");
      return true;
    }
    let body: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(await getRequestBody(req));
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
        throw new Error("invalid body");
      body = parsed as Record<string, unknown>;
    } catch {
      sendError(res, 400, "JSONが不正です。");
      return true;
    }
    if (pathname === "/api/work/rate") {
      const rate = body.hourlyRate;
      // The repository validates API and Discord writes consistently.
      setRate(user, rate as number);
      sendJson(res, 200, { success: true, hourlyRate: rate });
    } else if (pathname === "/api/work/entries") {
      const entry = validateEntry(body.hours, body.date, body.description);
      sendJson(res, 200, {
        success: true,
        entry: publicEntry(addEntry(user, entry.date, entry.minutes, entry.description)),
      });
    } else {
      if (!deleteEntry(body.id as number, user)) {
        sendError(res, 404, "記録が見つかりません。");
        return true;
      }
      sendJson(res, 200, { success: true });
    }
  } catch (error) {
    if (error instanceof WorkValidationError) sendError(res, 400, error.message);
    else sendError(res, 500, "労働記録の処理に失敗しました。");
  }
  return true;
};
