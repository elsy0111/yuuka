import { getDb } from "./database.js";

export interface Expense {
  id: number;
  user_id: string;
  amount: number;
  category: string;
  description: string | null;
  date: string;
  source: string;
  purchase_source: string;
  created_at: string;
}

export interface CategoryTotal {
  category: string;
  total: number;
  count: number;
}

export interface DailyExpenseTotal {
  date: string;
  total: number;
}

export const CATEGORIES = [
  "食費",
  "日用品",
  "交通費",
  "光熱費",
  "通信費",
  "医療費",
  "娯楽",
  "衣服",
  "その他",
] as const;

export type Category = (typeof CATEGORIES)[number];

export function addExpense(
  userId: string,
  amount: number,
  category: string,
  description?: string,
  date?: string,
  source: string = "manual",
  purchaseSource: string = "不明",
): Expense {
  const db = getDb();
  const expenseDate = date ?? new Date().toISOString().slice(0, 10);
  const stmt = db.prepare(`
    INSERT INTO expenses (user_id, amount, category, description, date, source, purchase_source)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    userId,
    amount,
    category,
    description ?? null,
    expenseDate,
    source,
    purchaseSource,
  );
  const expense = getExpenseById(result.lastInsertRowid as number);
  if (!expense) {
    throw new Error("Failed to load created expense");
  }
  return expense;
}

export function getExpenseById(id: number): Expense | undefined {
  const db = getDb();
  return db.prepare("SELECT * FROM expenses WHERE id = ?").get(id) as Expense | undefined;
}

export function getMonthlyTotal(userId: string, year?: number, month?: number): number {
  const db = getDb();
  const now = new Date();
  const y = year ?? now.getFullYear();
  const m = month ?? now.getMonth() + 1;
  const prefix = `${y}-${String(m).padStart(2, "0")}`;

  const row = db
    .prepare(
      "SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE user_id = ? AND date LIKE ?",
    )
    .get(userId, `${prefix}%`) as { total: number };
  return row.total;
}

export function getMonthlyCategoryBreakdown(
  userId: string,
  year?: number,
  month?: number,
): CategoryTotal[] {
  const db = getDb();
  const now = new Date();
  const y = year ?? now.getFullYear();
  const m = month ?? now.getMonth() + 1;
  const prefix = `${y}-${String(m).padStart(2, "0")}`;

  return db
    .prepare(
      `SELECT category, SUM(amount) as total, COUNT(*) as count 
       FROM expenses 
       WHERE user_id = ? AND date LIKE ?
       GROUP BY category 
       ORDER BY total DESC`,
    )
    .all(userId, `${prefix}%`) as CategoryTotal[];
}

export function listRecentExpenses(userId: string, count: number = 10): Expense[] {
  const db = getDb();
  return db
    .prepare("SELECT * FROM expenses WHERE user_id = ? ORDER BY date DESC, created_at DESC LIMIT ?")
    .all(userId, count) as Expense[];
}

export function getMonthlyCount(userId: string, year?: number, month?: number): number {
  const db = getDb();
  const now = new Date();
  const y = year ?? now.getFullYear();
  const m = month ?? now.getMonth() + 1;
  const prefix = `${y}-${String(m).padStart(2, "0")}`;
  const row = db
    .prepare("SELECT COUNT(*) as cnt FROM expenses WHERE user_id = ? AND date LIKE ?")
    .get(userId, `${prefix}%`) as { cnt: number };
  return row.cnt;
}

export function getMonthlyMaxDay(
  userId: string,
  year?: number,
  month?: number,
): DailyExpenseTotal | null {
  const db = getDb();
  const now = new Date();
  const y = year ?? now.getFullYear();
  const m = month ?? now.getMonth() + 1;
  const prefix = `${y}-${String(m).padStart(2, "0")}`;
  const row = db
    .prepare(
      `SELECT date, SUM(amount) as total FROM expenses
       WHERE user_id = ? AND date LIKE ?
       GROUP BY date ORDER BY total DESC LIMIT 1`,
    )
    .get(userId, `${prefix}%`) as DailyExpenseTotal | undefined;
  return row ?? null;
}

export function getDailyExpenseTotals(userId: string, days: number = 6): DailyExpenseTotal[] {
  const safeDays = Math.max(1, Math.min(days, 31));
  const dateStrings = Array.from({ length: safeDays }, (_, idx) => {
    const d = new Date();
    d.setDate(d.getDate() - (safeDays - 1 - idx));
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  });

  const rows = getDb()
    .prepare(`
      SELECT date, COALESCE(SUM(amount), 0) as total
      FROM expenses
      WHERE user_id = ? AND date BETWEEN ? AND ?
      GROUP BY date
    `)
    .all(userId, dateStrings[0], dateStrings[dateStrings.length - 1]) as DailyExpenseTotal[];

  const totals = new Map(rows.map((row) => [row.date, row.total]));
  return dateStrings.map((date) => ({ date, total: totals.get(date) ?? 0 }));
}

export interface ExpenseFilter {
  dateFrom?: string;
  dateTo?: string;
  category?: string;
  source?: string;
  amountMin?: number;
  amountMax?: number;
  q?: string;
}

export function updateExpense(
  id: number,
  userId: string,
  fields: {
    amount?: number;
    category?: string;
    description?: string | null;
    date?: string;
    purchase_source?: string;
  },
): Expense | undefined {
  const db = getDb();
  const sets: string[] = [];
  const params: unknown[] = [];
  if (fields.amount !== undefined) {
    sets.push("amount = ?");
    params.push(fields.amount);
  }
  if (fields.category !== undefined) {
    sets.push("category = ?");
    params.push(fields.category);
  }
  if ("description" in fields) {
    sets.push("description = ?");
    params.push(fields.description ?? null);
  }
  if (fields.date !== undefined) {
    sets.push("date = ?");
    params.push(fields.date);
  }
  if (fields.purchase_source !== undefined) {
    sets.push("purchase_source = ?");
    params.push(fields.purchase_source);
  }
  if (sets.length === 0) return getExpenseById(id);
  params.push(id, userId);
  db.prepare(`UPDATE expenses SET ${sets.join(", ")} WHERE id = ? AND user_id = ?`).run(...params);
  return getExpenseById(id);
}

export function deleteExpense(id: number, userId: string): boolean {
  const db = getDb();
  const result = db.prepare("DELETE FROM expenses WHERE id = ? AND user_id = ?").run(id, userId);
  return result.changes > 0;
}

export function listFilteredExpenses(userId: string, filter: ExpenseFilter = {}): Expense[] {
  const db = getDb();
  const conditions: string[] = ["user_id = ?"];
  const params: unknown[] = [userId];

  if (filter.dateFrom) {
    conditions.push("date >= ?");
    params.push(filter.dateFrom);
  }
  if (filter.dateTo) {
    conditions.push("date <= ?");
    params.push(filter.dateTo);
  }
  if (filter.category) {
    conditions.push("category = ?");
    params.push(filter.category);
  }
  if (filter.source) {
    conditions.push("source = ?");
    params.push(filter.source);
  }
  if (filter.amountMin != null) {
    conditions.push("amount >= ?");
    params.push(filter.amountMin);
  }
  if (filter.amountMax != null) {
    conditions.push("amount <= ?");
    params.push(filter.amountMax);
  }
  if (filter.q) {
    const like = `%${filter.q}%`;
    conditions.push(`(
      CAST(amount AS TEXT) LIKE ?
      OR category LIKE ?
      OR COALESCE(description, '') LIKE ?
      OR date LIKE ?
      OR source LIKE ?
      OR purchase_source LIKE ?
    )`);
    params.push(like, like, like, like, like, like);
  }

  const sql = `SELECT * FROM expenses WHERE ${conditions.join(" AND ")} ORDER BY date DESC, created_at DESC`;
  return db.prepare(sql).all(...params) as Expense[];
}
