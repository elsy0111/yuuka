import * as repo from "../db/workRepo.js";

function perform(operation: () => object): string {
  try {
    return JSON.stringify({ success: true, ...operation() });
  } catch (error) {
    return JSON.stringify({
      success: false,
      message:
        error instanceof repo.WorkValidationError
          ? error.message
          : "労働記録の処理に失敗しました。",
    });
  }
}

export function setHourlyRate(userId: string, args: { hourly_rate: number }): string {
  return perform(() => {
    repo.setRate(userId, args.hourly_rate);
    return {
      hourlyRate: args.hourly_rate,
      message: `時給を${args.hourly_rate.toLocaleString()}円に設定しました。`,
    };
  });
}
export function addWorkEntry(
  userId: string,
  args: { hours: number; date?: string; description?: string },
): string {
  return perform(() => {
    const input = repo.validateEntry(args.hours, args.date, args.description);
    const entry = repo.publicEntry(
      repo.addEntry(userId, input.date, input.minutes, input.description),
    );
    return {
      entry,
      message: `${entry.date}の労働を${entry.minutes}分記録しました。働いた分は${entry.amount.toLocaleString()}円（控除前）です。`,
    };
  });
}
export function getWorkSummary(userId: string, args: { month?: string } = {}): string {
  return perform(() => {
    const now = repo.workMonthDate(args.month);
    return {
      month: args.month ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
      ...repo.monthlyWork(userId, now),
    };
  });
}
export function deleteWorkEntry(userId: string, args: { id: number }): string {
  return perform(() => {
    if (!repo.deleteEntry(args.id, userId))
      throw new repo.WorkValidationError("記録が見つかりません。");
    return { message: "労働記録を削除しました。" };
  });
}

export function updateWorkEntry(
  userId: string,
  args: { id: number; hours?: number; date?: string; description?: string },
): string {
  return perform(() => {
    const entry = repo.updateEntry(args.id, userId, args);
    if (!entry) throw new repo.WorkValidationError("労働記録が見つかりません。");
    return {
      entry: repo.publicEntry(entry),
      message: `労働記録を更新しました。働いた分は${entry.amount.toLocaleString()}円（控除前）です。`,
    };
  });
}
