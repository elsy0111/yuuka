import { migrateUserId } from "../../db/userRepo.js";
import { getRequestBody, sendError, sendJson } from "../http.js";
import type { RouteHandler } from "../types.js";

export const handleUserMigrate: RouteHandler = async ({ req, res, pathname, method }) => {
  if (pathname !== "/api/users/migrate" || method !== "POST") return false;

  try {
    const { fromId, toId } = JSON.parse(await getRequestBody(req));
    if (!fromId?.trim() || !toId?.trim()) {
      sendError(res, 400, "fromId と toId は必須です。");
      return true;
    }
    if (fromId === toId) {
      sendError(res, 400, "同じIDには移行できません。");
      return true;
    }
    const result = migrateUserId(fromId.trim(), toId.trim());
    sendJson(res, 200, { success: true, ...result });
  } catch {
    sendError(res, 500, "ユーザーID移行に失敗しました。");
  }
  return true;
};
