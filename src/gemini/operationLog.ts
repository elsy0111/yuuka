const RECORD_WRITE_TOOL = /^(add|update|delete|set|save|complete|reopen)[A-Z]/;
const CLAIMED_WRITE = /(記録|登録|更新|削除|修正|変更)(し|いたし)(まし|ておきまし)た/;

/** 記録を書き換えるツールの成功結果を、ユーザーに見せる完了メッセージとして蓄積する */
export function recordCompletedOperation(completed: string[], name: string, result: unknown): void {
  if (!RECORD_WRITE_TOOL.test(name) || !result || typeof result !== "object") return;
  const record = result as { success?: unknown; message?: unknown };
  if (record.success !== true) return;
  completed.push(typeof record.message === "string" ? record.message : `${name} を実行しました。`);
}

/** 失敗があったターンの応答を、完了済みの操作と失敗内容を併記した文面にする */
export function buildFailureReport(failures: string, completed: string[]): string {
  const lines = [`操作の一部を完了できませんでした。\n失敗: ${failures}`];
  if (completed.length > 0) {
    lines.push(`完了済み（再実行すると重複します）:\n${completed.map((m) => `- ${m}`).join("\n")}`);
  }
  return lines.join("\n");
}

/** ツールを実行していないのに操作済みと述べている応答へ注記を付ける */
export function annotateUnbackedClaim(text: string, completed: string[]): string {
  if (completed.length > 0 || !CLAIMED_WRITE.test(text)) return text;
  return `${text}\n\n※この返答では、記録の追加・更新・削除は実際には行われていません。`;
}
