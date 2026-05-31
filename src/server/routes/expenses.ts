import {
  addExpense,
  deleteExpense,
  getDailyExpenseTotals,
  getMonthlyCategoryBreakdown,
  getMonthlyCount,
  getMonthlyMaxDay,
  getMonthlyTotal,
  listFilteredExpenses,
  listRecentExpenses,
  updateExpense,
} from "../../db/expenseRepo.js";
import { getMonthlyBudget, updateMonthlyBudget } from "../../db/userRepo.js";
import { parseReceipt } from "../../services/receiptParser.js";
import { getRequestBody, sendError, sendJson } from "../http.js";
import { getSessionDiscordId } from "../session.js";
import type { RouteHandler } from "../types.js";

export const handleExpenses: RouteHandler = async ({ req, res, parsedUrl, pathname, method }) => {
  if (pathname === "/api/expenses" && method === "GET") {
    try {
      const userId = getSessionDiscordId(req);
      if (!userId) { sendError(res, 401, "認証されていません。"); return true; }
      const now = new Date();
      const year = parseInt(parsedUrl.searchParams.get("year") || String(now.getFullYear()), 10);
      const month = parseInt(parsedUrl.searchParams.get("month") || String(now.getMonth() + 1), 10);
      const total = getMonthlyTotal(userId, year, month);
      const budget = getMonthlyBudget(userId);
      const daysElapsed = new Date().getDate();
      const breakdown = getMonthlyCategoryBreakdown(userId, year, month);
      sendJson(res, 200, {
        success: true,
        expenses: listRecentExpenses(userId, 30),
        total,
        budget,
        remaining: budget - total,
        breakdown,
        dailyTotals: getDailyExpenseTotals(userId, 7),
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
    if (!userId) { sendError(res, 401, "認証されていません。"); return true; }
    const numberParam = (name: string) =>
      parsedUrl.searchParams.get(name) ? Number(parsedUrl.searchParams.get(name)) : undefined;
    const expenses = listFilteredExpenses(userId, {
      dateFrom: parsedUrl.searchParams.get("dateFrom") || undefined,
      dateTo: parsedUrl.searchParams.get("dateTo") || undefined,
      category: parsedUrl.searchParams.get("category") || undefined,
      source: parsedUrl.searchParams.get("source") || undefined,
      amountMin: numberParam("amountMin"),
      amountMax: numberParam("amountMax"),
      q: parsedUrl.searchParams.get("q") || undefined,
    });
    sendJson(res, 200, { success: true, expenses });
    return true;
  }

  if (pathname === "/api/expenses/add" && method === "POST") {
    try {
      const userId = getSessionDiscordId(req);
      if (!userId) { sendError(res, 401, "認証されていません。"); return true; }
      const { amount, category, description, date, purchase_source } = JSON.parse(
        await getRequestBody(req),
      );
      if (!amount || !category) {
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
      if (!userId) { sendError(res, 401, "認証されていません。"); return true; }
      const { id, amount, category, description, date, purchase_source } = JSON.parse(
        await getRequestBody(req),
      );
      if (!id) {
        sendError(res, 400, "IDが必要です。");
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
      if (!userId) { sendError(res, 401, "認証されていません。"); return true; }
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
      if (!userId) { sendError(res, 401, "認証されていません。"); return true; }
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
      if (!userId) { sendError(res, 401, "認証されていません。"); return true; }
      const { imageBase64, mimeType, additionalText } = JSON.parse(
        await getRequestBody(req),
      );
      if (!imageBase64 || !mimeType) {
        sendError(res, 400, "画像データ(base64)とMIMEタイプが必要です。");
        return true;
      }
      const response = await parseReceipt(
        userId,
        imageBase64,
        mimeType,
        additionalText,
      );
      sendJson(res, 200, { success: true, response });
    } catch (err) {
      console.error("WEBレシート解析エラー:", err);
      sendError(res, 500, "レシート解析中にエラーが発生しました。");
    }
    return true;
  }

  return false;
};
