import * as taskRepo from "../db/taskRepo.js";
import { formatDate, formatPriority, statusEmoji } from "../utils/formatters.js";

export function addTask(
  userId: string,
  args: { title: string; description?: string; due_date?: string; priority?: number },
): string {
  const task = taskRepo.addTask(userId, args.title, args.description, args.due_date, args.priority);
  const priorityLabel = formatPriority(task.priority);
  const dueLabel = task.due_date ? `、期限: ${formatDate(task.due_date)}` : "";
  return JSON.stringify({
    success: true,
    message: `タスク「${task.title}」を追加しました (ID: #${task.id}、優先度: ${priorityLabel}${dueLabel})`,
    task,
  });
}

export function listTasks(userId: string, args: { status?: string }): string {
  const tasks = taskRepo.listTasks(userId, args.status);
  if (tasks.length === 0) {
    return JSON.stringify({ success: true, message: "タスクはありません。", tasks: [] });
  }

  const lines = tasks.map(
    (t) =>
      `${statusEmoji(t.status)} #${t.id} ${t.title}${t.due_date ? ` (期限: ${formatDate(t.due_date)})` : ""}`,
  );
  return JSON.stringify({
    success: true,
    message: `タスク一覧 (${tasks.length}件):\n${lines.join("\n")}`,
    tasks,
  });
}

export function completeTask(userId: string, args: { task_id: number }): string {
  const task = taskRepo.completeTask(args.task_id, userId);
  if (!task) {
    return JSON.stringify({
      success: false,
      message: `タスク #${args.task_id} が見つかりません。`,
    });
  }
  return JSON.stringify({
    success: true,
    message: `タスク「${task.title}」(#${task.id}) を完了にしました✅`,
    task,
  });
}

export function reopenTask(userId: string, args: { task_id: number }): string {
  const task = taskRepo.reopenTask(args.task_id, userId);
  if (!task) {
    return JSON.stringify({ success: false, message: "タスクが見つかりません。" });
  }
  return JSON.stringify({
    success: true,
    message: `タスク「${task.title}」を未完了に戻しました。`,
    task,
  });
}

export function deleteTask(userId: string, args: { task_id: number }): string {
  const deleted = taskRepo.deleteTask(args.task_id, userId);
  if (!deleted) {
    return JSON.stringify({
      success: false,
      message: `タスク #${args.task_id} が見つかりません。`,
    });
  }
  return JSON.stringify({
    success: true,
    message: `タスク #${args.task_id} を削除しました🗑️`,
  });
}

export function updateTask(
  userId: string,
  args: {
    task_id: number;
    title?: string;
    description?: string | null;
    due_date?: string | null;
    priority?: number;
  },
): string {
  const validDate =
    args.due_date === undefined ||
    args.due_date === null ||
    (typeof args.due_date === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(args.due_date) &&
      Number.isFinite(Date.parse(`${args.due_date}T00:00:00Z`)) &&
      new Date(`${args.due_date}T00:00:00Z`).toISOString().slice(0, 10) === args.due_date);
  if (
    !Number.isSafeInteger(args.task_id) ||
    args.task_id < 1 ||
    !validDate ||
    (args.title !== undefined && (typeof args.title !== "string" || !args.title.trim())) ||
    (args.description !== undefined &&
      args.description !== null &&
      typeof args.description !== "string") ||
    (args.priority !== undefined &&
      (!Number.isInteger(args.priority) || args.priority < 0 || args.priority > 2))
  ) {
    return JSON.stringify({ success: false, message: "タスクの入力が不正です。" });
  }
  const task = taskRepo.updateTask(args.task_id, userId, {
    title: args.title?.trim(),
    description: args.description,
    dueDate: args.due_date,
    priority: args.priority,
  });
  return JSON.stringify(
    task
      ? { success: true, message: `タスク「${task.title}」を更新しました。`, task }
      : { success: false, message: "タスクが見つかりません。" },
  );
}
