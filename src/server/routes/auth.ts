import { config } from "../../config.js";
import { getRequestBody, sendError, sendJson } from "../http.js";
import {
  createSession,
  deleteSessionToken,
  getBearerSessionToken,
  getCookieSessionToken,
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
    sendError(res, 429, `ログイン試行回数が上限に達しました。${remainSec}秒後に再試行してください。`);
    return true;
  }

  try {
    const body = await getRequestBody(req);
    const { passcode } = JSON.parse(body);

    if (passcode !== config.adminToken) {
      const current = loginAttempts.get(clientIp) || { count: 0, resetAt: 0 };
      current.count += 1;
      current.resetAt = Date.now() + LOGIN_LOCKOUT_MS;
      loginAttempts.set(clientIp, current);
      sendError(res, 401, "パスコードが正しくありません。");
      return true;
    }

    loginAttempts.delete(clientIp);
    const sessionToken = createSession();
    res.setHeader(
      "Set-Cookie",
      `__Host-yuuka-session=${sessionToken}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400`
    );
    sendJson(res, 200, {
      success: true,
      message: "ログインに成功しました！",
      sessionToken,
      expiresAt: Date.now() + SESSION_TTL,
    });
  } catch {
    sendError(res, 400, "リクエストフォーマットが不正です。");
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
    `__Host-yuuka-session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`
  );
  sendJson(res, 200, { success: true, message: "ログアウトしました。" });
  return true;
};
