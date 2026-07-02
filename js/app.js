import { loadState, saveState, sanitize } from "./store.js";
import { computeTrend, projectForward, milestones, parseWeight, toDayNumber, fromDayNumber } from "./trend.js";
import { createChart, formatDay, formatKg } from "./chart.js";

const state = loadState();
const chart = createChart(document.getElementById("chart"), document.getElementById("tooltip"));

const $ = (id) => document.getElementById(id);

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ---------- Rendering ----------

function render() {
  saveState(state);
  const trend = computeTrend(state.weights);
  const projection = projectForward(trend, state.goal);
  renderStats(trend, projection);
  renderRangeButtons();
  chart.update({
    weights: state.weights,
    events: state.events,
    projection,
    goal: state.goal,
    rangeDays: state.range === "all" ? null : Number(state.range),
  });
  renderMilestones(trend);
  renderHistory();
}

function renderStats(trend, projection) {
  const last = state.weights[state.weights.length - 1];
  $("stat-current").textContent = last ? `${formatKg(last.kg)} kg` : "—";
  $("stat-current-date").textContent = last ? formatDay(toDayNumber(last.date)) : "";

  const rateEl = $("stat-rate");
  const rateSub = $("stat-rate-sub");
  rateEl.classList.remove("good", "bad");
  if (trend) {
    const perWeek = trend.slope * 7;
    rateEl.textContent = `${perWeek > 0 ? "+" : ""}${formatKg(perWeek)} kg/week`;
    rateEl.classList.add(perWeek < 0 ? "good" : "bad");
    rateSub.textContent = perWeek < 0 ? "Keep it up" : "Trending up";
  } else {
    rateEl.textContent = "—";
    rateSub.textContent = "Needs two weigh-ins";
  }

  const totalEl = $("stat-total");
  totalEl.classList.remove("good", "bad");
  if (state.weights.length >= 2) {
    const first = state.weights[0];
    const diff = last.kg - first.kg;
    totalEl.textContent = `${diff > 0 ? "+" : ""}${formatKg(diff)} kg`;
    totalEl.classList.add(diff < 0 ? "good" : "bad");
    $("stat-total-sub").textContent = `since ${formatDay(toDayNumber(first.date))}`;
  } else {
    totalEl.textContent = "—";
    $("stat-total-sub").textContent = "";
  }

  if (state.goal != null) {
    $("stat-goal").textContent = `${formatKg(state.goal, Number.isInteger(state.goal) ? 0 : 1)} kg`;
    $("stat-goal-eta").textContent = projection?.reachesGoal
      ? `projected ${formatDay(projection.endDay)}`
      : projection?.goalDay
        ? `projected ${formatDay(projection.goalDay)}`
        : "no downward trend yet";
  } else {
    $("stat-goal").textContent = "—";
    $("stat-goal-eta").textContent = "set a goal below";
  }
}

function renderRangeButtons() {
  for (const btn of document.querySelectorAll(".range-btn")) {
    btn.classList.toggle("selected", btn.dataset.range === state.range);
  }
}

function renderMilestones(trend) {
  const rows = milestones(trend, state.goal);
  const tbody = $("milestone-table").querySelector("tbody");
  tbody.textContent = "";
  $("milestone-empty").hidden = rows.length > 0;
  $("milestone-table").hidden = rows.length === 0;
  for (const m of rows) {
    const tr = document.createElement("tr");
    const kgTd = document.createElement("td");
    kgTd.className = "num";
    kgTd.textContent = `${formatKg(m.kg, Number.isInteger(m.kg) ? 0 : 1)} kg`;
    const dateTd = document.createElement("td");
    dateTd.textContent = `${formatDay(m.day)} (${fromDayNumber(m.day)})`;
    tr.append(kgTd, dateTd);
    tbody.append(tr);
  }
}

