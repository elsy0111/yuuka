import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
const original = process.cwd();
const directory = mkdtempSync(path.join(tmpdir(), "yuuka-receipt-test-"));
process.chdir(directory);
process.env.DISCORD_TOKEN = "test-token";
process.env.DB_PATH = path.join(directory, "test.db");
const { runMigrations } = await import("../src/db/migrations.js");
const { getDb, closeDb } = await import("../src/db/database.js");
const { processWebReceipt } = await import("../src/services/webReceipt.js");
runMigrations();
getDb()
  .prepare("INSERT INTO users(discord_id,username,password_hash) VALUES(?,?,?)")
  .run("alice", "Alice", "test");
getDb()
  .prepare("INSERT INTO users(discord_id,username,password_hash) VALUES(?,?,?)")
  .run("bob", "Bob", "test");
test.after(() => {
  closeDb();
  process.chdir(original);
  rmSync(directory, { recursive: true, force: true });
});
const count = () =>
  (getDb().prepare("SELECT COUNT(*) AS count FROM expenses").get() as { count: number }).count;
test("receipt persists extracted items once with the authenticated owner", async () => {
  const saved = await processWebReceipt("alice", "aGVsbG8=", "image/png", undefined, async () => [
    { amount: 180, category: "食費", description: "パン", date: "2026-10-01" },
    { amount: 220, category: "食費", description: "牛乳", purchaseSource: "商店" },
  ]);
  assert.equal(saved.expenses.length, 2);
  assert.equal(saved.total, 400);
  assert.equal(count(), 2);
  assert.ok(saved.expenses.every((e) => e.user_id === "alice" && e.source === "receipt"));
  assert.equal(saved.expenses[0].purchase_source, "不明");
  assert.equal(
    (
      getDb().prepare("SELECT COUNT(*) AS count FROM expenses WHERE user_id='bob'").get() as {
        count: number;
      }
    ).count,
    0,
  );
});
test("invalid receipt item prevents all inserts and failed extraction is not successful", async () => {
  const before = count();
  for (const bad of [{ amount: -1 }, { date: "2026-02-30" }, { category: "invalid" }]) {
    await assert.rejects(() =>
      processWebReceipt("alice", "aGVsbG8=", "image/png", undefined, async () => [
        { amount: 200, category: "食費", description: "valid" },
        { amount: 300, category: "食費", description: "bad", ...bad },
      ]),
    );
    assert.equal(count(), before);
  }
  await assert.rejects(() =>
    processWebReceipt("alice", "aGVsbG8=", "image/png", undefined, async () => []),
  );
  await assert.rejects(() =>
    processWebReceipt("alice", "bad!", "image/png", undefined, async () => []),
  );
  assert.equal(count(), before);
});
