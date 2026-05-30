import { state } from "./state.js";
import { openModal, getModal, closeModal } from "./modal.js";

export async function fetchExpensesList() {
  const tbody = document.getElementById("expenses-table-body");
  tbody.replaceChildren();
  try {
    const res = await fetch(`/api/expenses?userId=${state.activeUserId}`);
    const data = await res.json();
    if (!data.success) return;

    document.getElementById("expense-month-total").textContent = `¥${data.total.toLocaleString()}`;
    renderBudgetBar(data.total, data.budget ?? 50000, data.remaining ?? data.budget - data.total);
    renderExpenseStats(data.stats || {});
    renderDailyExpenseTotals(data.dailyTotals || []);

    if (data.expenses?.length > 0) {
      data.expenses.forEach((exp) => {
        tbody.appendChild(makeExpenseRow(exp));
      });
    } else {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 5;
      td.textContent = "まだ支出記録がありません。上のスキャナーか手動登録をご利用ください。";
      tr.appendChild(td);
      tbody.appendChild(tr);
    }
  } catch (e) {
    console.error(e);
  }
}

function renderExpenseStats(stats) {
  const countEl = document.getElementById("stat-expense-count");
  const avgEl = document.getElementById("stat-expense-avg-daily");
  const avgSubEl = document.getElementById("stat-expense-avg-daily-sub");
  const maxAmtEl = document.getElementById("stat-expense-max-day-amount");
  const maxDateEl = document.getElementById("stat-expense-max-day-date");
  const rankEl = document.getElementById("stat-expense-top-categories");

  if (countEl) countEl.textContent = `${(stats.count ?? 0).toLocaleString()}件`;

  if (avgEl) avgEl.textContent = `¥${(stats.avgDaily ?? 0).toLocaleString()}`;
  if (avgSubEl) {
    const d = new Date().getDate();
    avgSubEl.textContent = `${d}日経過`;
  }

  if (maxAmtEl)
    maxAmtEl.textContent = stats.maxDay ? `¥${stats.maxDay.total.toLocaleString()}` : "¥0";
  if (maxDateEl) {
    if (stats.maxDay) {
      const [, m, d] = stats.maxDay.date.split("-");
      maxDateEl.textContent = `${Number(m)}/${Number(d)}`;
    } else {
      maxDateEl.textContent = "—";
    }
  }

  if (rankEl) {
    rankEl.replaceChildren();
    (stats.topCategories ?? []).forEach((cat, i) => {
      const li = document.createElement("li");
      li.className = "stat-ranking-item";
      li.innerHTML = `<span class="stat-rank-num">${i + 1}</span><span class="stat-rank-cat">${cat.category}</span><span class="stat-rank-amt">¥${cat.total.toLocaleString()}</span>`;
      rankEl.appendChild(li);
    });
    if ((stats.topCategories ?? []).length === 0) {
      const li = document.createElement("li");
      li.textContent = "記録なし";
      li.style.color = "var(--text-secondary)";
      li.style.fontSize = "0.8rem";
      rankEl.appendChild(li);
    }
  }
}

function renderDailyExpenseTotals(dailyTotals) {
  const list = document.getElementById("expense-daily-list");
  if (!list) return;
  list.replaceChildren();

  const reversed = [...dailyTotals].reverse();
  const maxTotal = Math.max(...reversed.map((row) => Number(row.total || 0)), 1);
  reversed.forEach((row, idx) => {
    const item = document.createElement("div");
    item.className = "expense-daily-item";

    const label = document.createElement("span");
    label.className = "expense-daily-date";
    label.textContent = formatDailyLabel(
      row.date,
      reversed.length - 1 - idx,
      dailyTotals.length - 1,
    );

    const barTrack = document.createElement("div");
    barTrack.className = "expense-daily-track";
    const bar = document.createElement("div");
    bar.className = "expense-daily-bar";
    bar.style.width = `${Math.max((Number(row.total || 0) / maxTotal) * 100, row.total > 0 ? 4 : 0)}%`;
    barTrack.appendChild(bar);

    const amount = document.createElement("strong");
    amount.className = "expense-daily-amount";
    amount.textContent = `¥${Number(row.total || 0).toLocaleString()}`;

    item.append(label, barTrack, amount);
    list.appendChild(item);
  });
}

