import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const originalCwd = process.cwd();
const tempDir = mkdtempSync(path.join(tmpdir(), "yuuka-expense-test-"));
process.chdir(tempDir);
process.env.DISCORD_TOKEN = "test-token";
process.env.DB_PATH = path.join(tempDir, "expense.db");

const [migrations, db, functions, repo] = await Promise.all([
  import("../src/db/migrations.js"),
  import("../src/db/database.js"),
  import("../src/functions/expenseFunctions.js"),
  import("../src/db/expenseRepo.js"),
]);
migrations.runMigrations();
db.getDb()
  .prepare("INSERT INTO users (discord_id, username, password_hash) VALUES (?, ?, ?)")
  .run("alice", "Alice", "test");

test.after(() => {
  db.closeDb();
  process.chdir(originalCwd);
  rmSync(tempDir, { recursive: true, force: true });
});

test("records an explicit expense and defaults an unknown source", () => {
  const result = JSON.parse(functions.addExpense("alice", { amount: 330, category: "交通費" }));
  assert.equal(result.success, true);
  assert.equal(result.expense.purchase_source, "不明");
  assert.equal(repo.getExpenseById(result.expense.id)?.user_id, "alice");
});

test("rejects invalid amount, category, and date without inserting", () => {
  const before = repo.getMonthlyTotal("alice");
  for (const args of [
    { amount: 0, category: "食費" },
    { amount: 1.5, category: "食費" },
    { amount: 100, category: "存在しない" },
    { amount: 100, category: "食費", date: "2026-02-30" },
  ]) {
    assert.equal(JSON.parse(functions.addExpense("alice", args)).success, false);
  }
  assert.equal(repo.getMonthlyTotal("alice"), before);
});

test("invalid input reports the offending field and value", () => {
  const result = JSON.parse(
    functions.addExpense("alice", {
      amount: 318,
      category: "食費",
      date: "2026-10-08, description:",
    }),
  );
  assert.equal(result.success, false);
  assert.match(result.message, /date="2026-10-08, description:"/);
  assert.doesNotMatch(result.message, /amount|category/);
});

test("recent expenses expose id and registration time", () => {
  const added = JSON.parse(functions.addExpense("alice", { amount: 120, category: "食費" }));
  const listed = JSON.parse(functions.listRecentExpenses("alice", { count: 1 }));
  assert.match(listed.message, new RegExp(`#${added.expense.id} \\|`));
  assert.match(listed.message, new RegExp(`登録 ${added.expense.created_at}`));
});
