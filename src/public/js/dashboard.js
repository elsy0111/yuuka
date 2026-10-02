import { mergeDailyFinance, renderFinanceChart } from "./finance-chart.js";
import { closeModal, getModal, openModal } from "./modal.js";
import { state } from "./state.js";
import { toast } from "./toast.js";
import { apiRequest, reportError } from "./ui.js";

export function updateYuukaSpeechBubble() {
  const bubble = document.getElementById("yuuka-bubble-text");
  if (bubble)
    bubble.textContent =
      "先生、稼いだ分と使った分を一緒に確認しましょう。支出は家計、働いた時間は「働いた分」から記録できます。";
}

function formatNum(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function setUsageBar(barId, valId, used, limit) {
  const bar = document.getElementById(barId);
  const val = document.getElementById(valId);
  if (!bar || !val) return;
  const pct = limit > 0 ? Math.min((used / limit) * 100, 100) : 0;
  bar.style.width = `${pct}%`;
  bar.classList.remove("warn", "danger");
  if (pct >= 90) bar.classList.add("danger");
  else if (pct >= 70) bar.classList.add("warn");
  val.textContent = `${formatNum(used)} / ${formatNum(limit)}`;
}

let _geminiCurrentModel = "";
let _geminiCurrentQuota = { rpm: 0, rpd: 0, tpm: 0 };

export async function fetchGeminiUsage() {
  const editButton = document.getElementById("btn-gemini-quota-edit");
  if (editButton) editButton.hidden = !state.isAdmin;
  try {
    const res = await fetch("/api/gemini-usage");
    const data = await res.json();
    if (!data.success) return;
    const { usage, quota, model } = data;
    _geminiCurrentModel = model;
    _geminiCurrentQuota = quota;
    const modelEl = document.getElementById("gemini-usage-model");
    if (modelEl) modelEl.textContent = model;
    setUsageBar("gemini-bar-rpm", "gemini-val-rpm", usage.rpm, quota.rpm);
    setUsageBar("gemini-bar-rpd", "gemini-val-rpd", usage.rpd, quota.rpd);
    setUsageBar("gemini-bar-tpm", "gemini-val-tpm", usage.tpm, quota.tpm);
  } catch (e) {
    console.error("Gemini使用量取得エラー:", e);
  }
}

export function initGeminiQuotaEdit() {
  const editButton = document.getElementById("btn-gemini-quota-edit");
  editButton?.addEventListener("click", () => {
    if (!state.isAdmin) return;
    const label = document.getElementById("gemini-quota-model-label");
    if (label) label.textContent = _geminiCurrentModel || "—";
    document.getElementById("gemini-quota-rpm").value = _geminiCurrentQuota.rpm ?? "";
    document.getElementById("gemini-quota-rpd").value = _geminiCurrentQuota.rpd ?? "";
    document.getElementById("gemini-quota-tpm").value = _geminiCurrentQuota.tpm ?? "";
    openModal(getModal("gemini-quota"));
  });

  document.getElementById("btn-gemini-quota-save")?.addEventListener("click", async (event) => {
    if (!state.isAdmin) return;
    const button = event.currentTarget;
    const rpm = Number(document.getElementById("gemini-quota-rpm").value);
    const rpd = Number(document.getElementById("gemini-quota-rpd").value);
    const tpm = Number(document.getElementById("gemini-quota-tpm").value);
    if (![rpm, rpd, tpm].every((value) => Number.isInteger(value) && value >= 0)) {
      toast.error("クォータは0以上の整数で入力してください。");
      return;
    }
    button.disabled = true;
    try {
      await apiRequest("/api/gemini-usage/quota", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: _geminiCurrentModel, rpm, rpd, tpm }),
      });
      closeModal(getModal("gemini-quota"));
      fetchGeminiUsage();
      toast.success("Geminiクォータを保存しました。");
    } catch (e) {
      reportError(e);
    } finally {
      button.disabled = false;
    }
  });
}

let request = null;
let requestKey = "";
let version = 0;
function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}
export function initFinanceDashboard() {
  const input = document.getElementById("finance-month");
  input.value = currentMonth();
  input.addEventListener("change", () => {
    if (!input.checkValidity() || !input.value) {
      input.value = currentMonth();
    }
    fetchDashboardStats();
  });
  document.getElementById("finance-retry").addEventListener("click", fetchDashboardStats);
}
export async function fetchDashboardStats() {
  const user = state.activeUserId;
  const month = document.getElementById("finance-month").value || currentMonth();
  const key = `${user}:${month}`;
  if (!user || state.activeTab !== "dashboard") return;
  if (request && requestKey === key) return request;
  const capturedVersion = ++version;
  requestKey = key;
  request = loadFinance(user, month, capturedVersion);
  try {
    await request;
  } finally {
    if (capturedVersion === version) request = null;
  }
}
async function loadFinance(user, month, capturedVersion) {
  const card = document.getElementById("tab-dashboard");
  const error = document.getElementById("finance-error");
  const retry = document.getElementById("finance-retry");
  card.setAttribute("aria-busy", "true");
  error.textContent = "";
  retry.hidden = true;
  for (const id of ["stat-earned-total", "stat-expenses-total", "stat-net-total"])
    document.getElementById(id).textContent = "—";
  try {
    const [year, selectedMonth] = month.split("-");
    const [expenses, work] = await Promise.all([
      apiRequest(`/api/expenses?year=${year}&month=${selectedMonth}`),
      apiRequest(`/api/work?month=${month}`),
    ]);
    if (
      capturedVersion !== version ||
      user !== state.activeUserId ||
      state.activeTab !== "dashboard"
    )
      return;
    const earned = work.summary.amount;
    const spent = expenses.total;
    state.totalExpensesVal = spent;
    document.getElementById("stat-earned-total").textContent = `¥${earned.toLocaleString()}`;
    document.getElementById("stat-expenses-total").textContent = `¥${spent.toLocaleString()}`;
    document.getElementById("stat-net-total").textContent =
      `${earned - spent < 0 ? "−" : ""}¥${Math.abs(earned - spent).toLocaleString()}`;
    updateYuukaSpeechBubble();
    renderFinanceChart(
      mergeDailyFinance(expenses.monthlyDailyTotals || expenses.dailyTotals, work.entries),
    );
    renderCategories(expenses.breakdown, spent);
  } catch (err) {
    if (capturedVersion !== version || user !== state.activeUserId) return;
    document.getElementById("finance-chart").replaceChildren();
    document.getElementById("dashboard-category-bars").replaceChildren();
    error.textContent = "収支を取得できませんでした。";
    retry.hidden = false;
    reportError(err);
  } finally {
    if (capturedVersion === version && user === state.activeUserId)
      card.removeAttribute("aria-busy");
  }
}
function renderCategories(categories, total) {
  const root = document.getElementById("dashboard-category-bars");
  root.replaceChildren();
  if (!categories?.length) {
    root.textContent = "この月の支出はありません。";
    return;
  }
  for (const category of categories) {
    const row = document.createElement("div");
    row.className = "finance-category-row";
    const name = document.createElement("span");
    name.textContent = category.category;
    const track = document.createElement("div");
    track.className = "finance-category-track";
    const bar = document.createElement("div");
    bar.className = "finance-category-bar";
    bar.style.width = `${total ? (category.total / total) * 100 : 0}%`;
    track.append(bar);
    const amount = document.createElement("strong");
    amount.textContent = `¥${category.total.toLocaleString()}`;
    row.append(name, track, amount);
    root.append(row);
  }
}
