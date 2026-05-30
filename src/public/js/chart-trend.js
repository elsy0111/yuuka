import { currentTheme } from "./theme.js";

const SVG_NS = "http://www.w3.org/2000/svg";

function formatYen(value) {
  if (value >= 10000) return `¥${Math.round(value / 1000).toLocaleString()}k`;
  return `¥${value.toLocaleString()}`;
}

/**
 * maxVal を超える「きれいな」スケール上限と等間隔の刻み幅を返す。
 * 刻みは 500/1000/2000/5000/10000/... の nice number になる。
 */
function computeNiceScale(maxVal) {
  const rawStep = maxVal / 3 || 500;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;
  let niceFactor;
  if (normalized < 1.5) niceFactor = 1;
  else if (normalized < 3.5) niceFactor = 2;
  else if (normalized < 7.5) niceFactor = 5;
  else niceFactor = 10;
  const step = Math.max(niceFactor * magnitude, 500);
  const niceMax = step * Math.ceil(maxVal / step || 1);
  return { step, niceMax };
}

function formatDateLabel(dateString) {
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
    const pct = rows.length > 1 ? (idx / (rows.length - 1)) * 100 : 50;
    const span = document.createElement("span");
    span.textContent = formatDateLabel(row.date);
    span.style.left = `${pct}%`;
    xAxis.appendChild(span);
  });

  const maxVal = Math.max(...totals, 1);
  const { step, niceMax } = computeNiceScale(maxVal);
  const xStep = rows.length > 1 ? 400 / (rows.length - 1) : 400;
  const points = rows.map((row, idx) => ({
    x: idx * xStep,
    y: 130 - (Number(row.total || 0) / niceMax) * 100,
    amount: Number(row.total || 0),
    date: row.date,
    dateLabel: formatDateLabel(row.date),
  }));

  if (yAxis) {
    const labels = [niceMax, niceMax - step, niceMax - 2 * step, 0];
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
