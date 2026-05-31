import * as expenseRepo from "../db/expenseRepo.js";
import { getMonthlyBudget, updateMonthlyBudget } from "../db/userRepo.js";
import { currentMonthLabel, formatCurrency, formatDate } from "../utils/formatters.js";

export function addExpense(
  userId: string,
  args: {
    amount: number;
    category: string;
    description?: string;
    date?: string;
    source?: string;
    purchase_source?: string;
  },
): string {
  const expense = expenseRepo.addExpense(
    userId,
    args.amount,
    args.category,
    args.description,
    args.date,
    args.source ?? "manual",
    args.purchase_source ?? "不明",
  );
  return JSON.stringify({
    success: true,
    message: `${formatCurrency(expense.amount)} (${expense.category}) を記録しました${expense.description ? ` — ${expense.description}` : ""}`,
    expense,
  });
}

export function getMonthlySummary(userId: string, args: { year?: number; month?: number }): string {
  const breakdown = expenseRepo.getMonthlyCategoryBreakdown(userId, args.year, args.month);
  const total = expenseRepo.getMonthlyTotal(userId, args.year, args.month);
  const label = currentMonthLabel(args.year, args.month);

  if (breakdown.length === 0) {
    return JSON.stringify({
      success: true,
      message: `${label}の支出記録はありません。`,
      total: 0,
      breakdown: [],
    });
  }

  const lines = breakdown.map((c) => `${c.category}: ${formatCurrency(c.total)} (${c.count}件)`);
  lines.push(`───────────`);
  lines.push(`合計: ${formatCurrency(total)}`);

  return JSON.stringify({
    success: true,
    message: `${label}の支出サマリー:\n${lines.join("\n")}`,
    total,
    breakdown,
  });
}

export function getCategoryBreakdown(
  userId: string,
  args: { year?: number; month?: number },
): string {
  const breakdown = expenseRepo.getMonthlyCategoryBreakdown(userId, args.year, args.month);
  const total = expenseRepo.getMonthlyTotal(userId, args.year, args.month);
  const label = currentMonthLabel(args.year, args.month);

  if (breakdown.length === 0) {
    return JSON.stringify({
      success: true,
      message: `${label}の支出記録はありません。`,
      total: 0,
      breakdown: [],
    });
  }

  const lines = breakdown.map((c) => {
    const ratio = total > 0 ? ((c.total / total) * 100).toFixed(1) : "0";
    return `${c.category}: ${formatCurrency(c.total)} (${ratio}%, ${c.count}件)`;
  });

  return JSON.stringify({
    success: true,
    message: `${label}のカテゴリ別内訳:\n${lines.join("\n")}\n合計: ${formatCurrency(total)}`,
    total,
    breakdown,
  });
}

export function listRecentExpenses(userId: string, args: { count?: number }): string {
  const expenses = expenseRepo.listRecentExpenses(userId, args.count ?? 10);
  if (expenses.length === 0) {
    return JSON.stringify({
      success: true,
      message: "支出の記録はありません。",
      expenses: [],
    });
  }

  const lines = expenses.map((e) => {
    const desc = e.description ? ` — ${e.description}` : "";
    return `${formatDate(e.date)} | ${e.category} | ${formatCurrency(e.amount)}${desc}`;
  });

  return JSON.stringify({
    success: true,
    message: `直近の支出:\n${lines.join("\n")}`,
    expenses,
  });
}

export function setMonthlyBudget(userId: string, args: { budget: number }): string {
  const amount = Math.round(args.budget);
  if (amount < 0) {
    return JSON.stringify({ success: false, message: "予算は0以上の金額で設定してください。" });
  }
  const ok = updateMonthlyBudget(userId, amount);
  const current = getMonthlyBudget(userId);
  return JSON.stringify({
    success: ok,
    message: ok
      ? `月次予算を ${formatCurrency(current)} に更新しました。`
      : "予算の更新に失敗しました。",
    budget: current,
  });
}

export function getMonthlyBudgetInfo(userId: string): string {
  const budget = getMonthlyBudget(userId);
  const now = new Date();
  const total = expenseRepo.getMonthlyTotal(userId, now.getFullYear(), now.getMonth() + 1);
  const remaining = budget - total;
  return JSON.stringify({
    success: true,
    message: `今月の予算: ${formatCurrency(budget)} / 支出: ${formatCurrency(total)} / 残り: ${formatCurrency(remaining)}`,
    budget,
    total,
    remaining,
  });
}
