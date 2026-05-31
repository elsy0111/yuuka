import fs from "node:fs";
import path from "node:path";
import { getDb } from "./database.js";

export function runMigrations(): void {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      discord_id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS user_gemini_settings (
      discord_id TEXT PRIMARY KEY REFERENCES users(discord_id) ON DELETE CASCADE,
      api_key_encrypted TEXT,
      api_key_iv TEXT,
      api_key_tag TEXT,
      model TEXT NOT NULL DEFAULT 'gemini-3.1-flash-lite'
    );

    CREATE TABLE IF NOT EXISTS user_google_settings (
      discord_id TEXT PRIMARY KEY REFERENCES users(discord_id) ON DELETE CASCADE,
      client_id TEXT,
      client_secret TEXT,
      refresh_token TEXT,
      calendar_id TEXT,
      calendars TEXT,
      drive_backup_enabled INTEGER NOT NULL DEFAULT 0,
      drive_backup_folder_id TEXT,
      backup_cron TEXT NOT NULL DEFAULT '0 3 * * *'
    );

    CREATE TABLE IF NOT EXISTS user_preferences (
      discord_id TEXT PRIMARY KEY REFERENCES users(discord_id) ON DELETE CASCADE,
      monthly_budget INTEGER NOT NULL DEFAULT 50000
    );
  `);

  try {
    db.exec("DROP INDEX IF EXISTS idx_users_username;");
  } catch {}

  db.exec(`
    CREATE TABLE IF NOT EXISTS invite_codes (
      code TEXT PRIMARY KEY,
      created_by TEXT,
      used_by TEXT,
      used_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (used_by) REFERENCES users(discord_id)
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      priority INTEGER NOT NULL DEFAULT 0,
      due_date TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_user_status ON tasks(user_id, status);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS schedules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      start_at TEXT NOT NULL,
      end_at TEXT,
      remind_before_minutes INTEGER NOT NULL DEFAULT 30,
      reminded INTEGER NOT NULL DEFAULT 0,
      google_event_id TEXT,
      google_calendar_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE INDEX IF NOT EXISTS idx_schedules_user ON schedules(user_id);
    CREATE INDEX IF NOT EXISTS idx_schedules_start ON schedules(start_at);
    CREATE INDEX IF NOT EXISTS idx_schedules_reminded ON schedules(reminded, start_at);
  `);

  // 既存DB用カラム追加マイグレーション
  try {
    db.exec("ALTER TABLE schedules ADD COLUMN google_event_id TEXT;");
    console.log("ℹ️ schedules テーブルに google_event_id カラムを追加しました");
  } catch (_e) {
    // すでにカラムが存在する場合はエラーを無視
  }

  try {
    db.exec("ALTER TABLE schedules ADD COLUMN google_calendar_id TEXT;");
    console.log("ℹ️ schedules テーブルに google_calendar_id カラムを追加しました");
  } catch (_e) {
    // すでにカラムが存在する場合はエラーを無視
  }

  try {
    db.exec("ALTER TABLE expenses ADD COLUMN purchase_source TEXT NOT NULL DEFAULT '不明';");
    console.log("ℹ️ expenses テーブルに purchase_source カラムを追加しました");
  } catch (_e) {
    // すでにカラムが存在する場合はエラーを無視
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      amount INTEGER NOT NULL,
      category TEXT NOT NULL,
      description TEXT,
      date TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'manual',
      purchase_source TEXT NOT NULL DEFAULT '不明',
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE INDEX IF NOT EXISTS idx_expenses_user_date ON expenses(user_id, date);
    CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(user_id, category, date);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL,
      text TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE INDEX IF NOT EXISTS idx_chat_history_user ON chat_history(user_id);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS bot_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      level TEXT NOT NULL,
      event TEXT NOT NULL,
      user_id TEXT,
      username TEXT,
      guild_id TEXT,
      channel_id TEXT,
      message_id TEXT,
      details TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE INDEX IF NOT EXISTS idx_bot_logs_user_created ON bot_logs(user_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_bot_logs_level_created ON bot_logs(level, created_at);
    CREATE INDEX IF NOT EXISTS idx_bot_logs_created ON bot_logs(created_at);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS credentials (
      user_id TEXT NOT NULL DEFAULT '',
      service_name TEXT NOT NULL,
      username TEXT NOT NULL,
      encrypted_password TEXT NOT NULL,
      iv TEXT NOT NULL,
      auth_tag TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      PRIMARY KEY (user_id, service_name)
    );
  `);

  // credentials テーブルの user_id カラム追加マイグレーション（既存DBからの移行）
  try {
    const tableInfo = db.prepare("PRAGMA table_info(credentials)").all() as { name: string }[];
    const hasUserId = tableInfo.some((col) => col.name === "user_id");
    if (!hasUserId) {
      // 旧テーブルをリネーム→新テーブル作成→データ移行→旧テーブル削除
      db.exec(`
        ALTER TABLE credentials RENAME TO credentials_old;
        CREATE TABLE credentials (
          user_id TEXT NOT NULL DEFAULT '',
          service_name TEXT NOT NULL,
          username TEXT NOT NULL,
          encrypted_password TEXT NOT NULL,
          iv TEXT NOT NULL,
          auth_tag TEXT NOT NULL,
          updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
          PRIMARY KEY (user_id, service_name)
        );
        INSERT INTO credentials (user_id, service_name, username, encrypted_password, iv, auth_tag, updated_at)
        SELECT '', service_name, username, encrypted_password, iv, auth_tag, updated_at FROM credentials_old;
        DROP TABLE credentials_old;
      `);
      console.log("ℹ️ credentials テーブルを user_id 対応にマイグレーションしました");
    }
  } catch (_e) {
    // テーブルが存在しない場合など
  }

  // user_id カラム追加後にインデックスを安全に作成
  try {
    db.exec("CREATE INDEX IF NOT EXISTS idx_credentials_user ON credentials(user_id);");
  } catch (e) {
    console.error("credentials(user_id) インデックス作成に失敗しました:", e);
  }

  // Playbook テーブル作成
  db.exec(`
    CREATE TABLE IF NOT EXISTS playbooks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      title TEXT NOT NULL,
      keywords TEXT DEFAULT '[]',
      description TEXT DEFAULT '',
      steps TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      UNIQUE(user_id, name)
    );

    CREATE INDEX IF NOT EXISTS idx_playbooks_user ON playbooks(user_id);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      content TEXT NOT NULL,
      module TEXT NOT NULL DEFAULT 'general',
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE INDEX IF NOT EXISTS idx_memories_user ON memories(user_id);
    CREATE INDEX IF NOT EXISTS idx_memories_module ON memories(user_id, module);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS api_usage_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT,
      model TEXT NOT NULL,
      prompt_tokens INTEGER NOT NULL DEFAULT 0,
      completion_tokens INTEGER NOT NULL DEFAULT 0,
      total_tokens INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE INDEX IF NOT EXISTS idx_api_usage_created ON api_usage_logs(created_at);

    CREATE TABLE IF NOT EXISTS api_quotas (
      model TEXT PRIMARY KEY,
      rpm INTEGER NOT NULL DEFAULT 0,
      rpd INTEGER NOT NULL DEFAULT 0,
      tpm INTEGER NOT NULL DEFAULT 0
    );
  `);

  // 既存の Playbook ファイルからの DB マイグレーション
  const PLAYBOOK_DIR = path.resolve(process.cwd(), "data/playbooks");
  if (fs.existsSync(PLAYBOOK_DIR)) {
    const firstUser = db.prepare("SELECT discord_id FROM users LIMIT 1").get() as
      | { discord_id: string }
      | undefined;
    const MIGRATE_USER_ID = firstUser?.discord_id || "default_user";
    const mdFiles = fs.readdirSync(PLAYBOOK_DIR).filter((f) => f.endsWith(".md"));
    const insertStmt = db.prepare(`
      INSERT OR IGNORE INTO playbooks (user_id, name, title, keywords, description, steps)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const checkStmt = db.prepare(
      "SELECT COUNT(*) as count FROM playbooks WHERE user_id = ? AND name = ?",
    );

    for (const file of mdFiles) {
      try {
        const pbName = path.basename(file, ".md");
        const exists = (checkStmt.get(MIGRATE_USER_ID, pbName) as { count: number }).count > 0;
        if (exists) continue;

        const content = fs.readFileSync(path.join(PLAYBOOK_DIR, file), "utf-8");
        const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
        if (!frontmatterMatch) continue;

        const yamlStr = frontmatterMatch[1];
        const steps = content.substring(frontmatterMatch[0].length).trim();
        let pbTitle = "無題の手順書";
        let pbKeywords: string[] = [];
        let pbDescription = "";

        for (const line of yamlStr.split("\n")) {
          const parts = line.split(":");
          if (parts.length < 2) continue;
          const key = parts[0].trim().toLowerCase();
          const val = parts.slice(1).join(":").trim();
          if (key === "title") pbTitle = val;
          else if (key === "keywords")
            pbKeywords = val
              .replace(/[[\]]/g, "")
              .split(",")
              .map((k) => k.trim())
              .filter(Boolean);
          else if (key === "description") pbDescription = val;
        }

        insertStmt.run(
          MIGRATE_USER_ID,
          pbName,
          pbTitle,
          JSON.stringify(pbKeywords),
          pbDescription,
          steps,
        );
        console.log(`📦 Playbook マイグレーション: ${file} → DB (user: ${MIGRATE_USER_ID})`);
      } catch (err) {
        console.error(`Playbook マイグレーション失敗 (${file}):`, err);
      }
    }
  }

  console.log("✅ データベースマイグレーション完了");
}
