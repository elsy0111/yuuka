import { getDb } from "./database.js";

export type BotLogLevel = "debug" | "info" | "warn" | "error";

export interface BotLogEntry {
  id: number;
  level: BotLogLevel;
  event: string;
  user_id: string | null;
  username: string | null;
  guild_id: string | null;
  channel_id: string | null;
  message_id: string | null;
  details: string | null;
  created_at: string;
}

export interface AddBotLogInput {
  level: BotLogLevel;
  event: string;
  userId?: string | null;
  username?: string | null;
  guildId?: string | null;
  channelId?: string | null;
  messageId?: string | null;
  details?: unknown;
}

export interface ListBotLogsOptions {
  limit?: number;
  level?: BotLogLevel;
  userId?: string;
  includeSystem?: boolean;
}

export function addBotLog(input: AddBotLogInput): void {
  const db = getDb();
  const details =
    input.details === undefined
      ? null
      : typeof input.details === "string"
        ? input.details
        : JSON.stringify(input.details);

  db.prepare(`
    INSERT INTO bot_logs (
      level,
      event,
      user_id,
      username,
      guild_id,
      channel_id,
      message_id,
      details
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.level,
    input.event,
    input.userId ?? null,
    input.username ?? null,
    input.guildId ?? null,
    input.channelId ?? null,
    input.messageId ?? null,
    details,
  );
}

export function listBotLogs(options: ListBotLogsOptions = {}): BotLogEntry[] {
  const db = getDb();
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (options.level) {
    conditions.push("level = ?");
    params.push(options.level);
  }

  if (options.userId) {
    conditions.push(options.includeSystem ? "(user_id = ? OR user_id IS NULL)" : "user_id = ?");
    params.push(options.userId);
  } else if (options.includeSystem) {
    conditions.push("(user_id IS NULL OR user_id = '')");
  }

  const limit = Math.max(1, Math.min(options.limit ?? 200, 500));
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  return db
    .prepare(`SELECT * FROM bot_logs ${where} ORDER BY id DESC LIMIT ?`)
    .all(...params, limit) as BotLogEntry[];
}

export function pruneBotLogs(maxRows = 5000): void {
  const db = getDb();
  db.prepare(`
    DELETE FROM bot_logs
    WHERE id NOT IN (
      SELECT id FROM bot_logs ORDER BY id DESC LIMIT ?
    )
  `).run(maxRows);
}
