import { state } from "./state.js";
import { currentTheme } from "./theme.js";
import { renderDonutChart } from "./chart-donut.js";
import { renderPriceTrendChart } from "./chart-trend.js";
import { renderUrgentDashboardList } from "./dashboard-urgent.js";
import { openModal, getModal, closeModal } from "./modal.js";

export function updateYuukaSpeechBubble() {
  const el = document.getElementById("yuuka-bubble-text");
  if (!el) return;
  if (state.totalExpensesVal > 30000) {
    el.textContent = `先生、今月はちょっと出費が多いんじゃないですか？（¥${state.totalExpensesVal.toLocaleString()}に達しています！）セミナー会計として警告します。本当に必要なものかもう一度よく考えて買いましょう！`;
  } else if (state.pendingTasksCount > 5) {
    el.textContent = `先生！未完了タスクが ${state.pendingTasksCount} 件も溜まっていますよ！スケジュールを後回しにすると、結局最後に自分が苦しむことになるんですからね！今から一緒にやっつけましょう！`;
  } else {
    el.textContent =
      "お疲れ様です、先生。セミナー会計の早瀬ユウカが、今日も完璧にサポートしますよ！タスクや予定、家計の管理なら私に何でもお任せください！";
  }
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
  document.getElementById("btn-gemini-quota-edit")?.addEventListener("click", () => {
    const label = document.getElementById("gemini-quota-model-label");
    if (label) label.textContent = _geminiCurrentModel || "—";
    document.getElementById("gemini-quota-rpm").value = _geminiCurrentQuota.rpm || "";
    document.getElementById("gemini-quota-rpd").value = _geminiCurrentQuota.rpd || "";
    document.getElementById("gemini-quota-tpm").value = _geminiCurrentQuota.tpm || "";
    openModal(getModal("gemini-quota"));
  });

  document.getElementById("btn-gemini-quota-save")?.addEventListener("click", async () => {
    const rpm = Number(document.getElementById("gemini-quota-rpm").value);
    const rpd = Number(document.getElementById("gemini-quota-rpd").value);
    const tpm = Number(document.getElementById("gemini-quota-tpm").value);
    try {
      await fetch("/api/gemini-usage/quota", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: _geminiCurrentModel, rpm, rpd, tpm }),
      });
      closeModal(getModal("gemini-quota"));
      fetchGeminiUsage();
    } catch (e) {
      console.error(e);
    }
  });
}

export async function fetchDashboardStats() {
  try {
    const [statusRes, expenseRes] = await Promise.all([
      fetch(`/api/status?userId=${state.activeUserId}`),
      fetch(`/api/expenses?userId=${state.activeUserId}`),
    ]);
    const statusData = await statusRes.json();
    const expenseData = await expenseRes.json();

    if (!statusData.success || !expenseData.success) return;

    state.pendingTasksCount = statusData.stats.pendingTasks;
    state.totalExpensesVal = expenseData.total;

    document.getElementById("stat-pending-tasks").textContent = state.pendingTasksCount;
    document.getElementById("stat-upcoming-schedules").textContent = statusData.stats.schedules;
    document.getElementById("stat-expenses-total").textContent =
      `¥${state.totalExpensesVal.toLocaleString()}`;

    updateYuukaSpeechBubble();
    renderPriorityBarChart(statusData.stats.pendingPriorities || { 0: 0, 1: 0, 2: 0 });
    renderSparkline("schedules-sparkline-path", statusData.stats.scheduleTrend || [], 2);
    renderSparkline("expenses-sparkline-path", statusData.stats.expenseTrend || [], 5000);
    renderDonutChart(expenseData.breakdown, expenseData.total);
    renderUrgentDashboardList();

    document.getElementById("dashboard-highest-category").textContent =
      expenseData.breakdown?.[0]?.category || "なし";

    const last7 = (expenseData.dailyTotals || []).slice(-7);
    const week7Total = last7.reduce((s, d) => s + Number(d.total || 0), 0);
    const avg7 = last7.length > 0 ? Math.round(week7Total / last7.length) : 0;
    const todayTotal = last7.length > 0 ? Number(last7[last7.length - 1]?.total || 0) : 0;
    document.getElementById("dashboard-today-expense").textContent =
      `¥${todayTotal.toLocaleString()}`;
    document.getElementById("dashboard-average-expense").textContent = `¥${avg7.toLocaleString()}`;
    document.getElementById("dashboard-week-total").textContent = `¥${week7Total.toLocaleString()}`;

    renderPriceTrendChart(
      expenseData.dailyTotals || [],
      (p) => {
        const label = p.dateLabel || (p.x === 400 ? "今日" : p.x === 320 ? "昨日" : "この日");
        document.getElementById("yuuka-bubble-text").textContent =
          `${label}の出費額は ¥${p.amount.toLocaleString()} ですよ、先生！`;
      },
      updateYuukaSpeechBubble,
    );
  } catch (err) {
    console.error("ダッシュボード情報の更新エラー:", err);
    document.getElementById("yuuka-bubble-text").textContent =
      "先生、ダッシュボード情報の取得中にエラーが発生しました。データベース接続を確認してください！";
  }
}

function renderPriorityBarChart(priorities) {
  const chart = document.getElementById("tasks-priority-bar-chart");
  if (!chart) return;
  chart.replaceChildren();

  const isLight = currentTheme() === "blue-archive";
  const colors = isLight ? ["#B8E8F8", "#51C8E8", "#02D3FB"] : ["#71717a", "#e4e4e7", "#fafafa"];
  const labels = ["低", "中", "高"];
  const maxCount = Math.max(priorities[0], priorities[1], priorities[2], 1);

  [0, 1, 2].forEach((p) => {
    const wrap = document.createElement("div");
    wrap.style.cssText =
      "display:flex;flex-direction:column;align-items:center;flex:1;height:100%;justify-content:flex-end;";
    wrap.title = `${labels[p]}優先度: ${priorities[p]}件`;

    const countEl = document.createElement("span");
    countEl.style.cssText =
      "font-size:0.55rem;font-family:var(--font-family-mono);color:var(--color-zinc-muted);margin-bottom:2px;";
    countEl.textContent = priorities[p];

    const bar = document.createElement("div");
    bar.style.height = `${Math.max((priorities[p] / maxCount) * 100, 10)}%`;
    bar.style.width = "100%";
    bar.style.backgroundColor = colors[p];
    bar.style.borderRadius = "var(--radius)";
    bar.style.transition = "height 0.3s ease";

    wrap.append(countEl, bar);
    chart.appendChild(wrap);
  });
}

function renderSparkline(id, trend, minScale) {
  const path = document.getElementById(id);
  if (!path) return;
  const maxVal = Math.max(...trend, minScale);
  const pts = trend
    .map((v, i) => `${i === 0 ? "" : "L"} ${i * 25},${19 - (v / maxVal) * 18}`)
    .join(" ");
  path.setAttribute("d", `M ${pts}`);
}
