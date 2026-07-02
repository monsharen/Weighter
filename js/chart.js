// SVG weight chart: measured line, dashed projection, event diamonds,
// crosshair + tooltip. Rebuilt from scratch on every update.

import { toDayNumber, fromDayNumber } from "./trend.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const HEIGHT = 320;
const MARGIN = { top: 16, right: 64, bottom: 30, left: 42 };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatDay(day) {
  const d = new Date(day * 86400000);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

export function formatKg(v, decimals = 1) {
  return v.toFixed(decimals).replace(".", ",");
}

function el(name, attrs = {}, text) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text != null) node.textContent = text;
  return node;
}

export function createChart(container, tooltipEl) {
  let data = null;
  let scene = null; // geometry of the last render, used by the hover layer

  const resizeObserver = new ResizeObserver(() => { if (data) render(); });
  resizeObserver.observe(container);

  function update(newData) {
    data = newData;
    render();
  }

  function render() {
    container.querySelector("svg")?.remove();
    hideTooltip();
    scene = null;
    const empty = container.querySelector("#chart-empty");
    if (!data || data.weights.length === 0) {
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;

    const { weights, events, projection, goal, rangeDays } = data;
    const width = Math.max(320, container.clientWidth);

    // --- Domains -----------------------------------------------------------
    const lastDay = toDayNumber(weights[weights.length - 1].date);
    const rangeStart = rangeDays ? lastDay - rangeDays : -Infinity;
    const visible = weights
      .map((w) => ({ day: toDayNumber(w.date), kg: w.kg }))
      .filter((w) => w.day >= rangeStart);
    const visibleEvents = events
      .map((e) => ({ day: toDayNumber(e.date), label: e.label }))
      .filter((e) => e.day >= rangeStart && e.day <= (projection ? projection.endDay : lastDay));

    const xMin = Math.min(visible[0].day, ...visibleEvents.map((e) => e.day)) - 1;
    const xMax = (projection ? projection.endDay : lastDay) + 1;

    let yValues = visible.map((w) => w.kg);
    if (projection) yValues = yValues.concat([projection.startKg, projection.endKg]);
    if (goal != null && projection?.reachesGoal) yValues.push(goal);
    let yMin = Math.min(...yValues), yMax = Math.max(...yValues);
    if (goal != null && goal >= yMin - 3 && !yValues.includes(goal)) yMin = Math.min(yMin, goal);
    const pad = Math.max(0.6, (yMax - yMin) * 0.08);
    yMin -= pad; yMax += pad;

    const plotW = width - MARGIN.left - MARGIN.right;
    const plotH = HEIGHT - MARGIN.top - MARGIN.bottom;
    const x = (day) => MARGIN.left + ((day - xMin) / (xMax - xMin)) * plotW;
    const y = (kg) => MARGIN.top + ((yMax - kg) / (yMax - yMin)) * plotH;

    const svg = el("svg", {
      viewBox: `0 0 ${width} ${HEIGHT}`,
      width, height: HEIGHT,
      role: "img",
      "aria-label": "Weight over time with projection. Values are listed in the history table.",
    });

    const css = getComputedStyle(container.closest(".viz-root"));
    const color = (name) => css.getPropertyValue(name).trim();

    // --- Gridlines + y ticks ------------------------------------------------
    const yStep = pickStep(yMax - yMin, [0.5, 1, 2, 5, 10, 20]);
    for (let t = Math.ceil(yMin / yStep) * yStep; t <= yMax; t += yStep) {
      const ty = y(t);
      svg.append(el("line", {
        x1: MARGIN.left, x2: width - MARGIN.right, y1: ty, y2: ty,
        stroke: color("--gridline"), "stroke-width": 1,
      }));
      svg.append(el("text", {
        x: MARGIN.left - 8, y: ty + 3.5, "text-anchor": "end",
        "font-size": 11, fill: color("--text-muted"),
      }, formatKg(t, yStep < 1 ? 1 : 0)));
    }
    svg.append(el("text", {
      x: MARGIN.left - 8, y: MARGIN.top - 4, "text-anchor": "end",
      "font-size": 11, fill: color("--text-muted"),
    }, "kg"));

    // --- X axis -------------------------------------------------------------
    svg.append(el("line", {
      x1: MARGIN.left, x2: width - MARGIN.right,
      y1: MARGIN.top + plotH, y2: MARGIN.top + plotH,
      stroke: color("--baseline"), "stroke-width": 1,
    }));
    const xStep = pickStep((xMax - xMin) / 6, [1, 2, 7, 14, 30, 60, 90]);
    for (let t = Math.ceil(xMin / xStep) * xStep; t <= xMax; t += xStep) {
      svg.append(el("text", {
        x: x(t), y: MARGIN.top + plotH + 18, "text-anchor": "middle",
        "font-size": 11, fill: color("--text-muted"),
      }, formatDay(t)));
    }

    // --- Goal line ----------------------------------------------------------
    if (goal != null && goal >= yMin && goal <= yMax) {
      const gy = y(goal);
      svg.append(el("line", {
        x1: MARGIN.left, x2: width - MARGIN.right, y1: gy, y2: gy,
        stroke: color("--baseline"), "stroke-width": 1,
      }));
      svg.append(el("text", {
        x: width - MARGIN.right + 6, y: gy + 3.5,
        "font-size": 11, fill: color("--text-muted"),
      }, `Goal ${formatKg(goal, Number.isInteger(goal) ? 0 : 1)}`));
    }

    // --- Projection (dashed, lighter step of the same hue) -------------------
    if (projection && projection.endDay > projection.startDay) {
      svg.append(el("line", {
        x1: x(projection.startDay), y1: y(projection.startKg),
        x2: x(projection.endDay), y2: y(projection.endKg),
        stroke: color("--series-1-soft"), "stroke-width": 2,
        "stroke-dasharray": "6 5", "stroke-linecap": "round",
      }));
      if (projection.reachesGoal) {
        svg.append(el("text", {
          x: Math.min(x(projection.endDay), width - MARGIN.right) + 6,
          y: y(projection.endKg) - 8,
          "font-size": 11, "font-weight": 600, fill: color("--text-secondary"),
        }, formatDay(projection.endDay)));
      }
    }

    // --- Weight line + markers ----------------------------------------------
    const path = visible
      .map((w, i) => `${i ? "L" : "M"}${x(w.day).toFixed(1)},${y(w.kg).toFixed(1)}`)
      .join("");
    svg.append(el("path", {
      d: path, fill: "none", stroke: color("--series-1"),
      "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round",
    }));
    const drawDots = visible.length <= 45 ? visible : [visible[visible.length - 1]];
    for (const w of drawDots) {
      svg.append(el("circle", {
        cx: x(w.day), cy: y(w.kg), r: 4,
        fill: color("--series-1"), stroke: color("--surface-1"), "stroke-width": 2,
      }));
    }
    // Direct label on the line end (the one value the story is about).
    const lastPt = visible[visible.length - 1];
    svg.append(el("text", {
      x: x(lastPt.day), y: y(lastPt.kg) - 10, "text-anchor": "middle",
      "font-size": 12, "font-weight": 600, fill: color("--text-primary"),
    }, formatKg(lastPt.kg)));

    // --- Event diamonds (their own lane at the bottom) ------------------------
    const eventDays = new Map(); // day -> labels[]
    for (const e of visibleEvents) {
      if (!eventDays.has(e.day)) eventDays.set(e.day, []);
      eventDays.get(e.day).push(e.label);
    }
    const laneY = MARGIN.top + plotH - 10;
    for (const day of eventDays.keys()) {
      svg.append(el("rect", {
        x: -4.5, y: -4.5, width: 9, height: 9, rx: 1,
        transform: `translate(${x(day)},${laneY}) rotate(45)`,
        fill: color("--series-2"), stroke: color("--surface-1"), "stroke-width": 2,
      }));
    }

    // --- Hover layer ----------------------------------------------------------
    const crosshair = el("line", {
      y1: MARGIN.top, y2: MARGIN.top + plotH,
      stroke: color("--baseline"), "stroke-width": 1, visibility: "hidden",
    });
    svg.append(crosshair);
    const overlay = el("rect", {
      x: MARGIN.left, y: MARGIN.top, width: plotW, height: plotH,
      fill: "transparent",
    });
    svg.append(overlay);

    scene = {
      svg, crosshair, x, xMin, xMax, lastDay,
      weightsByDay: new Map(visible.map((w) => [w.day, w.kg])),
      eventDays, projection,
      colors: {
        series1: color("--series-1"),
        series1Soft: color("--series-1-soft"),
        series2: color("--series-2"),
      },
    };
    overlay.addEventListener("pointermove", onPointerMove);
    overlay.addEventListener("pointerleave", hideTooltip);

    container.append(svg);
  }

  function onPointerMove(ev) {
    if (!scene) return;
    const rect = scene.svg.getBoundingClientRect();
    const scale = rect.width / scene.svg.viewBox.baseVal.width;
    const px = (ev.clientX - rect.left) / scale;
    const pointerDay = scene.xMin + ((px - MARGIN.left) / (scene.x(scene.xMax) - MARGIN.left)) * (scene.xMax - scene.xMin);

    // Snap to the nearest day that has something to say: a weigh-in, an event,
    // or (past the last weigh-in) any projected day.
    let day = null;
    const candidates = new Set([...scene.weightsByDay.keys(), ...scene.eventDays.keys()]);
    if (scene.projection) {
      const p = Math.round(pointerDay);
      if (p > scene.lastDay && p <= scene.projection.endDay) candidates.add(p);
    }
    let best = Infinity;
    for (const c of candidates) {
      const dist = Math.abs(c - pointerDay);
      if (dist < best) { best = dist; day = c; }
    }
    if (day == null || best > 15) { hideTooltip(); return; }

    scene.crosshair.setAttribute("x1", scene.x(day));
    scene.crosshair.setAttribute("x2", scene.x(day));
    scene.crosshair.setAttribute("visibility", "visible");

    renderTooltip(day);
    const ttX = Math.min(ev.clientX + 14, window.innerWidth - tooltipEl.offsetWidth - 8);
    const ttY = Math.min(ev.clientY + 14, window.innerHeight - tooltipEl.offsetHeight - 8);
    tooltipEl.style.left = `${Math.max(4, ttX)}px`;
    tooltipEl.style.top = `${Math.max(4, ttY)}px`;
  }

  // Tooltip DOM is built with textContent only — event labels are user data.
  function renderTooltip(day) {
    tooltipEl.textContent = "";
    const dateRow = document.createElement("div");
    dateRow.className = "tt-date";
    dateRow.textContent = `${formatDay(day)} (${fromDayNumber(day)})`;
    tooltipEl.append(dateRow);

    const addRow = (keyStyle, value, name) => {
      const row = document.createElement("div");
      row.className = "tt-row";
      const key = document.createElement("span");
      key.className = keyStyle.diamond ? "tt-key diamond" : "tt-key";
      if (keyStyle.diamond) key.style.background = keyStyle.color;
      else {
        key.style.borderTopColor = keyStyle.color;
        if (keyStyle.dashed) key.style.borderTopStyle = "dashed";
      }
      const val = document.createElement("span");
      val.className = "tt-value";
      val.textContent = value;
      row.append(key, val);
      if (name) {
        const nm = document.createElement("span");
        nm.className = "tt-name";
        nm.textContent = name;
        row.append(nm);
      }
      tooltipEl.append(row);
    };

    const kg = scene.weightsByDay.get(day);
    if (kg != null) addRow({ color: scene.colors.series1 }, `${formatKg(kg)} kg`, "weight");
    else if (scene.projection && day > scene.lastDay && day <= scene.projection.endDay) {
      const p = scene.projection;
      const t = (day - p.startDay) / (p.endDay - p.startDay);
      addRow({ color: scene.colors.series1Soft, dashed: true },
        `≈ ${formatKg(p.startKg + t * (p.endKg - p.startKg))} kg`, "projected");
    }
    for (const label of scene.eventDays.get(day) ?? []) {
      addRow({ color: scene.colors.series2, diamond: true }, label);
    }
    tooltipEl.hidden = false;
  }

  function hideTooltip() {
    tooltipEl.hidden = true;
    scene?.crosshair.setAttribute("visibility", "hidden");
  }

  return { update };
}

/** Smallest step from `options` that yields at most ~7 divisions of `span`. */
function pickStep(span, options) {
  for (const s of options) {
    if (span / s <= 7) return s;
  }
  return options[options.length - 1];
}
