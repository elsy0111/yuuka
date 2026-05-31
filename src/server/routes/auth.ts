import { isValidCode, validateAndConsumeCode } from "../../db/inviteRepo.js";
import {
  createUser,
  getUserByDiscordId,
  updateUsername,
  verifyPassword,
} from "../../db/userRepo.js";
import { getRequestBody, sendError, sendJson } from "../http.js";
import {
  createSession,
  deleteSessionToken,
  getBearerSessionToken,
  getCookieSessionToken,
  getSessionDiscordId,
  LOGIN_LOCKOUT_MS,
  loginAttempts,
  MAX_LOGIN_ATTEMPTS,
  persistSessions,
  SESSION_TTL,
} from "../session.js";
import type { RouteHandler } from "../types.js";

export const handleLogin: RouteHandler = async ({ req, res, pathname, method }) => {
  if (pathname !== "/api/login" || method !== "POST") return false;

  const clientIp = req.socket.remoteAddress || "unknown";
  const attempt = loginAttempts.get(clientIp);
  if (attempt && attempt.count >= MAX_LOGIN_ATTEMPTS && Date.now() < attempt.resetAt) {
    const remainSec = Math.ceil((attempt.resetAt - Date.now()) / 1000);
    sendError(
      res,
      429,
      `ログイン試行回数が上限に達しました。${remainSec}秒後に再試行してください。`,
    );
    return true;
  }

  try {
    const body = await getRequestBody(req);
    const { discordId, password } = JSON.parse(body);

    if (!discordId || !password) {
      sendError(res, 400, "Discord ID とパスワードを入力してください。");
      return true;
    }

    const user = getUserByDiscordId(discordId);
    if (!user || !verifyPassword(password, user.password_hash)) {
      const current = loginAttempts.get(clientIp) || { count: 0, resetAt: 0 };
      current.count += 1;
      current.resetAt = Date.now() + LOGIN_LOCKOUT_MS;
      loginAttempts.set(clientIp, current);
      sendError(res, 401, "Discord ID またはパスワードが正しくありません。");
      return true;
    }

    loginAttempts.delete(clientIp);
    const sessionToken = createSession(user.discord_id);
    res.setHeader(
      "Set-Cookie",
      `__Host-yuuka-session=${sessionToken}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400`,
    );
    sendJson(res, 200, {
      success: true,
      message: "ログインに成功しました！",
      sessionToken,
      expiresAt: Date.now() + SESSION_TTL,
      discordId: user.discord_id,
      username: user.username,
    });
  } catch {
    sendError(res, 400, "リクエストフォーマットが不正です。");
  }
  return true;
};

export const handleRegister: RouteHandler = async ({ req, res, pathname, method }) => {
  if (pathname !== "/api/register" || method !== "POST") return false;

  let body = "";
  try {
    body = await getRequestBody(req);
  } catch (err) {
    console.error("[register] ボディ読み取りエラー:", err);
    sendError(res, 400, "リクエストの読み取りに失敗しました。");
    return true;
  }

  let parsed: { discordId?: string; username?: string; password?: string; inviteCode?: string };
  try {
    parsed = JSON.parse(body);
  } catch (err) {
    console.error("[register] JSONパースエラー body=%j err:", body, err);
    sendError(res, 400, "リクエストのフォーマットが不正です。");
    return true;
  }

  const { discordId, username, password, inviteCode } = parsed;

  if (!discordId || !username || !password || !inviteCode) {
    sendError(res, 400, "全ての項目を入力してください。");
    return true;
  }

  try {
    const existing = getUserByDiscordId(discordId);
    if (existing) {
      sendError(res, 400, "このDiscord IDは既に登録されています。");
      return true;
    }

    if (!isValidCode(inviteCode)) {
      sendError(res, 400, "招待コードが無効または使用済みです。");
      return true;
    }

    // ユーザーを先に作成してから招待コードを消費（FK制約のため）
    const user = createUser(discordId, username, password);
    validateAndConsumeCode(inviteCode, discordId);
    const sessionToken = createSession(user.discord_id);
    res.setHeader(
      "Set-Cookie",
      `__Host-yuuka-session=${sessionToken}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400`,
    );
    sendJson(res, 200, {
      success: true,
      message: "アカウントを作成しました！",
      sessionToken,
      expiresAt: Date.now() + SESSION_TTL,
      discordId: user.discord_id,
      username: user.username,
    });
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === "SQLITE_CONSTRAINT_UNIQUE") {
      sendError(res, 400, "このユーザー名は既に使用されています。別の名前を試してください。");
      return true;
    }
    console.error("[register] ユーザー作成エラー:", err);
    sendError(res, 500, "アカウントの作成に失敗しました。サーバーエラーです。");
  }
  return true;
};

export const handleLogout: RouteHandler = ({ req, res, pathname, method }) => {
  if (pathname !== "/api/logout" || method !== "POST") return false;

  deleteSessionToken(getCookieSessionToken(req));
  deleteSessionToken(getBearerSessionToken(req));
  persistSessions();
  res.setHeader(
    "Set-Cookie",
    `__Host-yuuka-session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
  );
  sendJson(res, 200, { success: true, message: "ログアウトしました。" });
  return true;
};

export const handleProfile: RouteHandler = async ({ req, res, pathname, method }) => {
  if (pathname !== "/api/profile" || method !== "PATCH") return false;

  const discordId = getSessionDiscordId(req);
  if (!discordId) {
    sendError(res, 401, "セッションが無効です。");
    return true;
  }

  try {
    const body = await getRequestBody(req);
    const { username } = JSON.parse(body);

    if (!username || typeof username !== "string" || !username.trim()) {
      sendError(res, 400, "ユーザー名を入力してください。");
      return true;
    }

    const ok = updateUsername(discordId, username.trim());
    if (!ok) {
      sendError(res, 404, "ユーザーが見つかりません。");
      return true;
    }

    sendJson(res, 200, { success: true, username: username.trim() });
  } catch {
    sendError(res, 400, "リクエストフォーマットが不正です。");
  }
  return true;
};
