import { openEditExpenseModal } from "./expenses.js";
import { state } from "./state.js";

let currentExpenses = [];
const sortState = { key: "date", dir: "desc" };
let fetchTimer = null;

function debouncedFetch() {
  clearTimeout(fetchTimer);
  fetchTimer = setTimeout(fetchDetailExpenses, 400);
}

export function initExpenseDetail() {
  const modal = document.getElementById("expense-detail-modal");
  const btnOpen = document.getElementById("btn-expense-detail");
  const btnClose = document.getElementById("btn-expense-detail-close");
  const _panel = modal?.querySelector(".modal-panel");

  const openModal = () => {
    modal.classList.remove("hidden");
    requestAnimationFrame(() => {
      requestAnimationFrame(() => modal.classList.add("modal-visible"));
    });
  };

  const closeModal = () => {
    modal.classList.remove("modal-visible");
    modal.addEventListener("transitionend", () => modal.classList.add("hidden"), { once: true });
  };

  btnOpen?.addEventListener("click", () => {
    openModal();
    setCurrentMonthRangeIfEmpty();
    fetchDetailExpenses();
  });

  btnClose?.addEventListener("click", closeModal);

  modal?.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modal?.classList.contains("hidden")) closeModal();
  });

  document.getElementById("btn-filter-apply")?.addEventListener("click", fetchDetailExpenses);

  document.getElementById("btn-filter-reset")?.addEventListener("click", () => {
    resetFilters();
    fetchDetailExpenses();
  });

  // フィルター値変化で自動発火
  [
    "filter-date-from",
    "filter-date-to",
    "filter-amount-min",
    "filter-amount-max",
    "filter-q",
    "filter-purchase-source",
  ].forEach((id) => {
    document.getElementById(id)?.addEventListener("input", debouncedFetch);
  });
  ["filter-category", "filter-source"].forEach((id) => {
    document.getElementById(id)?.addEventListener("change", fetchDetailExpenses);
  });

  document.querySelectorAll("#expense-detail-modal .sortable-th").forEach((th) => {
    th.addEventListener("click", () => {
      const key = th.dataset.sort;
      if (key === sortState.key) {
        sortState.dir = sortState.dir === "asc" ? "desc" : "asc";
      } else {
        sortState.key = key;
        sortState.dir = key === "date" || key === "amount" ? "desc" : "asc";
      }

      document.querySelectorAll("#expense-detail-modal .sortable-th").forEach((el) => {
        el.classList.remove("sort-asc", "sort-desc");
        const icon = el.querySelector(".sort-icon");
        if (icon) icon.textContent = "";
      });

      th.classList.add(`sort-${sortState.dir}`);
      const icon = th.querySelector(".sort-icon");
      if (icon) icon.textContent = sortState.dir === "asc" ? "▲" : "▼";

      renderTable();
    });
  });
}

async function fetchDetailExpenses() {
  const countEl = document.getElementById("filter-result-count");
  const params = new URLSearchParams({ userId: state.activeUserId });

  const get = (id) => document.getElementById(id)?.value ?? "";
  const dateFrom = get("filter-date-from");
  const dateTo = get("filter-date-to");
  const category = get("filter-category");
  const source = get("filter-source");
  const amountMin = get("filter-amount-min");
  const amountMax = get("filter-amount-max");
  const q = get("filter-q").trim();

  if (dateFrom) params.set("dateFrom", dateFrom);
  if (dateTo) params.set("dateTo", dateTo);
  if (category) params.set("category", category);
  if (source) params.set("source", source);
  if (amountMin) params.set("amountMin", amountMin);
  if (amountMax) params.set("amountMax", amountMax);
  if (q) params.set("q", q);

  const tbody = document.getElementById("detail-expenses-table-body");
  tbody.replaceChildren();
  countEl.textContent = "読込中…";

  try {
    const res = await fetch(`/api/expenses/all?${params}`);
    const data = await res.json();
    if (data.success) {
      currentExpenses = data.expenses;
      renderTable();
      countEl.textContent = `${data.expenses.length} 件`;
    }
  } catch (e) {
    console.error(e);
    countEl.textContent = "取得失敗";
  }
}

function renderTable() {
  const tbody = document.getElementById("detail-expenses-table-body");
  const { key, dir } = sortState;

  const sorted = [...currentExpenses].sort((a, b) => {
    let cmp;
    if (key === "amount") {
      cmp = a[key] - b[key];
    } else if (key === "date" || key === "created_at") {
      cmp = a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0;
    } else {
      cmp = (a[key] ?? "").localeCompare(b[key] ?? "");
    }
    return dir === "asc" ? cmp : -cmp;
  });

  tbody.replaceChildren();
  sorted.forEach((exp, i) => {
    const tr = makeDetailRow(exp);
    tr.style.opacity = "0";
    tr.style.transform = "translateY(6px)";
    tr.style.transition = `opacity 0.18s ease ${i * 18}ms, transform 0.18s ease ${i * 18}ms`;
    tbody.appendChild(tr);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        tr.style.opacity = "1";
        tr.style.transform = "translateY(0)";
      }),
    );
  });
}

function makeDetailRow(exp) {
  const tr = document.createElement("tr");

  const tdDate = document.createElement("td");
  tdDate.textContent = exp.date;

  const tdCategory = document.createElement("td");
  tdCategory.textContent = exp.category;

  const tdDescription = document.createElement("td");
  tdDescription.textContent = exp.description || "—";

  const tdPurchase = document.createElement("td");
  tdPurchase.textContent = exp.purchase_source || "不明";

  const tdSource = document.createElement("td");
  const badge = document.createElement("span");
  badge.className = `expense-source-badge source-${exp.source}`;
  const badgeIcon = document.createElement("span");
  badgeIcon.className = "material-symbols-outlined source-icon";
  let srcText = "";
  if (exp.source === "web") {
    badgeIcon.textContent = "language";
    srcText = " Web";
  } else if (exp.source === "manual") {
    badgeIcon.textContent = "edit";
    srcText = " 手動";
  } else {
    badgeIcon.textContent = "chat";
    srcText = " Discord";
  }
  badge.append(badgeIcon, document.createTextNode(srcText));
  tdSource.appendChild(badge);

  const tdAmount = document.createElement("td");
  tdAmount.className = "expense-amount-val";
  tdAmount.textContent = `¥${exp.amount.toLocaleString()}`;

  const tdCreated = document.createElement("td");
  tdCreated.style.color = "var(--text-secondary)";
  tdCreated.style.fontSize = "0.72rem";
  tdCreated.textContent = exp.created_at || "—";

  tr.style.cursor = "pointer";
  tr.addEventListener("click", () => openEditExpenseModal(exp));
  tr.append(tdDate, tdCategory, tdDescription, tdPurchase, tdSource, tdAmount, tdCreated);
  return tr;
}

function resetFilters() {
  [
    "filter-date-from",
    "filter-date-to",
    "filter-category",
    "filter-source",
    "filter-amount-min",
    "filter-amount-max",
    "filter-q",
  ].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  setCurrentMonthRange();
}

function setCurrentMonthRangeIfEmpty() {
  const from = document.getElementById("filter-date-from");
  const to = document.getElementById("filter-date-to");
  if (!from?.value && !to?.value) setCurrentMonthRange();
}

function setCurrentMonthRange() {
  const from = document.getElementById("filter-date-from");
  const to = document.getElementById("filter-date-to");
  if (!from || !to) return;

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  from.value = formatDate(new Date(year, month, 1));
  to.value = formatDate(new Date(year, month + 1, 0));
}

function formatDate(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
