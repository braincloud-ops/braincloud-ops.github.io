// Executive brief: headline figures with a comparison period, a trend, school
// groups, schools with the most cancellations and (administrators only) the
// teaching workload. Every figure comes from the API; the browser never
// downloads the schedule to calculate it. The detailed tables of the earlier
// report are kept below the brief.
import { decode, punch, rise } from "./motion.mjs?v=b30c130f594d";
import { confirmedSessions, groupTone } from "./schedule-model.mjs?v=b30c130f594d";

const $ = (id) => document.getElementById(id);
const KEYS = ["NORMAL", "COVERED", "CANCEL_SCHOOL", "CANCEL_BC"];
const fmt = (n) => Number(n).toLocaleString("en-GB");
const pct = (r) =>
  r === null || r === undefined
    ? "—"
    : (r * 100).toLocaleString("en-GB", {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }) + "%";
const day = (d, options) =>
  new Date(d + "T00:00:00Z").toLocaleDateString("en-GB", {
    timeZone: "UTC",
    ...options,
  });
export function rangeLabel(start, end) {
  const full = { day: "numeric", month: "short", year: "numeric" };
  if (start === end) return day(start, full);
  if (start.slice(0, 7) === end.slice(0, 7))
    return `${Number(start.slice(8))}–${day(end, full)}`;
  const sameYear = start.slice(0, 4) === end.slice(0, 4);
  return `${day(start, { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) })} – ${day(end, full)}`;
}
const bucketTotal = (b) => KEYS.reduce((n, k) => n + (b[k] || 0), 0);
function bucketLabel(start, unit, index, count) {
  if (unit === "month") {
    const label = day(start, { month: "short" });
    if (index === 0 || start.slice(5, 7) === "01")
      return label + " " + start.slice(2, 4);
    return count > 24 ? "" : label;
  }
  if (unit === "week") return day(start, { day: "numeric", month: "short" });
  // Days: Monday labels only, so 23 columns stay readable on a phone.
  return new Date(start + "T00:00:00Z").getUTCDay() === 1 || index === 0
    ? day(start, { day: "numeric", month: "short" })
    : "";
}
function bucketName(start, unit) {
  if (unit === "month") return day(start, { month: "long", year: "numeric" });
  if (unit === "week")
    return "Week of " + day(start, { day: "numeric", month: "short" });
  return day(start, { weekday: "short", day: "numeric", month: "short" });
}

// Bangkok calendar dates for the period presets.
const bangkokToday = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const monthStart = (date, back) => {
  const [y, m] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 - back, 1)).toISOString().slice(0, 10);
};
const dayBefore = (date) =>
  new Date(Date.parse(date + "T00:00:00Z") - 86400000)
    .toISOString()
    .slice(0, 10);
