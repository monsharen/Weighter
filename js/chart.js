// SVG weight chart: measured line, dashed projection, event diamonds,
// crosshair + tooltip (mouse hover or touch scrub). Rebuilt on every update.

import { toDayNumber, fromDayNumber } from "./trend.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatDay(day) {
  const d = new Date(day * 86400000);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

export function formatKg(v, decimals = 1) {
  return v.toFixed(decimals).replace(".", ",");
}

/** Chart geometry scaled to the container width (phone vs desktop). */
function layout(width) {
  const narrow = width < 520;
  return {
    height: narrow ? 260 : 320,
    margin: narrow
      ? { top: 14, right: 52, bottom: 26, left: 34 }
      : { top: 16, right: 64, bottom: 30, left: 42 },
  };
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

  // Touch tooltips stay up after the tap; dismiss on tap-outside or scroll.
  document.addEventListener("pointerdown", (ev) => {
    if (scene && !scene.svg.contains(ev.target)) hideTooltip();
  }, true);
  window.addEventListener("scroll", () => hideTooltip(), { passive: true });

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
    const width = Math.max(300, container.clientWidth);
    const { height, margin } = layout(width);

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

    const plotW = width - margin.left - margin.right;
    const plotH = height - margin.top - margin.bottom;
    const x = (day) => margin.left + ((day - xMin) / (xMax - xMin)) * plotW;
    const y = (kg) => margin.top + ((yMax - kg) / (yMax - yMin)) * plotH;

    const svg = el("svg", {
      viewBox: `0 0 ${width} ${height}`,
      width, height,
      role: "img",
      "aria-label": "Weight over time with projection. Values are listed in the history table.",
    });

    const css = getComputedStyle(container.closest(".viz-root"));
    const color = (name) => css.getPropertyValue(name).trim();

    // --- Gridlines + y ticks ------------------------------------------------
    const maxYTicks = Math.max(3, Math.floor(plotH / 44));
    const yStep = pickStep((yMax - yMin) / maxYTicks, [0.5, 1, 2, 5, 10, 20]);
    for (let t = Math.ceil(yMin / yStep) * yStep; t <= yMax; t += yStep) {
      const ty = y(t);
      svg.append(el("line", {
        x1: margin.left, x2: width - margin.right, y1: ty, y2: ty,
        stroke: color("--gridline"), "stroke-width": 1,
      }));
      svg.append(el("text", {
        x: margin.left - 7, y: ty + 3.5, "text-anchor": "end",
        "font-size": 11, fill: color("--text-muted"),
      }, formatKg(t, yStep < 1 ? 1 : 0)));
    }
    svg.append(el("text", {
      x: margin.left - 7, y: margin.top - 4, "text-anchor": "end",
      "font-size": 11, fill: color("--text-muted"),
    }, "kg"));

    // --- X axis -------------------------------------------------------------
    svg.append(el("line", {
      x1: margin.left, x2: width - margin.right,
      y1: margin.top + plotH, y2: margin.top + plotH,
      stroke: color("--baseline"), "stroke-width": 1,
    }));
    const maxXTicks = Math.max(3, Math.floor(plotW / 78));
    const xStep = pickStep((xMax - xMin) / maxXTicks, [1, 2, 7, 14, 30, 60, 90]);
    for (let t = Math.ceil(xMin / xStep) * xStep; t <= xMax; t += xStep) {
      svg.append(el("text", {
        x: x(t), y: margin.top + plotH + 17, "text-anchor": "middle",
        "font-size": 11, fill: color("--text-muted"),
      }, formatDay(t)));
    }

    // --- Goal line ----------------------------------------------------------
    if (goal != null && goal >= yMin && goal <= yMax) {
      const gy = y(goal);
      svg.append(el("line", {
        x1: margin.left, x2: width - margin.right, y1: gy, y2: gy,
        stroke: color("--baseline"), "stroke-width": 1,
      }));
      svg.append(el("text", {
        x: width - margin.right + 5, y: gy + 3.5,
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
          x: Math.min(x(projection.endDay), width - margin.right) + 5,
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
    // On narrow plots daily dots turn to mush — draw them only when they fit.
    const maxDots = Math.floor(plotW / 9);
    const drawDots = visible.length <= maxDots ? visible : [visible[visible.length - 1]];
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
    const laneY = margin.top + plotH - 10;
    for (const day of eventDays.keys()) {
      svg.append(el("rect", {
        x: -4.5, y: -4.5, width: 9, height: 9, rx: 1,
        transform: `translate(${x(day)},${laneY}) rotate(45)`,
        fill: color("--series-2"), stroke: color("--surface-1"), "stroke-width": 2,
      }));
    }

    // --- Hover / touch-scrub layer ---------------------------------------------
    const crosshair = el("line", {
      y1: margin.top, y2: margin.top + plotH,
      stroke: color("--baseline"), "stroke-width": 1, visibility: "hidden",
    });
    svg.append(crosshair);
    const overlay = el("rect", {
      x: margin.left, y: margin.top, width: plotW, height: plotH,
      fill: "transparent",
    });
    svg.append(overlay);

    scene = {
      svg, crosshair, x, xMin, xMax, lastDay, margin,
      weightsByDay: new Map(visible.map((w) => [w.day, w.kg])),
      eventDays, projection,
      colors: {
        series1: color("--series-1"),
        series1Soft: color("--series-1-soft"),
        series2: color("--series-2"),
      },
    };
    overlay.addEventListener("pointermove", onPointer);
    overlay.addEventListener("pointerdown", onPointer); // tap on touch screens
    // A touch tap fires pointerleave right after pointerup — keep the tooltip
    // up for touch; it's dismissed by tapping elsewhere or scrolling.
    overlay.addEventListener("pointerleave", (ev) => {
      if (ev.pointerType !== "touch") hideTooltip();
    });
    overlay.addEventListener("pointercancel", hideTooltip);

    container.append(svg);
  }

  function onPointer(ev) {
    if (!scene) return;
    const rect = scene.svg.getBoundingClientRect();
    const scale = rect.width / scene.svg.viewBox.baseVal.width;
    const px = (ev.clientX - rect.left) / scale;
    const plotW = scene.x(scene.xMax) - scene.margin.left;
    const pointerDay = scene.xMin + ((px - scene.margin.left) / plotW) * (scene.xMax - scene.xMin);

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
    // Keep the tooltip on screen — above the finger on touch, beside the mouse.
    const touch = ev.pointerType === "touch";
    const rawX = touch ? ev.clientX - tooltipEl.offsetWidth / 2 : ev.clientX + 14;
    const rawY = touch ? ev.clientY - tooltipEl.offsetHeight - 24 : ev.clientY + 14;
    tooltipEl.style.left = `${clamp(rawX, 4, window.innerWidth - tooltipEl.offsetWidth - 4)}px`;
    tooltipEl.style.top = `${clamp(rawY, 4, window.innerHeight - tooltipEl.offsetHeight - 4)}px`;
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

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

/** Smallest step from `options` that yields at most ~`span/step` divisions. */
function pickStep(minStep, options) {
  for (const s of options) {
    if (s >= minStep) return s;
  }
  return options[options.length - 1];
}
