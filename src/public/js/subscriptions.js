import { fetchExpensesList } from "./expenses.js";
import { confirmModal } from "./modal.js";
import { state } from "./state.js";
import { toast } from "./toast.js";
import { apiRequest, guardSubmit, localDate, reportError } from "./ui.js";

let initialized = false;
let requestVersion = 0;
let loadedUser = "";
let editing = null;
const el = (id) => document.getElementById(`subscription-${id}`);
const yen = (value) => `¥${Number(value || 0).toLocaleString()}`;
const CYCLE_UNITS = { monthly: "月", yearly: "年" };

function resetForm() {
  editing = null;
  el("form").reset();
  el("start-date").value = localDate();
  el("category").value = "その他";
  el("form-title").textContent = "サブスクを追加";
  el("edit-cancel").hidden = true;
  el("submit").textContent = "サブスクを登録";
}
function renderSummary(summary) {
  el("summary").replaceChildren();
  for (const [label, value] of [
    ["登録数", `${summary.count}件`],
    ["月あたり合計", yen(summary.monthlyTotal)],
    ["年あたり合計", yen(summary.yearlyTotal)],
  ]) {
    const item = document.createElement("div");
    const caption = document.createElement("span");
    caption.textContent = label;
    const amount = document.createElement("strong");
    amount.textContent = value;
    item.append(caption, amount);
    el("summary").append(item);
  }
}
function editSubscription(subscription) {
  editing = subscription;
  el("name").value = subscription.name;
  el("amount").value = subscription.amount;
  el("cycle").value = subscription.billingCycle;
  el("category").value = subscription.category || "その他";
  el("start-date").value = subscription.startDate;
  el("description").value = subscription.description || "";
  el("form-title").textContent = `${subscription.name}を編集`;
  el("edit-cancel").hidden = false;
  el("submit").textContent = "変更を保存";
  el("submit").disabled = false;
  el("form").scrollIntoView({
    block: "center",
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
  });
  el("name").focus({ preventScroll: true });
}
function renderSubscriptions(subscriptions) {
  const list = el("list");
  list.replaceChildren();
  if (!subscriptions.length) {
    list.textContent = "登録されているサブスクはありません。";
    return;
  }
  for (const subscription of subscriptions) {
    const row = document.createElement("article");
    row.className = "work-entry-row";
    const text = document.createElement("div");
    text.className = "work-entry-text";
    const heading = document.createElement("strong");
    heading.textContent = subscription.name;
    const value = document.createElement("span");
    value.textContent = [
      `${yen(subscription.amount)} / ${CYCLE_UNITS[subscription.billingCycle] ?? ""}`,
      subscription.category || "その他",
      `次回 ${subscription.nextBillingDate}`,
      ...(subscription.billingCycle === "yearly"
        ? [`月換算 ${yen(subscription.monthlyAmount)}`]
        : []),
      ...(subscription.lastChargedDate ? [`最終記録 ${subscription.lastChargedDate}`] : []),
    ].join(" · ");
    text.append(heading, value);
    if (subscription.description) {
      const note = document.createElement("span");
      note.textContent = subscription.description;
      text.append(note);
    }
    const actions = document.createElement("div");
    actions.className = "work-entry-actions";
    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "btn btn-secondary btn-sm";
    edit.textContent = "編集";
    edit.setAttribute("aria-label", `${subscription.name}を編集`);
    edit.addEventListener("click", () => editSubscription(subscription));
    const del = document.createElement("button");
    del.type = "button";
    del.className = "btn btn-secondary btn-sm";
    del.textContent = "削除";
    del.setAttribute("aria-label", `${subscription.name}を削除`);
    del.addEventListener("click", async () => {
      if (
        !(await confirmModal(
          `${subscription.name}（${yen(subscription.amount)} / ${CYCLE_UNITS[subscription.billingCycle] ?? ""}）を削除しますか？`,
        ))
      )
        return;
      const user = state.activeUserId;
      del.disabled = true;
      edit.disabled = true;
      try {
        await apiRequest("/api/subscriptions/delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: subscription.id }),
        });
        if (user !== state.activeUserId) return;
        if (editing?.id === subscription.id) resetForm();
        toast.success("サブスクを削除しました。");
        await fetchSubscriptions();
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
export async function fetchSubscriptions() {
  if (!el("card") || !state.activeUserId) return;
  const user = state.activeUserId;
  if (loadedUser !== user) {
    resetForm();
    loadedUser = user;
  }
  const version = ++requestVersion;
  el("card").setAttribute("aria-busy", "true");
  el("summary").textContent = "読み込み中…";
  el("list").replaceChildren();
  el("error").textContent = "";
  el("retry")?.remove();
  el("submit").disabled = true;
  try {
    const data = await apiRequest("/api/subscriptions");
    if (version !== requestVersion || user !== state.activeUserId) return;
    renderSummary(data.summary);
    renderSubscriptions(data.subscriptions);
    el("submit").disabled = false;
  } catch (error) {
    if (version !== requestVersion || user !== state.activeUserId) return;
    el("summary").textContent = "合計は未取得です";
    el("error").textContent = "サブスクを取得できませんでした。";
    const retry = document.createElement("button");
    retry.id = "subscription-retry";
    retry.type = "button";
    retry.className = "btn btn-secondary btn-sm";
    retry.textContent = "再試行";
    retry.addEventListener("click", fetchSubscriptions);
    el("error").after(retry);
    el("submit").disabled = !editing;
    reportError(error);
  } finally {
    if (version === requestVersion) el("card").removeAttribute("aria-busy");
  }
}
export function initSubscriptions() {
  if (initialized || !el("card")) return;
  initialized = true;
  resetForm();
  el("edit-cancel").addEventListener("click", () => {
    resetForm();
    el("name").focus();
  });
  el("form").addEventListener(
    "submit",
    guardSubmit(async (event) => {
      event.preventDefault();
      const name = el("name").value.trim();
      const amount = Number(el("amount").value);
      if (!name) {
        reportError(new Error("サービス名を入力してください。"));
        return;
      }
      if (!Number.isInteger(amount) || amount < 1 || amount > 10000000) {
        reportError(new Error("金額は1〜10,000,000円の整数で入力してください。"));
        return;
      }
      const editId = editing?.id;
      const user = state.activeUserId;
      try {
        await apiRequest(editId ? "/api/subscriptions/update" : "/api/subscriptions/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(editId ? { id: editId } : {}),
            name,
            amount,
            billingCycle: el("cycle").value,
            category: el("category").value,
            startDate: el("start-date").value,
            description: el("description").value.trim(),
          }),
        });
        if (user !== state.activeUserId) return;
        resetForm();
        toast.success(editId ? "サブスクを更新しました。" : "サブスクを登録しました。");
        fetchExpensesList();
        await fetchSubscriptions();
      } catch (error) {
        reportError(error);
      }
    }),
  );
}
