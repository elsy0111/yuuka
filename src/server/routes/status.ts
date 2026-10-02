import { getMainBotInviteUrl } from "../../bot.js";
import { config } from "../../config.js";
import { getDb } from "../../db/database.js";
import { getUserByDiscordId } from "../../db/userRepo.js";
import { sendError, sendJson } from "../http.js";
import { getSessionDiscordId } from "../session.js";
import type { RouteHandler } from "../types.js";

function mask(str: string): string {
  if (!str) return "未設定";
  if (str.length <= 8) return "****";
  return `${str.substring(0, 4)}...${str.substring(str.length - 4)}`;
}

function countForDate(sql: string, userId: string, dateStr: string): number {
  const row = getDb().prepare(sql).get(userId, dateStr) as {
    count?: number;
    total?: number | null;
  };
  return row?.count ?? row?.total ?? 0;
}

export const handleStatus: RouteHandler = async ({ req, res, pathname, method }) => {
  if (pathname !== "/api/status" || method !== "GET") return false;

  try {
    const db = getDb();
    const discordId = getSessionDiscordId(req);
    const userId = discordId || "sensei_default";
    const expenseCount = db
      .prepare("SELECT COUNT(*) as count FROM expenses WHERE user_id = ?")
      .get(userId) as { count: number };
    const expenseTrend = Array.from({ length: 5 }, (_, idx) => {
      const dateStr = new Date(Date.now() - (4 - idx) * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);
      return countForDate(
        "SELECT SUM(amount) as total FROM expenses WHERE user_id = ? AND date = ?",
        userId,
        dateStr,
      );
    });

    sendJson(res, 200, {
      success: true,
      stats: {
        expenses: expenseCount.count,
        expenseTrend,
      },
      config: {
        dbPath: config.dbPath,
        googleServiceAccountEmail: mask(config.googleServiceAccountEmail),
        googleClientId: mask(config.googleClientId),
        botInviteUrl: getMainBotInviteUrl(),
      },
    });
  } catch (err) {
    console.error("ステータス取得エラー:", err);
    sendError(res, 500, "ステータス取得に失敗しました。");
  }
  return true;
};

export const handleUsers: RouteHandler = ({ req, res, pathname, method }) => {
  if (pathname !== "/api/users" || method !== "GET") return false;
  try {
    const discordId = getSessionDiscordId(req);
    if (discordId) {
      const user = getUserByDiscordId(discordId);
      if (user) {
        sendJson(res, 200, {
          success: true,
          users: [user.discord_id],
          username: user.username,
          discordId: user.discord_id,
          createdAt: user.created_at,
          isAdmin: user.is_admin === 1,
        });
        return true;
      }
      sendError(res, 401, "ユーザーが見つかりません。再ログインしてください。");
      return true;
    }
    sendError(res, 401, "認証されていません。");
  } catch {
    sendError(res, 500, "ユーザー一覧の取得に失敗しました。");
  }
  return true;
};
