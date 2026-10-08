// One school's page in a dialog (owner idea, 7 October 2026): figures for the
// executive period compared with the school's group, a month-by-month trend,
// student counts, a Google Maps link (a plain search link: no key, no cost)
// and, for administrators, the local teachers and who teaches there most.
import { modal } from "./dom.mjs?v=4bb7b27a0ac3";
import { decode } from "./motion.mjs?v=4bb7b27a0ac3";
import { groupTone } from "./schedule-model.mjs?v=4bb7b27a0ac3";
import { fillTrend, rangeLabel } from "./executive.mjs?v=4bb7b27a0ac3";

const fmt = (n) => Number(n).toLocaleString("en-GB");
const pct = (r) =>
  r === null || r === undefined
    ? "—"
    : (r * 100).toLocaleString("en-GB", {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }) + "%";
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// Google Maps search for the school; opens Google's own page with photos.
export function mapsLink(school) {
  // A known location opens exactly there.
  if (school.latitude != null && school.longitude != null)
    return (
      "https://www.google.com/maps/search/?api=1&query=" +
      encodeURIComponent(`${school.latitude},${school.longitude}`)
    );
  const query = [
    school.name_th || school.name_en || school.code,
    school.district,
    school.province,
    "Thailand",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    "https://www.google.com/maps/search/?api=1&query=" +
    encodeURIComponent(query)
  );
}

export function createSchoolSheet({ api, isAdmin, getPeriod }) {
  return async function openSchool(schoolId, label = "School") {
    const { dialog, body } = modal(label);
    dialog.classList.add("school-dialog");
    body.append(el("p", "brief-empty", "Loading the school…"));
    dialog.showModal();
    const { start, end } = getPeriod();
    let data;
    try {
      ({ data } = await api(
        isAdmin() ? "/admin/reports/school" : "/reports/school",
        { method: "POST", data: { school_id: schoolId, start, end } },
      ));
    } catch (error) {
      body.replaceChildren(
        el(
          "p",
          "brief-empty",
          error.message || "The school could not be loaded.",
        ),
      );
      return;
    }
    render(dialog, body, data);
  };
}

function render(dialog, body, { school, report, group }) {
  dialog.querySelector("h2").textContent =
    `${school.code} — ${school.name_th || school.name_en}`;
  body.replaceChildren();
  const head = el("div", "school-head");
  head.dataset.tone = groupTone(school.group);
  if (school.name_th && school.name_en)
    head.append(el("p", "school-name-en", school.name_en));
  const meta = el("p", "school-meta");
  meta.append(
    el("span", "group-chip", school.group),
    " " +
      [school.district, school.province].filter(Boolean).join(", ") +
      (school.learning_model ? ` · ${school.learning_model}` : ""),
  );
  if (school.status && !/^active$/i.test(school.status))
    meta.append(" ", el("span", "state-pill", school.status));
  const link = el("a", "button-link secondary-link", "Open in Google Maps ↗");
  link.href = mapsLink(school);
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  head.append(meta, link);
  body.append(head);

  const f = report.figures;
  body.append(
    el(
      "p",
      "profile-period",
      `${rangeLabel(report.start, report.end)} · compared with all ${school.group} schools`,
    ),
  );
  if (!report.total) {
    body.append(
      el(
        "p",
        "brief-empty",
        "No recorded classes in this period. This does not confirm zero activity.",
      ),
    );
  } else {
    const tiles = el("div", "brief-kpis school-kpis");
    const latest = [...report.student_counts]
      .filter((s) => s.no_students !== null)
      .sort((a, b) => b.year.localeCompare(a.year))[0];
    for (const [label, value, sub] of [
      [
        "Classes delivered",
        fmt(f.delivered),
        `of ${fmt(f.scheduled)} scheduled`,
      ],
      [
        "Delivery rate",
        pct(f.delivery_rate),
        group ? `group ${pct(group.delivery_rate)}` : "",
      ],
      [
        "Cancelled by the school",
        fmt(f.cancel_school),
        `${pct(f.cancel_school_rate)}` +
          (group ? ` · group ${pct(group.cancel_school_rate)}` : ""),
      ],
      [
        "Cancelled by Braincloud",
        fmt(f.cancel_bc),
        `${pct(f.cancel_bc_rate)}` +
          (group ? ` · group ${pct(group.cancel_bc_rate)}` : ""),
      ],
      [
        "Students",
        latest ? fmt(latest.no_students) : "—",
        latest ? `recorded for ${latest.year}` : "not recorded",
      ],
    ]) {
      const card = el("article", "kpi");
      const v = el("strong", "kpi-value", value);
      card.append(
        el("span", "kpi-label", label),
        v,
        el("span", "kpi-sub", sub),
      );
      tiles.append(card);
      decode(v, value);
    }
    body.append(tiles);
    const trend = el("section", "brief-panel");
    trend.append(el("h3", "", "Classes over time"));
    const legend = el("ul", "brief-legend");
    legend.setAttribute("aria-hidden", "true");
    for (const [key, text] of [
      ["NORMAL", "Delivered"],
      ["COVERED", "By a cover teacher"],
      ["CANCEL_SCHOOL", "Cancelled by the school"],
      ["CANCEL_BC", "Cancelled by Braincloud"],
    ]) {
      const li = el("li", "", text);
      li.dataset.key = key;
      legend.append(li);
    }
    const chart = el("div", "brief-trend school-trend");
    fillTrend(chart, report);
    trend.append(legend, chart);
    body.append(trend);
  }

  const people = el("section", "brief-panel");
  people.append(el("h3", "", "Teachers"));
  const s = report.schools[0];
  if (report.admin_detail && s) {
    const list = (title, rows, text) => {
      people.append(el("h4", "", title));
      const ul = el("ul", "profile-facts");
      for (const row of rows) ul.append(el("li", "", text(row)));
      if (!rows.length) ul.append(el("li", "brief-empty", "None recorded."));
      people.append(ul);
    };
    list("Local teachers at this school", s.affiliated_staff, (t) => t.name);
    list(
      "Taught here most in this period",
      s.responsible_teachers.slice(0, 8),
      (t) =>
        `${t.name}: ${fmt(t.taught)} ${t.taught === 1 ? "class" : "classes"}`,
    );
  } else {
    people.append(
      el(
        "p",
        "brief-locked",
        s
          ? `${fmt(s.affiliated_staff_count)} local teachers; ${fmt(s.responsible_teacher_count)} teachers taught here in this period. Names are shown to administrators.`
          : "Names are shown to administrators.",
      ),
    );
  }
  body.append(people);

  if (report.student_counts.length) {
    const students = el("section", "brief-panel");
    students.append(el("h3", "", "Students by year"));
    const ul = el("ul", "profile-facts");
    for (const row of report.student_counts)
      ul.append(
        el(
          "li",
          "",
          `${row.year}: ${row.no_students === null ? row.status : fmt(row.no_students)}`,
        ),
      );
    students.append(ul);
    body.append(students);
  }
  body.append(
    el(
      "p",
      "brief-locked",
      "Learning activity is not shown: the TMS learning data is no longer updated.",
    ),
  );
}
