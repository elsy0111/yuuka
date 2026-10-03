const NS = "http://www.w3.org/2000/svg";
export function mergeDailyFinance(days, entries, now = new Date()) {
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const income = new Map();
  for (const entry of entries || [])
    income.set(entry.date, (income.get(entry.date) || 0) + Number(entry.amount || 0));
  return (days || [])
    .filter((day) => day.date <= today)
    .map((day) => ({
      date: day.date,
      spent: Number(day.total || 0),
      earned: income.get(day.date) || 0,
    }));
}
export function cumulativeFinance(rows) {
  let spent = 0;
  let earned = 0;
  return (rows || []).map((row) => {
    earned += Number(row.earned || 0);
    spent += Number(row.spent || 0);
    return { ...row, earned, spent };
  });
}
function node(tag, attrs, text) {
  const element = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, value);
  if (text !== undefined) element.textContent = text;
  return element;
}
export function renderFinanceChart(rows, mode = "daily") {
  rows = mode === "cumulative" ? cumulativeFinance(rows) : rows || [];
  const modeCaption = document.getElementById("finance-mode-caption");
  if (modeCaption) modeCaption.textContent = `${mode === "cumulative" ? "累積" : "日別"}・円`;
  const svg = document.getElementById("finance-chart");
  const output = document.getElementById("finance-day-summary");
  svg.replaceChildren();
  svg.onpointerdown = null;
  svg.onkeydown = null;
  svg.hidden = rows.length === 0;
  if (!rows.length) {
    const kind = mode === "cumulative" ? "累積" : "日別";
    svg.setAttribute("aria-label", `表示する${kind}の収支はありません`);
    output.textContent = `この期間に表示できる${kind}の収支はありません。`;
    return;
  }
  const left = 60,
    right = 584,
    top = 18,
    bottom = 196;
  const max = Math.max(1, ...rows.flatMap((row) => [row.earned, row.spent]));
  const magnitude = 10 ** Math.floor(Math.log10(max));
  const scale = Math.ceil(max / magnitude) * magnitude;
  const x = (index) => left + (index * (right - left)) / Math.max(1, rows.length - 1);
  const y = (amount) => bottom - (amount / scale) * (bottom - top);
  for (let i = 0; i <= 4; i++) {
    const value = (scale * i) / 4;
    const position = y(value);
    svg.append(
      node("line", {
        x1: left,
        x2: right,
        y1: position,
        y2: position,
        stroke: "var(--border-matte)",
        "stroke-width": 1,
      }),
    );
    svg.append(
      node(
        "text",
        {
          x: left - 8,
          y: position + 4,
          "text-anchor": "end",
          fill: "var(--text-secondary)",
          "font-size": 15,
        },
        formatAxisAmount(value),
      ),
    );
  }
  const labels = new Set([
    0,
    rows.length - 1,
    ...[4, 9, 14, 19, 24].filter((i) => i < rows.length - 2),
  ]);
  for (const index of labels)
    if (rows[index])
      svg.append(
        node(
          "text",
          {
            x: x(index),
            y: 221,
            "text-anchor": "middle",
            fill: "var(--text-secondary)",
            "font-size": 16,
          },
          `${Number(rows[index].date.slice(-2))}日`,
        ),
      );
  for (const [key, color] of [
    ["earned", "var(--finance-earned)"],
    ["spent", "var(--finance-spent)"],
  ]) {
    svg.append(
      node("path", {
        d: rows.map((row, i) => `${i ? "L" : "M"} ${x(i)},${y(row[key])}`).join(" "),
        fill: "none",
        stroke: color,
        "stroke-width": 2.5,
        "vector-effect": "non-scaling-stroke",
        "data-series": key,
      }),
    );
    rows.forEach((row, i) => {
      if (row[key]) svg.append(node("circle", { cx: x(i), cy: y(row[key]), r: 3, fill: color }));
    });
  }
  const cursor = node("line", {
    y1: top,
    y2: bottom,
    stroke: "var(--text-secondary)",
    "stroke-dasharray": "3 3",
    visibility: "hidden",
  });
  svg.append(cursor);
  let selected = -1;
  const select = (index) => {
    if (!rows.length) return;
    selected = Math.max(0, Math.min(rows.length - 1, index));
    const row = rows[selected];
    cursor.setAttribute("x1", x(selected));
    cursor.setAttribute("x2", x(selected));
    cursor.setAttribute("visibility", "visible");
    output.textContent =
      mode === "cumulative"
        ? `月初から${row.date}　稼いだ分 ¥${row.earned.toLocaleString()} ／ 使った分 ¥${row.spent.toLocaleString()}`
        : `${row.date}　稼いだ分 ¥${row.earned.toLocaleString()} ／ 使った分 ¥${row.spent.toLocaleString()}`;
  };
  svg.onpointerdown = (event) => {
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const matrix = svg.getScreenCTM();
    if (!matrix) return;
    const position = point.matrixTransform(matrix.inverse());
    select(Math.round(((position.x - left) / (right - left)) * (rows.length - 1)));
  };
  svg.onkeydown = (event) => {
    if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault();
    select(selected < 0 ? 0 : selected + (event.key === "ArrowRight" ? 1 : -1));
  };
  output.textContent =
    mode === "cumulative"
      ? "グラフを押すと、月初からその日までの累積金額を確認できます。"
      : "グラフを押すと、その日の金額を確認できます。";
  const totalEarned =
    mode === "cumulative" ? rows.at(-1).earned : rows.reduce((sum, row) => sum + row.earned, 0);
  const totalSpent =
    mode === "cumulative" ? rows.at(-1).spent : rows.reduce((sum, row) => sum + row.spent, 0);
  svg.setAttribute(
    "aria-label",
    `${mode === "cumulative" ? "累積" : "日別"}の収支。稼いだ分 ${totalEarned.toLocaleString()}円、使った分 ${totalSpent.toLocaleString()}円。左右キーで日を選択`,
  );
}

function formatAxisAmount(value) {
  if (value >= 100_000_000) return `${Number((value / 100_000_000).toFixed(1))}億`;
  if (value >= 10_000) return `${Number((value / 10_000).toFixed(1))}万`;
  return Math.round(value).toLocaleString();
}
