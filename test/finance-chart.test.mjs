import assert from "node:assert/strict";
import test from "node:test";
import { mergeDailyFinance } from "../src/public/js/finance-chart.js";
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
