import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { apiRequest, guardSubmit, localDate } from "../src/public/js/ui.js";

test("date input uses the local calendar date instead of UTC", () => {
  const date = { getFullYear: () => 2026, getMonth: () => 9, getDate: () => 2 };
  assert.equal(localDate(date), "2026-10-02");
});

test("failed API responses cannot be interpreted as successful writes", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({
      ok: false,
      json: async () => ({ success: false, message: "拒否" }),
    });
    await assert.rejects(apiRequest("/api/tasks/add"), /拒否/);
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ success: false }) });
    await assert.rejects(apiRequest("/api/tasks/add"), /操作に失敗/);
  } finally {
    globalThis.fetch = original;
  }
});

test("submit lock blocks concurrent writes and releases after failures", async () => {
  const button = { disabled: false };
  const form = {
    dataset: {},
    setAttribute() {},
    removeAttribute() {},
    querySelectorAll: () => [button],
  };
  const event = { preventDefault() {}, currentTarget: form };
  let finish;
  let calls = 0;
  const handler = guardSubmit(async () => {
    calls++;
    await new Promise((resolve) => {
      finish = resolve;
    });
  });
  const pending = handler(event);
  assert.equal(button.disabled, true);
  await handler(event);
  assert.equal(calls, 1);
  finish();
  await pending;
  assert.equal(button.disabled, false);
  assert.equal(form.dataset.submitting, undefined);
  await assert.rejects(
    guardSubmit(async () => {
      throw new Error("failed");
    })(event),
    /failed/,
  );
  assert.equal(button.disabled, false);
});

async function workerContext(fetch) {
  const handlers = {};
  const deleted = [];
  const context = {
    self: {
      addEventListener: (name, handler) => {
        handlers[name] = handler;
      },
      clients: { claim() {} },
    },
    location: { origin: "https://yuuka.test" },
    URL,
    Response,
    fetch,
    caches: {
      match: async () => new Response("old"),
      keys: async () => ["other-app", "yuuka-v2", "yuuka-v3", "yuuka-v4"],
      delete: async (key) => deleted.push(key),
      open: async () => ({ put() {} }),
    },
  };
  vm.runInNewContext(
    await readFile(new URL("../src/public/sw.js", import.meta.url), "utf8"),
    context,
  );
  return { handlers, deleted };
}

test("service worker serves deployed assets and falls back only when offline", async () => {
  const { handlers } = await workerContext(async () => new Response("new"));
  let response;
  handlers.fetch({
    request: { url: "https://yuuka.test/js/main.js", method: "GET" },
    waitUntil() {},
    respondWith: (value) => {
      response = value;
    },
  });
  assert.equal(await (await response).text(), "new");
  const offline = await workerContext(async () => {
    throw new Error("offline");
  });
  offline.handlers.fetch({
    request: { url: "https://yuuka.test/js/main.js", method: "GET" },
    waitUntil() {},
    respondWith: (value) => {
      response = value;
    },
  });
  assert.equal(await (await response).text(), "old");
});

test("service worker leaves API requests and other applications' caches alone", async () => {
  const { handlers, deleted } = await workerContext(async () => {
    throw new Error("must not fetch");
  });
  let intercepted = false;
  handlers.fetch({
    request: { url: "https://yuuka.test/api/tasks", method: "GET" },
    respondWith: () => {
      intercepted = true;
    },
  });
  assert.equal(intercepted, false);
  let activated;
  handlers.activate({
    waitUntil: (value) => {
      activated = value;
    },
  });
  await activated;
  assert.deepEqual(deleted, ["yuuka-v2", "yuuka-v3"]);
});

test("blocked local storage does not prevent using the app", async () => {
  const { storage } = await import("../src/public/js/storage.js");
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    get() {
      throw new Error("blocked");
    },
  });
  try {
    storage.setItem("test", "value");
    assert.equal(storage.getItem("test"), "value");
    storage.removeItem("test");
    assert.equal(storage.getItem("test"), null);
  } finally {
    if (original) Object.defineProperty(globalThis, "localStorage", original);
    else delete globalThis.localStorage;
  }
});
