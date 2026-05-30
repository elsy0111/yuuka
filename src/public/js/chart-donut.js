import { currentTheme } from "./theme.js";

const COLOR_MAP_BA = {
  食費: "#02D3FB",
  日用品: "#A3BAFF",
  交通費: "#FB90A4",
  娯楽: "#FFD966",
  その他: "#7A9BB0",
};
const COLOR_MAP_DARK = {
  食費: "#00e676",
  日用品: "#3b82f6",
  交通費: "#ef4444",
  娯楽: "#ff5376",
  その他: "#8e87ad",
};
const FALLBACK_COLORS = ["#a78bfa", "#f59e0b", "#10b981", "#6366f1", "#ec4899"];
const C = 251.2; // 円周 r=40

export function renderDonutChart(breakdown, total) {
  const svg    = document.getElementById("dashboard-donut-chart");
  const legend = document.getElementById("dashboard-category-legend");
  const pctEl  = document.getElementById("chart-center-percentage");
  const totalEl = document.getElementById("dashboard-category-total");

  legend.replaceChildren();
  svg.querySelectorAll(".donut-seg").forEach(el => el.remove());

  if (!breakdown || breakdown.length === 0 || total === 0) {
    pctEl.textContent = "0%";
    if (totalEl) totalEl.textContent = "¥0";
    const empty = document.createElement("div");
    empty.className = "legend-item";
    empty.textContent = "今月のデータはありません。";
    legend.appendChild(empty);
    return;
  }

  const colorMap = currentTheme() === "blue-archive" ? COLOR_MAP_BA : COLOR_MAP_DARK;
  let offset = 0;

  breakdown.slice(0, 4).forEach((cat, i) => {
    const ratio  = cat.total / total;
    const segLen = ratio * C;
    const color  = colorMap[cat.category] || FALLBACK_COLORS[i % FALLBACK_COLORS.length];

    const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    circle.setAttribute("class", "donut-seg");
    circle.setAttribute("cx", "50");
    circle.setAttribute("cy", "50");
    circle.setAttribute("r", "40");
    circle.setAttribute("fill", "transparent");
    circle.setAttribute("stroke", color);
    circle.setAttribute("stroke-width", "9");
    circle.setAttribute("stroke-dasharray", `${segLen} ${C - segLen}`);
    circle.setAttribute("stroke-dashoffset", `-${offset}`);
    circle.setAttribute("stroke-linecap", "butt");
    svg.appendChild(circle);
    offset += segLen;

    const pct  = Math.round(ratio * 100);
    const item = document.createElement("div");
    item.className = "legend-item";
    const dot  = document.createElement("span");
    dot.className = "legend-color";
    dot.style.backgroundColor = color;
    const lbl  = document.createElement("span");
    lbl.textContent = `${cat.category}: ¥${cat.total.toLocaleString()} (${pct}%)`;
    item.append(dot, lbl);
    legend.appendChild(item);
  });

  const ent    = breakdown.find(c => c.category === "娯楽");
  const entPct = ent ? Math.round((ent.total / total) * 100) : 0;
  pctEl.textContent = `${entPct}%`;
  if (totalEl) totalEl.textContent = `¥${total.toLocaleString()}`;
}
