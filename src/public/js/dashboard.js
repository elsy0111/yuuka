import { state } from "./state.js";
import { currentTheme } from "./theme.js";
import { renderDonutChart } from "./chart-donut.js";
import { renderPriceTrendChart } from "./chart-trend.js";
import { renderUrgentDashboardList } from "./dashboard-urgent.js";

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

    const expenses = expenseData.expenses || [];
    const maxExp = expenses.length > 0 ? Math.max(...expenses.map((e) => e.amount)) : 0;
    document.getElementById("dashboard-highest-expense").textContent =
      `¥${maxExp.toLocaleString()}`;
    document.getElementById("dashboard-highest-category").textContent =
      expenseData.breakdown?.[0]?.category || "なし";
    document.getElementById("dashboard-average-expense").textContent =
      expenses.length > 0 ? `¥${Math.round(expenseData.total / 30).toLocaleString()}` : "¥0";

    renderPriceTrendChart(
      expenses,
      (p) => {
        const label = p.x === 400 ? "今日" : p.x === 320 ? "昨日" : "この日";
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
