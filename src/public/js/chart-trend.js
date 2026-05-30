import { currentTheme } from "./theme.js";

const SVG_NS = "http://www.w3.org/2000/svg";

function formatYen(value) {
  if (value >= 10000) return `¥${Math.round(value / 1000).toLocaleString()}k`;
  return `¥${value.toLocaleString()}`;
}

// データ範囲: SVG y=15(最大値)〜y=135(0) → 120px分
const DATA_TOP = 15;
const DATA_BOTTOM = 135;
const DATA_RANGE = DATA_BOTTOM - DATA_TOP; // 120
const SVG_VIEWBOX_H = 150;
const SVG_CSS_H = 140;
// 左右の余白 (SVG座標)
const PAD_X = 30;
const DATA_WIDTH = 400 - PAD_X * 2; // 340

/**
 * 常に step*3 = niceMax になるよう設計。
 * グリッド線4本: 0, step, step*2, step*3(=niceMax) が等間隔になる。
 */
function computeNiceScale(maxVal) {
  const candidates = [500, 1000, 2000, 5000, 10000, 20000, 50000, 100000];
  const step = candidates.find((s) => s * 3 >= maxVal) ?? 100000;
  return { step, niceMax: step * 3 };
}

function formatDateLabel(dateString, idx, lastIdx) {
  if (idx === lastIdx) return "今日";
  if (idx === 0) return "7日前";
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
    const svgX =
      PAD_X + (rows.length > 1 ? (idx * DATA_WIDTH) / (rows.length - 1) : DATA_WIDTH / 2);
    const pct = (svgX / 400) * 100;
    const span = document.createElement("span");
    span.textContent = formatDateLabel(row.date, idx, rows.length - 1);
    span.style.left = `${pct}%`;
    xAxis.appendChild(span);
  });

  const maxVal = Math.max(...totals, 1);
  const { step, niceMax } = computeNiceScale(maxVal);
  const xStep = rows.length > 1 ? DATA_WIDTH / (rows.length - 1) : DATA_WIDTH;
  const points = rows.map((row, idx) => ({
    x: PAD_X + idx * xStep,
    y: DATA_BOTTOM - (Number(row.total || 0) / niceMax) * DATA_RANGE,
    amount: Number(row.total || 0),
    date: row.date,
    dateLabel: formatDateLabel(row.date, idx, rows.length - 1),
  }));

  if (yAxis) {
    // グリッド線 y=15,55,95,135 に対応する値: niceMax, step*2, step, 0
    const gridSvgYs = [DATA_TOP, 55, 95, DATA_BOTTOM];
    const gridValues = [niceMax, step * 2, step, 0];
    yAxis.replaceChildren(
      ...gridValues.map((val, i) => {
        const span = document.createElement("span");
        span.textContent = formatYen(val);
        span.style.top = `${(gridSvgYs[i] / SVG_VIEWBOX_H) * SVG_CSS_H}px`;
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
  const firstX = points[0].x;
  const lastX = points[points.length - 1].x;
  areaPath.setAttribute(
    "d",
    `M ${firstX},${DATA_BOTTOM} ${points.map((p) => `L ${p.x},${p.y}`).join(" ")} L ${lastX},${DATA_BOTTOM} Z`,
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
