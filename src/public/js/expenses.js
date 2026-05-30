import { state } from "./state.js";
import { openModal, getModal } from "./modal.js";

export async function fetchExpensesList() {
  const tbody = document.getElementById("expenses-table-body");
  tbody.replaceChildren();
  try {
    const res  = await fetch(`/api/expenses?userId=${state.activeUserId}`);
    const data = await res.json();
    if (!data.success) return;

    document.getElementById("expense-month-total").textContent = `¥${data.total.toLocaleString()}`;
    renderBudgetBar(data.total);

    if (data.expenses?.length > 0) {
      data.expenses.forEach(exp => tbody.appendChild(makeExpenseRow(exp)));
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

function renderBudgetBar(total) {
  const TARGET   = 50000;
  const pct      = Math.min((total / TARGET) * 100, 100);
  const bar      = document.getElementById("expense-budget-bar");
  const pctEl    = document.getElementById("expense-budget-percent");
  const statusEl = document.getElementById("expense-budget-status");

  bar.style.width     = `${pct}%`;
  pctEl.textContent   = `${Math.round(pct)}%`;
  statusEl.replaceChildren();

  const iconEl = document.createElement("span");
  iconEl.className = "material-symbols-outlined icon-small";
  iconEl.style.cssText = "vertical-align:middle;margin-right:6px;";
  const textEl = document.createElement("span");

  if (pct >= 100) {
    iconEl.textContent        = "warning";
    textEl.textContent        = " 先生！完全に予算上限を突破しています！";
    statusEl.style.color      = "var(--text-error)";
  } else if (pct > 70) {
    iconEl.textContent        = "lightbulb";
    textEl.textContent        = " ちょっと今月は出費のペースが早い気がします。";
    statusEl.style.color      = "#f59e0b";
  } else {
    iconEl.textContent        = "check_circle";
    textEl.textContent        = " 健全な支出状況をキープしています！素晴らしい！";
    statusEl.style.color      = "var(--text-success)";
  }
  statusEl.append(iconEl, textEl);
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

  tr.append(tdDate, tdCat, tdDesc, tdAmt);
  return tr;
}

export function initExpenses() {
  const expDateInput = document.getElementById("exp-date");
  if (expDateInput) expDateInput.value = new Date().toISOString().slice(0, 10);

  document.getElementById("expense-form")?.addEventListener("submit", async e => {
    e.preventDefault();
    const amount   = parseInt(document.getElementById("exp-amount").value, 10);
    const category = document.getElementById("exp-category").value;
    const desc           = document.getElementById("exp-description").value.trim();
    const date           = document.getElementById("exp-date").value;
    const purchaseSrc    = document.getElementById("exp-purchase-source")?.value.trim() || "不明";
    try {
      const res  = await fetch("/api/expenses/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: state.activeUserId, amount, category, description: desc, date, purchase_source: purchaseSrc }),
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

  initReceiptDropzone();
}

function initReceiptDropzone() {
  const dropzone  = document.getElementById("receipt-dropzone");
  const fileInput = document.getElementById("receipt-file-input");
  if (!dropzone) return;

  dropzone.addEventListener("dragover",  e => { e.preventDefault(); dropzone.classList.add("dragover"); });
  dropzone.addEventListener("dragleave", () => dropzone.classList.remove("dragover"));
  dropzone.addEventListener("drop", e => {
    e.preventDefault();
    dropzone.classList.remove("dragover");
    if (e.dataTransfer.files.length > 0) processReceiptFile(e.dataTransfer.files[0]);
  });
  dropzone.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", e => {
    if (e.target.files.length > 0) processReceiptFile(e.target.files[0]);
  });
}

function processReceiptFile(file) {
  if (!file.type.startsWith("image/")) {
    alert("エラー: 画像ファイル(PNG, JPEG等)のみ対応しています。");
    return;
  }
  const scanStatus    = document.getElementById("scan-status");
  const scanStatusTxt = document.getElementById("scan-status-text");
  const reader        = new FileReader();

  reader.onload = async e => {
    const base64Data = e.target.result.split(",")[1];
    scanStatus.classList.remove("hidden");
    scanStatusTxt.textContent = "レシート画像をユウカが確認中... (Gemini API解析を起動しています)";
    try {
      const res  = await fetch("/api/expenses/upload-receipt", {
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
