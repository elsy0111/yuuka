import { currentTheme } from "./theme.js";

export function renderPriceTrendChart(expenses, onHover, onLeave) {
  const svg = document.getElementById("dashboard-trend-chart");
  const linePath = document.getElementById("trend-line-path");
  const areaPath = document.getElementById("trend-area-path");

  svg.querySelectorAll("circle").forEach((c) => {
    c.remove();
  });

  const dateLabels = [];
  const dateStrings = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dateStrings.push(d.toISOString().slice(0, 10));
    dateLabels.push(`${d.getMonth() + 1}/${d.getDate()}`);
  }

  const xAxis = svg.nextElementSibling;
  xAxis.replaceChildren();
  dateLabels.forEach((label, idx) => {
    const span = document.createElement("span");
    span.textContent = idx === 0 ? "5日前" : idx === 4 ? "昨日" : idx === 5 ? "今日" : label;
    xAxis.appendChild(span);
  });

  const dailyTotals = dateStrings.map((date) => {
    if (!expenses) return 0;
    return expenses.filter((e) => e.date === date).reduce((s, e) => s + e.amount, 0);
  });

  const maxVal = Math.max(...dailyTotals, 10000);
  const points = dailyTotals.map((val, idx) => ({
    x: idx * 80,
    y: 130 - (val / maxVal) * 100,
    amount: val,
  }));

  linePath.setAttribute(
    "d",
    points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x},${p.y}`).join(" "),
  );
  areaPath.setAttribute(
    "d",
    `M 0,130 ${points.map((p) => `L ${p.x},${p.y}`).join(" ")} L 400,130 Z`,
  );

  const isLight = currentTheme() === "blue-archive";
  const dotNorm = isLight ? "#02D3FB" : "#fafafa";
  const dotHover = isLight ? "#00AED8" : "#a1a1aa";

  points.forEach((p) => {
    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("cx", p.x);
    circle.setAttribute("cy", p.y);
    circle.setAttribute("r", "4.5");
    circle.setAttribute("fill", dotNorm);
    circle.setAttribute("stroke", "var(--card-matte)");
    circle.setAttribute("stroke-width", "1.5");
    circle.style.cursor = "pointer";
    circle.style.transition = "r 0.15s ease, fill 0.15s ease";

    circle.addEventListener("mouseenter", () => {
      circle.setAttribute("r", "7.5");
      circle.setAttribute("fill", dotHover);
      onHover?.(p);
    });
    circle.addEventListener("mouseleave", () => {
      circle.setAttribute("r", "4.5");
      circle.setAttribute("fill", dotNorm);
      onLeave?.();
    });

    svg.appendChild(circle);
  });
}
