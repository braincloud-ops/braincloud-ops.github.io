import { initializeDashboard } from "./dashboard.mjs?v=a2d3aa58e2e0";
import { initializeAttendance } from "./attendance.mjs?v=a2d3aa58e2e0";
import {
  initializeRequestWorkflows,
  confirmSubmission,
} from "./request-workflows.mjs?v=a2d3aa58e2e0";
import { API_URL } from "./config.js?v=a2d3aa58e2e0";
import { initializeAdminCalendar } from "./admin-calendar.mjs?v=a2d3aa58e2e0";
import { initializeDirectory } from "./directory.mjs?v=a2d3aa58e2e0";
import { initializeTimeline } from "./timeline.mjs?v=a2d3aa58e2e0";
import { initializeLearning } from "./learning.mjs?v=a2d3aa58e2e0";
import { closeNavigation } from "./interface.mjs?v=a2d3aa58e2e0";
import { showLineIdentity, lineRequestHeaders } from "./line-context.mjs?v=a2d3aa58e2e0";
import { improveFormDates, showSubmissionReceipt } from "./form-experience.mjs?v=a2d3aa58e2e0";
import { combobox } from "./combobox.mjs?v=a2d3aa58e2e0";
import { enterSection } from "./motion.mjs?v=a2d3aa58e2e0";
import { character } from "./characters.mjs?v=a2d3aa58e2e0";
import { groupTone, teacherActive, teacherType } from "./schedule-model.mjs?v=a2d3aa58e2e0";
const $ = (id) => document.getElementById(id),
  state = {
    schools: [],
    teachers: [],
    session: null,
    edit: null,
    executive: null,
    alarm: null,
  };
const demo = ["localhost", "127.0.0.1"].includes(location.hostname),
  base = API_URL || (demo ? "/api" : "");
