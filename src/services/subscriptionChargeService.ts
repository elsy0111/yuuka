import cron from "node-cron";
import { getDb } from "../db/database.js";
import { addExpense } from "../db/expenseRepo.js";
import {
  BILLING_CYCLE_LABELS,
  dueBillingDates,
  listAllSubscriptions,
  listSubscriptions,
  markSubscriptionCharged,
  type Subscription,
} from "../db/subscriptionRepo.js";
import { localWorkDate } from "../db/workRepo.js";

const DAILY_CHARGE_CRON = "5 0 * * *";

let task: cron.ScheduledTask | null = null;

function chargeSubscription(subscription: Subscription, today: string): number {
  return getDb().transaction(() => {
    const dates = dueBillingDates(
      subscription.start_date,
      subscription.billing_cycle,
      subscription.charge_from,
      subscription.last_charged_date,
      today,
    );
    for (const date of dates) {
      addExpense(
        subscription.user_id,
        subscription.amount,
        subscription.category,
        `${subscription.name}（サブスク・${BILLING_CYCLE_LABELS[subscription.billing_cycle]}）`,
        date,
        "subscription",
        subscription.name,
      );
    }
    if (dates.length > 0) markSubscriptionCharged(subscription.id, dates[dates.length - 1]);
    return dates.length;
  })();
}

/** 支払日を迎えたサブスクを家計簿に支出として記録し、記録件数を返す。 */
export function chargeDueSubscriptions(options: { userId?: string; today?: string } = {}): number {
  const today = options.today ?? localWorkDate();
  const subscriptions =
    options.userId === undefined ? listAllSubscriptions() : listSubscriptions(options.userId);
  const count = subscriptions.reduce((total, s) => total + chargeSubscription(s, today), 0);
  if (count > 0) console.log(`💳 サブスク支払い ${count} 件を家計簿に記録しました`);
  return count;
}

/** chargeDueSubscriptions の失敗をログに留め、記録件数（失敗時は0）を返す。 */
export function tryChargeDueSubscriptions(
  options: { userId?: string; today?: string } = {},
): number {
  try {
    return chargeDueSubscriptions(options);
  } catch (err) {
    console.error("サブスク支払い記録エラー:", err);
    return 0;
  }
}

function runCharge(): void {
  tryChargeDueSubscriptions();
}

export function startSubscriptionChargeService(): void {
  runCharge();
  task = cron.schedule(DAILY_CHARGE_CRON, runCharge);
  console.log("💳 サブスク支払い記録サービス開始");
}

export function stopSubscriptionChargeService(): void {
  if (task) {
    task.stop();
    task = null;
    console.log("💳 サブスク支払い記録サービス停止");
  }
}
