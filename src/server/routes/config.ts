import { getGoogleCalendars, updateGoogleCalendarsInYaml } from "../../config.js";
import { clearCalendarCache } from "../../services/googleCalendarService.js";
import { getUserGeminiConfig, updateGeminiSettings } from "../../db/userRepo.js";
import { encryptText } from "../../utils/crypto.js";
import { getSessionDiscordId } from "../session.js";
import { getRequestBody, sendError, sendJson } from "../http.js";
import type http from "node:http";
import type { RouteHandler } from "../types.js";

async function readCalendarId(req: http.IncomingMessage): Promise<string | undefined> {
  const body = await getRequestBody(req);
  const { calendarId } = JSON.parse(body);
  if (!calendarId || typeof calendarId !== "string" || !calendarId.trim()) return undefined;
  return calendarId.trim();
}

export const handleGeminiConfig: RouteHandler = async ({ req, res, pathname, method }) => {
  if (!pathname.startsWith("/api/config/gemini")) return false;

  const discordId = getSessionDiscordId(req);
  if (!discordId) {
    sendError(res, 401, "認証されていません。");
    return true;
  }

  if (pathname === "/api/config/gemini" && method === "GET") {
    const cfg = getUserGeminiConfig(discordId);
    sendJson(res, 200, {
      success: true,
      hasApiKey: !!cfg?.apiKeyEncrypted,
      model: cfg?.model ?? "gemini-2.0-flash-lite",
    });
    return true;
  }

  if (pathname === "/api/config/gemini" && method === "POST") {
    try {
      const { apiKey, model } = JSON.parse(await getRequestBody(req));
      if (!model) {
        sendError(res, 400, "model は必須です。");
        return true;
      }

      const existing = getUserGeminiConfig(discordId);
      let encrypted = existing?.apiKeyEncrypted ?? null;
      let iv = existing?.apiKeyIv ?? null;
      let tag = existing?.apiKeyTag ?? null;

      // apiKey が送られてきた場合のみ上書き（空欄なら既存キーを維持）
      if (apiKey?.trim()) {
        const result = encryptText(apiKey.trim());
        encrypted = result.encrypted;
        iv = result.iv;
        tag = result.authTag;
      }

      updateGeminiSettings(discordId, encrypted, iv, tag, model);
      sendJson(res, 200, { success: true, model, hasApiKey: !!encrypted });
    } catch (err) {
      console.error("Gemini設定保存エラー:", err);
      sendError(res, 500, "Gemini設定の保存に失敗しました。");
    }
    return true;
  }

  return false;
};

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
