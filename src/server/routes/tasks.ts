import { addTask, completeTask, deleteTask, listTasks, reopenTask } from "../../db/taskRepo.js";
import { getRequestBody, sendError, sendJson } from "../http.js";
import type { RouteHandler } from "../types.js";

export const handleTasks: RouteHandler = async ({ req, res, parsedUrl, pathname, method }) => {
  if (pathname === "/api/tasks" && method === "GET") {
    try {
      const userId = parsedUrl.searchParams.get("userId") || "sensei_default";
      const status = parsedUrl.searchParams.get("status") || "all";
      sendJson(res, 200, { success: true, tasks: listTasks(userId, status) });
    } catch {
      sendError(res, 500, "タスク一覧の取得に失敗しました。");
    }
    return true;
  }

  if (pathname === "/api/tasks/add" && method === "POST") {
    try {
      const { userId, title, description, dueDate, priority } = JSON.parse(await getRequestBody(req));
      if (!title) return sendError(res, 400, "タイトルは必須です。"), true;
      const task = addTask(userId || "sensei_default", title, description, dueDate, priority);
      sendJson(res, 200, { success: true, task });
    } catch {
      sendError(res, 500, "タスクの追加に失敗しました。");
    }
    return true;
  }

  if ((pathname === "/api/tasks/complete" || pathname === "/api/tasks/reopen" || pathname === "/api/tasks/delete") && method === "POST") {
    try {
      const { id, userId } = JSON.parse(await getRequestBody(req));
      if (!id || !userId) return sendError(res, 400, "IDとユーザーIDが必要です。"), true;

      if (pathname.endsWith("/complete")) {
        sendJson(res, 200, { success: true, task: completeTask(id, userId) });
      } else if (pathname.endsWith("/reopen")) {
        sendJson(res, 200, { success: true, task: reopenTask(id, userId) });
      } else {
        sendJson(res, 200, { success: deleteTask(id, userId) });
      }
    } catch {
      sendError(res, 500, "タスクの更新に失敗しました。");
    }
    return true;
  }

  return false;
};