showLineIdentity();
if (demo) {
  $("environment").hidden = false;
  $("environment").textContent =
    "Local demo • Synthetic data • No email or Discord messages • Demo password: demo password only";
}
if (!base) {
  $("environment").hidden = false;
  $("environment").textContent =
    "Production API is not connected. This is a preview prepared for migration.";
}
let messageTimer;
function message(text, error = false) {
  clearTimeout(messageTimer);
  $("message").textContent = text;
  $("message").classList.toggle("error", error);
  if (text && !error && text !== "Working…")
    messageTimer = setTimeout(() => ($("message").textContent = ""), 6000);
}
async function api(
  path,
  { method = "GET", data, headers = {}, raw = false } = {},
) {
  if (!base) throw new Error("The API is not connected.");
  if (path.startsWith("/admin/") && path !== "/admin/login") {
    if (!state.session || Date.parse(state.session.expires_at) <= Date.now()) {
      signOut();
      throw new Error("Please sign in again.");
    }
    headers.Authorization = "Bearer " + state.session.token;
  }
  const r = await fetch(base + path, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  if (!r.ok) {
    const e = await r.json();
    if (r.status === 401) signOut();
    throw new Error(e.error || "The action could not be completed.");
  }
  return raw ? r : r.json();
}
async function busy(button, action) {
  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  message("Working…");
  try {
    await action();
  } catch (e) {
    message(e.message, true);
  } finally {
    button.disabled = false;
    button.removeAttribute("aria-busy");
  }
}
async function query(table, filters = [], admin = false, order = []) {
  const all = [];
  for (let offset = 0; offset < 60000; offset += 1000) {
    const { data } = await api(admin ? "/admin/query" : "/query", {
      method: "POST",
      data: { table, filters, order, offset, limit: 1000 },
    });
    all.push(...data);
    if (data.length < 1000) return all;
  }
  throw new Error("Too many records. Select a shorter date range.");
}
function table(target, columns, rows, action) {
  const root = $(target);
  root.replaceChildren();
  if (!rows.length) {
    root.textContent = "No records found for this date range.";
    return;
  }
  const t = document.createElement("table"),
    head = t.createTHead().insertRow();
  for (const [, title] of columns) {
    const th = document.createElement("th");
    th.scope = "col";
    th.textContent = title;
    head.append(th);
  }
  if (action) {
    const th = document.createElement("th");
    th.textContent = "Action";
    head.append(th);
  }
  const body = t.createTBody();
  for (const item of rows) {
    const row = body.insertRow();
    for (const [key] of columns) {
      const cell = row.insertCell();
      const value = String(item[key] ?? "");
      if (
        key === "status" &&
        [
          "Pending",
          "Approved",
          "Rejected",
          "Cancelled",
          "Acknowledged",
        ].includes(value)
      ) {
        const badge = document.createElement("span");
        badge.className = "request-status";
        badge.dataset.status = value;
        badge.textContent = value;
        cell.append(badge);
      } else cell.textContent = value;
    }
    if (action) {
      const b = document.createElement("button");
      b.textContent = "Edit";
      b.addEventListener("click", () => action(item));
      row.insertCell().append(b);
    }
  }
  root.append(t);
}
const teacherName = (id) => {
  const t = state.teachers.find((t) => t.user_id === id);
  return t
    ? [t.firstname_en, t.lastname_en].filter(Boolean).join(" ")
    : id || "Not specified";
};
const schoolName = (id) => {
  const s = state.schools.find((s) => s.school_id === id);
  return s?.school_code || id;
};
const filters = (start, end, column = "date") => [
  { column, op: "gte", value: start },
  { column, op: "lte", value: end },
];
const combos = {};
function schoolItem(s) {
  return {
    value: s.school_code,
    label: `${s.school_code} — ${s.school_name_th || s.school_name_en || ""}`,
    detail: s.school_name_th && s.school_name_en ? s.school_name_en : undefined,
    meta: s.school_group || "Other",
    tone: groupTone(s.school_group),
    search: [s.school_name_en, s.school_name_th].join(" "),
  };
}
// Active teachers are listed; inactive ones appear only when searched for.
function teacherItems(teachers) {
  const item = (t) => {
    const nickname = t.nickname_en || t.nickname_th;
    const thai = [t.firstname_th, t.lastname_th].filter(Boolean).join(" ");
    const name = teacherName(t.user_id);
    return {
      value: t.user_id,
      label: name + (nickname ? ` (${nickname})` : ""),
      // Some records repeat the English name in the Thai fields.
      detail:
        thai && thai.toLowerCase() !== name.toLowerCase() ? thai : undefined,
      meta: teacherType(t),
      search: [t.nickname_th, t.nickname_en, thai].join(" "),
    };
  };
  return [
    ...teachers.filter(teacherActive).map(item),
    ...teachers
      .filter((t) => !teacherActive(t))
      .map((t) => ({
        ...item(t),
        section: "Inactive",
        hiddenUntilSearch: true,
      })),
  ];
}
function options(id, rows, value, label) {
  for (const row of rows) {
    const option = document.createElement("option");
    option.value = row[value];
    option.textContent = label(row);
    $(id).append(option);
  }
}
function route(moveFocus = false) {
  const requested = location.hash.slice(1) || "home";
  const sections = [...document.querySelectorAll("main>section")];
  const id = sections.some((section) => section.id === requested)
    ? requested
    : "home";
  for (const section of document.querySelectorAll("main>section"))
    section.hidden = section.id !== id;
  for (const a of document.querySelectorAll("nav a")) {
    if (a.hash === "#" + id) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  }
  const heading = $(id).querySelector("h1");
  const activeLink = document.querySelector('nav a[aria-current="page"]');
  $("page-name").textContent = activeLink?.textContent.trim() || "Overview";
  document.title = `${$("page-name").textContent} | Braincloud Operations`;
  heading.tabIndex = -1;
  closeNavigation();
  if (moveFocus) {
    heading.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "instant" });
    enterSection($(id));
  }
  message("");
}
addEventListener("hashchange", () => route(true));
route();
{
  const wave = character("robot-b-wave", { small: true });
  wave.classList.add("login-character");
  $("login-form").prepend(wave);
}
const today = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Bangkok",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());
for (const input of document.querySelectorAll("input[type=date]"))
  input.value = today;
