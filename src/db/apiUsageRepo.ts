import { getDb } from "./database.js";

export interface ApiUsageLog {
  id: number;
  user_id: string | null;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  created_at: string;
}

export interface ApiUsageSummary {
  rpm: number;
  rpd: number;
  tpm: number;
  tpd: number;
}

export function recordApiUsage(
  model: string,
  promptTokens: number,
  completionTokens: number,
  userId?: string,
): void {
  try {
    getDb()
      .prepare(
        `INSERT INTO api_usage_logs (user_id, model, prompt_tokens, completion_tokens, total_tokens)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(userId ?? null, model, promptTokens, completionTokens, promptTokens + completionTokens);
  } catch {
    // ログ失敗は無視
  }
}

export function getApiUsageSummary(model: string, userId?: string): ApiUsageSummary {
  const db = getDb();
  const userFilter = userId ? "AND user_id = ?" : "";
  const params = (base: unknown[]) => (userId ? [...base, userId] : base);

  const rpm = (
    db
      .prepare(
        `SELECT COUNT(*) as c FROM api_usage_logs
         WHERE model = ? AND created_at >= datetime('now', 'localtime', '-1 minute') ${userFilter}`,
      )
      .get(...params([model])) as { c: number }
  ).c;

  const rpd = (
    db
      .prepare(
        `SELECT COUNT(*) as c FROM api_usage_logs
         WHERE model = ? AND created_at >= date('now', 'localtime') ${userFilter}`,
      )
      .get(...params([model])) as { c: number }
  ).c;

  const tpmRow = db
    .prepare(
      `SELECT COALESCE(SUM(total_tokens), 0) as t FROM api_usage_logs
       WHERE model = ? AND created_at >= datetime('now', 'localtime', '-1 minute') ${userFilter}`,
    )
    .get(...params([model])) as { t: number };

  const tpdRow = db
    .prepare(
      `SELECT COALESCE(SUM(total_tokens), 0) as t FROM api_usage_logs
       WHERE model = ? AND created_at >= date('now', 'localtime') ${userFilter}`,
    )
    .get(...params([model])) as { t: number };

  return { rpm, rpd, tpm: tpmRow.t, tpd: tpdRow.t };
}

export function pruneApiUsageLogs(): void {
  // 7日以上前のログを削除
  getDb()
    .prepare(
      `DELETE FROM api_usage_logs WHERE created_at < datetime('now', 'localtime', '-7 days')`,
    )
    .run();
}

export interface ApiQuota {
  rpm: number;
  rpd: number;
  tpm: number;
}

export function getModelQuota(model: string): ApiQuota {
  const row = getDb().prepare("SELECT rpm, rpd, tpm FROM api_quotas WHERE model = ?").get(model) as
    | ApiQuota
    | undefined;
  return row ?? { rpm: 0, rpd: 0, tpm: 0 };
}

export function setModelQuota(model: string, quota: ApiQuota): void {
  getDb()
    .prepare(
      `INSERT INTO api_quotas (model, rpm, rpd, tpm) VALUES (?, ?, ?, ?)
       ON CONFLICT(model) DO UPDATE SET rpm=excluded.rpm, rpd=excluded.rpd, tpm=excluded.tpm`,
    )
    .run(model, quota.rpm, quota.rpd, quota.tpm);
}
