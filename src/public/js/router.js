import { fetchBotLogs } from "./bot-logs.js";
import { fetchConfigSettings } from "./config.js";
import { fetchDashboardStats, fetchGeminiUsage } from "./dashboard.js";
import { fetchExpensesList } from "./expenses.js";
import { fetchMemories } from "./memories.js";
import { fetchSchedulesList } from "./schedules.js";
import { state } from "./state.js";
import { fetchTasksList } from "./tasks.js";

const TAB_TITLES = {
  dashboard: "ダッシュボード",
  tasks: "タスク管理（ToDo）",
  schedules: "予定スケジュール（Googleカレンダー同期）",
  expenses: "家計管理",
  config: "システム設定情報",
  "bot-logs": "開発者",
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
      fetchGeminiUsage();
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
