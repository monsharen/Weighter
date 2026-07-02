// Pure date/regression/projection math. No DOM — unit-tested with node --test.

export const MS_PER_DAY = 86400000;
export const TREND_WINDOW_DAYS = 28;
export const PROJECTION_HORIZON_DAYS = 90;

/** "2026-07-02" -> integer day number (UTC days since epoch). */
export function toDayNumber(isoDate) {
  return Math.round(Date.parse(isoDate + "T00:00:00Z") / MS_PER_DAY);
}

/** Integer day number -> "2026-07-02". */
export function fromDayNumber(day) {
  return new Date(day * MS_PER_DAY).toISOString().slice(0, 10);
}

/** Least-squares fit over [{x, y}]. Returns {slope, intercept} or null. */
export function linearRegression(points) {
  const n = points.length;
  if (n < 2) return null;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (const p of points) {
    sx += p.x; sy += p.y; sxx += p.x * p.x; sxy += p.x * p.y;
  }
  const denom = n * sxx - sx * sx;
  if (denom === 0) return null; // all points on the same day
  const slope = (n * sxy - sx * sy) / denom;
  return { slope, intercept: (sy - slope * sx) / n };
}

/**
 * Fit a trend over the last `windowDays` of entries (falls back to all
 * entries when the window holds fewer than two).
 * weights: [{date, kg}] sorted ascending by date.
 * Returns {slope (kg/day), intercept, lastDay, valueAt(day)} or null.
 */
export function computeTrend(weights, windowDays = TREND_WINDOW_DAYS) {
  if (weights.length < 2) return null;
  const lastDay = toDayNumber(weights[weights.length - 1].date);
  let pts = weights.filter((w) => lastDay - toDayNumber(w.date) <= windowDays);
  if (pts.length < 2) pts = weights;
  const fit = linearRegression(pts.map((w) => ({ x: toDayNumber(w.date), y: w.kg })));
  if (!fit) return null;
  return {
    slope: fit.slope,
    intercept: fit.intercept,
    lastDay,
    valueAt: (day) => fit.slope * day + fit.intercept,
  };
}

/**
 * Where the dashed projection line ends: at the goal if the trend reaches it
 * within the horizon, otherwise at the horizon.
 * Returns {startDay, startKg, endDay, endKg, reachesGoal, goalDay|null} or null.
 */
export function projectForward(trend, goalKg, horizonDays = PROJECTION_HORIZON_DAYS) {
  if (!trend) return null;
  const startDay = trend.lastDay;
  const startKg = trend.valueAt(startDay);
  let goalDay = null;
  if (goalKg != null && trend.slope < 0 && goalKg < startKg) {
    goalDay = Math.ceil((goalKg - trend.intercept) / trend.slope);
  }
  const reachesGoal = goalDay != null && goalDay - startDay <= horizonDays;
  const endDay = reachesGoal ? goalDay : startDay + horizonDays;
  return {
    startDay,
    startKg,
    endDay,
    endKg: trend.valueAt(endDay),
    reachesGoal,
    goalDay: goalDay != null && goalDay > startDay ? goalDay : null,
  };
}

/**
 * Projected dates for each whole-kg mark between the current trend weight and
 * the goal (or the next `fallbackKg` marks when no goal is set).
 * Returns [{kg, day}], nearest first, at most `maxRows`.
 */
export function milestones(trend, goalKg, { maxRows = 12, fallbackKg = 5 } = {}) {
  if (!trend || trend.slope >= 0) return [];
  const startKg = trend.valueAt(trend.lastDay);
  const floor = goalKg != null && goalKg < startKg ? goalKg : startKg - fallbackKg;
  const out = [];
  for (let kg = Math.floor(startKg); kg >= Math.ceil(floor); kg--) {
    if (kg >= startKg) continue;
    out.push({ kg, day: Math.ceil((kg - trend.intercept) / trend.slope) });
    if (out.length >= maxRows) break;
  }
  if (goalKg != null && goalKg < startKg && goalKg !== Math.ceil(goalKg) && out.length < maxRows) {
    out.push({ kg: goalKg, day: Math.ceil((goalKg - trend.intercept) / trend.slope) });
  }
  return out;
}

/** Parse "82,4" or "82.4" -> 82.4, or null when not a sensible weight. */
export function parseWeight(text) {
  const v = Number.parseFloat(String(text).trim().replace(",", "."));
  if (!Number.isFinite(v) || v <= 0 || v >= 500) return null;
  return Math.round(v * 10) / 10;
}
