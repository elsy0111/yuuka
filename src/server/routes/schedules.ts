import {
  addSchedule,
  deleteSchedule,
  listUpcomingSchedules,
  updateSchedule,
} from "../../db/scheduleRepo.js";
import { getRequestBody, sendError, sendJson } from "../http.js";
import type { RouteHandler } from "../types.js";

export const handleSchedules: RouteHandler = async ({ req, res, parsedUrl, pathname, method }) => {
  if (pathname === "/api/schedules" && method === "GET") {
    try {
      const userId = parsedUrl.searchParams.get("userId") || "sensei_default";
      const days = parseInt(parsedUrl.searchParams.get("days") || "7", 10);
      sendJson(res, 200, { success: true, schedules: listUpcomingSchedules(userId, days) });
    } catch {
      sendError(res, 500, "スケジュールの取得に失敗しました。");
    }
    return true;
  }

  if (pathname === "/api/schedules/add" && method === "POST") {
    try {
      const { userId, title, startAt, endAt, remindBeforeMinutes, description } = JSON.parse(
        await getRequestBody(req),
      );
      if (!title || !startAt) {
        sendError(res, 400, "タイトルと開始日時は必須です。");
        return true;
      }
      const schedule = addSchedule(
        userId || "sensei_default",
        title,
        startAt,
        endAt,
        remindBeforeMinutes,
        description,
      );
      sendJson(res, 200, { success: true, schedule });
    } catch {
      sendError(res, 500, "スケジュールの追加に失敗しました。");
    }
    return true;
  }

  if (pathname === "/api/schedules/update" && method === "POST") {
    try {
      const { id, userId, title, description, startAt, endAt, remindBeforeMinutes } = JSON.parse(
        await getRequestBody(req),
      );
      if (!id || !userId) {
        sendError(res, 400, "IDとユーザーIDが必要です。");
        return true;
      }
      const schedule = updateSchedule(id, userId, {
        title,
        description,
        startAt,
        endAt,
        remindBeforeMinutes,
      });
      sendJson(res, 200, { success: true, schedule });
    } catch {
      sendError(res, 500, "予定の更新に失敗しました。");
    }
    return true;
  }

  if (pathname === "/api/schedules/delete" && method === "POST") {
    try {
      const { id, userId } = JSON.parse(await getRequestBody(req));
      if (!id || !userId) {
        sendError(res, 400, "IDとユーザーIDが必要です。");
        return true;
      }
      sendJson(res, 200, { success: deleteSchedule(id, userId) });
    } catch {
      sendError(res, 500, "予定の削除に失敗しました。");
    }
    return true;
  }

  return false;
};
