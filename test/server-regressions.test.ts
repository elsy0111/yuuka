import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { Readable } from "node:stream";
import type { RouteContext, RouteHandler } from "../src/server/types.js";

// Set configuration before importing modules that initialize the database.
const testDir = mkdtempSync(path.join(tmpdir(), "yuuka-server-test-"));
const originalCwd = process.cwd();
process.chdir(testDir);
process.env.DISCORD_TOKEN = "test-token";
process.env.DB_PATH = path.join(testDir, "test.db");

const [migrations, database, tasks, users, session] = await Promise.all([
  import("../src/db/migrations.js"),
  import("../src/db/database.js"),
  import("../src/db/taskRepo.js"),
  import("../src/db/userRepo.js"),
  import("../src/server/session.js"),
]);
migrations.runMigrations();
process.chdir(originalCwd);

test.after(() => {
  process.chdir(originalCwd);
  database.closeDb();
  rmSync(testDir, { recursive: true, force: true });
});

test("task updates do not return another user's task", () => {
  const db = database.getDb();
  db.prepare("INSERT INTO users (discord_id, username, password_hash) VALUES (?, ?, ?)").run(
    "owner",
    "Owner",
    "invalid",
  );
  const task = tasks.addTask("owner", "private task");

  assert.equal(tasks.updateTask(task.id, "other-user", { title: "stolen" }), undefined);
  assert.equal(tasks.completeTask(task.id, "other-user"), undefined);
  assert.equal(tasks.getTaskById(task.id)?.title, "private task");
});

test("malformed password hashes fail verification without throwing", () => {
  assert.equal(users.verifyPassword("password", "salt:not-a-hex-hash"), false);
  assert.equal(users.verifyPassword("password", "salt:00"), false);
});

test("malformed cookie encoding is ignored", () => {
  const req = { headers: { cookie: "__Host-yuuka-session=%E0%A4%A" } } as never;
  assert.equal(session.getCookieSessionToken(req), undefined);
});

test("malformed request URL receives a 400 response", async () => {
  const { serverHandler } = await import("../src/server.js");
  const response = {
    headersSent: false,
    writableEnded: false,
    setHeader() {},
    writeHead(status: number) {
      assert.equal(status, 400);
    },
    end() {
      this.writableEnded = true;
    },
  };
  await serverHandler(
    {
      method: "GET",
      url: "/api/status",
      headers: { host: "[" },
    } as never,
    response,
  );
  assert.equal(response.writableEnded, true);
});

async function callRoute(handler: RouteHandler, url: string, token: string, body?: object) {
  const req = Readable.from(body ? [Buffer.from(JSON.stringify(body))] : []);
  Object.assign(req, { headers: { authorization: `Bearer ${token}` } });
  let status = 0;
  let result: Record<string, unknown> = {};
  const res = {
    writeHead(code: number) {
      status = code;
    },
    end(value: string) {
      result = JSON.parse(value);
    },
  };
  const parsedUrl = new URL(url, "http://test");
  await handler({
    req,
    res,
    parsedUrl,
    pathname: parsedUrl.pathname,
    method: body ? "POST" : "GET",
  } as unknown as RouteContext);
  return { status, result };
}

test("authenticated routes ignore forged user IDs for tasks, schedules, memories and credentials", async () => {
  const [
    { handleTasks },
    { handleSchedules },
    { handleMemories },
    { handleCredentials },
    schedules,
    memories,
    secrets,
  ] = await Promise.all([
    import("../src/server/routes/tasks.js"),
    import("../src/server/routes/schedules.js"),
    import("../src/server/routes/memories.js"),
    import("../src/server/routes/credentials.js"),
    import("../src/db/scheduleRepo.js"),
    import("../src/db/memoryRepo.js"),
    import("../src/services/secretService.js"),
  ]);
  const victimTask = tasks.addTask("victim", "victim task");
  schedules.addSchedule("victim", "victim schedule", new Date(Date.now() + 3600000).toISOString());
  memories.saveMemory("victim", "victim memory", "general");
  process.env.YUUKA_ENCRYPTION_SECRET = "test-only-key";
  secrets.registerCredential("victim", "private-service", "victim-login", "victim-password");
  const token = session.createSession("attacker");
  for (const [handler, url, key] of [
    [handleTasks, "/api/tasks?userId=victim", "tasks"],
    [handleSchedules, "/api/schedules?userId=victim", "schedules"],
    [handleMemories, "/api/memories?userId=victim", "memories"],
    [handleCredentials, "/api/credentials?userId=victim", "credentials"],
  ] as const) {
    const response = await callRoute(handler, url, token);
    assert.equal(response.status, 200);
    assert.deepEqual(response.result[key], []);
  }
  await callRoute(handleTasks, "/api/tasks/update", token, {
    userId: "victim",
    id: victimTask.id,
    title: "stolen",
  });
  assert.equal(tasks.getTaskById(victimTask.id)?.title, "victim task");
  const added = await callRoute(handleTasks, "/api/tasks/add", token, {
    userId: "victim",
    title: "attacker task",
    dueDate: null,
  });
  assert.equal(added.status, 200);
  assert.equal((added.result.task as { user_id: string }).user_id, "attacker");
  await callRoute(handleCredentials, "/api/credentials/delete", token, {
    userId: "victim",
    serviceName: "private-service",
  });
  assert.equal(secrets.listCredentials("victim").length, 1);
  session.deleteSessionToken(token);
});