function formatDailyLabel(dateString, idx, lastIdx) {
  if (idx === lastIdx) return "今日";
  if (idx === lastIdx - 1) return "昨日";
  const [, month, day] = dateString.split("-");
  return `${Number(month)}/${Number(day)}`;
}

function renderBudgetBar(total, budget, remaining) {
  const pct = budget > 0 ? Math.min((total / budget) * 100, 100) : 0;
  const bar = document.getElementById("expense-budget-bar");
  const pctEl = document.getElementById("expense-budget-percent");
  const statusEl = document.getElementById("expense-budget-status");
  const limitEl = document.getElementById("expense-budget-limit");
  const remainingEl = document.getElementById("expense-budget-remaining");

  if (limitEl) limitEl.textContent = `¥${budget.toLocaleString()}`;
  if (remainingEl) {
    const rem = remaining ?? budget - total;
    remainingEl.textContent =
      rem >= 0 ? `残り ¥${rem.toLocaleString()}` : `超過 ¥${(-rem).toLocaleString()}`;
    remainingEl.style.color =
      rem < 0 ? "var(--color-red)" : rem < budget * 0.3 ? "#f59e0b" : "var(--text-success)";
  }

  bar.style.width = `${pct}%`;
  pctEl.textContent = `${Math.round(pct)}%`;
  statusEl.replaceChildren();

  const iconEl = document.createElement("span");
  iconEl.className = "material-symbols-outlined icon-small";
  iconEl.style.cssText = "vertical-align:middle;margin-right:6px;";
  const textEl = document.createElement("span");

  if (pct >= 100) {
    iconEl.textContent = "warning";
    textEl.textContent = " 先生！完全に予算上限を突破しています！";
    statusEl.style.color = "var(--text-error)";
  } else if (pct > 70) {
    iconEl.textContent = "lightbulb";
    textEl.textContent = " ちょっと今月は出費のペースが早い気がします。";
    statusEl.style.color = "#f59e0b";
  } else {
    iconEl.textContent = "check_circle";
    textEl.textContent = " 健全な支出状況をキープしています！素晴らしい！";
    statusEl.style.color = "var(--text-success)";
  }
  statusEl.append(iconEl, textEl);
}

export function initBudgetEdit() {
  const editBtn = document.getElementById("btn-budget-edit");
  const form = document.getElementById("budget-edit-form");
  const saveBtn = document.getElementById("btn-budget-save");
  const cancelBtn = document.getElementById("btn-budget-cancel");
  const input = document.getElementById("budget-input");

  editBtn?.addEventListener("click", () => {
    const current =
      document.getElementById("expense-budget-limit")?.textContent?.replace(/[¥,]/g, "") || "50000";
    input.value = current;
    form.style.display = "flex";
    editBtn.style.display = "none";
    input.focus();
  });

  cancelBtn?.addEventListener("click", () => {
    form.style.display = "none";
    editBtn.style.display = "";
  });

  saveBtn?.addEventListener("click", async () => {
    const budget = Number(input.value);
    if (!budget || budget < 0) return;
    try {
      const res = await fetch("/api/expenses/budget", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: state.activeUserId, budget }),
      });
      const data = await res.json();
      if (data.success) {
        form.style.display = "none";
        editBtn.style.display = "";
        fetchExpensesList();
      }
    } catch (e) {
      console.error(e);
    }
  });
}

export function makeExpenseRow(exp) {
  const tr = document.createElement("tr");

  const tdDate = document.createElement("td");
  tdDate.textContent = exp.date;

  const tdCat = document.createElement("td");
  tdCat.textContent = exp.category;

  const tdDesc = document.createElement("td");
  tdDesc.textContent = exp.description || "なし";

  const tdAmt = document.createElement("td");
  tdAmt.className = "expense-amount-val";
  tdAmt.textContent = `¥${exp.amount.toLocaleString()}`;

  tr.style.cursor = "pointer";
  tr.addEventListener("click", () => openEditExpenseModal(exp));
  tr.append(tdDate, tdCat, tdDesc, tdAmt);
  return tr;
}

function openEditExpenseModal(exp) {
  document.getElementById("exp-edit-id").value = exp.id;
  document.getElementById("exp-edit-amount").value = exp.amount;
  document.getElementById("exp-edit-date").value = exp.date;
  document.getElementById("exp-edit-category").value = exp.category;
  document.getElementById("exp-edit-description").value = exp.description || "";
  document.getElementById("exp-edit-purchase-source").value = exp.purchase_source || "";
  openModal(getModal("expense-edit"));
}

