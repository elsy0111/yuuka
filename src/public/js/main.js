// スプラッシュスクリーン制御（DOMContentLoaded 前に実行）
(() => {
  const splash = document.getElementById("splash-screen");
  if (!splash) return;
  const theme = localStorage.getItem("yuuka-theme") || "dark";
  const isBa = theme === "blue-archive";
  splash.style.backgroundColor = isBa ? "#FBFCFF" : "#09090b";
  const title = document.getElementById("splash-title");
  const sub = document.getElementById("splash-sub");
  if (title) title.style.color = isBa ? "#1a2740" : "#fafafa";
  if (sub) sub.style.color = isBa ? "#6687a8" : "#a1a1aa";
  const isPwa =
    window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  setTimeout(
    () => {
      splash.classList.add("hide");
      splash.addEventListener("animationend", () => splash.remove(), { once: true });
    },
    isPwa ? 1800 : 0,
  );
})();

import { checkSessionHandshake, initAuth } from "./auth.js";
import { initBotLogs } from "./bot-logs.js";
import { initConfig } from "./config.js";
import { initCredentials } from "./credentials.js";
import { initGeminiQuotaEdit } from "./dashboard.js";
import { initExpenseDetail } from "./expense-detail.js";
import { initBudgetEdit, initExpenses } from "./expenses.js";
import { initModals } from "./modal.js";
import { initRouter } from "./router.js";
import { initSchedules } from "./schedules.js";
import { initTasks } from "./tasks.js";
import { initTheme } from "./theme.js";

document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  initModals();
  initRouter();
  initAuth();
  initTasks();
  initSchedules();
  initExpenses();
  initBudgetEdit();
  initGeminiQuotaEdit();
  initExpenseDetail();
  initConfig();
  initCredentials();
  initBotLogs();

  checkSessionHandshake();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }
});
