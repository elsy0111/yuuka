import { state } from "./state.js";
import { fetchDashboardStats } from "./dashboard.js";
import { fetchTasksList } from "./tasks.js";
import { fetchSchedulesList } from "./schedules.js";
import { fetchExpensesList } from "./expenses.js";
import { fetchConfigSettings } from "./config.js";
import { fetchMemories } from "./memories.js";
import { fetchBotLogs } from "./bot-logs.js";

const TAB_TITLES = {
  dashboard: "ダッシュボード",
  tasks: "タスク管理（ToDo）",
  schedules: "予定スケジュール（Googleカレンダー同期）",
  expenses: "家計管理（レシートAI解析＆経費簿）",
  config: "システム設定情報",
  "bot-logs": "Discord Botログ",
};

export function loadDataForActiveTab() {
  switch (state.activeTab) {
    case "dashboard":
      fetchDashboardStats();
      break;
    case "tasks":
      fetchTasksList();
      break;
    case "schedules":
      fetchSchedulesList();
      break;
    case "expenses":
      fetchExpensesList();
      break;
    case "config":
      fetchConfigSettings();
      fetchMemories();
      break;
    case "bot-logs":
      fetchBotLogs();
      break;
  }
}

export function switchTab(tabId) {
  state.activeTab = tabId;

  document.querySelectorAll(".menu-item").forEach((item) => {
    item.classList.toggle("active", item.getAttribute("data-tab") === tabId);
  });

  document.querySelectorAll(".tab-view").forEach((view) => {
    view.classList.toggle("active", view.id === `tab-${tabId}`);
  });

  const titleEl = document.getElementById("current-tab-title");
  if (titleEl) titleEl.textContent = TAB_TITLES[tabId] || "ユウカの管理室";

  loadDataForActiveTab();
}

export function initRouter() {
  document.querySelectorAll(".menu-item").forEach((item) => {
    item.addEventListener("click", (e) => {
      e.preventDefault();
      switchTab(item.getAttribute("data-tab"));
    });
  });
}
