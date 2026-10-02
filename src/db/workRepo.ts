import { getDb } from "./database.js";

export class WorkValidationError extends Error {}

export function localWorkDate(value = new Date()): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

export function validateRate(rate: unknown): asserts rate is number {
  if (typeof rate !== "number" || !Number.isInteger(rate) || rate < 1 || rate > 10_000_000) {
    throw new WorkValidationError("時給は1〜10,000,000円の整数で入力してください。");
  }
}

export function validateEntry(
  hours: unknown,
  date: unknown = localWorkDate(),
  description: unknown = "",
) {
  if (
    typeof hours !== "number" ||
    !Number.isFinite(hours) ||
    hours <= 0 ||
    hours > 24 ||
    Math.round(hours * 60) < 1
  ) {
    throw new WorkValidationError("労働時間は1分以上、24時間以内で入力してください。");
  }
  const timestamp = typeof date === "string" ? Date.parse(`${date}T00:00:00Z`) : Number.NaN;
  if (
    typeof date !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(timestamp) ||
    new Date(timestamp).toISOString().slice(0, 10) !== date
  ) {
    throw new WorkValidationError("日付を正しく入力してください。");
  }
  if (typeof description !== "string" || description.length > 500) {
    throw new WorkValidationError("メモは500文字以内で入力してください。");
  }
  return { minutes: Math.round(hours * 60), date, description: description.trim() };
}

export interface WorkEntry {
  id: number;
  user_id: string;
  date: string;
  minutes: number;
  hourly_rate: number;
  amount: number;
  description: string | null;
}
export function getRate(userId: string): number | null {
  const r = getDb()
    .prepare("SELECT hourly_rate FROM user_preferences WHERE discord_id=?")
    .get(userId) as { hourly_rate: number | null } | undefined;
  return r?.hourly_rate ?? null;
}
export function setRate(userId: string, rate: number): void {
  validateRate(rate);
  getDb()
    .prepare(
      "INSERT INTO user_preferences(discord_id,hourly_rate) VALUES(?,?) ON CONFLICT(discord_id) DO UPDATE SET hourly_rate=excluded.hourly_rate",
    )
    .run(userId, rate);
}
export function addEntry(
  userId: string,
  date: string,
  minutes: number,
  description?: string,
): WorkEntry {
  if (!Number.isInteger(minutes)) throw new WorkValidationError("時間は分単位で指定してください。");
  const values = validateEntry(minutes / 60, date, description);
  const rate = getRate(userId);
  if (rate === null) throw new WorkValidationError("先に時給を設定してください。");
  const amount = Math.round((minutes * rate) / 60);
  const r = getDb()
    .prepare(
      "INSERT INTO work_entries(user_id,date,minutes,hourly_rate,amount,description) VALUES(?,?,?,?,?,?)",
    )
    .run(userId, date, minutes, rate, amount, values.description || null);
  return getDb()
    .prepare("SELECT * FROM work_entries WHERE id=?")
    .get(r.lastInsertRowid) as WorkEntry;
}
export function listEntries(userId: string, from: string, until?: string): WorkEntry[] {
  return getDb()
    .prepare(
      "SELECT * FROM work_entries WHERE user_id=? AND date>=? AND (? IS NULL OR date<?) ORDER BY date DESC,id DESC",
    )
    .all(userId, from, until ?? null, until ?? null) as WorkEntry[];
}
export function deleteEntry(id: number, userId: string): boolean {
  if (!Number.isSafeInteger(id) || id <= 0) throw new WorkValidationError("記録IDが不正です。");
  return (
    getDb().prepare("DELETE FROM work_entries WHERE id=? AND user_id=?").run(id, userId).changes > 0
  );
}

export function updateEntry(
  id: number,
  userId: string,
  fields: { hours?: number; date?: string; description?: string },
): WorkEntry | undefined {
  if (!Number.isSafeInteger(id) || id < 1) throw new WorkValidationError("記録IDが不正です。");
  const existing = getDb()
    .prepare("SELECT * FROM work_entries WHERE id=? AND user_id=?")
    .get(id, userId) as WorkEntry | undefined;
  if (!existing) return undefined;
  const input = validateEntry(
    fields.hours ?? existing.minutes / 60,
    fields.date ?? existing.date,
    fields.description ?? existing.description ?? "",
  );
  getDb()
    .prepare(
      "UPDATE work_entries SET date=?,minutes=?,amount=?,description=? WHERE id=? AND user_id=?",
    )
    .run(
      input.date,
      input.minutes,
      Math.round((input.minutes * existing.hourly_rate) / 60),
      input.description || null,
      id,
      userId,
    );
  return getDb()
    .prepare("SELECT * FROM work_entries WHERE id=? AND user_id=?")
    .get(id, userId) as WorkEntry;
}

export function publicEntry(entry: WorkEntry) {
  return {
    id: entry.id,
    date: entry.date,
    minutes: entry.minutes,
    hourlyRate: entry.hourly_rate,
    amount: entry.amount,
    description: entry.description,
  };
}

export function monthlyWork(userId: string, now = new Date()) {
  const from = localWorkDate(new Date(now.getFullYear(), now.getMonth(), 1));
  const until = localWorkDate(new Date(now.getFullYear(), now.getMonth() + 1, 1));
  const entries = listEntries(userId, from, until);
  return {
    hourlyRate: getRate(userId),
    entries: entries.map(publicEntry),
    summary: {
      minutes: entries.reduce((total, entry) => total + entry.minutes, 0),
      amount: entries.reduce((total, entry) => total + entry.amount, 0),
      count: entries.length,
    },
  };
}
