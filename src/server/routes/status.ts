import { config, getGoogleCalendars } from "../../config.js";
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
  const row = getDb().prepare(sql).get(userId, dateStr) as { count?: number; total?: number | null };
  return row?.count ?? row?.total ?? 0;
}

export const handleStatus: RouteHandler = async ({ res, parsedUrl, pathname, method }) => {
  if (pathname !== "/api/status" || method !== "GET") return false;

  try {
    const db = getDb();
    const userId = parsedUrl.searchParams.get("userId") || "sensei_default";
    const taskCount = db.prepare("SELECT COUNT(*) as count FROM tasks WHERE user_id = ?").get(userId) as { count: number };
    const pendingTaskCount = db.prepare("SELECT COUNT(*) as count FROM tasks WHERE user_id = ? AND status = 'pending'").get(userId) as { count: number };
    const scheduleCount = db.prepare("SELECT COUNT(*) as count FROM schedules WHERE user_id = ?").get(userId) as { count: number };
    const expenseCount = db.prepare("SELECT COUNT(*) as count FROM expenses WHERE user_id = ?").get(userId) as { count: number };
    const priorityRows = db.prepare(`
      SELECT priority, COUNT(*) as count
      FROM tasks
      WHERE user_id = ? AND status = 'pending'
      GROUP BY priority
    `).all(userId) as { priority: number; count: number }[];

    const priorityMap: Record<number, number> = { 0: 0, 1: 0, 2: 0 };
    for (const row of priorityRows) priorityMap[row.priority] = row.count;

    const scheduleTrend = Array.from({ length: 5 }, (_, i) => {
      const dateStr = new Date(Date.now() + i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      return countForDate("SELECT COUNT(*) as count FROM schedules WHERE user_id = ? AND date(start_at) = date(?)", userId, dateStr);
    });
    const expenseTrend = Array.from({ length: 5 }, (_, idx) => {
      const dateStr = new Date(Date.now() - (4 - idx) * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      return countForDate("SELECT SUM(amount) as total FROM expenses WHERE user_id = ? AND date = ?", userId, dateStr);
    });

    sendJson(res, 200, {
      success: true,
      stats: {
        tasks: taskCount.count,
        pendingTasks: pendingTaskCount.count,
        pendingPriorities: priorityMap,
        schedules: scheduleCount.count,
        scheduleTrend,
        expenses: expenseCount.count,
        expenseTrend,
      },
      config: {
        dbPath: config.dbPath,
        reminderCron: config.reminderCron,
        googleCalendarId: config.googleCalendarId,
        googleServiceAccountEmail: mask(config.googleServiceAccountEmail),
        googleClientId: mask(config.googleClientId),
        googleCalendars: getGoogleCalendars().map(id => ({ id, summary: id })),
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
        sendJson(res, 200, { success: true, users: [user.discord_id], username: user.username, discordId: user.discord_id });
        return true;
      }
    }
    const usersRows = getDb().prepare(`
      SELECT DISTINCT user_id FROM tasks
      UNION SELECT DISTINCT user_id FROM schedules
      UNION SELECT DISTINCT user_id FROM expenses
    `).all() as { user_id: string }[];
    const users = usersRows.map(r => r.user_id).filter(id => id && id.trim() !== "");
    sendJson(res, 200, { success: true, users: users.length ? users : ["sensei_default"] });
  } catch {
    sendError(res, 500, "ユーザー一覧の取得に失敗しました。");
  }
  return true;
};
