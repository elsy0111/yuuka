import crypto from "node:crypto";
import { getDb } from "./database.js";

export interface UserRecord {
  discord_id: string;
  username: string;
  password_hash: string;
  // gemini (from user_gemini_settings)
  gemini_api_key_encrypted: string | null;
  gemini_api_key_iv: string | null;
  gemini_api_key_tag: string | null;
  gemini_model: string;
  // google (from user_google_settings)
  google_client_id: string | null;
  google_client_secret: string | null;
  google_refresh_token: string | null;
  google_calendar_id: string | null;
  google_calendars: string | null;
  google_drive_backup_enabled: number;
  google_drive_backup_folder_id: string | null;
  backup_cron: string;
  // discord (from user_discord_settings)
  discord_token_encrypted: string | null;
  discord_token_iv: string | null;
  discord_token_tag: string | null;
  persona: string | null;
  // preferences (from user_preferences)
  monthly_budget: number;
  created_at: string;
  updated_at: string;
}

export interface GeminiConfig {
  apiKeyEncrypted: string | null;
  apiKeyIv: string | null;
  apiKeyTag: string | null;
  model: string;
}

export interface DiscordBotConfig {
  tokenEncrypted: string | null;
  tokenIv: string | null;
  tokenTag: string | null;
  persona: string | null;
}

export interface GoogleConfig {
  clientId: string | null;
  clientSecret: string | null;
  refreshToken: string | null;
  calendarId: string | null;
  calendars: string[];
}

// ─── パスワードハッシュ ───────────────────────────────────────────────────────

const SCRYPT_KEYLEN = 64;
const SCRYPT_COST = 16384;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto
    .scryptSync(password, salt, SCRYPT_KEYLEN, {
      N: SCRYPT_COST,
      r: SCRYPT_BLOCK_SIZE,
      p: SCRYPT_PARALLELIZATION,
    })
    .toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, hash] = storedHash.split(":");
  if (!salt || !hash) return false;
  const derived = crypto
    .scryptSync(password, salt, SCRYPT_KEYLEN, {
      N: SCRYPT_COST,
      r: SCRYPT_BLOCK_SIZE,
      p: SCRYPT_PARALLELIZATION,
    })
    .toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(derived, "hex"));
}

// ─── 内部ヘルパー ────────────────────────────────────────────────────────────

const USER_JOIN_SQL = `
  SELECT
    u.discord_id, u.username, u.password_hash, u.created_at, u.updated_at,
    COALESCE(g.api_key_encrypted, NULL)  AS gemini_api_key_encrypted,
    COALESCE(g.api_key_iv, NULL)         AS gemini_api_key_iv,
    COALESCE(g.api_key_tag, NULL)        AS gemini_api_key_tag,
    COALESCE(g.model, 'gemini-3.1-flash-lite') AS gemini_model,
    go.client_id                          AS google_client_id,
    go.client_secret                      AS google_client_secret,
    go.refresh_token                      AS google_refresh_token,
    go.calendar_id                        AS google_calendar_id,
    go.calendars                          AS google_calendars,
    COALESCE(go.drive_backup_enabled, 0)  AS google_drive_backup_enabled,
    go.drive_backup_folder_id             AS google_drive_backup_folder_id,
    COALESCE(go.backup_cron, '0 3 * * *') AS backup_cron,
    d.token_encrypted                     AS discord_token_encrypted,
    d.token_iv                            AS discord_token_iv,
    d.token_tag                           AS discord_token_tag,
    d.persona                             AS persona,
    COALESCE(p.monthly_budget, 50000)     AS monthly_budget
  FROM users u
  LEFT JOIN user_gemini_settings g  ON u.discord_id = g.discord_id
  LEFT JOIN user_google_settings go ON u.discord_id = go.discord_id
  LEFT JOIN user_discord_settings d ON u.discord_id = d.discord_id
  LEFT JOIN user_preferences p      ON u.discord_id = p.discord_id
`;

function ensureSubRows(discordId: string): void {
  const db = getDb();
  db.prepare("INSERT OR IGNORE INTO user_gemini_settings (discord_id) VALUES (?)").run(discordId);
  db.prepare("INSERT OR IGNORE INTO user_google_settings (discord_id) VALUES (?)").run(discordId);
  db.prepare("INSERT OR IGNORE INTO user_discord_settings (discord_id) VALUES (?)").run(discordId);
  db.prepare("INSERT OR IGNORE INTO user_preferences (discord_id) VALUES (?)").run(discordId);
}

// ─── ユーザー CRUD ───────────────────────────────────────────────────────────

