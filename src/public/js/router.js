import { fetchBotLogs } from "./bot-logs.js";
import { fetchConfigSettings } from "./config.js";
import { fetchDashboardStats, fetchGeminiUsage } from "./dashboard.js";
import { fetchExpensesList } from "./expenses.js";
import { fetchMemories } from "./memories.js";
import { fetchSchedulesList } from "./schedules.js";
import { state } from "./state.js";
import { getModal, openModal } from "./modal.js";
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

export function switchTab(tabId, recordHistory = false) {
  if (!Object.hasOwn(TAB_TITLES, tabId)) return;
  const changed = state.activeTab !== tabId;
  state.activeTab = tabId;
  if (location.hash !== `#${tabId}`) {
    history[recordHistory ? "pushState" : "replaceState"](null, "", `#${tabId}`);
  }

  document.querySelectorAll(".menu-item").forEach((item) => {
    const active = item.getAttribute("data-tab") === tabId;
    item.classList.toggle("active", active);
    if (active) item.setAttribute("aria-current", "page");
    else item.removeAttribute("aria-current");
  });

  document.querySelectorAll(".tab-view").forEach((view) => {
    view.classList.toggle("active", view.id === `tab-${tabId}`);
  });

  const titleEl = document.getElementById("current-tab-title");
  if (titleEl) titleEl.textContent = TAB_TITLES[tabId] || "ユウカの管理室";

  document.title = `${TAB_TITLES[tabId]} | ユウカの管理室`;
  if (changed) {
    document.querySelector(".main-content")?.scrollTo(0, 0);
    window.scrollTo(0, 0);
    titleEl?.focus({ preventScroll: true });
  }
  loadDataForActiveTab();
}

export function initRouter() {
  document.querySelectorAll("[data-quick-add]").forEach((button) => {
    button.addEventListener("click", () => {
      const kind = button.dataset.quickAdd;
      if (kind === "expense") {
        switchTab("expenses", true);
        const input = document.getElementById("exp-amount");
        input?.scrollIntoView({ block: "center" });
        input?.focus({ preventScroll: true });
      } else {
        switchTab(kind === "task" ? "tasks" : "schedules", true);
        openModal(getModal(kind));
      }
    });
  });
  window.addEventListener("hashchange", () => switchTab(location.hash.slice(1)));
  document.querySelectorAll(".menu-item").forEach((item) => {
    item.addEventListener("click", (e) => {
      e.preventDefault();
      switchTab(item.getAttribute("data-tab"), true);
    });
  });
}
