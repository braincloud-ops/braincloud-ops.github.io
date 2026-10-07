// Where our schools are: a province map for the executive brief. Boundaries
// are a small static file built from Natural Earth (scripts/build-thailand-map.mjs);
// each school's province comes from the public school directory and the
// figures from the loaded report, so the map follows the period and filters.
import { groupTone } from "./schedule-model.mjs?v=a7073daf9c9b";
import { rise } from "./motion.mjs?v=a7073daf9c9b";

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
    new URL("./maps/thailand-provinces.json?v=a7073daf9c9b", import.meta.url),
  ).then((r) => {
    if (!r.ok) throw new Error("MAP_UNAVAILABLE");
    return r.json();
  }));

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

// Five shades over 1..max; a value v falls in step ceil(5v / max).
export function legendSteps(max) {
  const steps = [];
  for (let k = 1; k <= 5; k++) {
    const from = Math.floor(((k - 1) * max) / 5) + 1,
      to = Math.floor((k * max) / 5);
    if (to >= from) steps.push({ step: k, from, to });
  }
  return steps;
}
const stepOf = (v, max) => (v > 0 ? Math.ceil((5 * v) / max) : 0);

export function createSchoolMap() {
  const root = $("brief-map"),
    legend = $("brief-map-legend"),
    list = $("brief-map-list"),
    detail = $("brief-map-detail");
  let mode = "schools",
    figures = { provinces: new Map(), unplaced: 0 },
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
    root.replaceChildren(svg);
    built = true;
  }

  function draw() {
    const values = [...figures.provinces.values()].map(valueOf);
    const max = Math.max(0, ...values);
    for (const [key, { path, title, name }] of paths) {
      const p = figures.provinces.get(key);
      const value = valueOf(p);
      path.dataset.step = String(stepOf(value, max));
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
    for (const s of max ? legendSteps(max) : []) {
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
      const name = document.createElement("span");
      name.className = "map-school-name";
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

  function select(key) {
    selected = selected === key ? null : key;
    draw();
  }

  return {
    async render(report, directory) {
      figures = provinceFigures(report.schools, directory);
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
