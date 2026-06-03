import crypto from "node:crypto";
import {
  createInviteCode,
  deleteInviteCode,
  listInviteCodes,
  updateInviteCodeMemo,
} from "../../db/inviteRepo.js";
import { sendError, sendJson } from "../http.js";
import { getSessionDiscordId } from "../session.js";
import type { RouteHandler } from "../types.js";

export const handleInviteCodes: RouteHandler = ({ req, res, pathname, method }) => {
  if (!pathname.startsWith("/api/invite-codes")) return false;

  const discordId = getSessionDiscordId(req);
  if (!discordId) {
    sendError(res, 401, "認証されていません。");
    return true;
  }

  if (pathname === "/api/invite-codes" && method === "GET") {
    const codes = listInviteCodes();
    sendJson(res, 200, { success: true, codes });
    return true;
  }

  if (pathname === "/api/invite-codes" && method === "POST") {
    const code = crypto.randomBytes(6).toString("hex").toUpperCase();
    createInviteCode(code, discordId);
    sendJson(res, 200, { success: true, code });
    return true;
  }

  const codeMatch = pathname.match(/^\/api\/invite-codes\/([A-F0-9]+)$/);
  if (codeMatch && method === "DELETE") {
    const ok = deleteInviteCode(codeMatch[1]);
    sendJson(res, 200, { success: ok });
    return true;
  }

  if (codeMatch && method === "PATCH") {
    let body = "";
    req.on("data", (chunk: Buffer) => (body += chunk.toString()));
    req.on("end", () => {
      try {
        const { memo } = JSON.parse(body);
        const ok = updateInviteCodeMemo(codeMatch[1], memo ?? "");
        sendJson(res, 200, { success: ok });
      } catch {
        sendError(res, 400, "不正なリクエストです。");
      }
    });
    return true;
  }

  return false;
};
