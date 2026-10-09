import assert from "node:assert/strict";
import test from "node:test";
import {
  annotateUnbackedClaim,
  buildFailureReport,
  recordCompletedOperation,
} from "../src/gemini/operationLog.js";

test("only successful record writes are collected", () => {
  const completed = [];
  recordCompletedOperation(completed, "addExpense", { success: true, message: "#1 記録" });
  recordCompletedOperation(completed, "addExpense", { success: false, message: "不正" });
  recordCompletedOperation(completed, "listRecentExpenses", { success: true, message: "一覧" });
  recordCompletedOperation(completed, "searchWeb", { success: true, message: "検索" });
  assert.deepEqual(completed, ["#1 記録"]);
});

test("failure report lists already completed writes", () => {
  const report = buildFailureReport("日付が不正", ["#395 ¥648 を記録しました"]);
  assert.match(report, /失敗: 日付が不正/);
  assert.match(report, /- #395 ¥648 を記録しました/);
  assert.doesNotMatch(buildFailureReport("x", []), /完了済み/);
});

test("claims without executed writes are annotated", () => {
  assert.match(annotateUnbackedClaim("メモを更新しました。", []), /実際には行われていません/);
  assert.equal(annotateUnbackedClaim("メモを更新しました。", ["#1 更新"]), "メモを更新しました。");
  assert.equal(annotateUnbackedClaim("こんにちは", []), "こんにちは");
});
