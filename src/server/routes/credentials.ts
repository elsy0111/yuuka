import * as secretService from "../../services/secretService.js";
import { getRequestBody, sendError, sendJson } from "../http.js";
import type { RouteHandler } from "../types.js";

export const handleCredentials: RouteHandler = async ({ req, res, parsedUrl, pathname, method }) => {
  if (pathname === "/api/credentials" && method === "GET") {
    try {
      const userId = parsedUrl.searchParams.get("userId") || "sensei_default";
      sendJson(res, 200, { success: true, credentials: secretService.listCredentials(userId) });
    } catch {
      sendError(res, 500, "資格情報一覧の取得に失敗しました。");
    }
    return true;
  }

  if (pathname === "/api/credentials/register" && method === "POST") {
    try {
      const body = await getRequestBody(req);
      const { userId, serviceName, username, password } = JSON.parse(body);
      if (!serviceName || !username || !password) {
        sendError(res, 400, "サービス名、ユーザー名、およびパスワードは必須です。");
        return true;
      }

      secretService.registerCredential(userId || "sensei_default", serviceName, username, password);
      sendJson(res, 200, { success: true, message: "資格情報を正常に登録しました。" });
    } catch {
      sendError(res, 500, "資格情報の登録に失敗しました。");
    }
    return true;
  }

  if (pathname === "/api/credentials/delete" && method === "POST") {
    try {
      const body = await getRequestBody(req);
      const { userId, serviceName } = JSON.parse(body);
      if (!serviceName) {
        sendError(res, 400, "サービス名は必須です。");
        return true;
      }

      sendJson(res, 200, { success: secretService.deleteCredential(userId || "sensei_default", serviceName) });
    } catch {
      sendError(res, 500, "資格情報の削除に失敗しました。");
    }
    return true;
  }

  return false;
};
