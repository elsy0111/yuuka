import { getGoogleCalendars, updateGoogleCalendarsInYaml } from "../../config.js";
import { clearCalendarCache } from "../../services/googleCalendarService.js";
import { getRequestBody, sendError, sendJson } from "../http.js";
import type http from "node:http";
import type { RouteHandler } from "../types.js";

async function readCalendarId(req: http.IncomingMessage): Promise<string | undefined> {
  const body = await getRequestBody(req);
  const { calendarId } = JSON.parse(body);
  if (!calendarId || typeof calendarId !== "string" || !calendarId.trim()) return undefined;
  return calendarId.trim();
}

export const handleCalendarAdd: RouteHandler = async ({ req, res, pathname, method }) => {
  if (pathname !== "/api/config/calendars/add" || method !== "POST") return false;
  try {
    const cleanId = await readCalendarId(req);
    if (!cleanId) {
      sendError(res, 400, "有効なカレンダーIDを指定してください。");
      return true;
    }

    const current = [...getGoogleCalendars()];
    if (current.includes(cleanId)) {
      sendJson(res, 200, { success: true, message: "このカレンダーIDは既に登録されています。" });
      return true;
    }

    updateGoogleCalendarsInYaml([...current, cleanId]);
    clearCalendarCache();
    sendJson(res, 200, { success: true, message: "カレンダーIDを追加しました。" });
  } catch (err) {
    console.error("カレンダー追加エラー:", err);
    sendError(res, 500, "カレンダーの追加に失敗しました。");
  }
  return true;
};

export const handleCalendarDelete: RouteHandler = async ({ req, res, pathname, method }) => {
  if (pathname !== "/api/config/calendars/delete" || method !== "POST") return false;
  try {
    const cleanId = await readCalendarId(req);
    if (!cleanId) {
      sendError(res, 400, "有効なカレンダーIDを指定してください。");
      return true;
    }

    updateGoogleCalendarsInYaml(getGoogleCalendars().filter((id) => id !== cleanId));
    clearCalendarCache();
    sendJson(res, 200, { success: true, message: "カレンダーIDを削除しました。" });
  } catch (err) {
    console.error("カレンダー削除エラー:", err);
    sendError(res, 500, "カレンダーの削除に失敗しました。");
  }
  return true;
};