export async function handleDeleteExpense(id) {
  if (!confirm("この支出記録を削除しますか？")) return;
  try {
    await fetch("/api/expenses/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, userId: state.activeUserId }),
    });
    fetchExpensesList();
  } catch (e) {
    console.error(e);
  }
}

async function handleEditExpenseSubmit(e) {
  e.preventDefault();
  const id = parseInt(document.getElementById("exp-edit-id").value, 10);
  const amount = parseInt(document.getElementById("exp-edit-amount").value, 10);
  const date = document.getElementById("exp-edit-date").value;
  const category = document.getElementById("exp-edit-category").value;
  const description = document.getElementById("exp-edit-description").value.trim();
  const purchase_source = document.getElementById("exp-edit-purchase-source").value.trim();
  try {
    const res = await fetch("/api/expenses/update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id,
        userId: state.activeUserId,
        amount,
        date,
        category,
        description,
        purchase_source,
      }),
    });
    const data = await res.json();
    if (data.success) {
      closeModal(getModal("expense-edit"));
      fetchExpensesList();
    }
  } catch (err) {
    console.error(err);
  }
}

export function initExpenses() {
  const expDateInput = document.getElementById("exp-date");
  if (expDateInput) expDateInput.value = new Date().toISOString().slice(0, 10);

  document.getElementById("expense-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const amount = parseInt(document.getElementById("exp-amount").value, 10);
    const category = document.getElementById("exp-category").value;
    const desc = document.getElementById("exp-description").value.trim();
    const date = document.getElementById("exp-date").value;
    const purchaseSrc = document.getElementById("exp-purchase-source")?.value.trim() || "不明";
    try {
      const res = await fetch("/api/expenses/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: state.activeUserId,
          amount,
          category,
          description: desc,
          date,
          purchase_source: purchaseSrc,
        }),
      });
      const data = await res.json();
      if (data.success) {
        document.getElementById("expense-form").reset();
        document.getElementById("exp-date").value = new Date().toISOString().slice(0, 10);
        fetchExpensesList();
      }
    } catch (e) {
      console.error(e);
    }
  });

  document.getElementById("expense-edit-form")?.addEventListener("submit", handleEditExpenseSubmit);

  document.getElementById("btn-expense-delete")?.addEventListener("click", () => {
    const id = parseInt(document.getElementById("exp-edit-id")?.value, 10);
    if (id) handleDeleteExpense(id);
  });

  initReceiptDropzone();
}

function initReceiptDropzone() {
  const dropzone = document.getElementById("receipt-dropzone");
  const fileInput = document.getElementById("receipt-file-input");
  if (!dropzone) return;

  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.classList.add("dragover");
  });
  dropzone.addEventListener("dragleave", () => dropzone.classList.remove("dragover"));
  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("dragover");
    if (e.dataTransfer.files.length > 0) processReceiptFile(e.dataTransfer.files[0]);
  });
  dropzone.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", (e) => {
    if (e.target.files.length > 0) processReceiptFile(e.target.files[0]);
  });
}

function processReceiptFile(file) {
  if (!file.type.startsWith("image/")) {
    alert("エラー: 画像ファイル(PNG, JPEG等)のみ対応しています。");
    return;
  }
  const scanStatus = document.getElementById("scan-status");
  const scanStatusTxt = document.getElementById("scan-status-text");
  const reader = new FileReader();

  reader.onload = async (e) => {
    const base64Data = e.target.result.split(",")[1];
    scanStatus.classList.remove("hidden");
    scanStatusTxt.textContent = "レシート画像をユウカが確認中... (Gemini API解析を起動しています)";
    try {
      const res = await fetch("/api/expenses/upload-receipt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: state.activeUserId,
          imageBase64: base64Data,
          mimeType: file.type,
          additionalText: "WEB管理画面からアップロードされたレシートの解析結果です。",
        }),
      });
      const data = await res.json();
      if (data.success) {
        scanStatus.classList.add("hidden");
        document.getElementById("receipt-ai-response").textContent = data.response;
        openModal(getModal("receiptResult"));
        fetchExpensesList();
      } else {
        throw new Error(data.message);
      }
    } catch (err) {
      scanStatus.classList.add("hidden");
      alert(`解析エラーが発生しました:\n${err.message}`);
    }
  };
  reader.readAsDataURL(file);
}
