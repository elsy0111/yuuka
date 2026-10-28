import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const originalCwd = process.cwd();
const tempDir = mkdtempSync(path.join(tmpdir(), "yuuka-subscription-charge-test-"));
process.chdir(tempDir);
process.env.DISCORD_TOKEN = "test-token";
process.env.DB_PATH = path.join(tempDir, "subscription-charge.db");

const [migrations, db, repo, functions, service, work] = await Promise.all([
  import("../src/db/migrations.js"),
  import("../src/db/database.js"),
  import("../src/db/subscriptionRepo.js"),
  import("../src/functions/subscriptionFunctions.js"),
  import("../src/services/subscriptionChargeService.js"),
  import("../src/db/workRepo.js"),
]);
migrations.runMigrations();
const sqlite = db.getDb();
for (const id of ["alice", "bob", "dave"]) {
  sqlite
    .prepare("INSERT INTO users (discord_id, username, password_hash) VALUES (?, ?, ?)")
    .run(id, id, "test");
}

function subscriptionExpenses(userId: string) {
  return sqlite
    .prepare(
      "SELECT amount, category, description, date, source, purchase_source FROM expenses WHERE user_id=? AND source='subscription' ORDER BY date, id",
    )
    .all(userId) as {
    amount: number;
    category: string;
    description: string;
    date: string;
    source: string;
    purchase_source: string;
  }[];
}

function setChargeFrom(id: number, date: string) {
  sqlite.prepare("UPDATE subscriptions SET charge_from=? WHERE id=?").run(date, id);
}

test.after(() => {
  db.closeDb();
  process.chdir(originalCwd);
  rmSync(tempDir, { recursive: true, force: true });
});

test("dueBillingDates applies charge_from, last charged date, month-end clamp and catch-up", () => {
  assert.deepEqual(
    repo.dueBillingDates("2026-01-05", "monthly", "2026-08-10", null, "2026-10-28"),
    ["2026-09-05", "2026-10-05"],
  );
  assert.deepEqual(
    repo.dueBillingDates("2026-01-05", "monthly", "2026-08-01", "2026-09-05", "2026-10-28"),
    ["2026-10-05"],
  );
  assert.deepEqual(
    repo.dueBillingDates("2026-01-31", "monthly", "2026-01-01", null, "2026-04-30"),
    ["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"],
  );
  assert.deepEqual(repo.dueBillingDates("2024-02-29", "yearly", "2024-01-01", null, "2026-10-28"), [
    "2024-02-29",
    "2025-02-28",
    "2026-02-28",
  ]);
  assert.deepEqual(
    repo.dueBillingDates("2026-12-01", "monthly", "2026-10-28", null, "2026-10-28"),
    [],
  );
  assert.deepEqual(
    repo.dueBillingDates("2026-10-28", "monthly", "2026-10-28", null, "2026-10-28"),
    ["2026-10-28"],
  );
  assert.deepEqual(
    repo.dueBillingDates("2026-10-28", "monthly", "2026-10-28", "2026-10-28", "2026-10-28"),
    [],
  );
});

test("dueBillingDates never charges twice in the same billing period after a date change", () => {
  assert.deepEqual(
    repo.dueBillingDates("2026-10-20", "monthly", "2026-10-01", "2026-10-05", "2026-11-25"),
    ["2026-11-20"],
  );
  assert.deepEqual(
    repo.dueBillingDates("2026-09-01", "yearly", "2026-01-01", "2026-03-10", "2027-10-01"),
    ["2027-09-01"],
  );
});

test("category defaults to その他, is validated and kept on partial update", () => {
  const sub = repo.addSubscription("dave", {
    name: "Cloud",
    amount: 300,
    billingCycle: "monthly",
    startDate: "2026-01-01",
  });
  assert.equal(sub.category, "その他");
  assert.equal(sub.charge_from, work.localWorkDate());
  assert.equal(repo.updateSubscription(sub.id, "dave", { category: "通信費" })?.category, "通信費");
  assert.equal(repo.updateSubscription(sub.id, "dave", { amount: 400 })?.category, "通信費");
  assert.throws(
    () => repo.updateSubscription(sub.id, "dave", { category: "ゲーム" }),
    /カテゴリが不正です/,
  );
  assert.throws(() =>
    repo.addSubscription("dave", {
      name: "X",
      amount: 1,
      billingCycle: "monthly",
      category: "ゲーム",
    }),
  );
  assert.equal(
    JSON.parse(
      functions.addSubscription("dave", {
        name: "X",
        amount: 1,
        billing_cycle: "monthly",
        category: "ゲーム",
      }),
    ).success,
    false,
  );
  const stored = repo.getSubscription(sub.id, "dave");
  assert.ok(stored);
  const pub = repo.publicSubscription(stored, "2026-10-28");
  assert.equal(pub.category, "通信費");
  assert.equal(pub.lastChargedDate, null);
});

test("chargeDueSubscriptions records expenses once, scoped to the given user", () => {
  const alice = repo.addSubscription("alice", {
    name: "Netflix",
    amount: 1490,
    billingCycle: "monthly",
    startDate: "2026-07-05",
    category: "娯楽",
  });
  setChargeFrom(alice.id, "2026-08-01");
  const bob = repo.addSubscription("bob", {
    name: "Phone",
    amount: 3000,
    billingCycle: "monthly",
    startDate: "2026-07-10",
  });
  setChargeFrom(bob.id, "2026-10-01");

  assert.equal(service.chargeDueSubscriptions({ userId: "alice", today: "2026-10-28" }), 3);
  assert.equal(subscriptionExpenses("bob").length, 0);
  assert.deepEqual(
    subscriptionExpenses("alice"),
    ["2026-08-05", "2026-09-05", "2026-10-05"].map((date) => ({
      amount: 1490,
      category: "娯楽",
      description: "Netflix（サブスク・月払い）",
      date,
      source: "subscription",
      purchase_source: "Netflix",
    })),
  );
  assert.equal(repo.getSubscription(alice.id, "alice")?.last_charged_date, "2026-10-05");

  assert.equal(service.chargeDueSubscriptions({ userId: "alice", today: "2026-10-28" }), 0);
  assert.equal(subscriptionExpenses("alice").length, 3);

  service.chargeDueSubscriptions({ today: "2026-10-28" });
  assert.deepEqual(
    subscriptionExpenses("bob").map((e) => [e.date, e.category]),
    [["2026-10-10", "その他"]],
  );
  assert.equal(subscriptionExpenses("alice").length, 3);

  service.chargeDueSubscriptions({ today: "2026-11-05" });
  assert.equal(subscriptionExpenses("alice").at(-1)?.date, "2026-11-05");
  assert.equal(subscriptionExpenses("alice").length, 4);
});

test("a subscription starting today is charged immediately by the tool", () => {
  const result = JSON.parse(
    functions.addSubscription("dave", {
      name: "Music",
      amount: 980,
      billing_cycle: "monthly",
      category: "娯楽",
    }),
  );
  assert.equal(result.success, true);
  assert.match(result.message, /今日分の支払いを家計簿に記録しました。/);
  assert.equal(result.subscription.lastChargedDate, work.localWorkDate());
  const expenses = subscriptionExpenses("dave").filter((e) => e.purchase_source === "Music");
  assert.deepEqual(
    expenses.map((e) => [e.date, e.amount, e.category]),
    [[work.localWorkDate(), 980, "娯楽"]],
  );
});
