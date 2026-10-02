import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const originalCwd = process.cwd();
const tempDir = mkdtempSync(path.join(tmpdir(), "yuuka-work-test-"));
process.chdir(tempDir);
process.env.DISCORD_TOKEN = "test-token";
process.env.DB_PATH = path.join(tempDir, "work.db");

const [migrations, db, repo, functions] = await Promise.all([
  import("../src/db/migrations.js"),
  import("../src/db/database.js"),
  import("../src/db/workRepo.js"),
  import("../src/functions/workFunctions.js"),
]);
migrations.runMigrations();
const sqlite = db.getDb();
for (const id of ["alice", "bob"]) {
  sqlite
    .prepare("INSERT INTO users (discord_id, username, password_hash) VALUES (?, ?, ?)")
    .run(id, id, "test");
  sqlite.prepare("INSERT INTO user_preferences (discord_id) VALUES (?)").run(id);
}

test.after(() => {
  db.closeDb();
  process.chdir(originalCwd);
  rmSync(tempDir, { recursive: true, force: true });
});

test("rate changes do not alter historical entry snapshots", () => {
  repo.setRate("alice", 1200);
  const first = repo.addEntry("alice", "2026-10-01", 90, "morning");
  repo.setRate("alice", 1800);
  const second = repo.addEntry("alice", "2026-10-02", 60, "evening");
  assert.equal(first.hourly_rate, 1200);
  assert.equal(first.amount, 1800);
  assert.equal(second.hourly_rate, 1800);
  assert.equal(second.amount, 1800);
});

test("work entries are isolated by user and delete is ownership scoped", () => {
  repo.setRate("bob", 1000);
  const entry = repo.addEntry("bob", "2026-10-03", 60);
  assert.equal(
    repo.listEntries("alice", "2026-10-01").some((e) => e.id === entry.id),
    false,
  );
  assert.equal(repo.deleteEntry(entry.id, "alice"), false);
  assert.equal(repo.deleteEntry(entry.id, "bob"), true);
});

test("work function rejects invalid tool arguments", () => {
  assert.equal(JSON.parse(functions.setHourlyRate("alice", { hourly_rate: 0 })).success, false);
  assert.equal(
    JSON.parse(functions.setHourlyRate("alice", { hourly_rate: Number.NaN })).success,
    false,
  );
  assert.equal(JSON.parse(functions.addWorkEntry("alice", { hours: 0 })).success, false);
  assert.equal(JSON.parse(functions.addWorkEntry("alice", { hours: 25 })).success, false);
});

test("monthly listing excludes the next month", () => {
  repo.setRate("alice", 1000);
  repo.addEntry("alice", "2026-10-31", 60);
  repo.addEntry("alice", "2026-11-01", 60);
  const october = repo.listEntries("alice", "2026-10-01", "2026-11-01");
  assert.equal(
    october.every((entry) => entry.date < "2026-11-01"),
    true,
  );
  assert.equal(
    october.some((entry) => entry.date === "2026-11-01"),
    false,
  );
});

test("work tool rejects impossible dates, sub-minute entries and invalid notes", () => {
  for (const args of [
    { hours: 2, date: "2026-02-30" },
    { hours: 0.001 },
    { hours: 2, date: "2026-13-01" },
    { hours: 2, description: "x".repeat(501) },
  ])
    assert.equal(JSON.parse(functions.addWorkEntry("alice", args)).success, false);
  assert.equal(
    JSON.parse(functions.setHourlyRate("alice", { hourly_rate: 10000001 })).success,
    false,
  );
  const summary = repo.monthlyWork("alice", new Date(2026, 9, 31));
  assert.equal(
    summary.entries.some((entry) => entry.date === "2026-10-31"),
    true,
  );
  assert.equal(
    summary.entries.some((entry) => entry.date === "2026-11-01"),
    false,
  );
});