export function createUser(discordId: string, username: string, password: string): UserRecord {
  const db = getDb();
  const passwordHash = hashPassword(password);
  db.prepare("INSERT INTO users (discord_id, username, password_hash) VALUES (?, ?, ?)").run(
    discordId,
    username,
    passwordHash,
  );
  ensureSubRows(discordId);
  const user = getUserByDiscordId(discordId);
  if (!user) throw new Error("Failed to load created user");
  return user;
}

export function getUserByDiscordId(discordId: string): UserRecord | undefined {
  return getDb()
    .prepare(`${USER_JOIN_SQL} WHERE u.discord_id = ?`)
    .get(discordId) as UserRecord | undefined;
}

export function isRegisteredUser(discordId: string): boolean {
  const row = getDb()
    .prepare("SELECT 1 FROM users WHERE discord_id = ? LIMIT 1")
    .get(discordId);
  return !!row;
}

export function updateUsername(discordId: string, newUsername: string): boolean {
  const result = getDb()
    .prepare(
      "UPDATE users SET username = ?, updated_at = datetime('now', 'localtime') WHERE discord_id = ?",
    )
    .run(newUsername, discordId);
  return result.changes > 0;
}

export function listAllUserIds(): string[] {
  const rows = getDb()
    .prepare("SELECT discord_id FROM users ORDER BY created_at ASC")
    .all() as { discord_id: string }[];
  return rows.map((r) => r.discord_id);
}

export function deleteUser(discordId: string): boolean {
  const result = getDb().prepare("DELETE FROM users WHERE discord_id = ?").run(discordId);
  return result.changes > 0;
}

// ─── Gemini 設定 ─────────────────────────────────────────────────────────────

export function getUserGeminiConfig(discordId: string): GeminiConfig | null {
  const row = getDb()
    .prepare(
      "SELECT api_key_encrypted, api_key_iv, api_key_tag, model FROM user_gemini_settings WHERE discord_id = ?",
    )
    .get(discordId) as
    | {
        api_key_encrypted: string | null;
        api_key_iv: string | null;
        api_key_tag: string | null;
        model: string;
      }
    | undefined;
  if (!row) return null;
  return {
    apiKeyEncrypted: row.api_key_encrypted,
    apiKeyIv: row.api_key_iv,
    apiKeyTag: row.api_key_tag,
    model: row.model,
  };
}

export function updateGeminiSettings(
  discordId: string,
  apiKeyEncrypted: string | null,
  apiKeyIv: string | null,
  apiKeyTag: string | null,
  model: string,
): boolean {
  ensureSubRows(discordId);
  const result = getDb()
    .prepare(
      `INSERT INTO user_gemini_settings (discord_id, api_key_encrypted, api_key_iv, api_key_tag, model)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(discord_id) DO UPDATE SET
         api_key_encrypted = excluded.api_key_encrypted,
         api_key_iv = excluded.api_key_iv,
         api_key_tag = excluded.api_key_tag,
         model = excluded.model`,
    )
    .run(discordId, apiKeyEncrypted, apiKeyIv, apiKeyTag, model);
  getDb()
    .prepare(
      "UPDATE users SET updated_at = datetime('now', 'localtime') WHERE discord_id = ?",
    )
    .run(discordId);
  return result.changes > 0;
}

// ─── Google 設定 ─────────────────────────────────────────────────────────────

export function getUserGoogleConfig(discordId: string): GoogleConfig | null {
  const row = getDb()
    .prepare(
      "SELECT client_id, client_secret, refresh_token, calendar_id, calendars FROM user_google_settings WHERE discord_id = ?",
    )
    .get(discordId) as
    | {
        client_id: string | null;
        client_secret: string | null;
        refresh_token: string | null;
        calendar_id: string | null;
        calendars: string | null;
      }
    | undefined;
  if (!row) return null;
  let calendars: string[] = [];
  if (row.calendars) {
    try {
      calendars = JSON.parse(row.calendars);
    } catch {
      calendars = [];
    }
  }
  return {
    clientId: row.client_id,
    clientSecret: row.client_secret,
    refreshToken: row.refresh_token,
    calendarId: row.calendar_id,
    calendars,
  };
}

export function updateGoogleSettings(
  discordId: string,
  clientId: string | null,
  clientSecret: string | null,
  refreshToken: string | null,
  calendarId: string | null,
  calendars: string[],
): boolean {
  ensureSubRows(discordId);
  const calendarsJson = calendars.length > 0 ? JSON.stringify(calendars) : null;
  const result = getDb()
    .prepare(
      `INSERT INTO user_google_settings (discord_id, client_id, client_secret, refresh_token, calendar_id, calendars)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(discord_id) DO UPDATE SET
         client_id = excluded.client_id,
         client_secret = excluded.client_secret,
         refresh_token = excluded.refresh_token,
         calendar_id = excluded.calendar_id,
         calendars = excluded.calendars`,
    )
    .run(discordId, clientId, clientSecret, refreshToken, calendarId, calendarsJson);
  getDb()
    .prepare(
      "UPDATE users SET updated_at = datetime('now', 'localtime') WHERE discord_id = ?",
    )
    .run(discordId);
  return result.changes > 0;
}

