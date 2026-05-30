import { state } from "./state.js";

export async function renderUrgentDashboardList() {
  const list = document.getElementById("dashboard-urgent-list");
  list.replaceChildren();

  try {
    const [resSched, resTasks] = await Promise.all([
      fetch(`/api/schedules?userId=${state.activeUserId}&days=1`),
      fetch(`/api/tasks?userId=${state.activeUserId}&status=pending`),
    ]);
    const dataSched = await resSched.json();
    const dataTasks = await resTasks.json();

    let count = 0;

    if (dataSched.success) {
      dataSched.schedules.slice(0, 2).forEach(sched => {
        list.appendChild(makeUrgentItem(
          "calendar_today",
          `[今日の予定] ${sched.title}`,
          sched.start_at.slice(11, 16),
          "badge-urgent"
        ));
        count++;
      });
    }

    if (dataTasks.success) {
      dataTasks.tasks.slice(0, 3).forEach(task => {
        list.appendChild(makeUrgentItem(
          "checklist",
          `[未消化タスク] ${task.title}`,
          task.priority === 2 ? "優先: 高" : "優先: 普通",
          "badge-normal"
        ));
        count++;
      });
    }

    if (count === 0) {
      const item = document.createElement("div");
      item.className = "urgent-item";
      item.textContent = "今日の急ぎのタスクや予定はありません！素晴らしい計画性ですね！";
      list.appendChild(item);
    }
  } catch (e) {
    console.error(e);
  }
}

function makeUrgentItem(icon, text, badgeText, badgeClass) {
  const item = document.createElement("div");
  item.className = "urgent-item";

  const iconEl = document.createElement("span");
  iconEl.className = "material-symbols-outlined icon-small";
  iconEl.style.marginRight = "6px";
  iconEl.textContent = icon;

  const titleEl = document.createElement("span");
  titleEl.textContent = ` ${text}`;

  const badge = document.createElement("span");
  badge.className = `urgent-badge ${badgeClass}`;
  badge.textContent = badgeText;

  item.append(iconEl, titleEl, badge);
  return item;
}
