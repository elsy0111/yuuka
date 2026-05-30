import fs from "node:fs";
import path from "node:path";
import type { FunctionDeclaration } from "@google/generative-ai";
import { config } from "../config.js";
import * as taskFn from "./taskFunctions.js";
import * as scheduleFn from "./scheduleFunctions.js";
import * as expenseFn from "./expenseFunctions.js";
import * as browserFn from "./browserFunctions.js";
import * as credentialFn from "./credentialFunctions.js";
import * as playbookFn from "./playbookFunctions.js";
import * as memoryFn from "./memoryFunctions.js";
import { taskDeclarations } from "./declarations/tasks.js";
import { scheduleDeclarations } from "./declarations/schedules.js";
import { expenseDeclarations } from "./declarations/expenses.js";
import { systemDeclarations } from "./declarations/system.js";

type FunctionArgs = Record<string, unknown>;

// ─── 動的プラグインロード機構 ───────────────────────────────────────────

export const dynamicFunctionDeclarations: FunctionDeclaration[] = [];
const dynamicDispatchMap = new Map<
  string,
  (userId: string, args: FunctionArgs) => Promise<string> | string
>();

/**
 * 自己拡張機能（サンドボックス）が有効に設定されているかどうかを判定する
 */
export function isSandboxEnabled(): boolean {
  if (!config.sandboxPath) return false;
  try {
    return fs.existsSync(config.sandboxPath) && fs.statSync(config.sandboxPath).isDirectory();
  } catch {
    return false;
  }
}

/**
 * 全ての関数定義（静的＋動的ロードされたもの）を返す
 */
export function getAllFunctionDeclarations(): FunctionDeclaration[] {
  const allStatic = [
    ...taskDeclarations,
    ...scheduleDeclarations,
    ...expenseDeclarations,
    ...systemDeclarations,
  ];

  if (!isSandboxEnabled()) {
    // 自己拡張機能が無効な場合、自己拡張関連ツールを除外して返す
    const sandboxTools = [
      "readCodeFile",
      "writeCodeFile",
      "listCodeFiles",
      "searchCodeFiles",
      "verifyCodeChanges",
      "checkoutBranch",
      "commitLocalChanges",
      "mergeBranch",
      "pushChanges",
      "reloadDynamicFunctions",
    ];
    return allStatic.filter((decl) => !sandboxTools.includes(decl.name));
  }

  return [...allStatic, ...dynamicFunctionDeclarations];
}

/**
 * サンドボックス内に動的追加された関数定義・ロジックをスキャンしてロードする
 */
export async function initializeDynamicFunctions(clearCache = false): Promise<void> {
  if (!isSandboxEnabled()) {
    console.log(
      "[Dynamic Function] サンドボックスが無効または未設定のため、動的関数のロードをスキップします。",
    );
    return;
  }

  const sandboxAbs = path.resolve(config.sandboxPath);
  const selfAbs = path.resolve(process.cwd());

  // 自分自身のリポジトリの場合は重複読み込み防止のためスキップ
  if (sandboxAbs === selfAbs) return;

  const distFunctionsDir = path.join(sandboxAbs, "dist", "functions");
  if (!fs.existsSync(distFunctionsDir)) {
    console.log(
      `[Dynamic Function] ${distFunctionsDir} が存在しないため、動的関数のロードをスキップします。`,
    );
    return;
  }

  try {
    const files = fs.readdirSync(distFunctionsDir);
    const ignoreFiles = [
      "index.js",
      "taskFunctions.js",
      "scheduleFunctions.js",
      "expenseFunctions.js",
      "fileFunctions.js",
      "commandFunctions.js",
      "browserFunctions.js",
      "gitFunctions.js",
    ];

    if (clearCache) {
      dynamicFunctionDeclarations.length = 0;
      dynamicDispatchMap.clear();
    }

    for (const file of files) {
      if (file.endsWith(".js") && !ignoreFiles.includes(file)) {
        const fullPath = path.join(distFunctionsDir, file);
        const fileUrl = clearCache ? `file://${fullPath}?t=${Date.now()}` : `file://${fullPath}`;

        try {
          const module = await import(fileUrl);

          // 1. 宣言の登録 (規約: module.functionDeclarations 配列から取得)
          if (module.functionDeclarations && Array.isArray(module.functionDeclarations)) {
            for (const decl of module.functionDeclarations) {
              // 重複登録の防止
              if (dynamicFunctionDeclarations.some((d) => d.name === decl.name)) {
                continue;
              }
              dynamicFunctionDeclarations.push(decl);

              // 2. 実行関数の登録
              const fnName = decl.name;
              if (typeof module[fnName] === "function") {
                dynamicDispatchMap.set(fnName, module[fnName]);
                console.log(
                  `[Dynamic Function] Loaded function: ${fnName} from ${file} (clearCache=${clearCache})`,
                );
              } else {
                console.warn(
                  `[Dynamic Function] Function "${fnName}" is declared in ${file} but its execution function is not exported.`,
                );
              }
            }
          }
        } catch (importErr) {
          console.error(`[Dynamic Function] Failed to import ${file}:`, importErr);
        }
      }
    }
  } catch (err) {
    console.error("[Dynamic Function] Failed to load dynamic functions:", err);
  }
}

