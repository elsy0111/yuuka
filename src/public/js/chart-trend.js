import { currentTheme } from "./theme.js";

const SVG_NS = "http://www.w3.org/2000/svg";

function formatYen(value) {
  if (value >= 10000) return `¥${Math.round(value / 1000).toLocaleString()}k`;
  return `¥${value.toLocaleString()}`;
}

function formatDateLabel(dateString, idx, lastIdx) {
  if (idx === lastIdx) return "今日";
  if (idx === lastIdx - 1) return "昨日";
  const [, month, day] = dateString.split("-");
  return `${Number(month)}/${Number(day)}`;
}

export function renderPriceTrendChart(dailyTotals, onHover, onLeave) {
  const svg = document.getElementById("dashboard-trend-chart");
  const linePath = document.getElementById("trend-line-path");
  const areaPath = document.getElementById("trend-area-path");
  const yAxis = document.getElementById("dashboard-trend-y-axis");

  svg.querySelectorAll("circle, text.trend-point-label").forEach((c) => {
    c.remove();
  });

  const rows = Array.isArray(dailyTotals) ? dailyTotals : [];
  const totals = rows.map((row) => Number(row.total || 0));

  const xAxis = svg.nextElementSibling;
  xAxis.replaceChildren();
  rows.forEach((row, idx) => {
    const span = document.createElement("span");
    span.textContent =
      idx === 0 ? `${rows.length - 1}日前` : formatDateLabel(row.date, idx, rows.length - 1);
    xAxis.appendChild(span);
  });

  const maxVal = Math.max(...totals, 1);
  const scaleMax = Math.ceil(maxVal * 1.18);
  const xStep = rows.length > 1 ? 400 / (rows.length - 1) : 400;
  const points = rows.map((row, idx) => ({
    x: idx * xStep,
    y: 130 - (Number(row.total || 0) / scaleMax) * 100,
    amount: Number(row.total || 0),
    date: row.date,
    dateLabel: formatDateLabel(row.date, idx, rows.length - 1),
  }));

  if (yAxis) {
    const labels = [scaleMax, Math.round(scaleMax * 0.6), Math.round(scaleMax * 0.2), 0];
    yAxis.replaceChildren(
      ...labels.map((val) => {
        const span = document.createElement("span");
        span.textContent = formatYen(val);
        return span;
      }),
    );
  }

  if (points.length === 0) {
    linePath.setAttribute("d", "");
    areaPath.setAttribute("d", "");
    return;
  }

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
  const labelColor = isLight ? "#1a2740" : "#e4e4e7";

  points.forEach((p) => {
    const label = document.createElementNS(SVG_NS, "text");
    label.classList.add("trend-point-label");
    label.setAttribute("x", Math.min(Math.max(p.x, 28), 372));
    label.setAttribute("y", Math.max(12, p.y - 10));
    label.setAttribute("text-anchor", "middle");
    label.setAttribute("fill", labelColor);
    label.textContent = formatYen(p.amount);
    svg.appendChild(label);

    const circle = document.createElementNS(SVG_NS, "circle");
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
