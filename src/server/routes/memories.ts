import { deleteMemory, listMemories, saveMemory, updateMemory } from "../../db/memoryRepo.js";
import { getRequestBody, sendError, sendJson } from "../http.js";
import { getSessionDiscordId } from "../session.js";
import type { RouteHandler } from "../types.js";

export const handleMemories: RouteHandler = async ({ req, res, parsedUrl, pathname, method }) => {
  if (!pathname.startsWith("/api/memories")) return false;
  const sessionUserId = getSessionDiscordId(req);
  if (!sessionUserId) {
    sendError(res, 401, "認証されていません。");
    return true;
  }
  if (pathname === "/api/memories" && method === "GET") {
    const module = parsedUrl.searchParams.get("module") || undefined;
    try {
      sendJson(res, 200, { success: true, memories: listMemories(sessionUserId, module) });
    } catch {
      sendError(res, 500, "記憶の取得に失敗しました。");
    }
    return true;
  }

  if (pathname === "/api/memories/add" && method === "POST") {
    try {
      const { content, module } = JSON.parse(await getRequestBody(req));
      if (!content?.trim()) {
        sendError(res, 400, "contentは必須です。");
        return true;
      }
      const memory = saveMemory(sessionUserId, content.trim(), module || "general");
      sendJson(res, 200, { success: true, memory });
    } catch {
      sendError(res, 500, "記憶の保存に失敗しました。");
    }
    return true;
  }

  if (pathname === "/api/memories/update" && method === "POST") {
    try {
      const { id, content, module } = JSON.parse(await getRequestBody(req));
      if (!id || !content?.trim()) {
        sendError(res, 400, "idとcontentは必須です。");
        return true;
      }
      const memory = updateMemory(Number(id), sessionUserId, content.trim(), module);
      sendJson(res, 200, { success: true, memory });
    } catch {
      sendError(res, 500, "記憶の更新に失敗しました。");
    }
    return true;
  }

  if (pathname === "/api/memories/delete" && method === "POST") {
    try {
      const { id } = JSON.parse(await getRequestBody(req));
      if (!id) {
        sendError(res, 400, "idは必須です。");
        return true;
      }
      const ok = deleteMemory(Number(id), sessionUserId);
      sendJson(res, 200, {
        success: ok,
        message: ok ? "削除しました。" : "対象が見つかりません。",
      });
    } catch {
      sendError(res, 500, "記憶の削除に失敗しました。");
    }
    return true;
  }

  return false;
};