function renderHistory() {
  const tbody = $("history-table").querySelector("tbody");
  tbody.textContent = "";
  const dates = new Set([
    ...state.weights.map((w) => w.date),
    ...state.events.map((e) => e.date),
  ]);
  const sorted = [...dates].sort((a, b) => b.localeCompare(a));
  $("history-empty").hidden = sorted.length > 0;
  $("history-table").hidden = sorted.length === 0;

  for (const date of sorted.slice(0, 120)) {
    const tr = document.createElement("tr");

    const dateTd = document.createElement("td");
    dateTd.textContent = date;

    const weight = state.weights.find((w) => w.date === date);
    const kgTd = document.createElement("td");
    kgTd.className = "num";
    kgTd.textContent = weight ? formatKg(weight.kg) : "";

    const evTd = document.createElement("td");
    evTd.textContent = state.events
      .filter((e) => e.date === date)
      .map((e) => e.label)
      .join(", ");

    const actTd = document.createElement("td");
    if (weight) actTd.append(makeDeleteButton(`Delete weight on ${date}`, () => {
      state.weights = state.weights.filter((w) => w.date !== date);
      render();
    }));
    if (state.events.some((e) => e.date === date)) {
      actTd.append(makeDeleteButton(`Delete events on ${date}`, () => {
        state.events = state.events.filter((e) => e.date !== date);
        render();
      }, "✕ event"));
    }

    tr.append(dateTd, kgTd, evTd, actTd);
    tbody.append(tr);
  }
}

function makeDeleteButton(title, onClick, text = "✕") {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "del-btn";
  btn.title = title;
  btn.setAttribute("aria-label", title);
  btn.textContent = text;
  btn.addEventListener("click", onClick);
  return btn;
}

// ---------- Forms ----------

$("weight-date").value = todayIso();
$("event-date").value = todayIso();

$("weight-form").addEventListener("submit", (ev) => {
  ev.preventDefault();
  const kg = parseWeight($("weight-kg").value);
  const date = $("weight-date").value;
  if (kg == null || !date) return;
  state.weights = state.weights.filter((w) => w.date !== date);
  state.weights.push({ date, kg });
  state.weights.sort((a, b) => a.date.localeCompare(b.date));
  $("weight-kg").value = "";
  render();
});

$("event-form").addEventListener("submit", (ev) => {
  ev.preventDefault();
  const label = $("event-label").value.trim();
  const date = $("event-date").value;
  if (!label || !date) return;
  state.events.push({ date, label: label.slice(0, 60) });
  state.events.sort((a, b) => a.date.localeCompare(b.date));
  $("event-label").value = "";
  render();
});

$("goal-form").addEventListener("submit", (ev) => {
  ev.preventDefault();
  const raw = $("goal-kg").value.trim();
  state.goal = raw === "" ? null : parseWeight(raw);
  render();
});
if (state.goal != null) $("goal-kg").value = String(state.goal).replace(".", ",");

for (const btn of document.querySelectorAll(".range-btn")) {
  btn.addEventListener("click", () => {
    state.range = btn.dataset.range;
    render();
  });
}

// ---------- Import / export ----------

$("export-btn").addEventListener("click", () => {
  const blob = new Blob(
    [JSON.stringify({ weights: state.weights, events: state.events, goal: state.goal }, null, 2)],
    { type: "application/json" },
  );
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `weighter-backup-${todayIso()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});

$("import-btn").addEventListener("click", () => $("import-file").click());
$("import-file").addEventListener("change", async () => {
  const file = $("import-file").files[0];
  if (!file) return;
  try {
    const imported = sanitize(JSON.parse(await file.text()));
    if (!confirm(`Replace current data with ${imported.weights.length} weigh-ins and ${imported.events.length} events?`)) return;
    state.weights = imported.weights;
    state.events = imported.events;
    state.goal = imported.goal;
    render();
  } catch {
    alert("That file doesn't look like a Weighter backup.");
  } finally {
    $("import-file").value = "";
  }
});

render();