test("authenticated work API validates input and ignores forged owners", async () => {
  const { Readable } = await import("node:stream");
  const { handleWork } = await import("../src/server/routes/work.js");
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
    await handleWork({
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
  assert.equal((await call("/api/work", undefined, "invalid")).status, 401);
  assert.equal((await call("/api/work/rate", "null")).status, 400);
  assert.equal((await call("/api/work/entries", { hours: "2" })).status, 400);
  assert.equal((await call("/api/work/entries", { hours: 2, date: "2026-02-30" })).status, 400);
  const bobRate = repo.getRate("bob");
  assert.equal((await call("/api/work/rate", { hourlyRate: 1250, userId: "bob" })).status, 200);
  assert.equal(repo.getRate("bob"), bobRate);
  const entry = await call("/api/work/entries", { hours: 2.5, date: "2026-10-02" });
  assert.equal(entry.status, 200);
  assert.equal((entry.result.entry as { amount: number }).amount, 3125);
  assert.equal((entry.result.entry as { hourlyRate: number }).hourlyRate, 1250);
  const victim = repo.addEntry("bob", "2026-10-02", 60);
  assert.equal((await call("/api/work/delete", { id: victim.id })).status, 404);
  session.deleteSessionToken(token);
});

test("Discord editing tools preserve unspecified fields and cannot edit other owners", async () => {
  const [tasks, expenses, schedules, taskTools, expenseTools, scheduleTools] = await Promise.all([
    import("../src/db/taskRepo.js"),
    import("../src/db/expenseRepo.js"),
    import("../src/db/scheduleRepo.js"),
    import("../src/functions/taskFunctions.js"),
    import("../src/functions/expenseFunctions.js"),
    import("../src/functions/scheduleFunctions.js"),
  ]);
  const task = tasks.addTask("alice", "Old task", "keep", "2026-10-31", 2);
  assert.equal(
    JSON.parse(taskTools.updateTask("bob", { task_id: task.id, title: "stolen" })).success,
    false,
  );
  assert.equal(
    JSON.parse(taskTools.updateTask("alice", { task_id: task.id, title: "New task" })).task
      .description,
    "keep",
  );
  assert.equal(
    JSON.parse(taskTools.updateTask("alice", { task_id: task.id, due_date: "2026-02-30" })).success,
    false,
  );
  const expense = expenses.addExpense("alice", 500, "食費", "keep", "2026-10-01");
  assert.equal(
    JSON.parse(expenseTools.updateExpense("alice", { id: expense.id, amount: 600 })).expense
      .description,
    "keep",
  );
  assert.equal(
    JSON.parse(expenseTools.updateExpense("bob", { id: expense.id, amount: 700 })).success,
    false,
  );
  assert.equal(JSON.parse(expenseTools.deleteExpense("bob", { id: expense.id })).success, false);
  assert.equal(
    JSON.parse(expenseTools.updateExpense("alice", { id: expense.id, date: "2026-02-30" })).success,
    false,
  );
  const schedule = schedules.addSchedule(
    "alice",
    "Meet",
    "2026-10-03T10:00:00",
    "2026-10-03T11:00:00",
    30,
    "keep",
  );
  assert.equal(
    JSON.parse(
      await scheduleTools.updateSchedule("alice", { schedule_id: schedule.id, title: "Rename" }),
    ).schedule.description,
    "keep",
  );
  assert.equal(
    JSON.parse(
      await scheduleTools.updateSchedule("bob", { schedule_id: schedule.id, title: "stolen" }),
    ).success,
    false,
  );
  assert.equal(
    JSON.parse(
      await scheduleTools.updateSchedule("alice", {
        schedule_id: schedule.id,
        end_at: "2026-10-03T09:00:00",
      }),
    ).success,
    false,
  );
});

test("work edits preserve historical rates and cannot cross user boundaries", () => {
  repo.setRate("alice", 1200);
  const entry = repo.addEntry("alice", "2026-10-02", 60, "keep");
  repo.setRate("alice", 2000);
  assert.equal(
    JSON.parse(functions.updateWorkEntry("bob", { id: entry.id, hours: 2 })).success,
    false,
  );
  const edited = JSON.parse(functions.updateWorkEntry("alice", { id: entry.id, hours: 2.5 }));
  assert.equal(edited.entry.hourlyRate, 1200);
  assert.equal(edited.entry.amount, 3000);
  assert.equal(edited.entry.description, "keep");
  assert.equal(
    JSON.parse(functions.updateWorkEntry("alice", { id: entry.id, hours: 0 })).success,
    false,
  );
});
