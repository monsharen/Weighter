import { test } from "node:test";
import assert from "node:assert/strict";
import {
  toDayNumber, fromDayNumber, linearRegression, computeTrend,
  projectForward, milestones, parseWeight,
} from "../js/trend.js";
import { sanitize } from "../js/store.js";

function series(startDate, kgs) {
  const start = toDayNumber(startDate);
  return kgs.map((kg, i) => ({ date: fromDayNumber(start + i), kg }));
}

test("day number round-trips", () => {
  assert.equal(fromDayNumber(toDayNumber("2026-07-02")), "2026-07-02");
  assert.equal(toDayNumber("2026-07-03") - toDayNumber("2026-07-02"), 1);
});

test("linear regression fits an exact line", () => {
  const fit = linearRegression([{ x: 0, y: 10 }, { x: 1, y: 9 }, { x: 2, y: 8 }]);
  assert.ok(Math.abs(fit.slope - -1) < 1e-9);
  assert.ok(Math.abs(fit.intercept - 10) < 1e-9);
});

test("regression needs two distinct x values", () => {
  assert.equal(linearRegression([{ x: 5, y: 1 }]), null);
  assert.equal(linearRegression([{ x: 5, y: 1 }, { x: 5, y: 2 }]), null);
});

test("trend of steady 0.5 kg/week loss", () => {
  // ~71 g/day for 28 days
  const kgs = Array.from({ length: 29 }, (_, i) => 85 - (0.5 / 7) * i);
  const trend = computeTrend(series("2026-06-01", kgs));
  assert.ok(Math.abs(trend.slope * 7 - -0.5) < 1e-6);
});

test("trend uses only the recent window", () => {
  // 60 days flat at 90, then 10 days dropping fast
  const flat = Array.from({ length: 60 }, () => 90);
  const drop = Array.from({ length: 10 }, (_, i) => 90 - 0.2 * (i + 1));
  const trend = computeTrend(series("2026-04-01", [...flat, ...drop]));
  assert.ok(trend.slope < -0.05, `recent drop should dominate, got ${trend.slope}`);
});

test("projection reaches the goal at the right date", () => {
  // exactly -0.1 kg/day from 85
  const kgs = Array.from({ length: 15 }, (_, i) => 85 - 0.1 * i);
  const weights = series("2026-06-01", kgs);
  const trend = computeTrend(weights);
  const proj = projectForward(trend, 80.6);
  assert.ok(proj.reachesGoal);
  // last kg = 83.6, needs 30 more days at 0.1/day
  assert.equal(proj.endDay - trend.lastDay, 30);
});

test("projection falls back to horizon when goal is far", () => {
  const kgs = Array.from({ length: 15 }, (_, i) => 85 - 0.01 * i);
  const trend = computeTrend(series("2026-06-01", kgs));
  const proj = projectForward(trend, 60, 90);
  assert.equal(proj.reachesGoal, false);
  assert.equal(proj.endDay - proj.startDay, 90);
});

test("no goal projection when trending up", () => {
  const trend = computeTrend(series("2026-06-01", [80, 80.2, 80.4, 80.6]));
  const proj = projectForward(trend, 75);
  assert.equal(proj.reachesGoal, false);
  assert.equal(proj.goalDay, null);
});

test("milestones list whole kgs down to the goal", () => {
  const kgs = Array.from({ length: 15 }, (_, i) => 85 - 0.1 * i); // ends 83.6
  const trend = computeTrend(series("2026-06-01", kgs));
  const rows = milestones(trend, 81);
  assert.deepEqual(rows.map((r) => r.kg), [83, 82, 81]);
  assert.ok(rows[0].day > trend.lastDay);
  assert.ok(rows[2].day > rows[1].day);
});

test("milestones empty without a downward trend", () => {
  const trend = computeTrend(series("2026-06-01", [80, 81, 82]));
  assert.deepEqual(milestones(trend, 75), []);
});

test("parseWeight accepts comma and dot decimals", () => {
  assert.equal(parseWeight("82,4"), 82.4);
  assert.equal(parseWeight("82.4"), 82.4);
  assert.equal(parseWeight(" 90 "), 90);
  assert.equal(parseWeight("abc"), null);
  assert.equal(parseWeight("-5"), null);
  assert.equal(parseWeight("900"), null);
});

test("sanitize dedupes weights per date and drops junk", () => {
  const s = sanitize({
    weights: [
      { date: "2026-07-01", kg: 84.25 },
      { date: "2026-07-01", kg: 84.5 },
      { date: "not-a-date", kg: 80 },
      { date: "2026-07-02", kg: -1 },
    ],
    events: [
      { date: "2026-07-01", label: "  🍺 Beer  " },
      { date: "2026-07-01", label: "" },
      { label: "no date" },
    ],
    goal: 75,
    range: "30",
  });
  assert.deepEqual(s.weights, [{ date: "2026-07-01", kg: 84.5 }]);
  assert.deepEqual(s.events, [{ date: "2026-07-01", label: "🍺 Beer" }]);
  assert.equal(s.goal, 75);
  assert.equal(s.range, "30");
});

test("sanitize survives garbage", () => {
  for (const junk of [null, 42, "hi", [], { weights: "nope" }]) {
    const s = sanitize(junk);
    assert.deepEqual(s.weights, []);
    assert.deepEqual(s.events, []);
  }
});
