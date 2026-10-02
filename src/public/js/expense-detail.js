import { openEditExpenseModal } from "./expenses.js";
import { closeExternalModal, openExternalModal } from "./modal.js";
import { state } from "./state.js";
import { apiRequest } from "./ui.js";

let currentExpenses = [];
const sortState = { key: "date", dir: "desc" };
let fetchTimer = null;
let activeRequest = null;
let requestVersion = 0;

function debouncedFetch() {
  clearTimeout(fetchTimer);
  activeRequest?.abort();
  requestVersion += 1;
  fetchTimer = setTimeout(fetchDetailExpenses, 400);
}

export function initExpenseDetail() {
  const modal = document.getElementById("expense-detail-modal");
  const btnOpen = document.getElementById("btn-expense-detail");
  const btnClose = document.getElementById("btn-expense-detail-close");
  const _panel = modal?.querySelector(".modal-panel");

  const openModal = () => {
    modal.classList.remove("hidden");
    openExternalModal(modal, performClose);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => modal.classList.add("modal-visible"));
    });
  };

  const performClose = () => {
    clearTimeout(fetchTimer);
    activeRequest?.abort();
    requestVersion += 1;
    modal.classList.remove("modal-visible");
    closeExternalModal(modal);
    setTimeout(() => {
      if (!modal.classList.contains("modal-visible")) modal.classList.add("hidden");
    }, 250);
  };

  btnOpen?.addEventListener("click", () => {
    openModal();
    setCurrentMonthRangeIfEmpty();
    fetchDetailExpenses();
  });

  btnClose?.addEventListener("click", performClose);

  modal?.addEventListener("click", (e) => {
    if (e.target === modal) performClose();
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
  ].forEach((id) => {
    document.getElementById(id)?.addEventListener("input", debouncedFetch);
  });
  ["filter-category", "filter-source"].forEach((id) => {
    document.getElementById(id)?.addEventListener("change", fetchDetailExpenses);
  });

  document.getElementById("expense-detail-sort")?.addEventListener("change", (event) => {
    const [key, dir] = event.target.value.split(":");
    sortState.key = key;
    sortState.dir = dir;
    updateSortIndicators();
    renderTable();
  });
  document.addEventListener("expenses-updated", () => {
    if (!modal.classList.contains("hidden") && !modal.inert) fetchDetailExpenses();
  });
  document.querySelectorAll("#expense-detail-modal .sortable-th").forEach((th) => {
    th.tabIndex = 0;
    th.setAttribute("aria-sort", th.dataset.sort === sortState.key ? "descending" : "none");
    th.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        th.click();
      }
    });
    th.addEventListener("click", () => {
      const key = th.dataset.sort;
      if (key === sortState.key) {
        sortState.dir = sortState.dir === "asc" ? "desc" : "asc";
      } else {
        sortState.key = key;
        sortState.dir = key === "date" || key === "amount" ? "desc" : "asc";
      }

      updateSortIndicators();

      renderTable();
    });
  });
}

function updateSortIndicators() {
  document.querySelectorAll("#expense-detail-modal .sortable-th").forEach((header) => {
    const active = header.dataset.sort === sortState.key;
    header.classList.toggle("sort-asc", active && sortState.dir === "asc");
    header.classList.toggle("sort-desc", active && sortState.dir === "desc");
    header.setAttribute(
      "aria-sort",
      active ? (sortState.dir === "asc" ? "ascending" : "descending") : "none",
    );
    header.querySelector(".sort-icon").textContent = active
      ? sortState.dir === "asc"
        ? "▲"
        : "▼"
      : "";
  });
  const select = document.getElementById("expense-detail-sort");
  if (select) select.value = `${sortState.key}:${sortState.dir}`;
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

  clearTimeout(fetchTimer);
  activeRequest?.abort();
  const version = ++requestVersion;
  activeRequest = new AbortController();
  currentExpenses = [];
  document.getElementById("detail-expenses-table-body").removeAttribute("aria-busy");
  if (
    (dateFrom && dateTo && dateFrom > dateTo) ||
    (amountMin !== "" && amountMax !== "" && Number(amountMin) > Number(amountMax)) ||
    [amountMin, amountMax].some(
      (value) => value !== "" && (!Number.isFinite(Number(value)) || Number(value) < 0),
    )
  ) {
    currentExpenses = [];
    countEl.textContent = "検索条件を確認してください";
    showTableState("期間・金額は下限が上限以下になるように指定してください。金額は0以上です。");
    return;
  }
  const tbody = document.getElementById("detail-expenses-table-body");
  tbody.setAttribute("aria-busy", "true");
  countEl.textContent = "読込中…";
  showTableState("支出履歴を読み込んでいます…");
  try {
    const data = await apiRequest(`/api/expenses/all?${params}`, { signal: activeRequest.signal });
    if (version !== requestVersion) return;
    currentExpenses = data.expenses;
    renderTable();
    const total = currentExpenses.reduce((sum, expense) => sum + Number(expense.amount), 0);
    countEl.textContent = `${currentExpenses.length} 件・合計 ¥${total.toLocaleString()}`;
  } catch (error) {
    if (version !== requestVersion || error.name === "AbortError") return;
    currentExpenses = [];
    countEl.textContent = "読み込みに失敗しました";
    showTableState("支出履歴を読み込めませんでした。", fetchDetailExpenses);
  } finally {
    if (version === requestVersion) tbody.removeAttribute("aria-busy");
  }
}

function showTableState(message, retry) {
  const tbody = document.getElementById("detail-expenses-table-body");
  const row = document.createElement("tr");
  const cell = document.createElement("td");
  cell.colSpan = 7;
  cell.textContent = message;
  if (retry) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn btn-secondary btn-sm";
    button.textContent = "再試行";
    button.addEventListener("click", retry);
    cell.append(" ", button);
  }
  row.append(cell);
  tbody.replaceChildren(row);
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
  if (!sorted.length) {
    showTableState("条件に一致する支出がありません。期間や検索語を変えてお試しください。");
    return;
  }
  sorted.forEach((exp, i) => {
    const tr = makeDetailRow(exp);
    tr.style.opacity = "0";
    tr.style.transform = "translateY(6px)";
    tr.style.transition = window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "none"
      : `opacity 0.18s ease ${Math.min(i, 10) * 18}ms, transform 0.18s ease ${Math.min(i, 10) * 18}ms`;
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
  tr.tabIndex = 0;
  tr.setAttribute(
    "aria-label",
    `${exp.date} ${exp.category} ${exp.amount.toLocaleString()}円を編集`,
  );
  tr.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openEditExpenseModal(exp);
    }
  });
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
