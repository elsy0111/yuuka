// スプラッシュスクリーン制御（DOMContentLoaded 前に実行）
(function () {
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

import { initTheme } from "./theme.js";
import { initModals } from "./modal.js";
import { initRouter } from "./router.js";
import { initAuth, checkSessionHandshake } from "./auth.js";
import { initTasks } from "./tasks.js";
import { initSchedules } from "./schedules.js";
import { initExpenses } from "./expenses.js";
import { initExpenseDetail } from "./expense-detail.js";
import { initConfig } from "./config.js";
import { initCredentials } from "./credentials.js";

document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  initModals();
  initRouter();
  initAuth();
  initTasks();
  initSchedules();
  initExpenses();
  initExpenseDetail();
  initConfig();
  initCredentials();

  checkSessionHandshake();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }
});
