import { confirmModal } from "./modal.js";
import { state } from "./state.js";
import { toast } from "./toast.js";
import { apiRequest, guardSubmit, reportError } from "./ui.js";

let rate = null;
let initialized = false;
let requestVersion = 0;
let rateDirty = false;
let loadedUser = "";

const yen = (value) => `¥${Number(value || 0).toLocaleString()}`;
const localDate = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function setBusy(busy) {
  const card = document.getElementById("work-card");
  if (busy) card?.setAttribute("aria-busy", "true");
  else card?.removeAttribute("aria-busy");
}

function renderSummary(summary) {
  const el = document.getElementById("work-summary");
  if (!el) return;
  el.replaceChildren();
  const hours = Math.floor(summary.minutes / 60);
  const minutes = summary.minutes % 60;
  for (const [label, value] of [
    ["今月の労働時間", `${hours}時間${minutes ? `${minutes}分` : ""}`],
    ["今月の働いた分", yen(summary.amount)],
  ]) {
    const item = document.createElement("div");
    const caption = document.createElement("span");
    caption.textContent = label;
    const amount = document.createElement("strong");
    amount.textContent = value;
    item.append(caption, amount);
    el.append(item);
  }
}

function renderPreview() {
  const el = document.getElementById("work-preview");
  const hours = Number(document.getElementById("work-hours")?.value);
  if (!el) return;
  const minutes = Number.isFinite(hours) && hours > 0 ? Math.round(hours * 60) : 0;
  el.textContent =
    rate && minutes > 0 && hours <= 24
      ? `見込み: ${yen(Math.round((minutes * rate) / 60))}（控除前）`
      : "時給と時間を入力すると見込み額を表示します";
}

function renderEntries(entries) {
  const list = document.getElementById("work-entry-list");
  if (!list) return;
  list.replaceChildren();
  if (!entries.length) {
    list.textContent = rate ? "今月の記録はありません。" : "先に時給を設定してください。";
    return;
  }
  for (const entry of entries) {
    const row = document.createElement("article");
    row.className = "work-entry-row";
    const text = document.createElement("div");
    text.className = "work-entry-text";
    text.textContent = `${entry.date} · ${Math.floor(entry.minutes / 60)}時間${entry.minutes % 60}分 · ${yen(entry.amount)}${entry.description ? ` · ${entry.description}` : ""}`;
    const del = document.createElement("button");
    del.type = "button";
    del.className = "btn btn-secondary btn-sm";
    del.textContent = "削除";
    del.addEventListener("click", async () => {
      if (!(await confirmModal("この勤務記録を削除しますか？"))) return;
      del.disabled = true;
      try {
        await apiRequest("/api/work/delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: entry.id }),
        });
        await fetchWorkSummary();
      } catch (error) {
        del.disabled = false;
        reportError(error);
      }
    });
    row.append(text, del);
    list.appendChild(row);
  }
}

export async function fetchWorkSummary() {
  const card = document.getElementById("work-card");
  if (!card) return;
  const user = state.activeUserId;
  if (!user) return;
  if (loadedUser !== user) {
    rateDirty = false;
    document.getElementById("work-rate-form").reset();
    document.getElementById("work-entry-form").reset();
    document.getElementById("work-date").value = localDate();
    loadedUser = user;
  }
  setBusy(true);
  document.getElementById("work-summary").textContent = "読み込み中…";
  document.getElementById("work-entry-list").replaceChildren();
  document.getElementById("work-rate-hint").textContent = "";
  const version = ++requestVersion;
  rate = null;
  document.getElementById("work-error").textContent = "";
  document.getElementById("work-retry")?.remove();
  document.getElementById("work-entry-submit").disabled = true;
  try {
    const data = await apiRequest(`/api/work?userId=${encodeURIComponent(state.activeUserId)}`);
    if (version !== requestVersion || user !== state.activeUserId) return;
    rate = data.hourlyRate;
    const rateInput = document.getElementById("work-hourly-rate");
    if (rateInput && !rateDirty) rateInput.value = rate ?? "";
    document.getElementById("work-rate-hint").textContent = rate
      ? `現在の時給: ${yen(rate)}（過去の記録は変更されません）`
      : "時給を設定すると記録できます";
    renderSummary(data.summary);
    renderEntries(data.entries);
    renderPreview();
    document.getElementById("work-entry-submit").disabled = !rate;
  } catch (error) {
    if (version !== requestVersion || user !== state.activeUserId) return;
    const errorEl = document.getElementById("work-error");
    if (errorEl) errorEl.textContent = "取得できませんでした。再試行してください。";
    const retry = document.createElement("button");
    retry.id = "work-retry";
    retry.type = "button";
    retry.className = "btn btn-secondary btn-sm";
    retry.textContent = "再試行";
    retry.addEventListener("click", fetchWorkSummary, { once: true });
    errorEl?.after(retry);
    reportError(error);
  } finally {
    if (version === requestVersion) setBusy(false);
  }
}

export function initWork() {
  if (initialized || !document.getElementById("work-card")) return;
  initialized = true;
  const date = document.getElementById("work-date");
  if (date) date.value = localDate();
  document.getElementById("work-hours")?.addEventListener("input", renderPreview);
  document.getElementById("work-hourly-rate")?.addEventListener("input", () => {
    rateDirty = true;
  });
  document.getElementById("work-rate-form")?.addEventListener(
    "submit",
    guardSubmit(async (event) => {
      event.preventDefault();
      const hourlyRate = Number(document.getElementById("work-hourly-rate").value);
      if (!Number.isInteger(hourlyRate) || hourlyRate <= 0) {
        reportError(new Error("時給は1円以上の整数で入力してください。"));
        return;
      }
      try {
        await apiRequest("/api/work/rate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ hourlyRate }),
        });
        rateDirty = false;
        toast.success("時給を保存しました。");
        await fetchWorkSummary();
      } catch (error) {
        reportError(error);
      }
    }),
  );
  document.getElementById("work-entry-form")?.addEventListener(
    "submit",
    guardSubmit(async (event) => {
      const form = event.currentTarget;
      event.preventDefault();
      const hours = Number(document.getElementById("work-hours").value);
      const description = document.getElementById("work-description").value.trim();
      if (!Number.isFinite(hours) || hours <= 0 || hours > 24) {
        reportError(new Error("労働時間は0より大きく24時間以内で入力してください。"));
        return;
      }
      if (description.length > 500) {
        reportError(new Error("説明は500文字以内で入力してください。"));
        return;
      }
      try {
        await apiRequest("/api/work/entries", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            hours,
            date: date.value || undefined,
            description: description || undefined,
          }),
        });
        form.reset();
        date.value = localDate();
        toast.success("勤務記録を追加しました。");
        await fetchWorkSummary();
      } catch (error) {
        reportError(error);
      }
    }),
  );
}