export function presetRange(name, today = bangkokToday()) {
  if (name === "last-month")
    return {
      start: monthStart(today, 1),
      end: dayBefore(monthStart(today, 0)),
    };
  const back = { month: 0, quarter: 2, year: 11 }[name] ?? 0;
  return { start: monthStart(today, back), end: today };
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// A change against the comparison period. "better" says which way is good;
// leave and headcounts are shown without judging them.
function delta(current, previous, { kind, better }, against) {
  if (current === null || previous === null || previous === undefined)
    return null;
  let diff, text, spoken;
  if (kind === "points") {
    diff = (current - previous) * 100;
    if (Math.abs(diff) < 0.05) diff = 0;
    const size = Math.abs(diff).toLocaleString("en-GB", {
      maximumFractionDigits: 1,
    });
    text = size + (size === "1" ? " pt" : " pts");
    spoken = size + (size === "1" ? " point" : " points");
  } else {
    if (!previous) return null;
    diff = (current - previous) / previous;
    if (Math.abs(diff) < 0.0005) diff = 0;
    text =
      Math.abs(diff * 100).toLocaleString("en-GB", {
        maximumFractionDigits: 1,
      }) + "%";
  }
  const direction = diff > 0 ? "up" : diff < 0 ? "down" : "flat";
  // The heading names the comparison period; the pill stays one short line.
  const node = el(
    "span",
    "kpi-delta",
    direction === "flat"
      ? "No change vs previous"
      : `${direction === "up" ? "▲" : "▼"} ${text} vs previous`,
  );
  node.dataset.direction = direction;
  node.dataset.tone =
    direction === "flat" || !better
      ? "neutral"
      : direction === better
        ? "good"
        : "bad";
  node.setAttribute(
    "aria-label",
    direction === "flat"
      ? `No change compared with ${against}`
      : `${direction === "up" ? "Up" : "Down"} ${spoken || text} compared with ${against}`,
  );
  return node;
}

function kpiTiles(report) {
  const f = report.figures,
    p = report.previous,
    against = p ? rangeLabel(p.start, p.end) : "";
  const lost = f.covered + f.cancel_bc;
  const tiles = [
    {
      label: "Classes delivered",
      value: fmt(f.delivered),
      sub: `of ${fmt(f.scheduled)} scheduled`,
      cmp: [f.delivered, p?.delivered, { kind: "relative", better: "up" }],
      lead: true,
    },
    {
      label: "Delivery rate",
      value: pct(f.delivery_rate),
      sub: "delivered ÷ scheduled",
      cmp: [
        f.delivery_rate,
        p?.delivery_rate,
        { kind: "points", better: "up" },
      ],
      lead: true,
    },
    {
      label: "Cancelled by schools",
      value: fmt(f.cancel_school),
      sub: `${pct(f.cancel_school_rate)} of scheduled`,
      cmp: [
        f.cancel_school_rate,
        p?.cancel_school_rate,
        { kind: "points", better: "down" },
      ],
    },
    {
      label: "Cancelled by Braincloud",
      value: fmt(f.cancel_bc),
      sub: `${pct(f.cancel_bc_rate)} of scheduled`,
      cmp: [
        f.cancel_bc_rate,
        p?.cancel_bc_rate,
        { kind: "points", better: "down" },
      ],
    },
    {
      label: "Saved by cover",
      value: pct(f.cover_rate),
      sub: lost
        ? `${fmt(f.covered)} of ${fmt(lost)} classes the planned teacher could not teach`
        : "No class needed a cover teacher",
      cmp: [f.cover_rate, p?.cover_rate, { kind: "points", better: "up" }],
    },
    {
      label: "Schools served",
      value: fmt(report.schools_served),
      sub: "with at least one delivered class",
      cmp: [
        report.schools_served,
        p?.schools_served,
        { kind: "relative", better: null },
      ],
    },
    {
      label: "Teachers teaching",
      value: fmt(report.active_teachers),
      sub: "taught at least one class",
      cmp: [
        report.active_teachers,
        p?.active_teachers,
        { kind: "relative", better: null },
      ],
    },
    report.leave
      ? {
          label: "Teacher leave days",
          value: fmt(report.leave.days),
          sub: `${fmt(report.leave.teachers)} ${report.leave.teachers === 1 ? "teacher" : "teachers"}, Monday–Friday`,
          cmp: [
            report.leave.days,
            p?.leave?.days,
            { kind: "relative", better: null },
          ],
        }
      : {
          label: "Teacher leave days",
          value: "—",
          sub: "Not shown for a school or group filter",
        },
    report.peak
      ? {
          label: "Busiest moment",
          value: fmt(report.peak.busiest.n),
          sub: `classes at once, ${day(report.peak.busiest.date, { day: "numeric", month: "short" })} ${report.peak.busiest.at}${report.peak.typical === null ? "" : ` · typical school day ${fmt(Math.round(report.peak.typical))}`}`,
        }
      : {
          label: "Busiest moment",
          value: "—",
          sub: "No class times recorded",
        },
  ];
  const root = $("brief-kpis");
  root.replaceChildren();
  for (const tile of tiles) {
    const card = el("article", "kpi" + (tile.lead ? " is-lead" : ""));
    const value = el("strong", "kpi-value", tile.value);
    card.append(el("span", "kpi-label", tile.label), value);
    card.append(el("span", "kpi-sub", tile.sub));
    const change = tile.cmp && p ? delta(...tile.cmp, against) : null;
    if (change) card.append(change);
    root.append(card);
    decode(value, tile.value);
  }
  rise(root.children);
}

function renderChecks(report) {
  const items = [];
  const { removed_upstream, unconfirmed_days } = report.checks;
  if (removed_upstream)
    items.push(
      `Ignored ${fmt(removed_upstream)} classes that TMS removed after they were first scheduled.`,
    );
  if (unconfirmed_days.length) {
    const shown = unconfirmed_days
      .slice(0, 5)
      .map((d) => day(d, { day: "numeric", month: "short", year: "numeric" }));
    const more = unconfirmed_days.length - shown.length;
    items.push(
      `Not confirmed by the schedule sync, kept as recorded: ${shown.join(", ")}${more ? ` and ${more} more` : ""}.`,
    );
  }
  if (report.includes_future)
    items.push("Includes days still to come, counted as scheduled.");
  if (report.last_updated)
    items.push(
      `Latest source update: ${day(String(report.last_updated).slice(0, 10), { day: "numeric", month: "short", year: "numeric" })}.`,
    );
  const root = $("brief-checks");
  root.replaceChildren(...items.map((text) => el("li", "", text)));
}

function stack(counts, className) {
  const bar = el("div", className);
  bar.setAttribute("aria-hidden", "true");
  for (const key of [...KEYS].reverse()) {
    const part = el("span");
    part.dataset.key = key;
    part.style.flexGrow = String(counts[key] || 0);
    bar.append(part);
  }
  return bar;
}

function renderTrend(report, table) {
  const { unit, buckets } = report.trend;
  const root = $("brief-trend");
  root.replaceChildren();
  root.dataset.unit = unit;
  const max = Math.max(1, ...buckets.map(bucketTotal));
  buckets.forEach((b, i) => {
    const total = bucketTotal(b);
    const col = el("div", "trend-col");
    col.title =
      `${bucketName(b.start, unit)}: ${fmt(b.NORMAL + b.COVERED)} delivered` +
      ` (${fmt(b.COVERED)} by cover), ${fmt(b.CANCEL_SCHOOL)} cancelled by schools,` +
      ` ${fmt(b.CANCEL_BC)} by Braincloud`;
    const bar = stack(b, "trend-stack");
    bar.style.setProperty("--h", String(total / max));
    bar.style.setProperty("--i", String(i));
    col.append(
      bar,
      el("span", "trend-label", bucketLabel(b.start, unit, i, buckets.length)),
    );
    root.append(col);
  });
  table(
    "brief-trend-table",
    [
      ["period", unit === "month" ? "Month" : unit === "week" ? "Week" : "Day"],
      ["scheduled", "Scheduled"],
      ["delivered", "Delivered"],
      ["COVERED", "By a cover teacher"],
      ["CANCEL_SCHOOL", "Cancelled by school"],
      ["CANCEL_BC", "Cancelled by Braincloud"],
      ["rate", "Delivery rate"],
      ["peak", "Most at once"],
    ],
    buckets.map((b) => ({
      ...b,
      period: bucketName(b.start, unit),
      scheduled: bucketTotal(b),
      delivered: b.NORMAL + b.COVERED,
      rate: bucketTotal(b) ? pct((b.NORMAL + b.COVERED) / bucketTotal(b)) : "—",
      peak: b.peak ?? "—",
    })),
  );
}

function renderGroups(report) {
  const root = $("brief-groups");
  root.replaceChildren();
  for (const g of report.groups) {
    const row = el("div", "group-row");
    row.dataset.tone = groupTone(g.group);
    const head = el("div", "group-row-head");
    head.append(
      el("span", "group-chip", g.group),
      el("span", "group-row-total", `${fmt(g.total)} classes`),
    );
    row.append(
      head,
      stack(g, "split-bar"),
      el(
        "p",
        "group-row-rates",
        `${pct(g.delivery_rate)} delivered · ${pct(g.cancel_school_rate)} cancelled by schools · ${pct(g.cancel_bc_rate)} by Braincloud`,
      ),
    );
    root.append(row);
  }
  rise(root.children);
}

function renderTopSchools(report) {
  const root = $("brief-top-schools");
  root.replaceChildren();
  const list = report.top_school_cancellations;
  if (!list.length) {
    root.append(el("li", "brief-empty", "No class was cancelled by a school."));
    return;
  }
  const max = list[0].cancel_school;
  for (const s of list) {
    const item = el("li", "top-row");
    item.dataset.tone = groupTone(s.group);
    const name = el("span", "top-name");
    name.append(el("strong", "", s.school), " ", el("span", "", s.name || ""));
    const bar = el("span", "top-bar");
    bar.setAttribute("aria-hidden", "true");
    const fill = el("span");
    fill.style.setProperty("--w", String(s.cancel_school / max));
    bar.append(fill);
    item.append(
      name,
      bar,
      el(
        "span",
        "top-value",
        `${fmt(s.cancel_school)} · ${pct(s.rate)} of its classes · ${s.group}`,
      ),
    );
    root.append(item);
  }
  rise(root.children);
}

function renderWorkload(report) {
  const root = $("brief-workload");
  root.replaceChildren();
  if (!report.admin_detail) {
    const note = el("p", "brief-locked");
    const link = el("a", "", "Sign in on the Admin page");
    link.href = "#admin";
    note.append(
      link,
      " to see teacher names and workload. They are shown to administrators only.",
    );
    root.append(note);
    return;
  }
  const w = report.workload;
  if (!w.teachers) {
    root.append(
      el("p", "brief-empty", "No class was taught in this selection."),
    );
    return;
  }
  const taught = w.taught_by_type,
    sum = taught["Full-time"] + taught["Part-time"] + taught.Unclassified;
  const split = el("div", "split-bar is-type");
  split.setAttribute("aria-hidden", "true");
  for (const [type, key] of [
    ["Full-time", "ft"],
    ["Part-time", "pt"],
    ["Unclassified", "other"],
  ]) {
    const part = el("span");
    part.dataset.type = key;
    part.style.flexGrow = String(taught[type]);
    split.append(part);
  }
  const share = (type) =>
    `${type} ${pct(sum ? taught[type] / sum : null)} (${fmt(w.teachers_by_type[type])} ${w.teachers_by_type[type] === 1 ? "teacher" : "teachers"})`;
  const summary = el(
    "p",
    "workload-summary",
    `${fmt(w.teachers)} ${w.teachers === 1 ? "teacher" : "teachers"} taught ${fmt(sum)} classes. Median ${fmt(w.median_taught)} classes each; most ${fmt(w.most_taught)}.`,
  );
  const legend = el("ul", "workload-legend");
  for (const [type, key] of [
    ["Full-time", "ft"],
    ["Part-time", "pt"],
    ["Unclassified", "other"],
  ])
    if (taught[type]) {
      const li = el("li", "", share(type));
      li.dataset.type = key;
      legend.append(li);
    }
  root.append(
    el("h3", "", "Classes taught by contract type"),
    split,
    legend,
    summary,
  );
  root.append(el("h3", "", "Most classes covered for colleagues"));
  if (!w.top_coverers.length)
    root.append(el("p", "brief-empty", "No cover was recorded."));
  else {
    const list = el("ol", "coverers");
    for (const t of w.top_coverers) {
      const li = el("li");
      li.append(
        el("span", "", t.name),
        " ",
        el(
          "span",
          "type-tag",
          t.type === "Full-time" ? "FT" : t.type === "Part-time" ? "PT" : "",
        ),
        el(
          "span",
          "coverer-value",
          `${fmt(t.covering)} covered · ${fmt(t.taught)} taught`,
        ),
      );
      list.append(li);
    }
    root.append(list);
  }
}

export function briefText(r) {
  const f = r.figures,
    p = r.previous;
  const vs = (cur, prev) => {
    if (!p || cur === null || prev === null || prev === undefined) return "";
    const d = (cur - prev) * 100;
    return Math.abs(d) < 0.05
      ? ", no change"
      : `, ${d > 0 ? "+" : "−"}${Math.abs(d).toLocaleString("en-GB", { maximumFractionDigits: 1 })} pts`;
  };
  const lines = [
    `Braincloud operations brief: ${rangeLabel(r.start, r.end)}${p ? ` (compared with ${rangeLabel(p.start, p.end)})` : ""}`,
    `Classes delivered: ${fmt(f.delivered)} of ${fmt(f.scheduled)} scheduled (${pct(f.delivery_rate)}${vs(f.delivery_rate, p?.delivery_rate)})`,
    `Cancelled by schools: ${fmt(f.cancel_school)} (${pct(f.cancel_school_rate)}); by Braincloud: ${fmt(f.cancel_bc)} (${pct(f.cancel_bc_rate)})`,
    `Saved by cover: ${pct(f.cover_rate)} (${fmt(f.covered)} of ${fmt(f.covered + f.cancel_bc)})`,
    `Schools served: ${fmt(r.schools_served)} · Teachers teaching: ${fmt(r.active_teachers)}` +
      (r.leave ? ` · Teacher leave days: ${fmt(r.leave.days)}` : ""),
  ];
  if (r.peak)
    lines.push(
      `Busiest moment: ${fmt(r.peak.busiest.n)} classes at once (${day(r.peak.busiest.date, { day: "numeric", month: "short" })}, ${r.peak.busiest.at})`,
    );
  if (r.groups.length)
    lines.push(
      "By group: " +
        r.groups
          .map(
            (g) =>
              `${g.group} ${pct(g.delivery_rate)} delivered of ${fmt(g.total)}`,
          )
          .join("; "),
    );
  if (r.top_school_cancellations.length)
    lines.push(
      "Most cancellations by schools: " +
        r.top_school_cancellations
          .slice(0, 5)
          .map((s) => `${s.school} ${fmt(s.cancel_school)} (${pct(s.rate)})`)
          .join(", "),
    );
  lines.push(
    "Source: TMS schedule (Asia/Bangkok); trial schools excluded" +
      (r.checks.removed_upstream
        ? `; ${fmt(r.checks.removed_upstream)} classes removed from TMS ignored`
        : "") +
      ". Not an attendance or payment report.",
  );
  return lines.join("\n");
}

export function initializeExecutive({
  api,
  busy,
  message,
  query,
  table,
  teacherName,
  filters,
  isAdmin,
}) {
  const form = $("executive-form");
  let current = null,
    generation = 0;
  const presets = [...form.querySelectorAll("[data-preset]")];
  const choosePreset = (name) => {
    const range = presetRange(name);
    form.elements.start.value = range.start;
    form.elements.end.value = range.end;
    for (const b of presets)
      b.setAttribute("aria-pressed", String(b.dataset.preset === name));
  };
  for (const b of presets)
    b.addEventListener("click", () => choosePreset(b.dataset.preset));
  for (const input of [form.elements.start, form.elements.end])
    input.addEventListener("input", () => {
      for (const b of presets) b.setAttribute("aria-pressed", "false");
    });
  choosePreset("month");

  const teacherFilter = $("executive-teacher-filter");
  const clear = () => {
    generation++;
    current = null;
    $("executive-output").hidden = true;
  };
  addEventListener("admin-signed-in", () => (teacherFilter.hidden = false));
  addEventListener("admin-signed-out", () => {
    teacherFilter.hidden = true;
    for (const option of $("executive-teachers").options)
      option.selected = false;
    // Teacher figures must not stay on screen after signing out.
    if (current?.admin_detail) {
      clear();
      $("executive-note").textContent = "";
    }
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    busy(e.submitter, async () => {
      clear();
      const ticket = generation;
      $("executive-note").textContent = "Loading the selected period…";
      const f = new FormData(form);
      const params = {
        start: f.get("start"),
        end: f.get("end"),
        groups: f.getAll("groups"),
        schoolIds: f.getAll("schoolIds"),
        teacherIds: isAdmin() ? f.getAll("teacherIds") : [],
      };
      if (params.start > params.end)
        throw new Error("The start date is after the end date.");
      let report;
      try {
        report = (
          await api(
            isAdmin() ? "/admin/reports/executive" : "/reports/executive",
            { method: "POST", data: params },
          )
        ).data;
      } catch (error) {
        if (ticket === generation)
          $("executive-note").textContent =
            "This report could not be loaded. No replacement totals were calculated.";
        throw error;
      }
      if (ticket !== generation) return;
      $("executive-note").textContent = "";
      if (!report.total) {
        const note = $("executive-note");
        note.textContent = `${rangeLabel(report.start, report.end)}: no recorded sessions match this selection. This does not confirm zero activity.`;
        message("Report loaded.");
        return;
      }
      $("brief-period").textContent =
        rangeLabel(report.start, report.end) +
        (report.previous
          ? ` · compared with ${rangeLabel(report.previous.start, report.previous.end)}`
          : "") +
        " · Asia/Bangkok";
      kpiTiles(report);
      renderChecks(report);
      renderTrend(report, table);
      renderGroups(report);
      renderTopSchools(report);
      renderWorkload(report);
      renderDetails(report, params);
      current = report;
      $("executive-output").hidden = false;
      punch($("brief-kpis"));
      message("Executive summary loaded.");
    });
  });

  $("copy-executive").addEventListener("click", () =>
    busy($("copy-executive"), async () => {
      if (!current) throw new Error("Load a report first.");
      await navigator.clipboard.writeText(briefText(current));
      message("Brief copied.");
    }),
  );

  // The earlier report's tables, unchanged apart from teacher names, which
  // only administrators receive.
  function renderDetails(report, params) {
    const root = $("executive-totals");
    root.replaceChildren();
    for (const [label, value] of [
      ["Recorded sessions", report.total],
      ["Active teachers", report.active_teachers],
      ["Schools with records", report.schools.length],
      ["Affiliated staff", report.affiliated_staff_count],
    ]) {
      const card = el("div");
      card.append(
        el("strong", "", value.toLocaleString("en-GB")),
        el("span", "", label),
      );
      root.append(card);
    }
    const bars = $("executive-status");
    bars.replaceChildren();
    for (const [key, label] of [
      ["NORMAL", "Normal"],
      ["COVERED", "Covered"],
      ["CANCEL_SCHOOL", "Cancelled by school"],
      ["CANCEL_BC", "Cancelled by Braincloud / unspecified"],
    ]) {
      const row = el("label"),
        bar = document.createElement("meter");
      bar.max = report.total;
      bar.value = report.counts[key];
      bar.setAttribute("aria-label", label);
      row.append(
        document.createTextNode(`${label}: ${fmt(report.counts[key])}`),
        bar,
      );
      bars.append(row);
    }
    const statusColumns = [
      ["total", "Recorded"],
      ["NORMAL", "Normal"],
      ["COVERED", "Covered"],
      ["CANCEL_SCHOOL", "School cancelled"],
      ["CANCEL_BC", "BC / unspecified cancelled"],
    ];
    table(
      "executive-group-table",
      [["group", "School group"], ...statusColumns],
      report.groups,
    );
    const estimate = (value) =>
      value === null
        ? "Insufficient active weeks"
        : Number(value).toLocaleString("en-GB", { maximumFractionDigits: 1 });
    table(
      "executive-school-table",
      [
        ["school", "School"],
        ...statusColumns,
        ["active_teachers", "Distinct active teachers"],
        ["active_weeks", "Active weeks"],
        ["average", "Sessions / active week"],
        ["average_teachers", "Teachers / active week"],
        ["projection", "40-week estimate"],
      ],
      report.schools.map((s) => ({
        ...s,
        average: estimate(s.avg_classes_per_active_week),
        average_teachers: estimate(s.avg_teachers_per_active_week),
        projection: estimate(s.projection_40_weeks),
      })),
    );
    $("executive-teacher-section").hidden = !report.admin_detail;
    if (report.admin_detail)
      table(
        "executive-teacher-table",
        [
          ["name", "Teacher"],
          ["type", "Type"],
          ["assigned", "Assigned"],
          ["normal", "Normal"],
          ["covered", "Covered by others"],
          ["covering", "Covering"],
          ["cancel_school", "School cancelled"],
          ["cancel_bc", "BC / unspecified cancelled"],
          ["taught", "Taught"],
        ],
        report.teachers,
      );
    else $("executive-teacher-table").replaceChildren();
    table(
      "executive-students",
      [
        ["school", "School"],
        ["year", "Year"],
        ["count", "Students"],
        ["status", "Source status"],
      ],
      report.student_counts.map((row) => ({
        ...row,
        count: row.no_students ?? "Not available",
      })),
    );
    const details = $("executive-school-details");
    details.replaceChildren();
    for (const school of report.schools) {
      const item = el("details"),
        title = el("summary", "", `${school.school} — ${school.name}`);
      item.append(title);
      if (report.admin_detail)
        for (const [label, people] of [
          ["Responsible teachers", school.responsible_teachers],
          ["Currently affiliated staff", school.affiliated_staff],
        ]) {
          const list = el("ul");
          for (const person of people)
            list.append(
              el(
                "li",
                "",
                person.name +
                  (person.taught === undefined
                    ? ""
                    : `: ${person.taught} taught sessions`),
              ),
            );
          if (!people.length) list.textContent = "No matching staff recorded.";
          item.append(el("h3", "", label), list);
        }
      else
        item.append(
          el(
            "p",
            "",
            `Responsible teachers: ${fmt(school.responsible_teacher_count)} · Currently affiliated staff: ${fmt(school.affiliated_staff_count)}. Names are shown to administrators.`,
          ),
        );
      const button = el("button", "secondary", "View sessions"),
        rows = el("div", "table-wrap");
      button.type = "button";
      rows.id = `school-detail-${details.childElementCount}`;
      button.addEventListener("click", () =>
        busy(button, async () => {
          rows.replaceChildren();
          const sessions = confirmedSessions(
            await query(
              "fact_daily_session",
              [
                ...filters(report.start, report.end),
                { column: "school_id", op: "eq", value: school.school_id },
              ],
              false,
              [{ column: "date" }, { column: "session_id" }],
            ),
          );
          const selected = params.teacherIds.length
            ? sessions.filter(
                (s) =>
                  params.teacherIds.includes(s.original_teacher_id) ||
                  params.teacherIds.includes(s.actual_teacher_id),
              )
            : sessions;
          table(
            rows.id,
            [
              ["date", "Date"],
              ["start_time", "Start"],
              ["class_name", "Class"],
              ["teacher", "Assigned teacher"],
              ["status", "Status"],
            ],
            selected.map((s) => ({
              ...s,
              teacher: teacherName(s.actual_teacher_id),
            })),
          );
          message("School sessions loaded.");
        }),
      );
      item.append(button, rows);
      details.append(item);
    }
    table(
      "executive-year-table",
      [
        ["year", "Year"],
        ["total", "Recorded sessions"],
      ],
      report.yearly,
    );
    table(
      "executive-day-table",
      [
        ["date", "Date"],
        ["total", "Recorded sessions"],
      ],
      report.daily,
    );
  }
}
