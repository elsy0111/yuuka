import { state } from "./state.js";
import { makeExpenseRow } from "./expenses.js";

export function initExpenseDetail() {
  const modal     = document.getElementById("expense-detail-modal");
  const btnOpen   = document.getElementById("btn-expense-detail");
  const btnClose  = document.getElementById("btn-expense-detail-close");

  btnOpen?.addEventListener("click", () => {
    modal.classList.remove("hidden");
    fetchDetailExpenses();
  });

  btnClose?.addEventListener("click", () => modal.classList.add("hidden"));

  modal?.addEventListener("click", e => {
    if (e.target === modal) modal.classList.add("hidden");
  });

  document.getElementById("btn-filter-apply")?.addEventListener("click", fetchDetailExpenses);

  document.getElementById("btn-filter-reset")?.addEventListener("click", () => {
    resetFilters();
    fetchDetailExpenses();
  });
}

async function fetchDetailExpenses() {
  const tbody       = document.getElementById("detail-expenses-table-body");
  const countEl     = document.getElementById("filter-result-count");
  const params      = new URLSearchParams({ userId: state.activeUserId });

  const get = id => document.getElementById(id)?.value ?? "";
  const dateFrom  = get("filter-date-from");
  const dateTo    = get("filter-date-to");
  const category  = get("filter-category");
  const source    = get("filter-source");
  const amountMin = get("filter-amount-min");
  const amountMax = get("filter-amount-max");
  const q         = get("filter-q").trim();

  if (dateFrom)  params.set("dateFrom",  dateFrom);
  if (dateTo)    params.set("dateTo",    dateTo);
  if (category)  params.set("category",  category);
  if (source)    params.set("source",    source);
  if (amountMin) params.set("amountMin", amountMin);
  if (amountMax) params.set("amountMax", amountMax);
  if (q)         params.set("q",         q);

  tbody.replaceChildren();
  countEl.textContent = "読込中…";

  try {
    const res  = await fetch(`/api/expenses/all?${params}`);
    const data = await res.json();
    if (data.success) {
      data.expenses.forEach(exp => tbody.appendChild(makeDetailRow(exp)));
      countEl.textContent = `${data.expenses.length} 件`;
    }
  } catch (e) {
    console.error(e);
    countEl.textContent = "取得失敗";
  }
}

function makeDetailRow(exp) {
  const tr = makeExpenseRow(exp);

  const tdId = document.createElement("td");
  tdId.style.color = "var(--color-zinc-muted)";
  tdId.style.fontFamily = "var(--font-family-mono)";
  tdId.textContent = exp.id;
  tr.insertBefore(tdId, tr.firstChild);

  const tdCreated = document.createElement("td");
  tdCreated.style.color    = "var(--color-zinc-muted)";
  tdCreated.style.fontSize = "0.7rem";
  tdCreated.textContent    = exp.created_at || "—";
  tr.appendChild(tdCreated);

  return tr;
}

function resetFilters() {
  ["filter-date-from", "filter-date-to", "filter-category",
   "filter-source", "filter-amount-min", "filter-amount-max", "filter-q"]
    .forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = "";
    });
}
