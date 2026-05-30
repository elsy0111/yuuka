import { deleteMemory, listMemories, saveMemory, updateMemory } from "../../db/memoryRepo.js";
import { getRequestBody, sendError, sendJson } from "../http.js";
import type { RouteHandler } from "../types.js";

export const handleMemories: RouteHandler = async ({ req, res, parsedUrl, pathname, method }) => {
  if (pathname === "/api/memories" && method === "GET") {
    const userId = parsedUrl.searchParams.get("userId") || "sensei_default";
    const module = parsedUrl.searchParams.get("module") || undefined;
    try {
      sendJson(res, 200, { success: true, memories: listMemories(userId, module) });
    } catch {
      sendError(res, 500, "記憶の取得に失敗しました。");
    }
    return true;
  }

  if (pathname === "/api/memories/add" && method === "POST") {
    try {
      const { userId, content, module } = JSON.parse(await getRequestBody(req));
      if (!content?.trim()) {
        sendError(res, 400, "contentは必須です。");
        return true;
      }
      const memory = saveMemory(userId || "sensei_default", content.trim(), module || "general");
      sendJson(res, 200, { success: true, memory });
    } catch {
      sendError(res, 500, "記憶の保存に失敗しました。");
    }
    return true;
  }

  if (pathname === "/api/memories/update" && method === "POST") {
    try {
      const { id, userId, content, module } = JSON.parse(await getRequestBody(req));
      if (!id || !content?.trim()) {
        sendError(res, 400, "idとcontentは必須です。");
        return true;
      }
      const memory = updateMemory(Number(id), userId || "sensei_default", content.trim(), module);
      sendJson(res, 200, { success: true, memory });
    } catch {
      sendError(res, 500, "記憶の更新に失敗しました。");
    }
    return true;
  }

  if (pathname === "/api/memories/delete" && method === "POST") {
    try {
      const { id, userId } = JSON.parse(await getRequestBody(req));
      if (!id) {
        sendError(res, 400, "idは必須です。");
        return true;
      }
      const ok = deleteMemory(Number(id), userId || "sensei_default");
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
