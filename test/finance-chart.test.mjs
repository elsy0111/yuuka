import assert from "node:assert/strict";
import test from "node:test";
import {
  cumulativeFinance,
  mergeDailyFinance,
  renderFinanceChart,
} from "../src/public/js/finance-chart.js";

test("daily finance joins saved earnings to every expense day without plotting future zero-filled days", () => {
  assert.deepEqual(
    mergeDailyFinance(
      [
        { date: "2026-10-01", total: 300 },
        { date: "2026-10-02", total: 0 },
        { date: "2026-10-03", total: 0 },
      ],
      [
        { date: "2026-10-01", amount: 1200 },
        { date: "2026-10-01", amount: 600 },
        { date: "2026-09-30", amount: 999 },
      ],
      new Date(2026, 9, 2),
    ),
    [
      { date: "2026-10-01", spent: 300, earned: 1800 },
      { date: "2026-10-02", spent: 0, earned: 0 },
    ],
  );
});

test("cumulative finance accumulates spent and earned independently, including zero-day plateaus", () => {
  const rows = [
    { date: "2026-10-01", spent: 300, earned: 1800 },
    { date: "2026-10-02", spent: 0, earned: 0 },
    { date: "2026-10-03", spent: 50, earned: 200 },
  ];
  assert.deepEqual(cumulativeFinance(rows), [
    { date: "2026-10-01", spent: 300, earned: 1800 },
    { date: "2026-10-02", spent: 300, earned: 1800 },
    { date: "2026-10-03", spent: 350, earned: 2000 },
  ]);
});

test("cumulative finance handles empty and single-row input without mutation", () => {
  assert.deepEqual(cumulativeFinance([]), []);
  const row = { date: "2026-10-01", spent: 12, earned: 8 };
  const input = [row];
  assert.deepEqual(cumulativeFinance(input), [row]);
  assert.deepEqual(input, [row]);
  assert.notStrictEqual(cumulativeFinance(input)[0], row);
});

test("cumulative finance resets totals on every call", () => {
  const row = [{ date: "2026-10-01", spent: 12, earned: 8 }];
  assert.deepEqual(cumulativeFinance(row), [{ date: "2026-10-01", spent: 12, earned: 8 }]);
  assert.deepEqual(cumulativeFinance([{ date: "2026-10-02", spent: 1, earned: 2 }]), [
    { date: "2026-10-02", spent: 1, earned: 2 },
  ]);
});

function makeSvgDocument() {
  const makeElement = (tag) => ({
    tagName: tag,
    attributes: {},
    children: [],
    textContent: "",
    hidden: false,
    setAttribute(key, value) {
      this.attributes[key] = String(value);
    },
    append(...nodes) {
      this.children.push(...nodes);
    },
    replaceChildren(...nodes) {
      this.children = nodes;
    },
  });
  const svg = makeElement("svg");
  const output = makeElement("output");
  return {
    svg,
    output,
    document: {
      createElementNS(_namespace, tag) {
        return makeElement(tag);
      },
      getElementById(id) {
        return id === "finance-chart" ? svg : output;
      },
    },
  };
}

test("renderFinanceChart cumulative mode plots cumulative values and reports daily totals", () => {
  const { document, svg } = makeSvgDocument();
  const previousDocument = globalThis.document;
  globalThis.document = document;
  try {
    renderFinanceChart(
      [
        { date: "2026-10-01", spent: 10, earned: 100 },
        { date: "2026-10-02", spent: 5, earned: 0 },
      ],
      "cumulative",
    );
    const paths = svg.children.filter((child) => child.tagName === "path");
    assert.equal(paths.length, 2);
    assert.match(
      paths.find((path) => path.attributes["data-series"] === "spent").attributes.d,
      /L 584,169\.3/,
    );
    assert.match(
      paths.find((path) => path.attributes["data-series"] === "earned").attributes.d,
      /L 584,18/,
    );
    assert.match(svg.attributes["aria-label"], /稼いだ分 100円/);
    assert.match(svg.attributes["aria-label"], /使った分 15円/);
  } finally {
    globalThis.document = previousDocument;
  }
});

test("renderFinanceChart daily mode keeps daily values in paths and summary totals", () => {
  const { document, svg } = makeSvgDocument();
  const previousDocument = globalThis.document;
  globalThis.document = document;
  try {
    renderFinanceChart(
      [
        { date: "2026-10-01", spent: 10, earned: 100 },
        { date: "2026-10-02", spent: 5, earned: 0 },
      ],
      "daily",
    );
    const spentPath = svg.children.find((child) => child.attributes["data-series"] === "spent");
    assert.match(spentPath.attributes.d, /L 584,187\.1/);
    assert.match(svg.attributes["aria-label"], /稼いだ分 100円/);
    assert.match(svg.attributes["aria-label"], /使った分 15円/);
  } finally {
    globalThis.document = previousDocument;
  }
});

test("renderFinanceChart selects cumulative detail, switches modes, and clears handlers when empty", () => {
  const { document, svg, output } = makeSvgDocument();
  const previousDocument = globalThis.document;
  const rows = [
    { date: "2026-10-01", spent: 10, earned: 100 },
    { date: "2026-10-02", spent: 5, earned: 20 },
  ];
  const originalRows = structuredClone(rows);
  globalThis.document = document;
  try {
    renderFinanceChart(rows, "cumulative");
    svg.onkeydown({ key: "ArrowRight", preventDefault() {} });
    svg.onkeydown({ key: "ArrowRight", preventDefault() {} });
    assert.equal(output.textContent, "月初から2026-10-02　稼いだ分 ¥120 ／ 使った分 ¥15");
    assert.deepEqual(rows, originalRows);

    renderFinanceChart(rows, "daily");
    svg.onkeydown({ key: "ArrowRight", preventDefault() {} });
    assert.equal(output.textContent, "2026-10-01　稼いだ分 ¥100 ／ 使った分 ¥10");
    assert.deepEqual(rows, originalRows);

    renderFinanceChart([], "daily");
    assert.equal(svg.onkeydown, null);
    assert.equal(svg.onpointerdown, null);
    assert.equal(svg.hidden, true);
  } finally {
    globalThis.document = previousDocument;
  }
});
