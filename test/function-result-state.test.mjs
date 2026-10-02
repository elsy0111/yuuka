import assert from "node:assert/strict";
import test from "node:test";
import {
  applyFunctionResult,
  failureSummary,
  parseFunctionResult,
} from "../src/gemini/functionResultState.js";

test("an exact retry clears its failure regardless of ordering", () => {
  const failures = new Map();
  applyFunctionResult(
    failures,
    "updateTask",
    { task_id: 3, title: "new" },
    { success: false, message: "一時失敗" },
  );
  applyFunctionResult(failures, "updateTask", { title: "new", task_id: 3 }, { success: true });
  assert.equal(failureSummary(failures), null);
});

test("success for another record does not clear a failure", () => {
  const failures = new Map();
  applyFunctionResult(
    failures,
    "deleteTask",
    { task_id: 3 },
    { success: false, message: "対象なし" },
  );
  applyFunctionResult(failures, "deleteTask", { task_id: 4 }, { success: true });
  assert.equal(failureSummary(failures), "対象なし");
});

test("malformed result and unserializable args are safe", () => {
  const failures = new Map();
  const args = {};
  args.self = args;
  applyFunctionResult(failures, "tool", args, null);
  assert.equal(failureSummary(failures), null);
});

test("function responses remain objects for null, arrays and plain text", () => {
  assert.deepEqual(parseFunctionResult("null"), { result: null });
  assert.deepEqual(parseFunctionResult("[1,2]"), { result: [1, 2] });
  assert.deepEqual(parseFunctionResult("plain text"), { result: "plain text" });
  assert.deepEqual(parseFunctionResult('{"success":false,"message":"failed"}'), {
    success: false,
    message: "failed",
  });
});