test("invalid task priority and reversed schedule range are rejected", async () => {
  const [{ handleTasks }, { handleSchedules }] = await Promise.all([
    import("../src/server/routes/tasks.js"),
    import("../src/server/routes/schedules.js"),
  ]);
  const token = session.createSession("validation-user");
  assert.equal(
    (await callRoute(handleTasks, "/api/tasks/add", token, { title: "test", priority: -1 })).status,
    400,
  );
  assert.equal(
    (await callRoute(handleTasks, "/api/tasks/add", token, { title: "   " })).status,
    400,
  );
  assert.equal(
    (
      await callRoute(handleSchedules, "/api/schedules/add", token, {
        title: "test",
        startAt: "2026-10-02T14:00",
        endAt: "2026-10-02T13:00",
      })
    ).status,
    400,
  );
  session.deleteSessionToken(token);
});

test("logout persists revoked session immediately", () => {
  const token = session.createSession("logout-user");
  const req = { headers: { authorization: `Bearer ${token}` } } as never;
  assert.equal(session.isAuthenticated(req), true);
  session.deleteSessionToken(token);
  assert.equal(session.isAuthenticated(req), false);
  const persisted = JSON.parse(
    readFileSync(path.join(testDir, "data", "admin-sessions.json"), "utf8"),
  );
  assert.deepEqual(persisted, {});
});

test("schedule, memory and expense updates cannot expose another user's record", async () => {
  const [schedules, memories, expenses] = await Promise.all([
    import("../src/db/scheduleRepo.js"),
    import("../src/db/memoryRepo.js"),
    import("../src/db/expenseRepo.js"),
  ]);
  const schedule = schedules.addSchedule("victim", "private schedule", "2026-10-02T15:00");
  const memory = memories.saveMemory("victim", "private memory");
  const expense = expenses.addExpense("victim", 100, "食費");
  assert.equal(schedules.updateSchedule(schedule.id, "attacker", { title: "stolen" }), undefined);
  assert.equal(memories.updateMemory(memory.id, "attacker", "stolen"), undefined);
  assert.equal(expenses.updateExpense(expense.id, "attacker", { amount: 200 }), undefined);
  assert.equal(expenses.updateExpense(expense.id, "attacker", {}), undefined);
});

test("schedule windows compare dates instead of raw ISO text", async () => {
  const schedules = await import("../src/db/scheduleRepo.js");
  const past = new Date(Date.now() - 3600000).toISOString();
  const future = new Date(Date.now() + 3600000).toISOString();
  const old = schedules.addSchedule("date-test", "past", past);
  const upcoming = schedules.addSchedule("date-test", "future", future);
  const results = schedules.listUpcomingSchedules("date-test", 1);
  assert.deepEqual(
    results.map((row) => row.id),
    [upcoming.id],
  );
  assert.equal(
    results.some((row) => row.id === old.id),
    false,
  );
});

test("partial task updates retain existing description and due date", () => {
  const task = tasks.addTask("partial", "task", "description", "2026-10-03");
  const updated = tasks.updateTask(task.id, "partial", {
    priority: 2,
    description: undefined,
    dueDate: undefined,
  });
  assert.equal(updated?.description, "description");
  assert.equal(updated?.due_date, "2026-10-03");
});
