import {
  addTask,
  completeTask,
  deleteTask,
  listTasks,
  reopenTask,
  updateTask,
} from "../../db/taskRepo.js";
import { getRequestBody, sendError, sendJson } from "../http.js";
import { getSessionDiscordId } from "../session.js";
import type { RouteHandler } from "../types.js";

export const handleTasks: RouteHandler = async ({ req, res, parsedUrl, pathname, method }) => {
  if (!pathname.startsWith("/api/tasks")) return false;
  const sessionUserId = getSessionDiscordId(req);
  if (!sessionUserId) {
    sendError(res, 401, "認証されていません。");
    return true;
  }
  if (pathname === "/api/tasks" && method === "GET") {
    try {
      const status = parsedUrl.searchParams.get("status") || "all";
      sendJson(res, 200, { success: true, tasks: listTasks(sessionUserId, status) });
    } catch {
      sendError(res, 500, "タスク一覧の取得に失敗しました。");
    }
    return true;
  }

  if (pathname === "/api/tasks/add" && method === "POST") {
    try {
      const { title, description, dueDate, priority } = JSON.parse(await getRequestBody(req));
      if (!title) {
        sendError(res, 400, "タイトルは必須です。");
        return true;
      }
      if (
        typeof title !== "string" ||
        !title.trim() ||
        (priority !== undefined && (!Number.isInteger(priority) || priority < 0 || priority > 2)) ||
        (dueDate !== undefined &&
          dueDate !== null &&
          (typeof dueDate !== "string" || Number.isNaN(Date.parse(dueDate))))
      ) {
        sendError(res, 400, "タスクの入力が不正です。");
        return true;
      }
      const task = addTask(sessionUserId, title, description, dueDate || undefined, priority);
      sendJson(res, 200, { success: true, task });
    } catch {
      sendError(res, 500, "タスクの追加に失敗しました。");
    }
    return true;
  }

  if (pathname === "/api/tasks/update" && method === "POST") {
    try {
      const { id, title, description, dueDate, priority } = JSON.parse(await getRequestBody(req));
      if (!id) {
        sendError(res, 400, "IDとユーザーIDが必要です。");
        return true;
      }
      if (
        (title !== undefined && (typeof title !== "string" || !title.trim())) ||
        (priority !== undefined && (!Number.isInteger(priority) || priority < 0 || priority > 2)) ||
        (dueDate !== undefined &&
          dueDate !== null &&
          (typeof dueDate !== "string" || Number.isNaN(Date.parse(dueDate))))
      ) {
        sendError(res, 400, "タスクの入力が不正です。");
        return true;
      }
      const task = updateTask(id, sessionUserId, { title, description, dueDate, priority });
      sendJson(res, 200, { success: true, task });
    } catch {
      sendError(res, 500, "タスクの更新に失敗しました。");
    }
    return true;
  }

  if (
    (pathname === "/api/tasks/complete" ||
      pathname === "/api/tasks/reopen" ||
      pathname === "/api/tasks/delete") &&
    method === "POST"
  ) {
    try {
      const { id } = JSON.parse(await getRequestBody(req));
      if (!id) {
        sendError(res, 400, "IDとユーザーIDが必要です。");
        return true;
      }

      if (pathname.endsWith("/complete")) {
        sendJson(res, 200, { success: true, task: completeTask(id, sessionUserId) });
      } else if (pathname.endsWith("/reopen")) {
        sendJson(res, 200, { success: true, task: reopenTask(id, sessionUserId) });
      } else {
        sendJson(res, 200, { success: deleteTask(id, sessionUserId) });
      }
    } catch {
      sendError(res, 500, "タスクの更新に失敗しました。");
    }
    return true;
  }

  return false;
};
