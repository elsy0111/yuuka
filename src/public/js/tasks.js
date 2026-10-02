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
  list._tasks = null;
  const count = document.getElementById("tasks-count");
  if (count) count.textContent = "読み込み中…";
  showListState(list, "読み込み中…");
  try {
    const params = new URLSearchParams({ userId: state.activeUserId, status: filter });
    const data = await apiRequest(`/api/tasks?${params}`);
    if (list._requestId !== requestId) return;
    list._tasks = data.tasks;
    renderTasks(list);
  } catch (e) {
    if (list._requestId !== requestId) return;
    if (count) count.textContent = "取得に失敗しました";
    showListState(list, e.message || "読み込みに失敗しました。", () => fetchTasksList(filter));
  }
}

function renderTasks(list) {
  if (list._tasks === null) return;
  const query = (list._searchQuery || "").trim().toLocaleLowerCase();
  const tasks = (list._tasks || []).filter((task) => {
    if (!query) return true;
    return `${task.title}\n${task.description || ""}`.toLocaleLowerCase().includes(query);
  });
  list.replaceChildren();
  const status = list._tasks?.length ? `${tasks.length}件` : "登録されているタスクがありません。";
  const count = document.getElementById("tasks-count");
  if (count) count.textContent = status;
  if (tasks.length) {
    tasks.forEach((task) => {
      list.appendChild(makeTaskCard(task));
    });
    return;
  }
  const empty = document.createElement("div");
  empty.className = "glass task-empty-state";
  empty.textContent = query ? "検索条件に一致するタスクがありません。" : status;
  if (query) {
    const clear = document.createElement("button");
    clear.type = "button";
    clear.className = "btn-filter task-clear-search";
    clear.textContent = "検索をクリア";
    clear.addEventListener("click", () => {
      const input = document.getElementById("task-search");
      if (input) input.value = "";
      list._searchQuery = "";
      renderTasks(list);
      input?.focus();
    });
    empty.appendChild(clear);
  }
  list.appendChild(empty);
}

function setupTaskSearch() {
  const list = document.getElementById("tasks-list");
  const filterGroup = document.querySelector("[data-filter]")?.parentElement;
  if (!list || !filterGroup || document.getElementById("task-search")) return;
  const label = document.createElement("label");
  label.className = "task-search-wrap";
  label.htmlFor = "task-search";
  const icon = document.createElement("span");
  icon.className = "material-symbols-outlined";
  icon.textContent = "search";
  const input = document.createElement("input");
  input.id = "task-search";
  input.type = "search";
  input.placeholder = "タイトル・説明を検索";
  input.setAttribute("aria-label", "タスクを検索");
  input.addEventListener("input", () => {
    list._searchQuery = input.value;
    renderTasks(list);
  });
  label.append(icon, input);
  filterGroup.appendChild(label);
  const count = document.createElement("span");
  count.id = "tasks-count";
  count.className = "tasks-count";
  count.setAttribute("aria-live", "polite");
  filterGroup.appendChild(count);
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
  if (!title) return toast.error("タイトルを入力してください。");
  if (!Number.isInteger(priority) || priority < 0 || priority > 2) {
    return toast.error("優先度を選択してください。");
  }
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
  setupTaskSearch();
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
      if (!title) return toast.error("タイトルを入力してください。");
      if (!Number.isInteger(priority) || priority < 0 || priority > 2) {
        return toast.error("優先度を選択してください。");
      }
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
