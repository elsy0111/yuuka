const NS = "http://www.w3.org/2000/svg";
export function mergeDailyFinance(days, entries) {
  const income = new Map();
  for (const entry of entries || [])
    income.set(entry.date, (income.get(entry.date) || 0) + Number(entry.amount || 0));
  return (days || []).map((day) => ({
    date: day.date,
    spent: Number(day.total || 0),
    earned: income.get(day.date) || 0,
  }));
}
function node(tag, attrs, text) {
  const element = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, value);
  if (text !== undefined) element.textContent = text;
  return element;
}
export function renderFinanceChart(rows) {
  const svg = document.getElementById("finance-chart");
  const output = document.getElementById("finance-day-summary");
  svg.replaceChildren();
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
        Math.round(value).toLocaleString(),
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
      if (row[key])
        svg.append(
          node("rect", { x: x(i) - 3, y: y(row[key]) - 3, width: 6, height: 6, fill: color }),
        );
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
    output.textContent = `${row.date}　稼いだ分 ¥${row.earned.toLocaleString()} ／ 使った分 ¥${row.spent.toLocaleString()}`;
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
  output.textContent = "グラフを押すと、その日の金額を確認できます。";
  svg.setAttribute(
    "aria-label",
    `日別の収支。稼いだ分 ${rows.reduce((sum, row) => sum + row.earned, 0).toLocaleString()}円、使った分 ${rows.reduce((sum, row) => sum + row.spent, 0).toLocaleString()}円。左右キーで日を選択`,
  );
}