// ─── Function Dispatcher ───────────────────────────────────────────────

export async function dispatchFunction(
  functionName: string,
  args: FunctionArgs,
  userId: string,
): Promise<string> {
  // 自己拡張関連ツールのガード（サンドボックスが無効な場合は呼び出しエラーを返す）
  const sandboxTools = [
    "readCodeFile",
    "writeCodeFile",
    "listCodeFiles",
    "searchCodeFiles",
    "verifyCodeChanges",
    "checkoutBranch",
    "commitLocalChanges",
    "mergeBranch",
    "pushChanges",
    "reloadDynamicFunctions",
  ];
  if (sandboxTools.includes(functionName) && !isSandboxEnabled()) {
    return JSON.stringify({
      success: false,
      message:
        "エラー: 自己拡張機能（サンドボックス）は現在無効化されています。必要な設定を行ってください。",
    });
  }

  switch (functionName) {
    // タスク
    case "addTask":
      return taskFn.addTask(userId, args as Parameters<typeof taskFn.addTask>[1]);
    case "listTasks":
      return taskFn.listTasks(userId, args as Parameters<typeof taskFn.listTasks>[1]);
    case "completeTask":
      return taskFn.completeTask(userId, args as Parameters<typeof taskFn.completeTask>[1]);
    case "reopenTask":
      return taskFn.reopenTask(userId, args as Parameters<typeof taskFn.reopenTask>[1]);
    case "deleteTask":
      return taskFn.deleteTask(userId, args as Parameters<typeof taskFn.deleteTask>[1]);

    // 予定
    case "addSchedule":
      return await scheduleFn.addSchedule(
        userId,
        args as Parameters<typeof scheduleFn.addSchedule>[1],
      );
    case "listSchedules":
      return await scheduleFn.listSchedules(
        userId,
        args as Parameters<typeof scheduleFn.listSchedules>[1],
      );
    case "deleteSchedule":
      return await scheduleFn.deleteSchedule(
        userId,
        args as Parameters<typeof scheduleFn.deleteSchedule>[1],
      );

    // 家計
    case "addExpense":
      return expenseFn.addExpense(userId, args as Parameters<typeof expenseFn.addExpense>[1]);
    case "setMonthlyBudget":
      return expenseFn.setMonthlyBudget(
        userId,
        args as Parameters<typeof expenseFn.setMonthlyBudget>[1],
      );
    case "getMonthlyBudgetInfo":
      return expenseFn.getMonthlyBudgetInfo(userId);
    case "getMonthlySummary":
      return expenseFn.getMonthlySummary(
        userId,
        args as Parameters<typeof expenseFn.getMonthlySummary>[1],
      );
    case "getCategoryBreakdown":
      return expenseFn.getCategoryBreakdown(
        userId,
        args as Parameters<typeof expenseFn.getCategoryBreakdown>[1],
      );
    case "listRecentExpenses":
      return expenseFn.listRecentExpenses(
        userId,
        args as Parameters<typeof expenseFn.listRecentExpenses>[1],
      );

    // ヘッドレスブラウザ操作
    case "fetchDynamicPage":
      return await browserFn.fetchDynamicPage(
        userId,
        args as Parameters<typeof browserFn.fetchDynamicPage>[1],
      );
    case "takePageScreenshot":
      return await browserFn.takePageScreenshot(
        userId,
        args as Parameters<typeof browserFn.takePageScreenshot>[1],
      );
    case "searchWeb":
      return await browserFn.searchWeb(userId, args as Parameters<typeof browserFn.searchWeb>[1]);

    // 永続インタラクティブブラウザ操作
    case "browserInteractiveOpen":
      return await browserFn.browserInteractiveOpen(
        userId,
        args as Parameters<typeof browserFn.browserInteractiveOpen>[1],
      );
    case "browserInteractiveClick":
      return await browserFn.browserInteractiveClick(
        userId,
        args as Parameters<typeof browserFn.browserInteractiveClick>[1],
      );
    case "browserInteractiveType":
      return await browserFn.browserInteractiveType(
        userId,
        args as Parameters<typeof browserFn.browserInteractiveType>[1],
      );
    case "browserInteractiveWait":
      return await browserFn.browserInteractiveWait(
        userId,
        args as Parameters<typeof browserFn.browserInteractiveWait>[1],
      );
    case "browserInteractiveStatus":
      return await browserFn.browserInteractiveStatus(userId);
    case "browserInteractiveClose":
      return await browserFn.browserInteractiveClose(userId);

    // 資格情報
    case "getCredential":
      return await credentialFn.getCredential(
        userId,
        args as Parameters<typeof credentialFn.getCredential>[1],
      );
    case "listCredentials":
      return await credentialFn.listCredentials(
        userId,
        args as Parameters<typeof credentialFn.listCredentials>[1],
      );

    // 記憶管理
    case "saveMemory":
      return memoryFn.saveMemory(userId, args as Parameters<typeof memoryFn.saveMemory>[1]);
    case "searchMemories":
      return memoryFn.searchMemories(userId, args as Parameters<typeof memoryFn.searchMemories>[1]);
    case "listMemories":
      return memoryFn.listMemories(userId, args as Parameters<typeof memoryFn.listMemories>[1]);
    case "updateMemory":
      return memoryFn.updateMemory(userId, args as Parameters<typeof memoryFn.updateMemory>[1]);
    case "deleteMemory":
      return memoryFn.deleteMemory(userId, args as Parameters<typeof memoryFn.deleteMemory>[1]);

    // 手順書（Playbook）自動化
    case "savePlaybook":
      return await playbookFn.savePlaybook(
        userId,
        args as Parameters<typeof playbookFn.savePlaybook>[1],
      );
    case "findPlaybooks":
      return await playbookFn.findPlaybooks(
        userId,
        args as Parameters<typeof playbookFn.findPlaybooks>[1],
      );

    // 動的プラグインのリロード
    case "reloadDynamicFunctions":
      try {
        await initializeDynamicFunctions(true);
        return JSON.stringify({
          success: true,
          message: "動的関数を正常にリロードしました。新しく追加された関数が利用可能です。",
          loadedFunctions: dynamicFunctionDeclarations.map((d) => d.name),
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return JSON.stringify({ success: false, message: `リロード失敗: ${message}` });
      }

    default: {
      // 動的ロードされた関数マップに存在すれば実行する
      const fn = dynamicDispatchMap.get(functionName);
      if (!fn) {
        return JSON.stringify({ success: false, message: `不明な関数: ${functionName}` });
      }
      return await fn(userId, args);
    }
  }
}