improveFormDates();
async function initialize() {
  if (!base) return;
  try {
    [state.schools, state.teachers] = await Promise.all([
      query("dim_school", [], false, [{ column: "school_code" }]),
      query(
        "dim_user",
        [{ column: "user_type", op: "in", value: [210, 220] }],
        false,
        [
          { column: "firstname_en" },
          { column: "lastname_en" },
          { column: "user_id" },
        ],
      ),
    ]);
    const activeSchools = state.schools.filter(
      (s) => String(s.status).toLowerCase() === "active",
    );
    combos.school = combobox($("school-select"), {
      items: activeSchools.map(schoolItem),
      placeholder: "Type a school name or code",
      invalidText: "Choose a school from the list.",
      emptyText: "No school matches. Check the spelling or code.",
    });
    combos.teacher = combobox($("teacher-select"), {
      items: teacherItems(state.teachers),
      placeholder: "Type a teacher's name",
      invalidText: "Choose a teacher from the list.",
      emptyText: "No teacher matches. Ask an administrator to check the list.",
    });
    const reportSchools = state.schools.filter(
      (s) => s.school_group !== "Trial School",
    );
    options(
      "executive-schools",
      reportSchools,
      "school_id",
      (s) => `${s.school_code} — ${s.school_name_en || s.school_name_th}`,
    );
    options(
      "executive-groups",
      [...new Set(reportSchools.map((s) => s.school_group || "Other"))]
        .sort()
        .map((group) => ({ group })),
      "group",
      (s) => s.group,
    );
    options("executive-teachers", state.teachers, "user_id", (t) =>
      teacherName(t.user_id),
    );
    combos.editSchool = combobox($("edit-school"), {
      items: [
        ...activeSchools.map(schoolItem),
        ...state.schools
          .filter((s) => !activeSchools.includes(s))
          .map((s) => ({
            ...schoolItem(s),
            section: "Inactive schools",
            hiddenUntilSearch: true,
          })),
      ],
      placeholder: "Type a school name or code",
    });
    combos.editTeacher = combobox($("edit-teacher"), {
      items: teacherItems(state.teachers),
      placeholder: "Type a teacher's name",
    });
  } catch (e) {
    message(e.message, true);
  }
}
initialize();
initializeRequestWorkflows({
  query,
  api,
  getSchools: () => state.schools,
  teacherName,
});
initializeDashboard({ query });
for (const [id, category] of [
  ["school-form", "School"],
  ["teacher-form", "Teacher"],
]) {
  const form = $(id);
  let pending = null;
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    busy(form.querySelector("[type=submit]"), async () => {
      const data = Object.fromEntries(new FormData(form));
      data.request_category = category;
      data.affected_sessions =
        category === "Teacher"
          ? { startTime: data.startTime, endTime: data.endTime }
          : data.type === "Partial"
            ? [...form.querySelectorAll("[name=sessions]:checked")].map(
                (i) => i.value,
              )
            : null;
      delete data.startTime;
      delete data.endTime;
      delete data.sessions;
      const serialized = JSON.stringify(data);
      if (!pending || pending.serialized !== serialized)
        pending = { serialized, key: crypto.randomUUID() };
      if (!(await confirmSubmission(form, data, teacherName))) {
        message("You can edit your request before sending.");
        return;
      }
      const result = await api("/requests", {
        method: "POST",
        data,
        headers: { "Idempotency-Key": pending.key, ...lineRequestHeaders() },
      });
      message(`Request #${result.id} received. Status: Pending.`);
      // Keep the key while the payload is unchanged, including after a successful
      // response; only an explicit "Submit another request" starts a new one.
      showSubmissionReceipt(form, result, () => {
        pending = null;
        if (form.elements.reason) form.elements.reason.value = "";
        for (const box of form.querySelectorAll("[name=sessions]:checked"))
          box.checked = false;
        form.querySelector("[type=submit]")?.focus();
        message("Ready for another request. Check the details before sending.");
      });
    });
  });
}
$("report-form").addEventListener("submit", (e) => {
  e.preventDefault();
  busy(e.submitter, async () => {
    const f = Object.fromEntries(new FormData(e.target));
    if (f.start > f.end) throw new Error("Invalid date range.");
    let rows;
    if (f.report === "requests") {
      rows = await query(
        "requests_log",
        [
          { column: "start_date", op: "lte", value: f.end },
          { column: "end_date", op: "gte", value: f.start },
        ],
        false,
        [{ column: "id" }],
      );
      table(
        "report-output",
        [
          ["id", "Request ID"],
          ["request_category", "Type"],
          ["school_code", "School"],
          ["teacher", "Teacher"],
          ["start_date", "Start"],
          ["end_date", "End date"],
          ["status", "Status"],
        ],
        rows.map((r) => ({ ...r, teacher: teacherName(r.teacher_id) })),
      );
    } else if (f.report === "availability") {
      rows = await query(
        "fact_teacher_unavailability",
        [
          { column: "start_date", op: "lte", value: f.end },
          { column: "end_date", op: "gte", value: f.start },
        ],
        false,
        [{ column: "unavailability_id" }],
      );
      table(
        "report-output",
        [
          ["teacher", "Teacher"],
          ["start_date", "Start date"],
          ["end_date", "End date"],
          ["start_time", "Start time"],
          ["end_time", "End time"],
        ],
        rows.map((r) => ({ ...r, teacher: teacherName(r.teacher_id) })),
      );
    } else {
      rows = await query("fact_daily_session", filters(f.start, f.end), false, [
        { column: "date" },
        { column: "session_id" },
      ]);
      if (f.report === "summary") {
        const summary = new Map();
        for (const r of rows) {
          const s = summary.get(r.school_id) || {
            school: schoolName(r.school_id),
            total: 0,
            cancelled: 0,
            cover: 0,
          };
          s.total++;
          if (r.status.startsWith("Cancelled")) s.cancelled++;
          if (r.status.includes("Substituted")) s.cover++;
          summary.set(r.school_id, s);
        }
        table(
          "report-output",
          [
            ["school", "School"],
            ["total", "Total sessions"],
            ["cancelled", "Cancelled"],
            ["cover", "Substitutions"],
          ],
          [...summary.values()],
        );
      } else
        table(
          "report-output",
          [
            ["date", "Date"],
            ["start_time", "Time"],
            ["school", "School"],
            ["class_name", "Class"],
            ["teacher", "Assigned teacher"],
            ["status", "Status"],
          ],
          rows.map((r) => ({
            ...r,
            school: schoolName(r.school_id),
            teacher: teacherName(r.actual_teacher_id),
          })),
        );
    }
    $("report-note").textContent =
      `${f.start} to ${f.end} • Asia/Bangkok • ${rows.length} records`;
    message("Report loaded.");
  });
});
$("executive-form").addEventListener("submit", (e) => {
  e.preventDefault();
  busy(e.submitter, async () => {
    $("executive-output").hidden = true;
    state.executive = null;
    $("executive-note").textContent = "Loading the selected period…";
    const f = new FormData(e.target);
    const params = {
      start: f.get("start"),
      end: f.get("end"),
      groups: f.getAll("groups"),
      schoolIds: f.getAll("schoolIds"),
      teacherIds: f.getAll("teacherIds"),
    };
    let report;
    try {
      report = (
        await api("/reports/executive", { method: "POST", data: params })
      ).data;
    } catch (error) {
      $("executive-note").textContent =
        "This report could not be loaded. No replacement totals were calculated.";
      throw error;
    }
    $("executive-note").textContent =
      `${report.start} to ${report.end} • Asia/Bangkok • Latest source update: ${report.last_updated || "Not available"}`;
    if (!report.total) {
      $("executive-note").textContent +=
        " • No recorded sessions match this selection. This does not confirm zero activity.";
      message("Report loaded.");
      return;
    }
    const root = $("executive-totals");
    root.replaceChildren();
    for (const [label, value] of [
      ["Recorded sessions", report.total],
      ["Active teachers", report.active_teachers],
      ["Schools with records", report.schools.length],
      ["Affiliated staff", report.affiliated_staff_count],
    ]) {
      const card = document.createElement("div"),
        heading = document.createElement("strong"),
        caption = document.createElement("span");
      heading.textContent = value.toLocaleString("en-GB");
      caption.textContent = label;
      card.append(heading, caption);
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
      const row = document.createElement("label"),
        bar = document.createElement("meter");
      bar.max = report.total;
      bar.value = report.counts[key];
      bar.setAttribute("aria-label", label);
      row.append(
        document.createTextNode(
          `${label}: ${report.counts[key].toLocaleString("en-GB")}`,
        ),
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
      const item = document.createElement("details"),
        title = document.createElement("summary");
      title.textContent = `${school.school} — ${school.name}`;
      item.append(title);
      for (const [label, people] of [
        ["Responsible teachers", school.responsible_teachers],
        ["Currently affiliated staff", school.affiliated_staff],
      ]) {
        const heading = document.createElement("h3"),
          list = document.createElement("ul");
        heading.textContent = label;
        for (const person of people) {
          const li = document.createElement("li");
          li.textContent =
            person.name +
            (person.taught === undefined
              ? ""
              : `: ${person.taught} taught sessions`);
          list.append(li);
        }
        if (!people.length) list.textContent = "No matching staff recorded.";
        item.append(heading, list);
      }
      const button = document.createElement("button"),
        rows = document.createElement("div");
      button.type = "button";
      button.className = "secondary";
      button.textContent = "View sessions";
      rows.id = `school-detail-${details.childElementCount}`;
      rows.className = "table-wrap";
      button.addEventListener("click", () =>
        busy(button, async () => {
          rows.replaceChildren();
          const sessions = await query(
            "fact_daily_session",
            [
              ...filters(report.start, report.end),
              { column: "school_id", op: "eq", value: school.school_id },
            ],
            false,
            [{ column: "date" }, { column: "session_id" }],
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
    $("executive-output").hidden = false;
    state.executive = report;
    message("Executive summary loaded.");
  });
});

$("copy-executive").addEventListener("click", () =>
  busy($("copy-executive"), async () => {
    const r = state.executive;
    if (!r) throw new Error("Load a report first.");
    const text = [
      `Braincloud executive summary: ${r.start} to ${r.end} (Asia/Bangkok)`,
      `Recorded sessions: ${r.total}; active teachers: ${r.active_teachers}; affiliated staff: ${r.affiliated_staff_count}`,
      `Latest source update: ${r.last_updated || "Not available"}`,
      ...r.schools.map(
        (s) =>
          `${s.school}: ${s.total} recorded, ${s.NORMAL} normal, ${s.COVERED} covered, ${s.CANCEL_SCHOOL + s.CANCEL_BC} cancelled`,
      ),
      "Recorded sessions include cancellations; this is not a payment report.",
    ].join("\n");
    await navigator.clipboard.writeText(text);
    message("Report copied.");
  }),
);

function signOut() {
  dispatchEvent(new Event("admin-signed-out"));
  state.session = null;
  state.edit = null;
  state.alarm = null;
  $("login-form").hidden = false;
  $("admin-workspace").hidden = true;
  $("admin-requests").replaceChildren();
  $("job-output").replaceChildren();
  calendar.clear();
  directory.clear();
  $("edit-coverage").replaceChildren();
  $("edit-details").textContent = "";
  $("edit-form").reset();
  $("alarm-form").reset();
  $("alarm-output").replaceChildren();
  if ($("edit-dialog").open) $("edit-dialog").close();
}
initializeAttendance({ api });
const calendar = initializeAdminCalendar({ api, query, message });
const directory = initializeDirectory({ api, message });
// Administrator sections: one visible at a time; data loads on first visit.
function showAdminTab(name) {
  for (const b of document.querySelectorAll("[data-admin-tab]"))
    b.setAttribute("aria-pressed", String(b.dataset.adminTab === name));
  for (const panel of document.querySelectorAll("[data-admin-panel]"))
    panel.hidden = panel.dataset.adminPanel !== name;
  if (name === "calendar") calendar.start();
  if (name === "directory") directory.start();
  enterSection(document.querySelector(`[data-admin-panel="${name}"]`));
}
for (const b of document.querySelectorAll("[data-admin-tab]"))
  b.addEventListener("click", () => showAdminTab(b.dataset.adminTab));
$("login-form").addEventListener("submit", (e) => {
  e.preventDefault();
  busy(e.submitter, async () => {
    state.session = await api("/admin/login", {
      method: "POST",
      data: { password: e.target.elements.password.value },
    });
    e.target.reset();
    $("login-form").hidden = true;
    $("admin-workspace").hidden = false;
    $("session-expiry").textContent =
      "Session expires " +
      new Date(state.session.expires_at).toLocaleString("en-GB", {
        timeZone: "Asia/Bangkok",
      });
    message("Signed in.");
    showAdminTab("calendar");
  });
});
$("logout").addEventListener("click", () =>
  busy($("logout"), async () => {
    try {
      await api("/admin/logout", { method: "POST", data: {} });
    } finally {
      signOut();
      message("Signed out.");
    }
  }),
);
$("load-requests").addEventListener("click", () =>
  busy($("load-requests"), async () => {
    const { data } = await api("/admin/query", {
      method: "POST",
      data: {
        table: "requests_log",
        order: [{ column: "id", ascending: false }],
        limit: 100,
      },
    });
    table(
      "admin-requests",
      [
        ["id", "Request ID"],
        ["user_name", "Submitted by"],
        ["verified", "Submitter check"],
        ["request_category", "Category"],
        ["subject", "Teacher / school"],
        ["dates", "Dates"],
        ["type", "Type"],
        ["reason", "Reason"],
        ["status", "Status"],
      ],
      data.map((r) => ({
        ...r,
        verified: r.user_id ? "LINE verified" : "Browser, not verified",
        subject:
          (r.request_category || (r.teacher_id ? "Teacher" : "School")) ===
          "Teacher"
            ? teacherName(r.teacher_id)
            : r.school_code,
        dates:
          r.start_date === r.end_date
            ? r.start_date
            : `${r.start_date} to ${r.end_date}`,
      })),
      editRequest,
    );
    message("Loaded the 100 most recent requests.");
  }),
);
$("edit-form").addEventListener("submit", (e) => {
  e.preventDefault();
  busy(e.submitter, async () => {
    if (!state.edit) throw new Error("Select a request first.");
    const values = Object.fromEntries(new FormData(e.target));
    const changes = Object.fromEntries(
      ["status", "start_date", "end_date", "reason", "type"].map((k) => [
        k,
        values[k],
      ]),
    );
    if (
      (state.edit.request_category ||
        (state.edit.teacher_id ? "Teacher" : "School")) === "Teacher"
    ) {
      changes.teacher_id = values.teacher_id;
      changes.affected_sessions = {
        startTime: values.startTime,
        endTime: values.endTime,
      };
    } else {
      changes.school_code = values.school_code;
      changes.affected_sessions =
        values.type === "Partial"
          ? values.session_ids.split(/[\s,]+/).filter(Boolean)
          : null;
    }
    await api("/admin/requests/" + state.edit.id, {
      method: "PATCH",
      data: { revision: state.edit.revision, changes },
    });
    state.edit = null;
    $("edit-dialog").close();
    calendar.refresh();
    message(
      "Saved. The calendar is refreshing; reload recent requests to see the change there.",
    );
  });
});
function editRequest(item) {
  state.edit = item;
  $("edit-coverage").replaceChildren();
  $("edit-heading").textContent = "Edit request #" + item.id;
  $("edit-details").textContent =
    `Submitted by ${item.user_name || "Not recorded"}. Revision ${item.revision}.`;
  for (const k of ["status", "start_date", "end_date", "reason"])
    $("edit-form").elements[k].value = item[k] || "";
  const teacher =
    (item.request_category || (item.teacher_id ? "Teacher" : "School")) ===
    "Teacher";
  $("edit-school-fields").hidden = teacher;
  $("edit-teacher-fields").hidden = !teacher;
  $("edit-type").replaceChildren();
  const types = teacher
    ? ["Sick", "Annual", "Other"]
    : ["Whole Day", "Partial"];
  // Keep an older type (e.g. "Personal") selectable so the record can be saved.
  if (teacher && item.type && !types.includes(item.type)) types.push(item.type);
  options(
    "edit-type",
    types.map((type) => ({ type })),
    "type",
    (r) => r.type,
  );
  $("edit-type").value =
    item.type === "Specific Sessions" ? "Partial" : item.type;
  let affected = item.affected_sessions;
  if (typeof affected === "string") {
    try {
      affected = JSON.parse(affected);
    } catch {
      affected = null;
    }
  }
  const f = $("edit-form").elements;
  f.teacher_id.value = item.teacher_id || "";
  f.school_code.value = item.school_code || "";
  combos.editTeacher?.refresh();
  combos.editSchool?.refresh();
  f.startTime.value = affected?.startTime || "08:00";
  f.endTime.value = affected?.endTime || "16:00";
  f.session_ids.value = Array.isArray(affected) ? affected.join("\n") : "";
  if (!$("edit-dialog").open) $("edit-dialog").showModal();
}
$("edit-close").addEventListener("click", () => $("edit-dialog").close());
calendar.onEdit(editRequest);
for (const id of ["edit-check-sessions", "edit-check-teaching"])
  $(id).addEventListener("click", () =>
    busy($(id), async () => {
      if (!state.edit) throw new Error("Select a request first.");
      $("edit-coverage").replaceChildren();
      const f = $("edit-form").elements;
      let rows = await query(
        "fact_daily_session",
        filters(f.start_date.value, f.end_date.value),
        false,
        [
          { column: "date" },
          { column: "start_time" },
          { column: "session_id" },
        ],
      );
      if (id === "edit-check-teaching")
        rows = rows.filter(
          (r) =>
            r.original_teacher_id === f.teacher_id.value ||
            r.actual_teacher_id === f.teacher_id.value,
        );
      else {
        const school = state.schools.find(
          (s) => s.school_code === f.school_code.value,
        );
        const ids = f.session_ids.value.split(/[\s,]+/).filter(Boolean);
        rows = rows.filter(
          (r) =>
            r.school_id === school?.school_id &&
            (f.type.value !== "Partial" || ids.includes(String(r.session_id))),
        );
      }
      table(
        "edit-coverage",
        [
          ["session_id", "Session ID"],
          ["date", "Date"],
          ["start_time", "Start"],
          ["class_name", "Class"],
          ["original", "Original teacher"],
          ["actual", "Actual teacher"],
          ["status", "Status"],
        ],
        rows.map((r) => ({
          ...r,
          original: teacherName(r.original_teacher_id),
          actual: teacherName(r.actual_teacher_id),
        })),
      );
      message(
        "Recorded schedule loaded. Approval does not itself change the teaching schedule.",
      );
    }),
  );
initializeTimeline({
  api,
  query,
  busy,
  message,
  table,
  teacherName,
  schoolName,
  getTeachers: () => state.teachers,
});
initializeLearning({ api, busy, message, table });
const bangkokTime = (value) =>
  new Date(value).toLocaleString("en-GB", { timeZone: "Asia/Bangkok" });
$("email-status").addEventListener("click", () =>
  busy($("email-status"), async () => {
    const { data } = await api("/admin/notifications/status");
    const seen = data.relay_last_seen
      ? Date.now() - Date.parse(data.relay_last_seen) < 5 * 60000
        ? `checked in ${bangkokTime(data.relay_last_seen)}`
        : `last checked in ${bangkokTime(data.relay_last_seen)} — not running`
      : "has not checked in yet";
    const test = data.last_test
      ? data.last_test.delivered_at
        ? `Last test sent ${bangkokTime(data.last_test.delivered_at)}.`
        : data.last_test.last_error
          ? `Last test failed (${data.last_test.last_error}).`
          : "Last test is waiting for the mailer."
      : "";
    $("email-note").textContent =
      `Company mailer ${seen}. Teacher leave emails are ${data.enabled ? "on" : "off"}. ` +
      `Last leave email: ${data.last_delivered_at ? bangkokTime(data.last_delivered_at) : "none yet"}. ` +
      `Waiting: ${data.waiting}. Failed: ${data.failed}. ${test}`;
    message("Email status loaded.");
  }),
);
$("email-test").addEventListener("click", () =>
  busy($("email-test"), async () => {
    await api("/admin/notifications/test-email", { method: "POST", data: {} });
    $("email-note").textContent =
      "Test email queued. The company mailer sends it within about a minute; use Check email status to confirm.";
    message("Test email queued.");
  }),
);
$("load-alarms").addEventListener("click", () =>
  busy($("load-alarms"), async () => {
    const { data } = await api("/admin/alarms");
    table(
      "alarm-output",
      [
        ["time", "Time (Asia/Bangkok)"],
        ["label", "Label"],
        ["is_active", "Enabled"],
      ],
      data,
      (item) => {
        state.alarm = item;
        $("alarm-heading").textContent = "Edit reminder";
        const f = $("alarm-form").elements;
        f.time.value = item.time;
        f.label.value = item.label;
        f.is_active.checked = item.is_active;
      },
    );
    message("Reminder settings loaded. Delivery depends on server activation.");
  }),
);
$("new-alarm").addEventListener("click", () => {
  state.alarm = null;
  $("alarm-form").reset();
  $("alarm-heading").textContent = "New reminder";
});
$("alarm-form").addEventListener("submit", (e) => {
  e.preventDefault();
  busy(e.submitter, async () => {
    const f = e.target.elements;
    await api("/admin/alarms", {
      method: "POST",
      data: {
        id: state.alarm?.id,
        revision: state.alarm?.revision,
        time: f.time.value,
        label: f.label.value,
        is_active: f.is_active.checked,
      },
    });
    state.alarm = null;
    e.target.reset();
    $("alarm-heading").textContent = "New reminder";
    $("alarm-output").replaceChildren();
    message("Reminder saved. Reload reminders to see the latest settings.");
  });
});
$("load-jobs").addEventListener("click", () =>
  busy($("load-jobs"), async () => {
    const { data } = await api("/admin/jobs");
    table(
      "job-output",
      [
        ["job", "Job"],
        ["status", "Result"],
        ["data_as_of", "Data updated (UTC)"],
        ["finished_at", "Finished (UTC)"],
        ["error_code", "Error"],
      ],
      data,
    );
    message("Job status loaded.");
  }),
);
$("export-form").addEventListener("submit", (e) => {
  e.preventDefault();
  busy(e.submitter, async () => {
    const response = await api("/admin/export", {
        method: "POST",
        data: Object.fromEntries(new FormData(e.target)),
        raw: true,
      }),
      blob = await response.blob(),
      url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download =
      response.headers
        .get("Content-Disposition")
        ?.match(/filename="([^"]+)"/)?.[1] || "payment-draft.xlsx";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    message("Draft downloaded. Review it in Google Sheets before payment.");
  });
});
