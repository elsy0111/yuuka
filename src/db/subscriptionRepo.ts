import { getDb } from "./database.js";
import { localWorkDate } from "./workRepo.js";

export class SubscriptionValidationError extends Error {}

export const BILLING_CYCLES = ["monthly", "yearly"] as const;
export type BillingCycle = (typeof BILLING_CYCLES)[number];

const MONTHS_PER_CYCLE: Record<BillingCycle, number> = { monthly: 1, yearly: 12 };

export interface Subscription {
  id: number;
  user_id: string;
  name: string;
  amount: number;
  billing_cycle: BillingCycle;
  start_date: string;
  description: string | null;
}

export interface SubscriptionInput {
  name?: unknown;
  amount?: unknown;
  billingCycle?: unknown;
  startDate?: unknown;
  description?: unknown;
}

function isCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
}

function validateId(id: unknown): asserts id is number {
  if (typeof id !== "number" || !Number.isSafeInteger(id) || id < 1) {
    throw new SubscriptionValidationError("サブスクIDが不正です。");
  }
}

export function validateSubscription(input: SubscriptionInput) {
  const { name, amount, billingCycle, startDate = localWorkDate(), description } = input;
  const trimmedName = typeof name === "string" ? name.trim() : "";
  if (trimmedName.length < 1 || trimmedName.length > 100) {
    throw new SubscriptionValidationError("サービス名は1〜100文字で入力してください。");
  }
  if (
    typeof amount !== "number" ||
    !Number.isInteger(amount) ||
    amount < 1 ||
    amount > 10_000_000
  ) {
    throw new SubscriptionValidationError("金額は1〜10,000,000円の整数で入力してください。");
  }
  if (!BILLING_CYCLES.includes(billingCycle as BillingCycle)) {
    throw new SubscriptionValidationError(
      "支払い周期は月払い（monthly）か年払い（yearly）で指定してください。",
    );
  }
  if (!isCalendarDate(startDate)) {
    throw new SubscriptionValidationError("開始日をYYYY-MM-DD形式で正しく入力してください。");
  }
  if (description !== undefined && description !== null && typeof description !== "string") {
    throw new SubscriptionValidationError("メモは500文字以内で入力してください。");
  }
  const trimmedDescription = (description ?? "").trim();
  if (trimmedDescription.length > 500) {
    throw new SubscriptionValidationError("メモは500文字以内で入力してください。");
  }
  return {
    name: trimmedName,
    amount,
    billingCycle: billingCycle as BillingCycle,
    startDate,
    description: trimmedDescription || null,
  };
}

export function addSubscription(userId: string, input: SubscriptionInput): Subscription {
  const values = validateSubscription(input);
  const r = getDb()
    .prepare(
      "INSERT INTO subscriptions(user_id,name,amount,billing_cycle,start_date,description) VALUES(?,?,?,?,?,?)",
    )
    .run(
      userId,
      values.name,
      values.amount,
      values.billingCycle,
      values.startDate,
      values.description,
    );
  return getDb()
    .prepare("SELECT * FROM subscriptions WHERE id=?")
    .get(r.lastInsertRowid) as Subscription;
}

export function listSubscriptions(userId: string): Subscription[] {
  return getDb()
    .prepare("SELECT * FROM subscriptions WHERE user_id=? ORDER BY id")
    .all(userId) as Subscription[];
}

export function getSubscription(id: number, userId: string): Subscription | undefined {
  validateId(id);
  return getDb().prepare("SELECT * FROM subscriptions WHERE id=? AND user_id=?").get(id, userId) as
    | Subscription
    | undefined;
}

export function updateSubscription(
  id: number,
  userId: string,
  fields: SubscriptionInput,
): Subscription | undefined {
  const existing = getSubscription(id, userId);
  if (!existing) return undefined;
  const values = validateSubscription({
    name: fields.name !== undefined ? fields.name : existing.name,
    amount: fields.amount !== undefined ? fields.amount : existing.amount,
    billingCycle: fields.billingCycle !== undefined ? fields.billingCycle : existing.billing_cycle,
    startDate: fields.startDate !== undefined ? fields.startDate : existing.start_date,
    description: fields.description !== undefined ? fields.description : existing.description,
  });
  getDb()
    .prepare(
      "UPDATE subscriptions SET name=?,amount=?,billing_cycle=?,start_date=?,description=? WHERE id=? AND user_id=?",
    )
    .run(
      values.name,
      values.amount,
      values.billingCycle,
      values.startDate,
      values.description,
      id,
      userId,
    );
  return getSubscription(id, userId);
}

export function deleteSubscription(id: number, userId: string): boolean {
  validateId(id);
  return (
    getDb().prepare("DELETE FROM subscriptions WHERE id=? AND user_id=?").run(id, userId).changes >
    0
  );
}

function shiftMonths(year: number, month: number, day: number, months: number): string {
  const total = year * 12 + (month - 1) + months;
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
}

export function nextBillingDate(startDate: string, cycle: BillingCycle, today: string): string {
  if (startDate >= today) return startDate;
  const [sy, sm, sd] = startDate.split("-").map(Number);
  const [ty, tm] = today.split("-").map(Number);
  const step = MONTHS_PER_CYCLE[cycle];
  let k = Math.floor(((ty - sy) * 12 + (tm - sm)) / step);
  let candidate = shiftMonths(sy, sm, sd, k * step);
  while (candidate < today) {
    k += 1;
    candidate = shiftMonths(sy, sm, sd, k * step);
  }
  return candidate;
}

function monthlyAmount(s: Subscription): number {
  return s.billing_cycle === "monthly" ? s.amount : Math.round(s.amount / 12);
}

export function publicSubscription(s: Subscription, today = localWorkDate()) {
  return {
    id: s.id,
    name: s.name,
    amount: s.amount,
    billingCycle: s.billing_cycle,
    startDate: s.start_date,
    nextBillingDate: nextBillingDate(s.start_date, s.billing_cycle, today),
    monthlyAmount: monthlyAmount(s),
    description: s.description,
  };
}

export function subscriptionOverview(userId: string, today = localWorkDate()) {
  const rows = listSubscriptions(userId);
  const subscriptions = rows
    .map((s) => publicSubscription(s, today))
    .sort((a, b) =>
      a.nextBillingDate === b.nextBillingDate
        ? a.id - b.id
        : a.nextBillingDate < b.nextBillingDate
          ? -1
          : 1,
    );
  return {
    subscriptions,
    summary: {
      count: rows.length,
      monthlyTotal: subscriptions.reduce((total, s) => total + s.monthlyAmount, 0),
      yearlyTotal: rows.reduce(
        (total, s) => total + (s.billing_cycle === "monthly" ? s.amount * 12 : s.amount),
        0,
      ),
    },
  };
}
