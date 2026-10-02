import {
  addExpense,
  deleteExpense,
  getDailyExpenseTotals,
  getMonthlyCategoryBreakdown,
  getMonthlyCount,
  getMonthlyMaxDay,
  getMonthlyDailyExpenseTotals,
  getMonthlyTotal,
  listFilteredExpenses,
  listRecentExpenses,
  updateExpense,
} from "../../db/expenseRepo.js";
import { getMonthlyBudget, updateMonthlyBudget } from "../../db/userRepo.js";
import { processWebReceipt } from "../../services/webReceipt.js";
import { getRequestBody, sendError, sendJson } from "../http.js";
import { getSessionDiscordId } from "../session.js";
import type { RouteHandler } from "../types.js";

function isValidDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}

function isValidAmount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

export const handleExpenses: RouteHandler = async ({ req, res, parsedUrl, pathname, method }) => {
  if (pathname === "/api/expenses" && method === "GET") {
    try {
      const userId = getSessionDiscordId(req);
      if (!userId) {
        sendError(res, 401, "認証されていません。");
        return true;
      }
      const now = new Date();
      const year = Number(parsedUrl.searchParams.get("year") || now.getFullYear());
      const month = Number(parsedUrl.searchParams.get("month") || now.getMonth() + 1);
      if (
        !Number.isInteger(year) ||
        year < 1000 ||
        year > 9999 ||
        !Number.isInteger(month) ||
        month < 1 ||
        month > 12
      ) {
        sendError(res, 400, "年月が不正です。");
        return true;
      }
      const total = getMonthlyTotal(userId, year, month);
      const budget = getMonthlyBudget(userId);
      const daysElapsed = new Date().getDate();
      const breakdown = getMonthlyCategoryBreakdown(userId, year, month);
      sendJson(res, 200, {
        success: true,
        expenses: listRecentExpenses(userId, 5),
        total,
        budget,
        remaining: budget - total,
        breakdown,
        dailyTotals: getDailyExpenseTotals(userId, 7),
        monthlyDailyTotals: getMonthlyDailyExpenseTotals(userId, year, month),
        stats: {
          count: getMonthlyCount(userId, year, month),
          avgDaily: daysElapsed > 0 ? Math.round(total / daysElapsed) : 0,
          maxDay: getMonthlyMaxDay(userId, year, month),
          topCategories: breakdown.slice(0, 3),
        },
      });
    } catch {
      sendError(res, 500, "家計データの取得に失敗しました。");
    }
    return true;
  }

  if (pathname === "/api/expenses/all" && method === "GET") {
    const userId = getSessionDiscordId(req);
    if (!userId) {
      sendError(res, 401, "認証されていません。");
      return true;
    }
    const numberParam = (name: string) =>
      parsedUrl.searchParams.get(name) ? Number(parsedUrl.searchParams.get(name)) : undefined;
    const amountMin = numberParam("amountMin");
    const amountMax = numberParam("amountMax");
    if (
      (amountMin !== undefined && !Number.isFinite(amountMin)) ||
      (amountMax !== undefined && !Number.isFinite(amountMax))
    ) {
      sendError(res, 400, "金額フィルターが不正です。");
      return true;
    }
    const expenses = listFilteredExpenses(userId, {
      dateFrom: parsedUrl.searchParams.get("dateFrom") || undefined,
      dateTo: parsedUrl.searchParams.get("dateTo") || undefined,
      category: parsedUrl.searchParams.get("category") || undefined,
      source: parsedUrl.searchParams.get("source") || undefined,
      amountMin,
      amountMax,
      q: parsedUrl.searchParams.get("q") || undefined,
    });
    sendJson(res, 200, { success: true, expenses });
    return true;
  }

  if (pathname === "/api/expenses/add" && method === "POST") {
    try {
      const userId = getSessionDiscordId(req);
      if (!userId) {
        sendError(res, 401, "認証されていません。");
        return true;
      }
      const { amount, category, description, date, purchase_source } = JSON.parse(
        await getRequestBody(req),
      );
      if (
        !isValidAmount(amount) ||
        typeof category !== "string" ||
        !category.trim() ||
        !isValidDate(date)
      ) {
        sendError(res, 400, "金額とカテゴリは必須です。");
        return true;
      }
      const expense = addExpense(
        userId,
        amount,
        category,
        description,
        date,
        "web",
        purchase_source || "不明",
      );
      sendJson(res, 200, { success: true, expense });
    } catch {
      sendError(res, 500, "支出の追加に失敗しました。");
    }
    return true;
  }

  if (pathname === "/api/expenses/update" && method === "POST") {
    try {
      const userId = getSessionDiscordId(req);
      if (!userId) {
        sendError(res, 401, "認証されていません。");
        return true;
      }
      const { id, amount, category, description, date, purchase_source } = JSON.parse(
        await getRequestBody(req),
      );
      if (!Number.isInteger(id) || id <= 0) {
        sendError(res, 400, "IDが必要です。");
        return true;
      }
      if (amount !== undefined && !isValidAmount(amount)) {
        sendError(res, 400, "金額は正の整数で入力してください。");
        return true;
      }
      if (category !== undefined && (typeof category !== "string" || !category.trim())) {
        sendError(res, 400, "カテゴリが不正です。");
        return true;
      }
      if (date !== undefined && !isValidDate(date)) {
        sendError(res, 400, "日付が不正です。");
        return true;
      }
      const expense = updateExpense(id, userId, {
        amount,
        category,
        description,
        date,
        purchase_source,
      });
      sendJson(res, 200, { success: true, expense });
    } catch {
      sendError(res, 500, "支出の更新に失敗しました。");
    }
    return true;
  }

  if (pathname === "/api/expenses/delete" && method === "POST") {
    try {
      const userId = getSessionDiscordId(req);
      if (!userId) {
        sendError(res, 401, "認証されていません。");
        return true;
      }
      const { id } = JSON.parse(await getRequestBody(req));
      if (!id) {
        sendError(res, 400, "IDが必要です。");
        return true;
      }
      sendJson(res, 200, { success: deleteExpense(id, userId) });
    } catch {
      sendError(res, 500, "支出の削除に失敗しました。");
    }
    return true;
  }

  if (pathname === "/api/expenses/budget" && method === "POST") {
    try {
      const userId = getSessionDiscordId(req);
      if (!userId) {
        sendError(res, 401, "認証されていません。");
        return true;
      }
      const { budget } = JSON.parse(await getRequestBody(req));
      if (typeof budget !== "number" || budget < 0) {
        sendError(res, 400, "正の整数の budget が必要です。");
        return true;
      }
      const ok = updateMonthlyBudget(userId, Math.round(budget));
      sendJson(res, 200, { success: ok, budget: Math.round(budget) });
    } catch {
      sendError(res, 500, "予算の更新に失敗しました。");
    }
    return true;
  }

  if (pathname === "/api/expenses/upload-receipt" && method === "POST") {
    try {
      const userId = getSessionDiscordId(req);
      if (!userId) {
        sendError(res, 401, "認証されていません。");
        return true;
      }
      const { imageBase64, mimeType, additionalText } = JSON.parse(await getRequestBody(req));
      const saved = await processWebReceipt(userId, imageBase64, mimeType, additionalText);
      sendJson(res, 200, {
        success: true,
        response: `支出を${saved.expenses.length}件記録しました。`,
        savedCount: saved.expenses.length,
        expenses: saved.expenses,
        total: saved.total,
      });
    } catch (err) {
      console.error("WEBレシート解析エラー:", err);
      sendError(res, 500, "レシート解析中にエラーが発生しました。");
    }
    return true;
  }

  return false;
};
