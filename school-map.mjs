// Where our schools are: a province map for the executive brief. Boundaries
// are a small static file built from Natural Earth (scripts/build-thailand-map.mjs);
// each school's province comes from the public school directory and the
// figures from the loaded report, so the map follows the period and filters.
import { groupTone } from "./schedule-model.mjs?v=2c0067239c1d";
import { rise } from "./motion.mjs?v=2c0067239c1d";

const SVG = "http://www.w3.org/2000/svg";
const $ = (id) => document.getElementById(id);
const fmt = (n) => Number(n).toLocaleString("en-GB");
const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
// Natural Earth names Bangkok "Bangkok Metropolis"; other names match once
// spaces and hyphens are ignored ("Chon Buri" = "Chonburi").
const ALIAS = { bangkok: "bangkokmetropolis" };
export const provinceKey = (name) => ALIAS[norm(name)] || norm(name);

let shapes = null;
const loadShapes = () =>
  (shapes ??= fetch(
    new URL("./maps/thailand-provinces.json?v=2c0067239c1d", import.meta.url),
  ).then((r) => {
    if (!r.ok) throw new Error("MAP_UNAVAILABLE");
    return r.json();
  }));

// The 77 province names of the map (English), for pickers.
export const loadProvinceNames = () =>
  loadShapes().then((map) => map.provinces.map((p) => p.name));

// Per province: schools with at least one delivered class, and the classes
// delivered, within the report's selection.
export function provinceFigures(reportSchools, directory) {
  const byId = new Map(directory.map((s) => [String(s.school_id), s]));
  const provinces = new Map();
  let unplaced = 0;
  for (const s of reportSchools) {
    const delivered = (s.NORMAL || 0) + (s.COVERED || 0);
    if (!delivered) continue;
    const school = byId.get(String(s.school_id));
    const key = school && provinceKey(school.school_province);
    if (!key) {
      unplaced++;
      continue;
    }
    if (!provinces.has(key))
      provinces.set(key, {
        key,
        province: school.school_province,
        schools: [],
        classes: 0,
      });
    const p = provinces.get(key);
    p.schools.push({
      school_id: s.school_id,
      code: s.school,
      name: s.name,
      group: s.group,
      classes: delivered,
    });
    p.classes += delivered;
  }
  for (const p of provinces.values())
    p.schools.sort(
      (a, b) => b.classes - a.classes || a.code.localeCompare(b.code),
    );
  return { provinces, unplaced };
}

// Five shades on a log scale over 1..max: counts are skewed (most provinces
// have one or two schools, a few have twelve), so equal-width steps would
// paint most of the map the same. Upper bounds are (max+1)^(k/5) - 1.
export function legendSteps(max) {
  const steps = [];
  let from = 1;
  for (let k = 1; k <= 5 && from <= max; k++) {
    const to =
      k === 5 ? max : Math.max(from, Math.round(Math.pow(max + 1, k / 5) - 1));
    if (to >= from) {
      steps.push({ step: k, from, to: Math.min(to, max) });
      from = Math.min(to, max) + 1;
    }
  }
  // With a small maximum there are fewer than five steps; shift them so the
  // highest value always gets the darkest shade.
  const shift = 5 - steps.length;
  return steps.map((s, i) => ({ ...s, step: i + 1 + shift }));
}
const stepOf = (v, steps) =>
  v > 0 ? (steps.find((s) => v >= s.from && v <= s.to)?.step ?? 5) : 0;

