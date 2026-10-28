import {
  addSubscription,
  deleteSubscription,
  getSubscription,
  publicSubscription,
  SubscriptionValidationError,
  subscriptionOverview,
  updateSubscription,
} from "../../db/subscriptionRepo.js";
import { tryChargeDueSubscriptions } from "../../services/subscriptionChargeService.js";
import { getRequestBody, sendError, sendJson } from "../http.js";
import { getSessionDiscordId } from "../session.js";
import type { RouteHandler } from "../types.js";

export const handleSubscriptions: RouteHandler = async ({ req, res, pathname, method }) => {
  if (pathname !== "/api/subscriptions" && !pathname.startsWith("/api/subscriptions/"))
    return false;
  const user = getSessionDiscordId(req);
  if (!user) {
    sendError(res, 401, "認証されていません。");
    return true;
  }
  try {
    if (pathname === "/api/subscriptions" && method === "GET") {
      sendJson(res, 200, { success: true, ...subscriptionOverview(user) });
      return true;
    }
    if (
      method !== "POST" ||
      ![
        "/api/subscriptions/create",
        "/api/subscriptions/update",
        "/api/subscriptions/delete",
      ].includes(pathname)
    ) {
      sendError(res, 404, "APIエンドポイントが見つかりません。");
      return true;
    }
    let body: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(await getRequestBody(req));
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
        throw new Error("invalid body");
      body = parsed as Record<string, unknown>;
    } catch {
      sendError(res, 400, "JSONが不正です。");
      return true;
    }
    const fields = {
      name: body.name,
      amount: body.amount,
      billingCycle: body.billingCycle,
      startDate: body.startDate,
      description: body.description,
      category: body.category,
    };
    if (pathname === "/api/subscriptions/create") {
      const created = addSubscription(user, fields);
      tryChargeDueSubscriptions({ userId: user });
      sendJson(res, 200, {
        success: true,
        subscription: publicSubscription(getSubscription(created.id, user) ?? created),
      });
    } else if (pathname === "/api/subscriptions/update") {
      const subscription = updateSubscription(body.id as number, user, fields);
      if (!subscription) {
        sendError(res, 404, "サブスクが見つかりません。");
        return true;
      }
      tryChargeDueSubscriptions({ userId: user });
      sendJson(res, 200, {
        success: true,
        subscription: publicSubscription(getSubscription(subscription.id, user) ?? subscription),
      });
    } else {
      if (!deleteSubscription(body.id as number, user)) {
        sendError(res, 404, "サブスクが見つかりません。");
        return true;
      }
      sendJson(res, 200, { success: true });
    }
  } catch (error) {
    if (error instanceof SubscriptionValidationError) sendError(res, 400, error.message);
    else sendError(res, 500, "サブスクの処理に失敗しました。");
  }
  return true;
};
