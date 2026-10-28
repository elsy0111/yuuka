import * as repo from "../db/subscriptionRepo.js";

const CYCLE_LABELS: Record<repo.BillingCycle, string> = { monthly: "月払い", yearly: "年払い" };

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
};

function toInput(args: SubscriptionArgs): repo.SubscriptionInput {
  return {
    name: args.name,
    amount: args.amount,
    billingCycle: args.billing_cycle,
    startDate: args.start_date,
    description: args.description,
  };
}

export function addSubscription(userId: string, args: SubscriptionArgs): string {
  return perform(() => {
    const subscription = repo.publicSubscription(repo.addSubscription(userId, toInput(args)));
    return {
      subscription,
      message: `${subscription.name}を${CYCLE_LABELS[subscription.billingCycle]}${subscription.amount.toLocaleString()}円で登録しました。次回の支払日は${subscription.nextBillingDate}です。`,
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
    const subscription = repo.publicSubscription(updated);
    return {
      subscription,
      message: `${subscription.name}を${CYCLE_LABELS[subscription.billingCycle]}${subscription.amount.toLocaleString()}円に更新しました。次回の支払日は${subscription.nextBillingDate}です。`,
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
