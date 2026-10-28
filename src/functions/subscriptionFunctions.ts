import * as repo from "../db/subscriptionRepo.js";
import { tryChargeDueSubscriptions } from "../services/subscriptionChargeService.js";

function perform(operation: () => object): string {
  try {
    return JSON.stringify({ success: true, ...operation() });
  } catch (error) {
    return JSON.stringify({
      success: false,
      message:
        error instanceof repo.SubscriptionValidationError
          ? error.message
          : "サブスクの処理に失敗しました。",
    });
  }
}

type SubscriptionArgs = {
  name?: string;
  amount?: number;
  billing_cycle?: string;
  start_date?: string;
  description?: string;
  category?: string;
};

function chargedMessage(userId: string): string {
  return tryChargeDueSubscriptions({ userId }) > 0 ? "今日分の支払いを家計簿に記録しました。" : "";
}

function toInput(args: SubscriptionArgs): repo.SubscriptionInput {
  return {
    name: args.name,
    amount: args.amount,
    billingCycle: args.billing_cycle,
    startDate: args.start_date,
    description: args.description,
    category: args.category,
  };
}

export function addSubscription(userId: string, args: SubscriptionArgs): string {
  return perform(() => {
    const created = repo.addSubscription(userId, toInput(args));
    const charged = chargedMessage(userId);
    const subscription = repo.publicSubscription(
      repo.getSubscription(created.id, userId) ?? created,
    );
    return {
      subscription,
      message: `${subscription.name}を${repo.BILLING_CYCLE_LABELS[subscription.billingCycle]}${subscription.amount.toLocaleString()}円で登録しました。次回の支払日は${subscription.nextBillingDate}です。${charged}`,
    };
  });
}

export function listSubscriptions(userId: string): string {
  return perform(() => repo.subscriptionOverview(userId));
}

export function updateSubscription(
  userId: string,
  args: SubscriptionArgs & { id: number },
): string {
  return perform(() => {
    const updated = repo.updateSubscription(args.id, userId, toInput(args));
    if (!updated) throw new repo.SubscriptionValidationError("サブスクが見つかりません。");
    const charged = chargedMessage(userId);
    const subscription = repo.publicSubscription(
      repo.getSubscription(updated.id, userId) ?? updated,
    );
    return {
      subscription,
      message: `${subscription.name}を${repo.BILLING_CYCLE_LABELS[subscription.billingCycle]}${subscription.amount.toLocaleString()}円に更新しました。次回の支払日は${subscription.nextBillingDate}です。${charged}`,
    };
  });
}

export function deleteSubscription(userId: string, args: { id: number }): string {
  return perform(() => {
    if (!repo.deleteSubscription(args.id, userId))
      throw new repo.SubscriptionValidationError("サブスクが見つかりません。");
    return { message: "サブスクを削除しました。" };
  });
}
