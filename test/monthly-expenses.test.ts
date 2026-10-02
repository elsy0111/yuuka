import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const cwd = process.cwd(),
  dir = mkdtempSync(path.join(tmpdir(), "yuuka-expenses-"));
process.chdir(dir);
process.env.DISCORD_TOKEN = "test-token";
process.env.DB_PATH = path.join(dir, "expenses.db");
const [migrations, db, repo] = await Promise.all([
  import("../src/db/migrations.js"),
  import("../src/db/database.js"),
  import("../src/db/expenseRepo.js"),
]);
migrations.runMigrations();
db.getDb()
  .prepare("INSERT INTO users (discord_id, username, password_hash) VALUES (?, ?, ?)")
  .run("alice", "Alice", "x");
test.after(() => {
  db.closeDb();
  process.chdir(cwd);
  rmSync(dir, { recursive: true, force: true });
});

test("current month stops at today and includes zero days", () => {
  repo.addExpense("alice", 100, "食費", undefined, "2026-10-02");
  assert.deepEqual(repo.getMonthlyDailyExpenseTotals("alice", 2026, 10, new Date(2026, 9, 3, 12)), [
    { date: "2026-10-01", total: 0 },
    { date: "2026-10-02", total: 100 },
    { date: "2026-10-03", total: 0 },
  ]);
});

test("past months are complete and future months are empty", () => {
  assert.equal(
    repo.getMonthlyDailyExpenseTotals("alice", 2026, 9, new Date(2026, 9, 3)).length,
    30,
  );
  assert.deepEqual(repo.getMonthlyDailyExpenseTotals("alice", 2026, 11, new Date(2026, 9, 3)), []);
  assert.equal(
    repo.getMonthlyDailyExpenseTotals("alice", 2025, 12, new Date(2026, 0, 2)).length,
    31,
  );
});