export function updateGoogleRefreshToken(discordId: string, refreshToken: string): boolean {
  ensureSubRows(discordId);
  const result = getDb()
    .prepare(
      `INSERT INTO user_google_settings (discord_id, refresh_token)
       VALUES (?, ?)
       ON CONFLICT(discord_id) DO UPDATE SET refresh_token = excluded.refresh_token`,
    )
    .run(discordId, refreshToken);
  getDb()
    .prepare(
      "UPDATE users SET updated_at = datetime('now', 'localtime') WHERE discord_id = ?",
    )
    .run(discordId);
  return result.changes > 0;
}

export function updateBackupSettings(
  discordId: string,
  enabled: boolean,
  folderId: string | null,
  cron: string,
): boolean {
  ensureSubRows(discordId);
  const result = getDb()
    .prepare(
      `INSERT INTO user_google_settings (discord_id, drive_backup_enabled, drive_backup_folder_id, backup_cron)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(discord_id) DO UPDATE SET
         drive_backup_enabled = excluded.drive_backup_enabled,
         drive_backup_folder_id = excluded.drive_backup_folder_id,
         backup_cron = excluded.backup_cron`,
    )
    .run(discordId, enabled ? 1 : 0, folderId, cron);
  getDb()
    .prepare(
      "UPDATE users SET updated_at = datetime('now', 'localtime') WHERE discord_id = ?",
    )
    .run(discordId);
  return result.changes > 0;
}

// ─── Discord Bot 設定 ────────────────────────────────────────────────────────

export function getUserDiscordBotConfig(discordId: string): DiscordBotConfig | null {
  const row = getDb()
    .prepare(
      "SELECT token_encrypted, token_iv, token_tag, persona FROM user_discord_settings WHERE discord_id = ?",
    )
    .get(discordId) as
    | {
        token_encrypted: string | null;
        token_iv: string | null;
        token_tag: string | null;
        persona: string | null;
      }
    | undefined;
  if (!row) return null;
  return {
    tokenEncrypted: row.token_encrypted,
    tokenIv: row.token_iv,
    tokenTag: row.token_tag,
    persona: row.persona,
  };
}

export function updateDiscordBotSettings(
  discordId: string,
  tokenEncrypted: string | null,
  tokenIv: string | null,
  tokenTag: string | null,
  persona: string | null,
): boolean {
  ensureSubRows(discordId);
  const result = getDb()
    .prepare(
      `INSERT INTO user_discord_settings (discord_id, token_encrypted, token_iv, token_tag, persona)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(discord_id) DO UPDATE SET
         token_encrypted = excluded.token_encrypted,
         token_iv = excluded.token_iv,
         token_tag = excluded.token_tag,
         persona = excluded.persona`,
    )
    .run(discordId, tokenEncrypted, tokenIv, tokenTag, persona);
  getDb()
    .prepare(
      "UPDATE users SET updated_at = datetime('now', 'localtime') WHERE discord_id = ?",
    )
    .run(discordId);
  return result.changes > 0;
}

// ─── ユーザー設定（preferences）────────────────────────────────────────────

export function getMonthlyBudget(discordId: string): number {
  const row = getDb()
    .prepare("SELECT monthly_budget FROM user_preferences WHERE discord_id = ?")
    .get(discordId) as { monthly_budget: number | null } | undefined;
  return row?.monthly_budget ?? 50000;
}

export function updateMonthlyBudget(discordId: string, budget: number): boolean {
  ensureSubRows(discordId);
  const result = getDb()
    .prepare(
      `INSERT INTO user_preferences (discord_id, monthly_budget)
       VALUES (?, ?)
       ON CONFLICT(discord_id) DO UPDATE SET monthly_budget = excluded.monthly_budget`,
    )
    .run(discordId, budget);
  getDb()
    .prepare(
      "UPDATE users SET updated_at = datetime('now', 'localtime') WHERE discord_id = ?",
    )
    .run(discordId);
  return result.changes > 0;
}

// ─── ユーザーID移行 ──────────────────────────────────────────────────────────

export function migrateUserId(fromId: string, toId: string): { migrated: number } {
  const db = getDb();
  let total = 0;
  const tables = ["tasks", "schedules", "expenses", "memories"];
  for (const table of tables) {
    try {
      const result = db
        .prepare(`UPDATE ${table} SET user_id = ? WHERE user_id = ?`)
        .run(toId, fromId);
      total += result.changes;
    } catch {
      // テーブルが存在しない場合はスキップ
    }
  }
  return { migrated: total };
}
