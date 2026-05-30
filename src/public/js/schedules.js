import { state } from "./state.js";
import { closeModal, getModal, openModal } from "./modal.js";

export async function fetchSchedulesList(days = 7) {
  const list = document.getElementById("schedules-list");
  list.replaceChildren();
  try {
    const res = await fetch(`/api/schedules?userId=${state.activeUserId}&days=${days}`);
    const data = await res.json();
    if (data.success && data.schedules.length > 0) {
      data.schedules.forEach((sched) => {
        list.appendChild(makeScheduleCard(sched));
      });
    } else {
      const empty = document.createElement("div");
      empty.className = "glass";
      empty.textContent = "期間内の登録予定がありません。";
      list.appendChild(empty);
    }
  } catch (e) {
    console.error(e);
  }
}

function makeScheduleCard(sched) {
  const card = document.createElement("div");
  card.className = "card-item glass hover-lift";

  const left = document.createElement("div");
  left.className = "card-content-left";

  const icon = document.createElement("span");
  icon.className = "material-symbols-outlined list-card-icon";
  icon.style.fontSize = "1.8rem";
  icon.textContent = "event";

  const text = document.createElement("div");
  text.className = "card-text";

  const title = document.createElement("div");
  title.className = "card-title";
  title.textContent = sched.title;

  const desc = document.createElement("div");
  desc.className = "card-desc";
  desc.textContent = sched.description || "説明なし";

  const meta = document.createElement("div");
  meta.className = "card-meta-row";

  const time = document.createElement("span");
  time.className = "meta-item";
  const timeIcon = document.createElement("span");
  timeIcon.className = "material-symbols-outlined meta-icon";
  timeIcon.textContent = "schedule";
  time.append(timeIcon, document.createTextNode(` 開始: ${sched.start_at.replace("T", " ")}`));
  meta.appendChild(time);

  if (sched.google_event_id) {
    const badge = document.createElement("span");
    badge.className = "badge badge-accent";
    badge.textContent = "Google同期済み";
    meta.appendChild(badge);
  }

  text.append(title, desc, meta);
  left.append(icon, text);

  const right = document.createElement("div");
  right.className = "card-actions-right";

  const btnEdit = document.createElement("button");
  btnEdit.className = "btn-trash";
  const editIcon = document.createElement("span");
  editIcon.className = "material-symbols-outlined";
  editIcon.textContent = "edit";
  btnEdit.appendChild(editIcon);
  btnEdit.addEventListener("click", () => openEditScheduleModal(sched));
  right.appendChild(btnEdit);

  const btnTrash = document.createElement("button");
  btnTrash.className = "btn-trash";
  const trashIcon = document.createElement("span");
  trashIcon.className = "material-symbols-outlined";
  trashIcon.textContent = "delete";
  btnTrash.appendChild(trashIcon);
  btnTrash.addEventListener("click", () => handleDeleteSchedule(sched.id));
  right.appendChild(btnTrash);

  card.append(left, right);
  return card;
}

function openEditScheduleModal(sched) {
  document.getElementById("sched-edit-id").value = sched.id;
  document.getElementById("sched-edit-title").value = sched.title;
  document.getElementById("sched-edit-description").value = sched.description || "";
  document.getElementById("sched-edit-start").value = sched.start_at.replace(" ", "T").slice(0, 16);
  document.getElementById("sched-edit-end").value = sched.end_at
    ? sched.end_at.replace(" ", "T").slice(0, 16)
    : "";
  document.getElementById("sched-edit-remind").value = sched.remind_before_minutes ?? 30;
  openModal(getModal("schedule-edit"));
}

async function handleEditScheduleSubmit(e) {
  e.preventDefault();
  const id = parseInt(document.getElementById("sched-edit-id").value, 10);
  const title = document.getElementById("sched-edit-title").value.trim();
  const desc = document.getElementById("sched-edit-description").value.trim();
  const startAt = document.getElementById("sched-edit-start").value;
  const endAt = document.getElementById("sched-edit-end").value || null;
  const remind = parseInt(document.getElementById("sched-edit-remind").value, 10);
  try {
    const res = await fetch("/api/schedules/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id,
        userId: state.activeUserId,
        title,
        description: desc,
        startAt,
        endAt,
        remindBeforeMinutes: remind,
      }),
    });
    const data = await res.json();
    if (data.success) {
      closeModal(getModal("schedule-edit"));
      const d = parseInt(
        document.querySelector("[data-days].active")?.getAttribute("data-days") || "7",
        10,
      );
      fetchSchedulesList(d);
    }
  } catch (err) {
    console.error(err);
  }
}

async function handleDeleteSchedule(id) {
  if (
    !confirm(
      "本当にこの予定を削除しますか？\n(Googleカレンダーと連携している場合、自動でカレンダーからも削除されます)",
    )
  )
    return;
  try {
    await fetch("/api/schedules/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, userId: state.activeUserId }),
    });
    const d = parseInt(
      document.querySelector("[data-days].active")?.getAttribute("data-days") || "7",
      10,
    );
    fetchSchedulesList(d);
  } catch (e) {
    console.error(e);
  }
}

export function initSchedules() {
  document.querySelectorAll("[data-days]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-days]").forEach((b) => {
        b.classList.remove("active");
      });
      btn.classList.add("active");
      fetchSchedulesList(parseInt(btn.getAttribute("data-days"), 10));
    });
  });

  document
    .getElementById("schedule-edit-form")
    ?.addEventListener("submit", handleEditScheduleSubmit);

  document.getElementById("schedule-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const title = document.getElementById("sched-title").value.trim();
    const desc = document.getElementById("sched-description").value.trim();
    const startAt = document.getElementById("sched-start").value;
    const endAt = document.getElementById("sched-end").value;
    const remind = parseInt(document.getElementById("sched-remind").value, 10);
    try {
      const res = await fetch("/api/schedules/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: state.activeUserId,
          title,
          description: desc,
          startAt,
          endAt: endAt || undefined,
          remindBeforeMinutes: remind,
        }),
      });
      const data = await res.json();
      if (data.success) {
        closeModal(getModal("schedule"));
        document.getElementById("schedule-form").reset();
        const d = parseInt(
          document.querySelector("[data-days].active")?.getAttribute("data-days") || "7",
          10,
        );
        fetchSchedulesList(d);
      }
    } catch (e) {
      console.error(e);
    }
  });
}
