import {
  addSchedule,
  deleteSchedule,
  getScheduleById,
  listUpcomingSchedules,
  updateSchedule,
} from "../../db/scheduleRepo.js";
import { getRequestBody, sendError, sendJson } from "../http.js";
import { getSessionDiscordId } from "../session.js";
import type { RouteHandler } from "../types.js";

function isValidDate(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && !Number.isNaN(Date.parse(value));
}

function hasValidRange(startAt: unknown, endAt: unknown): boolean {
  return (
    endAt === undefined ||
    endAt === null ||
    (isValidDate(startAt) &&
      isValidDate(endAt) &&
      new Date(endAt).getTime() >= new Date(startAt).getTime())
  );
}

export const handleSchedules: RouteHandler = async ({ req, res, parsedUrl, pathname, method }) => {
  if (!pathname.startsWith("/api/schedules")) return false;
  const sessionUserId = getSessionDiscordId(req);
  if (!sessionUserId) {
    sendError(res, 401, "認証されていません。");
    return true;
  }
  if (pathname === "/api/schedules" && method === "GET") {
    try {
      const days = Number(parsedUrl.searchParams.get("days") || "7");
      if (!Number.isInteger(days) || days < 1 || days > 366) {
        sendError(res, 400, "日数が不正です。");
        return true;
      }
      sendJson(res, 200, { success: true, schedules: listUpcomingSchedules(sessionUserId, days) });
    } catch {
      sendError(res, 500, "スケジュールの取得に失敗しました。");
    }
    return true;
  }

  if (pathname === "/api/schedules/add" && method === "POST") {
    try {
      const { title, startAt, endAt, remindBeforeMinutes, description } = JSON.parse(
        await getRequestBody(req),
      );
      if (
        typeof title !== "string" ||
        !title.trim() ||
        !isValidDate(startAt) ||
        (endAt !== undefined &&
          endAt !== null &&
          (!isValidDate(endAt) || !hasValidRange(startAt, endAt))) ||
        (remindBeforeMinutes !== undefined &&
          (!Number.isInteger(remindBeforeMinutes) || remindBeforeMinutes < 0))
      ) {
        sendError(res, 400, "タイトルと開始日時は必須です。");
        return true;
      }
      const schedule = addSchedule(
        sessionUserId,
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
      const { id, title, description, startAt, endAt, remindBeforeMinutes } = JSON.parse(
        await getRequestBody(req),
      );
      if (!id) {
        sendError(res, 400, "IDとユーザーIDが必要です。");
        return true;
      }
      const existing = getScheduleById(id);
      if (!existing || existing.user_id !== sessionUserId) {
        sendError(res, 404, "予定が見つかりません。");
        return true;
      }
      if (
        !hasValidRange(startAt ?? existing.start_at, endAt === undefined ? existing.end_at : endAt)
      ) {
        sendError(res, 400, "終了日時は開始日時以降にしてください。");
        return true;
      }
      if (
        (title !== undefined && (typeof title !== "string" || !title.trim())) ||
        (startAt !== undefined && !isValidDate(startAt)) ||
        (endAt !== undefined && endAt !== null && !isValidDate(endAt)) ||
        (remindBeforeMinutes !== undefined &&
          (!Number.isInteger(remindBeforeMinutes) || remindBeforeMinutes < 0))
      ) {
        sendError(res, 400, "予定の入力が不正です。");
        return true;
      }
      const schedule = updateSchedule(id, sessionUserId, {
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
      const { id } = JSON.parse(await getRequestBody(req));
      if (!id) {
        sendError(res, 400, "IDとユーザーIDが必要です。");
        return true;
      }
      sendJson(res, 200, { success: deleteSchedule(id, sessionUserId) });
    } catch {
      sendError(res, 500, "予定の削除に失敗しました。");
    }
    return true;
  }

  return false;
};
