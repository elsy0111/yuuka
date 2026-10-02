import { confirmModal } from "./modal.js";
import { state } from "./state.js";
import { toast } from "./toast.js";
import { apiRequest, guardSubmit, reportError } from "./ui.js";

let rate = null;
let initialized = false;
let requestVersion = 0;
let rateDirty = false;
let loadedUser = "";
let editing = null;
const el = (id) => document.getElementById(`work-${id}`);
const yen = (value) => `¥${Number(value || 0).toLocaleString()}`;
const localDate = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const month = () => el("month").value || localDate().slice(0, 7);
const hoursInput = () => Number(el("hours").value) + Number(el("minutes").value) / 60;
const duration = (minutes) =>
  `${Math.floor(minutes / 60)}時間${minutes % 60 ? `${minutes % 60}分` : ""}`;

function resetEntry() {
  editing = null;
  el("entry-form").reset();
  el("date").value = month() === localDate().slice(0, 7) ? localDate() : `${month()}-01`;
  el("form-title").textContent = "勤務を追加";
  el("edit-cancel").hidden = true;
  el("entry-submit").textContent = "働いた時間を記録";
  renderPreview();
}
function renderSummary(summary) {
  el("summary").replaceChildren();
  for (const [label, value] of [
    ["労働時間", duration(summary.minutes)],
    ["働いた分", yen(summary.amount)],
  ]) {
    const item = document.createElement("div");
    const caption = document.createElement("span");
    caption.textContent = `${Number(month().slice(5))}月の${label}`;
    const amount = document.createElement("strong");
    amount.textContent = value;
    item.append(caption, amount);
    el("summary").append(item);
  }
}
function renderPreview() {
  const hours = hoursInput();
  const minutes = Number.isFinite(hours) ? Math.round(hours * 60) : 0;
  const appliedRate = editing?.hourlyRate ?? rate;
  el("preview").textContent =
    appliedRate && minutes > 0 && hours <= 24
      ? `${duration(minutes)} · ${yen(Math.round((minutes * appliedRate) / 60))}（控除前）${editing ? ` · 記録時の時給 ${yen(appliedRate)}` : ""}`
      : appliedRate
        ? "時間を入力すると働いた分を表示します"
        : "先に時給を保存してください";
}
function editEntry(entry) {
  editing = entry;
  el("hours").value = Math.floor(entry.minutes / 60);
  el("minutes").value = entry.minutes % 60;
  el("date").value = entry.date;
  el("description").value = entry.description || "";
  el("form-title").textContent = `${entry.date}の勤務を編集`;
  el("edit-cancel").hidden = false;
  el("entry-submit").textContent = "変更を保存";
  el("entry-submit").disabled = false;
  renderPreview();
  el("entry-form").scrollIntoView({
    block: "center",
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
  });
  el("hours").focus({ preventScroll: true });
}
function renderEntries(entries) {
  const list = el("entry-list");
  list.replaceChildren();
  if (!entries.length) {
    list.textContent = `${Number(month().slice(5))}月の勤務記録はありません。`;
    return;
  }
  for (const entry of entries) {
    const row = document.createElement("article");
    row.className = "work-entry-row";
    const text = document.createElement("div");
    text.className = "work-entry-text";
    const heading = document.createElement("strong");
    heading.textContent = `${entry.date} · ${duration(entry.minutes)}`;
    const value = document.createElement("span");
    value.textContent = `${yen(entry.amount)} · 時給 ${yen(entry.hourlyRate)}`;
    text.append(heading, value);
    if (entry.description) {
      const note = document.createElement("span");
      note.textContent = entry.description;
      text.append(note);
    }
    const actions = document.createElement("div");
    actions.className = "work-entry-actions";
    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "btn btn-secondary btn-sm";
    edit.textContent = "編集";
    edit.setAttribute("aria-label", `${entry.date}の勤務を編集`);
    edit.addEventListener("click", () => editEntry(entry));
    const del = document.createElement("button");
    del.type = "button";
    del.className = "btn btn-secondary btn-sm";
    del.textContent = "削除";
    del.setAttribute("aria-label", `${entry.date}の勤務を削除`);
    del.addEventListener("click", async () => {
      if (
        !(await confirmModal(
          `${entry.date}の勤務（${duration(entry.minutes)}・${yen(entry.amount)}）を削除しますか？`,
        ))
      )
        return;
      const user = state.activeUserId;
      del.disabled = true;
      edit.disabled = true;
      try {
        await apiRequest("/api/work/delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: entry.id }),
        });
        if (user !== state.activeUserId) return;
        if (editing?.id === entry.id) resetEntry();
        toast.success("勤務記録を削除しました。");
        await fetchWorkSummary();
      } catch (error) {
        del.disabled = false;
        edit.disabled = false;
        reportError(error);
      }
    });
    actions.append(edit, del);
    row.append(text, actions);
    list.append(row);
  }
}
export async function fetchWorkSummary() {
  if (!el("card") || !state.activeUserId) return;
  const user = state.activeUserId;
  if (loadedUser !== user) {
    rateDirty = false;
    rate = null;
    el("rate-hint").textContent = "";
    el("rate-form").reset();
    el("month").value = localDate().slice(0, 7);
    resetEntry();
    loadedUser = user;
  }
  const selectedMonth = month();
  const version = ++requestVersion;
  el("card").setAttribute("aria-busy", "true");
  el("summary").textContent = "読み込み中…";
  el("entry-list").replaceChildren();
  el("error").textContent = "";
  el("retry")?.remove();
  el("entry-submit").disabled = true;
  try {
    const data = await apiRequest(`/api/work?month=${encodeURIComponent(selectedMonth)}`);
    if (version !== requestVersion || user !== state.activeUserId) return;
    rate = data.hourlyRate;
    if (!rateDirty) el("hourly-rate").value = rate ?? "";
    el("rate-hint").textContent = rate
      ? `現在の時給: ${yen(rate)}（過去の記録は変更されません）`
      : "時給を設定すると記録できます";
    renderSummary(data.summary);
    renderEntries(data.entries);
    renderPreview();
    el("entry-submit").disabled = !rate && !editing;
  } catch (error) {
    if (version !== requestVersion || user !== state.activeUserId) return;
    el("summary").textContent = "合計は未取得です";
    el("error").textContent = "勤務記録を取得できませんでした。";
    const retry = document.createElement("button");
    retry.id = "work-retry";
    retry.type = "button";
    retry.className = "btn btn-secondary btn-sm";
    retry.textContent = "再試行";
    retry.addEventListener("click", fetchWorkSummary);
    el("error").after(retry);
    reportError(error);
  } finally {
    if (version === requestVersion) el("card").removeAttribute("aria-busy");
  }
}
function changeMonth(value) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return;
  el("month").value = value;
  resetEntry();
  fetchWorkSummary();
}
export function initWork() {
  if (initialized || !el("card")) return;
  initialized = true;
  el("month").value = localDate().slice(0, 7);
  resetEntry();
  for (const id of ["hours", "minutes"]) el(id).addEventListener("input", renderPreview);
  el("hourly-rate").addEventListener("input", () => {
    rateDirty = true;
  });
  el("edit-cancel").addEventListener("click", () => {
    resetEntry();
    el("hours").focus();
  });
  el("month").addEventListener("change", () => {
    if (!el("month").value) el("month").value = localDate().slice(0, 7);
    changeMonth(el("month").value);
  });
  el("month-today").addEventListener("click", () => changeMonth(localDate().slice(0, 7)));
  for (const [id, delta] of [
    ["month-prev", -1],
    ["month-next", 1],
  ])
    el(id).addEventListener("click", () => {
      const [year, selectedMonth] = month().split("-").map(Number);
      const date = new Date(year, selectedMonth - 1 + delta, 1);
      if (date.getFullYear() < 1000 || date.getFullYear() > 9999) return;
      changeMonth(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`);
    });
  document.querySelectorAll("[data-work-hours]").forEach((button) => {
    button.addEventListener("click", () => {
      el("hours").value = button.dataset.workHours;
      el("minutes").value = "0";
      renderPreview();
    });
  });
  el("rate-form").addEventListener(
    "submit",
    guardSubmit(async (event) => {
      event.preventDefault();
      const user = state.activeUserId;
      const hourlyRate = Number(el("hourly-rate").value);
      if (!Number.isInteger(hourlyRate) || hourlyRate < 1 || hourlyRate > 10000000) {
        reportError(new Error("時給は1〜10,000,000円の整数で入力してください。"));
        return;
      }
      try {
        await apiRequest("/api/work/rate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ hourlyRate }),
        });
        if (user !== state.activeUserId) return;
        rateDirty = false;
        toast.success("時給を保存しました。");
        await fetchWorkSummary();
      } catch (error) {
        reportError(error);
      }
    }),
  );
  el("entry-form").addEventListener(
    "submit",
    guardSubmit(async (event) => {
      event.preventDefault();
      const hours = hoursInput();
      const minutes = Number(el("minutes").value);
      if (
        !Number.isFinite(hours) ||
        Math.round(hours * 60) < 1 ||
        hours > 24 ||
        !Number.isInteger(minutes) ||
        minutes < 0 ||
        minutes > 59
      ) {
        reportError(new Error("労働時間は1分以上24時間以内、分は0〜59で入力してください。"));
        return;
      }
      const date = el("date").value;
      const description = el("description").value.trim();
      const editId = editing?.id;
      const user = state.activeUserId;
      try {
        await apiRequest(editId ? "/api/work/update" : "/api/work/entries", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...(editId ? { id: editId } : {}), hours, date, description }),
        });
        if (user !== state.activeUserId) return;
        el("month").value = date.slice(0, 7);
        resetEntry();
        toast.success(editId ? "勤務記録を更新しました。" : "勤務記録を追加しました。");
        await fetchWorkSummary();
      } catch (error) {
        reportError(error);
      }
    }),
  );
}
