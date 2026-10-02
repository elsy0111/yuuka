import { guardSubmit, apiRequest, reportError, showListState } from "./ui.js";
import { toast } from "./toast.js";
import { closeModal, confirmModal, getModal, openModal } from "./modal.js";
import { state } from "./state.js";

export async function fetchTasksList(
  filter = document.querySelector("[data-filter].active")?.dataset.filter || "all",
) {
  const list = document.getElementById("tasks-list");
  const requestId = (list._requestId || 0) + 1;
  list._requestId = requestId;
  showListState(list, "読み込み中…");
  try {
    const data = await apiRequest(`/api/tasks?userId=${state.activeUserId}&status=${filter}`);
    if (list._requestId !== requestId) return;
    list.replaceChildren();
    if (data.tasks.length > 0) {
      data.tasks.forEach((task) => {
        list.appendChild(makeTaskCard(task));
      });
    } else {
      const empty = document.createElement("div");
      empty.className = "glass";
      empty.textContent = "登録されているタスクがありません。";
      list.appendChild(empty);
    }
  } catch (e) {
    if (list._requestId !== requestId) return;
    showListState(list, e.message || "読み込みに失敗しました。", () => fetchTasksList(filter));
  }
}

function makeTaskCard(task) {
  const card = document.createElement("div");
  card.className = `card-item glass hover-lift ${task.status === "done" ? "done" : ""}`;

  const left = document.createElement("div");
  left.className = "card-content-left";

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.className = "checkbox-custom";
  checkbox.setAttribute("aria-label", `${task.title}の完了状態`);
  checkbox.checked = task.status === "done";
  checkbox.addEventListener("change", () => toggleTaskCompletion(task.id, task.status, checkbox));

  const text = document.createElement("div");
  text.className = "card-text";

  const title = document.createElement("div");
  title.className = "card-title";
  title.textContent = task.title;

  const desc = document.createElement("div");
  desc.className = "card-desc";
  desc.textContent = task.description || "説明なし";

  const meta = document.createElement("div");
  meta.className = "card-meta-row";

  if (task.due_date) {
    meta.appendChild(makeMetaItem("calendar_today", `期限: ${task.due_date}`));
  }
  const labels = ["低", "中", "高"];
  meta.appendChild(makeMetaItem("priority_high", `優先度: ${labels[task.priority] || "低"}`));

  text.append(title, desc, meta);
  left.append(checkbox, text);

  const right = document.createElement("div");
  right.className = "card-actions-right";
  right.appendChild(makeIconButton("edit", () => openEditTaskModal(task)));
  right.appendChild(makeTrashButton(() => handleDeleteTask(task.id)));

  card.append(left, right);
  return card;
}

function makeMetaItem(icon, text) {
  const span = document.createElement("span");
  span.className = "meta-item";
  const iconEl = document.createElement("span");
  iconEl.className = "material-symbols-outlined meta-icon";
  iconEl.textContent = icon;
  span.append(iconEl, document.createTextNode(` ${text}`));
  return span;
}

function makeIconButton(iconName, onClick) {
  const btn = document.createElement("button");
  btn.className = "btn-trash";
  btn.type = "button";
  btn.setAttribute("aria-label", iconName === "edit" ? "タスクを編集" : "タスクを削除");
  const icon = document.createElement("span");
  icon.className = "material-symbols-outlined";
  icon.textContent = iconName;
  btn.appendChild(icon);
  btn.addEventListener("click", onClick);
  return btn;
}

function makeTrashButton(onClick) {
  return makeIconButton("delete", onClick);
}

function openEditTaskModal(task) {
  document.getElementById("task-edit-id").value = task.id;
  document.getElementById("task-edit-title").value = task.title;
  document.getElementById("task-edit-description").value = task.description || "";
  document.getElementById("task-edit-due").value = task.due_date || "";
  document.getElementById("task-edit-priority").value = String(task.priority ?? 0);
  openModal(getModal("task-edit"));
}

async function toggleTaskCompletion(id, currentStatus, checkbox) {
  checkbox.disabled = true;
  const endpoint = currentStatus === "done" ? "/api/tasks/reopen" : "/api/tasks/complete";
  try {
    await apiRequest(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, userId: state.activeUserId }),
    });
    const f = document.querySelector("[data-filter].active")?.getAttribute("data-filter") || "all";
    fetchTasksList(f);
  } catch (e) {
    checkbox.checked = currentStatus === "done";
    reportError(e);
  } finally {
    checkbox.disabled = false;
  }
}

async function handleDeleteTask(id) {
  if (!(await confirmModal("本当にこのタスクを削除しますか？"))) return;
  try {
    await apiRequest("/api/tasks/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, userId: state.activeUserId }),
    });
    const f = document.querySelector("[data-filter].active")?.getAttribute("data-filter") || "all";
    fetchTasksList(f);
  } catch (e) {
    reportError(e);
  }
}

async function handleEditTaskSubmit(e) {
  e.preventDefault();
  const id = parseInt(document.getElementById("task-edit-id").value, 10);
  const title = document.getElementById("task-edit-title").value.trim();
  const desc = document.getElementById("task-edit-description").value.trim();
  const dueDate = document.getElementById("task-edit-due").value || null;
  const priority = parseInt(document.getElementById("task-edit-priority").value, 10);
  try {
    const data = await apiRequest("/api/tasks/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id,
        userId: state.activeUserId,
        title,
        description: desc,
        dueDate,
        priority,
      }),
    });
    if (data.success) {
      closeModal(getModal("task-edit"));
      const f =
        document.querySelector("[data-filter].active")?.getAttribute("data-filter") || "all";
      fetchTasksList(f);
    }
  } catch (err) {
    reportError(err);
  }
}

export function initTasks() {
  document.querySelectorAll("[data-filter]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-filter]").forEach((b) => {
        b.classList.remove("active");
      });
      btn.classList.add("active");
      fetchTasksList(btn.getAttribute("data-filter"));
    });
  });

  document
    .getElementById("task-edit-form")
    ?.addEventListener("submit", guardSubmit(handleEditTaskSubmit));

  document.getElementById("task-form")?.addEventListener(
    "submit",
    guardSubmit(async (e) => {
      e.preventDefault();
      const title = document.getElementById("task-title").value.trim();
      const desc = document.getElementById("task-description").value.trim();
      const dueDate = document.getElementById("task-due").value || null;
      const priority = parseInt(document.getElementById("task-priority").value, 10);
      try {
        const data = await apiRequest("/api/tasks/add", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: state.activeUserId,
            title,
            description: desc,
            dueDate,
            priority,
          }),
        });
        if (data.success) {
          toast.success("タスクを追加しました。");
          closeModal(getModal("task"));
          document.getElementById("task-form").reset();
          fetchTasksList();
        }
      } catch (e) {
        reportError(e);
      }
    }),
  );
}