export function createSchoolMap({ onSchool } = {}) {
  const root = $("brief-map"),
    legend = $("brief-map-legend"),
    list = $("brief-map-list"),
    detail = $("brief-map-detail");
  let mode = "schools",
    figures = { provinces: new Map(), unplaced: 0 },
    // School points: schools of the selection that have a map location.
    points = [],
    unlocated = 0,
    projection = null,
    dots = null,
    selected = null,
    paths = new Map(),
    built = false;
  const valueOf = (p) =>
    !p ? 0 : mode === "schools" ? p.schools.length : p.classes;
  const describe = (p) =>
    `${p.province}: ${fmt(p.schools.length)} ${p.schools.length === 1 ? "school" : "schools"} served, ${fmt(p.classes)} classes delivered`;

  for (const button of document.querySelectorAll("[data-map-mode]"))
    button.addEventListener("click", () => {
      mode = button.dataset.mapMode;
      for (const b of document.querySelectorAll("[data-map-mode]"))
        b.setAttribute("aria-pressed", String(b === button));
      draw();
    });

  async function build() {
    if (built) return;
    const map = await loadShapes();
    const svg = document.createElementNS(SVG, "svg");
    svg.setAttribute("viewBox", map.viewBox);
    svg.setAttribute("role", "group");
    svg.setAttribute("aria-label", "Map of Thailand by province");
    for (const shape of map.provinces) {
      const path = document.createElementNS(SVG, "path");
      path.setAttribute("d", shape.d);
      path.setAttribute("class", "province");
      const title = document.createElementNS(SVG, "title");
      path.append(title);
      const key = provinceKey(shape.name);
      path.addEventListener("click", () => select(key));
      path.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          select(key);
        }
      });
      paths.set(key, { path, title, name: shape.name });
      svg.append(path);
    }
    projection = map.projection;
    dots = document.createElementNS(SVG, "g");
    dots.setAttribute("class", "school-dots");
    svg.append(dots);
    root.replaceChildren(svg);
    built = true;
  }

  function draw() {
    const values = [...figures.provinces.values()].map(valueOf);
    const max = Math.max(0, ...values);
    const steps = max ? legendSteps(max) : [];
    for (const [key, { path, title, name }] of paths) {
      const p = figures.provinces.get(key);
      const value = valueOf(p);
      path.dataset.step = String(stepOf(value, steps));
      path.classList.toggle("is-selected", key === selected);
      title.textContent = p
        ? describe(p)
        : `${name}: no school in this selection`;
      if (value) {
        path.setAttribute("tabindex", "0");
        path.setAttribute("role", "button");
        path.setAttribute("aria-label", describe(p));
      } else {
        path.removeAttribute("tabindex");
        path.removeAttribute("role");
        path.removeAttribute("aria-label");
      }
    }
    legend.replaceChildren();
    for (const s of steps) {
      const li = document.createElement("li");
      li.dataset.step = String(s.step);
      li.textContent =
        s.from === s.to ? fmt(s.from) : `${fmt(s.from)}–${fmt(s.to)}`;
      legend.append(li);
    }
    if (max) {
      const unit = document.createElement("li");
      unit.className = "map-legend-unit";
      unit.textContent = mode === "schools" ? "schools" : "classes";
      legend.append(unit);
    }
    list.replaceChildren();
    const ranked = [...figures.provinces.values()].sort(
      (a, b) => valueOf(b) - valueOf(a) || a.province.localeCompare(b.province),
    );
    for (const p of ranked) {
      const li = document.createElement("li");
      const b = document.createElement("button");
      b.type = "button";
      b.className = "map-list-item";
      b.setAttribute("aria-pressed", String(p.key === selected));
      const name = document.createElement("span");
      name.textContent = p.province;
      const value = document.createElement("span");
      value.className = "map-list-value";
      value.textContent = fmt(valueOf(p));
      b.append(name, value);
      b.addEventListener("click", () => select(p.key));
      li.append(b);
      list.append(li);
    }
    if (!ranked.length) {
      const li = document.createElement("li");
      li.className = "brief-empty";
      li.textContent = "No school with a delivered class in this selection.";
      list.append(li);
    }
    rise(list.children);
    drawDots();
    showDetail();
  }

  function showDetail() {
    const p = selected && figures.provinces.get(selected);
    detail.replaceChildren();
    if (!p) {
      const hint = document.createElement("p");
      hint.className = "brief-empty";
      hint.textContent =
        `${fmt(figures.provinces.size)} ${figures.provinces.size === 1 ? "province" : "provinces"}. Choose one on the map or in the list.` +
        (figures.unplaced
          ? ` ${fmt(figures.unplaced)} ${figures.unplaced === 1 ? "school has" : "schools have"} no province recorded.`
          : "") +
        (points.length
          ? ` Dots: ${fmt(points.length)} ${points.length === 1 ? "school" : "schools"} (colour = group).`
          : "") +
        (unlocated
          ? ` ${fmt(unlocated)} ${unlocated === 1 ? "school has" : "schools have"} no map location yet (Admin → People & schools).`
          : "");
      detail.append(hint);
      return;
    }
    const heading = document.createElement("h3");
    heading.textContent = p.province;
    const summary = document.createElement("p");
    summary.className = "map-detail-summary";
    summary.textContent = `${fmt(p.schools.length)} ${p.schools.length === 1 ? "school" : "schools"} served · ${fmt(p.classes)} classes delivered`;
    const schools = document.createElement("ul");
    schools.className = "map-schools";
    for (const s of p.schools) {
      const li = document.createElement("li");
      li.dataset.tone = groupTone(s.group);
      const chip = document.createElement("span");
      chip.className = "group-chip";
      chip.textContent = s.group;
      // Opens the school's page when a handler is given.
      const name = document.createElement(onSchool ? "button" : "span");
      name.className = "map-school-name" + (onSchool ? " link-button" : "");
      if (onSchool) {
        name.type = "button";
        name.addEventListener("click", () =>
          onSchool(s.school_id, `${s.code} — ${s.name || ""}`),
        );
      }
      const code = document.createElement("strong");
      code.textContent = s.code;
      name.append(code, " " + (s.name || ""));
      const n = document.createElement("span");
      n.className = "map-list-value";
      n.textContent = fmt(s.classes);
      li.append(name, chip, n);
      schools.append(li);
    }
    detail.append(heading, summary, schools);
  }

  // One dot per school with a map location, coloured by its school group.
  function drawDots() {
    if (!dots || !projection) return;
    dots.replaceChildren();
    const { k, cos, ox, oy } = projection;
    for (const p of points) {
      const dot = document.createElementNS(SVG, "circle");
      dot.setAttribute("class", "school-dot");
      dot.setAttribute("cx", String(p.longitude * cos * k - ox));
      dot.setAttribute("cy", String(-p.latitude * k - oy));
      dot.setAttribute("r", "6");
      dot.dataset.tone = groupTone(p.group);
      const label = `${p.code} ${p.name || ""}: ${fmt(p.classes)} ${p.classes === 1 ? "class" : "classes"} delivered`;
      const title = document.createElementNS(SVG, "title");
      title.textContent = label;
      dot.append(title);
      if (onSchool) {
        dot.setAttribute("tabindex", "0");
        dot.setAttribute("role", "button");
        dot.setAttribute("aria-label", label);
        const open = () => onSchool(p.school_id, `${p.code} — ${p.name || ""}`);
        dot.addEventListener("click", open);
        dot.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            open();
          }
        });
      }
      dots.append(dot);
    }
  }

  function select(key) {
    selected = selected === key ? null : key;
    draw();
  }

  return {
    async render(report, directory) {
      figures = provinceFigures(report.schools, directory);
      const byId = new Map(directory.map((s) => [String(s.school_id), s]));
      points = [];
      unlocated = 0;
      for (const s of report.schools) {
        const classes = (s.NORMAL || 0) + (s.COVERED || 0);
        if (!classes) continue;
        const d = byId.get(String(s.school_id));
        if (d?.latitude == null || d?.longitude == null) unlocated++;
        else
          points.push({
            school_id: s.school_id,
            code: s.school,
            name: s.name,
            group: s.group,
            classes,
            latitude: Number(d.latitude),
            longitude: Number(d.longitude),
          });
      }
      if (selected && !figures.provinces.has(selected)) selected = null;
      try {
        await build();
      } catch {
        root.textContent = "The map could not be loaded. The list still works.";
      }
      draw();
    },
    // Top provinces for the copied brief.
    summary() {
      const ranked = [...figures.provinces.values()].sort(
        (a, b) =>
          b.schools.length - a.schools.length ||
          a.province.localeCompare(b.province),
      );
      return ranked.length
        ? `Provinces: ${fmt(ranked.length)} (most schools: ${ranked
            .slice(0, 3)
            .map((p) => `${p.province} ${p.schools.length}`)
            .join(", ")})`
        : "";
    },
  };
}
