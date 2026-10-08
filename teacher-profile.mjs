// Teacher profile (administrators): facts only, for coaching conversations.
// No score or grade; leave reasons are never shown (the server does not send
// them). Data: POST /admin/teachers/profile, see
// supabase/functions/_shared/teacher-profile.mjs.
import { combobox } from "./combobox.mjs?v=7974d4d75686";
import { presetRange, rangeLabel } from "./executive.mjs?v=7974d4d75686";
import { decode, rise } from "./motion.mjs?v=7974d4d75686";
import { groupTone } from "./schedule-model.mjs?v=7974d4d75686";

const $ = (id) => document.getElementById(id);
const fmt = (n) => Number(n).toLocaleString("en-GB");
const pct = (r) =>
  r === null || r === undefined
    ? "—"
    : (r * 100).toLocaleString("en-GB", { maximumFractionDigits: 1 }) + "%";
const plural = (n, one, many) => `${fmt(n)} ${n === 1 ? one : many}`;
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
const NOTICE = [
  ["week_or_more", "A week or more before"],
  ["two_to_six_days", "2–6 days before"],
  ["day_before", "The day before"],
  ["same_day", "On the day"],
  ["after_start", "After it started"],
];

export function initializeTeacherProfile({ api, busy, message }) {
  const form = $("profile-form"),
    output = $("profile-output"),
    note = $("profile-note");
  let combo = null,
    generation = 0;
  const presets = [...form.querySelectorAll("[data-profile-preset]")];
  const choose = (name) => {
    const r = presetRange(name);
    form.elements.start.value = r.start;
    form.elements.end.value = r.end;
    for (const b of presets)
      b.setAttribute("aria-pressed", String(b.dataset.profilePreset === name));
  };
  choose("year");
  for (const b of presets)
    b.addEventListener("click", () => {
      choose(b.dataset.profilePreset);
      if ($("profile-teacher").value)
        load(form.querySelector(":scope > button"));
    });
  for (const input of [form.elements.start, form.elements.end])
    input.addEventListener("input", () => {
      for (const b of presets) b.setAttribute("aria-pressed", "false");
    });
  $("profile-teacher").addEventListener("change", (e) => {
    if (e.target.value) load(form.querySelector(":scope > button"));
  });
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    load(e.submitter || form.querySelector(":scope > button"));
  });

  function load(button) {
    return busy(button, async () => {
      const ticket = ++generation;
      const teacher = $("profile-teacher").value;
      if (!teacher) throw new Error("Choose a teacher.");
      output.classList.add("is-loading");
      note.textContent = "Loading the profile…";
      let data;
      try {
        ({ data } = await api("/admin/teachers/profile", {
          method: "POST",
          data: {
            teacher_id: teacher,
            start: form.elements.start.value,
            end: form.elements.end.value,
          },
        }));
      } catch (error) {
        if (ticket === generation) {
          output.hidden = true;
          output.replaceChildren();
          note.textContent = "The profile could not be loaded.";
        }
        throw error;
      }
      if (ticket !== generation) return;
      note.textContent = "";
      output.classList.remove("is-loading");
      render(data);
      output.hidden = false;
      message("Profile loaded.");
    });
  }

  function render(p) {
    output.replaceChildren();
    const c = p.classes;
    const head = el("div", "profile-head");
    const name = el("h3", "", p.teacher.name);
    if (p.teacher.nickname)
      name.append(el("span", "nick", ` (${p.teacher.nickname})`));
    head.append(
      name,
      el("span", "type-tag", p.teacher.type),
      el("span", "profile-period", rangeLabel(p.start, p.end)),
    );
    if (p.teacher.status && !/^(active|enabled)$/i.test(p.teacher.status))
      head.append(el("span", "state-pill", p.teacher.status));
    output.append(head);

    const tiles = el("div", "brief-kpis profile-kpis");
    for (const [label, value, sub] of [
      [
        "Classes taught",
        fmt(c.taught_total),
        `${fmt(c.taught_own)} own + ${fmt(c.covering_for_colleagues)} covering colleagues`,
      ],
      [
        "Own classes taught",
        pct(c.own_delivery_rate),
        `${fmt(c.taught_own)} of ${fmt(c.planned)} planned for this teacher`,
      ],
      [
        "Covered by colleagues",
        fmt(c.covered_by_others),
        "own classes another teacher took",
      ],
      [
        "Cancelled by Braincloud",
        fmt(c.cancelled_by_bc),
        c.cancelled_by_bc_mass
          ? `own classes; plus ${fmt(c.cancelled_by_bc_mass)} on mass-cancellation days`
          : "own classes",
      ],
      ["Cancelled by schools", fmt(c.cancelled_by_school), "own classes"],
      [
        "Leave days",
        fmt(p.leave.days),
        `${plural(p.leave.requests, "request", "requests")} in the request form, Monday–Friday`,
      ],
      [
        "Unavailable in TMS",
        fmt(p.unavailability.days),
        `${plural(p.unavailability.records, "record", "records")}, Monday–Friday`,
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
    output.append(tiles);
    rise(tiles.children);

    // Month by month: own classes, covering colleagues, own classes cancelled.
    const months = el("section", "brief-panel");
    months.append(el("h3", "", "Month by month"));
    const legend = el("ul", "brief-legend");
    legend.setAttribute("aria-hidden", "true");
    for (const [key, text] of [
      ["NORMAL", "Own classes taught"],
      ["COVERED", "Covering colleagues"],
      ["CANCEL_SCHOOL", "Own classes cancelled"],
    ]) {
      const li = el("li", "", text);
      li.dataset.key = key;
      legend.append(li);
    }
    const chart = el("div", "brief-trend profile-trend");
    chart.setAttribute("aria-hidden", "true");
    const max = Math.max(
      1,
      ...p.months.map((m) => m.own + m.covering + m.cancelled),
    );
    p.months.forEach((m, i) => {
      const col = el("div", "trend-col");
      col.title = `${m.month}: ${fmt(m.own)} own, ${fmt(m.covering)} covering, ${fmt(m.cancelled)} cancelled`;
      const bar = el("div", "trend-stack");
      bar.style.setProperty(
        "--h",
        String((m.own + m.covering + m.cancelled) / max),
      );
      bar.style.setProperty("--i", String(i));
      for (const [key, n] of [
        ["CANCEL_SCHOOL", m.cancelled],
        ["COVERED", m.covering],
        ["NORMAL", m.own],
      ]) {
        const part = el("span");
        part.dataset.key = key;
        part.style.flexGrow = String(n);
        bar.append(part);
      }
      const label = new Date(m.month + "-01T00:00:00Z").toLocaleDateString(
        "en-GB",
        {
          timeZone: "UTC",
          month: "short",
          ...(i === 0 || m.month.endsWith("-01") ? { year: "2-digit" } : {}),
        },
      );
      col.append(bar, el("span", "trend-label", label));
      chart.append(col);
    });
    // A table cannot shrink to the 1px of .visually-hidden, so a wrapper hides it.
    const hidden = el("div", "visually-hidden");
    const table = el("table");
    hidden.append(table);
    const caption = el("caption", "", "Classes by month");
    table.append(caption);
    const body = table.createTBody();
    for (const m of p.months) {
      const row = body.insertRow();
      for (const v of [
        m.month,
        `${m.own} own`,
        `${m.covering} covering`,
        `${m.cancelled} cancelled`,
      ])
        row.insertCell().textContent = v;
    }
    months.append(
      legend,
      p.months.length
        ? chart
        : el("p", "brief-empty", "No classes in this period."),
      hidden,
    );
    output.append(months);

    const grid = el("div", "brief-grid");
    const schools = el("section", "brief-panel");
    schools.append(el("h3", "", "Schools taught"));
    const list = el("ol", "map-schools profile-schools");
    for (const s of p.schools.slice(0, 12)) {
      const li = el("li");
      li.dataset.tone = groupTone(s.group);
      const n = el("span", "map-school-name");
      n.append(el("strong", "", s.school), " " + s.name);
      li.append(
        n,
        el("span", "group-chip", s.group),
        el("span", "map-list-value", fmt(s.taught)),
      );
      list.append(li);
    }
    if (!p.schools.length)
      list.append(el("li", "brief-empty", "No class taught in this period."));
    schools.append(list);
    const leave = el("section", "brief-panel");
    leave.append(el("h3", "", "Leave"));
    const types = Object.entries(p.leave.by_type).sort((a, b) => b[1] - a[1]);
    const typeList = el("ul", "profile-facts");
    for (const [type, days] of types)
      typeList.append(el("li", "", `${type}: ${plural(days, "day", "days")}`));
    if (!types.length)
      typeList.append(
        el("li", "brief-empty", "No leave requests in this period."),
      );
    leave.append(typeList);
    if (p.leave.requests) {
      leave.append(el("h3", "", "Notice given"));
      const noticeList = el("ul", "profile-facts");
      for (const [key, text] of NOTICE)
        if (p.leave.notice[key])
          noticeList.append(
            el(
              "li",
              "",
              `${text}: ${plural(p.leave.notice[key], "request", "requests")}`,
            ),
          );
      leave.append(noticeList);
    }
    leave.append(
      el(
        "p",
        "brief-locked",
        "Sick leave is a right; these figures describe, they do not judge. Reasons are not shown.",
      ),
    );
    grid.append(schools, leave);
    output.append(grid);

    const checks = [];
    if (p.checks.removed_upstream)
      checks.push(
        `Ignored ${fmt(p.checks.removed_upstream)} classes that TMS removed after they were first scheduled.`,
      );
    if (p.checks.bc_event_days.length)
      checks.push(
        `Mass-cancellation days in this period: ${p.checks.bc_event_days.length}. They are shown apart from this teacher's own Braincloud cancellations.`,
      );
    if (checks.length) {
      const ul = el("ul", "brief-checks");
      for (const text of checks) ul.append(el("li", "", text));
      output.append(ul);
    }
  }

  return {
    setTeachers(items) {
      combo = combobox($("profile-teacher"), {
        items,
        placeholder: "Type a teacher's name",
        emptyText: "No teacher matches.",
      });
    },
    clear() {
      generation++;
      output.hidden = true;
      output.replaceChildren();
      note.textContent = "";
      if (combo) {
        $("profile-teacher").value = "";
        combo.refresh();
      }
    },
  };
}
