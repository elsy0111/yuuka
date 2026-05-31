import type http from "node:http";
import { config } from "../../config.js";
import {
  getUserGeminiConfig,
  getUserGoogleConfig,
  updateGeminiSettings,
  updateGoogleSettings,
} from "../../db/userRepo.js";
import { clearCalendarCache } from "../../services/googleCalendarService.js";
import { decryptText, encryptText } from "../../utils/crypto.js";
import { getRequestBody, sendError, sendJson } from "../http.js";
import { getSessionDiscordId } from "../session.js";
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
    let apiKeyPrefix: string | null = null;
    if (cfg?.apiKeyEncrypted && cfg.apiKeyIv && cfg.apiKeyTag) {
      try {
        const plain = decryptText(cfg.apiKeyEncrypted, cfg.apiKeyIv, cfg.apiKeyTag);
        apiKeyPrefix = `${plain.slice(0, 8)}...`;
      } catch (e) {
        console.error("[config/gemini] APIキー復号失敗:", e);
      }
    } else if (config.geminiApiKey) {
      apiKeyPrefix = `${config.geminiApiKey.slice(0, 8)}...`;
    }
    sendJson(res, 200, {
      success: true,
      hasApiKey: !!cfg?.apiKeyEncrypted || !!config.geminiApiKey,
      apiKeyPrefix,
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
    const discordId = getSessionDiscordId(req);
    if (!discordId) {
      sendError(res, 401, "認証されていません。");
      return true;
    }

    const cleanId = await readCalendarId(req);
    if (!cleanId) {
      sendError(res, 400, "有効なカレンダーIDを指定してください。");
      return true;
    }

    const googleCfg = getUserGoogleConfig(discordId);
    const current = googleCfg?.calendars ?? [];
    if (current.includes(cleanId)) {
      sendJson(res, 200, { success: true, message: "このカレンダーIDは既に登録されています。" });
      return true;
    }

    updateGoogleSettings(
      discordId,
      googleCfg?.clientId ?? null,
      googleCfg?.clientSecret ?? null,
      googleCfg?.refreshToken ?? null,
      googleCfg?.calendarId ?? null,
      [...current, cleanId],
    );
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
    const discordId = getSessionDiscordId(req);
    if (!discordId) {
      sendError(res, 401, "認証されていません。");
      return true;
    }

    const cleanId = await readCalendarId(req);
    if (!cleanId) {
      sendError(res, 400, "有効なカレンダーIDを指定してください。");
      return true;
    }

    const googleCfg = getUserGoogleConfig(discordId);
    const updated = (googleCfg?.calendars ?? []).filter((id) => id !== cleanId);
    updateGoogleSettings(
      discordId,
      googleCfg?.clientId ?? null,
      googleCfg?.clientSecret ?? null,
      googleCfg?.refreshToken ?? null,
      googleCfg?.calendarId ?? null,
      updated,
    );
    clearCalendarCache();
    sendJson(res, 200, { success: true, message: "カレンダーIDを削除しました。" });
  } catch (err) {
    console.error("カレンダー削除エラー:", err);
    sendError(res, 500, "カレンダーの削除に失敗しました。");
  }
  return true;
};
