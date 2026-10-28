import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const originalCwd = process.cwd();
const tempDir = mkdtempSync(path.join(tmpdir(), "yuuka-subscription-test-"));
process.chdir(tempDir);
process.env.DISCORD_TOKEN = "test-token";
process.env.DB_PATH = path.join(tempDir, "subscriptions.db");

const [migrations, db, repo, functions] = await Promise.all([
  import("../src/db/migrations.js"),
  import("../src/db/database.js"),
  import("../src/db/subscriptionRepo.js"),
  import("../src/functions/subscriptionFunctions.js"),
]);
migrations.runMigrations();
const sqlite = db.getDb();
for (const id of ["alice", "bob", "carol"]) {
  sqlite
    .prepare("INSERT INTO users (discord_id, username, password_hash) VALUES (?, ?, ?)")
    .run(id, id, "test");
}

test.after(() => {
  db.closeDb();
  process.chdir(originalCwd);
  rmSync(tempDir, { recursive: true, force: true });
});

test("subscriptions are isolated by user and edits are ownership scoped", () => {
  const sub = repo.addSubscription("bob", {
    name: "Netflix",
    amount: 1490,
    billingCycle: "monthly",
    startDate: "2026-01-05",
  });
  assert.equal(
    repo.listSubscriptions("alice").some((s) => s.id === sub.id),
    false,
  );
  assert.equal(repo.updateSubscription(sub.id, "alice", { amount: 1 }), undefined);
  assert.equal(repo.getSubscription(sub.id, "bob")?.amount, 1490);
  assert.equal(repo.deleteSubscription(sub.id, "alice"), false);
  assert.equal(repo.deleteSubscription(sub.id, "bob"), true);
});

test("partial update preserves unspecified fields", () => {
  const sub = repo.addSubscription("alice", {
    name: " Spotify ",
    amount: 980,
    billingCycle: "monthly",
    startDate: "2026-03-10",
    description: "family",
  });
  assert.equal(sub.name, "Spotify");
  const updated = repo.updateSubscription(sub.id, "alice", { amount: 1080 });
  assert.equal(updated?.name, "Spotify");
  assert.equal(updated?.start_date, "2026-03-10");
  assert.equal(updated?.description, "family");
  assert.equal(updated?.amount, 1080);
  assert.equal(repo.updateSubscription(sub.id, "alice", { description: " " })?.description, null);
  assert.throws(() => repo.updateSubscription(sub.id, "alice", { startDate: "2026-02-30" }));
  assert.throws(() => repo.updateSubscription(sub.id, "alice", { billingCycle: "weekly" }));
});

test("nextBillingDate rolls forward and clamps to month end from the original day", () => {
  assert.equal(repo.nextBillingDate("2026-01-05", "monthly", "2026-10-28"), "2026-11-05");
  assert.equal(repo.nextBillingDate("2026-01-28", "monthly", "2026-10-28"), "2026-10-28");
  assert.equal(repo.nextBillingDate("2026-01-31", "monthly", "2026-02-01"), "2026-02-28");
  assert.equal(repo.nextBillingDate("2026-01-31", "monthly", "2026-03-01"), "2026-03-31");
  assert.equal(repo.nextBillingDate("2026-01-31", "monthly", "2026-04-01"), "2026-04-30");
  assert.equal(repo.nextBillingDate("2025-12-15", "monthly", "2026-01-20"), "2026-02-15");
  assert.equal(repo.nextBillingDate("2024-02-29", "yearly", "2026-10-28"), "2027-02-28");
  assert.equal(repo.nextBillingDate("2024-02-29", "yearly", "2028-01-01"), "2028-02-29");
  assert.equal(repo.nextBillingDate("2025-11-01", "yearly", "2026-10-28"), "2026-11-01");
  assert.equal(repo.nextBillingDate("2026-12-01", "monthly", "2026-10-28"), "2026-12-01");
});

test("overview sorts by next billing date and totals monthly and yearly amounts", () => {
  repo.addSubscription("carol", {
    name: "Video",
    amount: 1000,
    billingCycle: "monthly",
    startDate: "2026-01-20",
  });
  repo.addSubscription("carol", {
    name: "Cloud",
    amount: 13000,
    billingCycle: "yearly",
    startDate: "2025-11-01",
  });
  const overview = repo.subscriptionOverview("carol", "2026-10-28");
  assert.deepEqual(
    overview.subscriptions.map((s) => [s.name, s.nextBillingDate, s.monthlyAmount]),
    [
      ["Cloud", "2026-11-01", 1083],
      ["Video", "2026-11-20", 1000],
    ],
  );
  assert.deepEqual(overview.summary, { count: 2, monthlyTotal: 2083, yearlyTotal: 25000 });
});

