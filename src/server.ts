import http from "node:http";
import { config } from "./config.js";
import { sendError } from "./server/http.js";
import { handleLogin, handleLogout } from "./server/routes/auth.js";
import { handleCalendarAdd, handleCalendarDelete } from "./server/routes/config.js";
import { handleCredentials } from "./server/routes/credentials.js";
import { handleExpenses } from "./server/routes/expenses.js";
import { handleMemories } from "./server/routes/memories.js";
import { handleSchedules } from "./server/routes/schedules.js";
import { handleStatus, handleUsers } from "./server/routes/status.js";
import { handleUserMigrate } from "./server/routes/userMigrate.js";
import { handleTasks } from "./server/routes/tasks.js";
import { isAuthenticated } from "./server/session.js";
import { serveStaticFile } from "./server/static.js";
import type { RouteContext, RouteHandler } from "./server/types.js";

const publicRoutes: RouteHandler[] = [handleLogin];
const privateRoutes: RouteHandler[] = [
  handleLogout,
  handleStatus,
  handleCalendarAdd,
  handleCalendarDelete,
  handleUsers,
  handleCredentials,
  handleTasks,
  handleSchedules,
  handleExpenses,
  handleMemories,
  handleUserMigrate,
];

export async function serverHandler(req: http.IncomingMessage, res: http.ServerResponse) {
  const { method, url } = req;
  const parsedUrl = new URL(url || "/", `http://${req.headers.host || "localhost"}`);
  const ctx: RouteContext = {
    req,
    res,
    parsedUrl,
    pathname: parsedUrl.pathname,
    method,
  };

  res.setHeader("Access-Control-Allow-Origin", "null");

  if (!ctx.pathname.startsWith("/api/")) {
    serveStaticFile(req, res);
    return;
  }

  for (const route of publicRoutes) {
    if (await route(ctx)) return;
  }

  if (!isAuthenticated(req)) {
    sendError(res, 401, "認証されていません。ログインし直してください。");
    return;
  }

  for (const route of privateRoutes) {
    if (await route(ctx)) return;
  }

  console.warn(`[404] 未マッチルート: ${ctx.method} ${ctx.pathname}`);
  sendError(res, 404, "APIエンドポイントが見つかりません。");
}

let server: http.Server | null = null;

export function startWebServer(retries = 10, retryDelayMs = 2000): Promise<void> {
  return new Promise((resolve, reject) => {
    const attempt = () => {
      server = http.createServer(serverHandler);

      server.on("error", (err: NodeJS.ErrnoException) => {
        if (err.code !== "EADDRINUSE") return reject(err);
        server?.removeAllListeners();
        server = null;
        if (retries <= 0) return reject(new Error(`ポート ${config.port} が解放されませんでした。`));
        console.log(`⏳ ポート ${config.port} 使用中。${retryDelayMs / 1000}秒後にリトライ... (残り ${retries} 回)`);
        retries--;
        setTimeout(attempt, retryDelayMs);
      });

      server.listen(config.port, config.host, () => {
        console.log(`🌐 Yuuka 管理画面サーバー起動完了: http://${config.host}:${config.port}`);
        resolve();
      });
    };

    attempt();
  });
}

export function stopWebServer(): void {
  if (!server) return;
  server.close(() => {
    console.log("🌐 Yuuka 管理画面サーバーを停止しました。");
  });
  server = null;
}
