// localStorage persistence. Schema:
// { weights: [{date, kg}], events: [{date, label}], goal: number|null, range: "30"|"90"|"all" }

const KEY = "weighter.v1";

const DEFAULT_STATE = { weights: [], events: [], goal: null, range: "90" };

export function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_STATE };
    return sanitize(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_STATE };
  }
}

export function saveState(state) {
  localStorage.setItem(KEY, JSON.stringify(state));
}

/** Validate an imported/stored blob into a well-formed state object. */
export function sanitize(data) {
  const state = { ...DEFAULT_STATE };
  if (!data || typeof data !== "object") return state;
  if (Array.isArray(data.weights)) {
    state.weights = data.weights
      .filter((w) => w && isIsoDate(w.date) && Number.isFinite(w.kg) && w.kg > 0 && w.kg < 500)
      .map((w) => ({ date: w.date, kg: Math.round(w.kg * 10) / 10 }));
    // one weight per date, last one wins
    const byDate = new Map(state.weights.map((w) => [w.date, w]));
    state.weights = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  }
  if (Array.isArray(data.events)) {
    state.events = data.events
      .filter((e) => e && isIsoDate(e.date) && typeof e.label === "string" && e.label.trim())
      .map((e) => ({ date: e.date, label: e.label.trim().slice(0, 60) }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }
  if (Number.isFinite(data.goal) && data.goal > 0 && data.goal < 500) state.goal = data.goal;
  if (["30", "90", "all"].includes(data.range)) state.range = data.range;
  return state;
}

function isIsoDate(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + "T00:00:00Z"));
}