test("subscription tools reject invalid arguments", () => {
  for (const args of [
    { name: "", amount: 100, billing_cycle: "monthly" },
    { name: "x".repeat(101), amount: 100, billing_cycle: "monthly" },
    { name: "A", amount: 0, billing_cycle: "monthly" },
    { name: "A", amount: 1.5, billing_cycle: "monthly" },
    { name: "A", amount: 10_000_001, billing_cycle: "monthly" },
    { name: "A", amount: 100, billing_cycle: "weekly" },
    { name: "A", amount: 100, billing_cycle: "monthly", start_date: "2026-02-30" },
    { name: "A", amount: 100, billing_cycle: "monthly", description: "x".repeat(501) },
  ])
    assert.equal(JSON.parse(functions.addSubscription("alice", args)).success, false);
  assert.equal(JSON.parse(functions.deleteSubscription("alice", { id: 0 })).success, false);
  assert.equal(JSON.parse(functions.updateSubscription("alice", { id: 999999 })).success, false);
  const added = JSON.parse(
    functions.addSubscription("alice", { name: "Music", amount: 1490, billing_cycle: "monthly" }),
  );
  assert.equal(added.success, true);
  assert.equal(added.subscription.nextBillingDate, added.subscription.startDate);
  assert.equal(JSON.parse(functions.listSubscriptions("alice")).summary.count >= 1, true);
});

test("authenticated subscription API validates input and ignores forged owners", async () => {
  const { Readable } = await import("node:stream");
  const { handleSubscriptions } = await import("../src/server/routes/subscriptions.js");
  const session = await import("../src/server/session.js");
  const token = session.createSession("alice");
  async function call(url: string, body?: object | string, auth = token) {
    const request = Readable.from(
      body === undefined
        ? []
        : [Buffer.from(typeof body === "string" ? body : JSON.stringify(body))],
    );
    Object.assign(request, { headers: { authorization: `Bearer ${auth}` } });
    let status = 0;
    let result: Record<string, unknown> = {};
    const parsedUrl = new URL(url, "http://test");
    await handleSubscriptions({
      req: request,
      res: {
        writeHead(code: number) {
          status = code;
        },
        end(value: string) {
          result = JSON.parse(value);
        },
      },
      parsedUrl,
      pathname: parsedUrl.pathname,
      method: body === undefined ? "GET" : "POST",
    } as never);
    return { status, result };
  }
  assert.equal((await call("/api/subscriptions", undefined, "invalid")).status, 401);
  assert.equal((await call("/api/subscriptions/create", "null")).status, 400);
  assert.equal(
    (await call("/api/subscriptions/create", { name: "A", amount: "100", billingCycle: "monthly" }))
      .status,
    400,
  );
  const created = await call("/api/subscriptions/create", {
    name: "Prime",
    amount: 5900,
    billingCycle: "yearly",
    startDate: "2026-01-15",
    userId: "bob",
  });
  assert.equal(created.status, 200);
  const subscription = created.result.subscription as { id: number; monthlyAmount: number };
  assert.equal(subscription.monthlyAmount, 492);
  assert.equal(repo.getSubscription(subscription.id, "alice")?.name, "Prime");
  const victim = repo.addSubscription("bob", {
    name: "Victim",
    amount: 100,
    billingCycle: "monthly",
    startDate: "2026-01-01",
  });
  assert.equal((await call("/api/subscriptions/update", { id: victim.id, amount: 1 })).status, 404);
  assert.equal((await call("/api/subscriptions/delete", { id: victim.id })).status, 404);
  const edited = await call("/api/subscriptions/update", {
    id: subscription.id,
    description: "edited",
  });
  assert.equal(edited.status, 200);
  assert.equal((edited.result.subscription as { amount: number }).amount, 5900);
  assert.equal(
    (await call("/api/subscriptions/update", { id: subscription.id, amount: null })).status,
    400,
  );
  const list = await call("/api/subscriptions");
  assert.equal(list.status, 200);
  assert.equal(
    (list.result.subscriptions as { id: number }[]).some((s) => s.id === victim.id),
    false,
  );
  assert.equal(typeof (list.result.summary as { yearlyTotal: number }).yearlyTotal, "number");
  assert.equal((await call("/api/subscriptions/delete", { id: subscription.id })).status, 200);
  assert.equal((await call("/api/subscriptions/unknown", {})).status, 404);
  session.deleteSessionToken(token);
});
