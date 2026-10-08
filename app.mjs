import { initializeDashboard } from "./dashboard.mjs?v=7502a32cfa1d";
import { initializeAttendance } from "./attendance.mjs?v=7502a32cfa1d";
import {
  initializeRequestWorkflows,
  confirmSubmission,
} from "./request-workflows.mjs?v=7502a32cfa1d";
import { API_URL } from "./config.js?v=7502a32cfa1d";
import { initializeAdminCalendar } from "./admin-calendar.mjs?v=7502a32cfa1d";
import {
  externalUrl,
  forgetViewer,
  inLineApp,
  keepViewer,
  openOutside,
  signIn,
  viewerSession,
} from "./viewer.mjs?v=7502a32cfa1d";
import { initializeAccess, levelLabel } from "./access.mjs?v=7502a32cfa1d";
import { initializeNewPerson } from "./new-person.mjs?v=7502a32cfa1d";
import { initializeDirectory } from "./directory.mjs?v=7502a32cfa1d";
import { initializeTimeline } from "./timeline.mjs?v=7502a32cfa1d";
import { initializeExecutive } from "./executive.mjs?v=7502a32cfa1d";
import { initializeTeacherProfile } from "./teacher-profile.mjs?v=7502a32cfa1d";
import { closeNavigation } from "./interface.mjs?v=7502a32cfa1d";
import { showLineIdentity, lineRequestHeaders } from "./line-context.mjs?v=7502a32cfa1d";
import { improveFormDates, showSubmissionReceipt } from "./form-experience.mjs?v=7502a32cfa1d";
import { combobox } from "./combobox.mjs?v=7502a32cfa1d";
import { enterSection } from "./motion.mjs?v=7502a32cfa1d";
import { character } from "./characters.mjs?v=7502a32cfa1d";
import {
  confirmedSessions,
  groupTone,
  teacherActive,
  teacherType,
} from "./schedule-model.mjs?v=7502a32cfa1d";
const $ = (id) => document.getElementById(id),
  state = {
    schools: [],
    teachers: [],
    session: null,
    edit: null,
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
    // Only an administrator call ends the administrator session.
    if (r.status === 401 && path.startsWith("/admin/")) signOut();
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
      if (key === "withdrawn" && value) {
        const badge = document.createElement("span");
        badge.className = "request-status";
        badge.dataset.status = "Cancelled";
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
  const t =
    state.teachers.find((t) => t.user_id === id) ||
    state.people?.find((t) => t.user_id === id);
  return t
    ? [t.firstname_en, t.lastname_en].filter(Boolean).join(" ")
    : id || "Not specified";
};
// A request taken back (stored as Cancelled; old records may say Rejected).
const withdrawn = (r) =>
  /^(cancelled|rejected)$/i.test(String(r?.status || "").trim());
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
      // FT/PT for teachers; otherwise the position (Thai teacher, Staff).
      meta:
        teacherType(t) !== "Other"
          ? teacherType(t)
          : { 110: "Thai teacher", 200: "Staff" }[t.position] || "",
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
// Inside LINE: a focused menu (forms, calendar, dashboard) and a way out to
// the full site in the phone's browser.
if (inLineApp()) {
  document.documentElement.classList.add("in-line");
  const out = $("open-outside");
  out.hidden = false;
  out.addEventListener("click", (event) => {
    out.href = externalUrl();
    openOutside(event);
  });
}
// Arriving from LINE's "Open in your browser": ?go=calendar/2026-10-08
// becomes #calendar/2026-10-08 (and LINE's own flag is dropped).
{
  const url = new URL(location.href);
  const go = url.searchParams.get("go");
  if (go || url.searchParams.has("openExternalBrowser")) {
    url.searchParams.delete("go");
    url.searchParams.delete("openExternalBrowser");
    if (go && /^[a-z]+(\/\d{4}-\d{2}-\d{2})?$/.test(go)) url.hash = go;
    history.replaceState(null, "", url.href);
  }
}
function route(moveFocus = false) {
  // "#calendar/2026-10-07": the page, then an argument for that page.
  const requested = location.hash.slice(1).split("/")[0] || "home";
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
  $("page-name").textContent =
    [...(activeLink?.childNodes || [])]
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => n.textContent)
      .join("")
      .trim() || "Overview";
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
  $("login-panel").prepend(wave);
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
    [state.schools, state.teachers, state.people] = await Promise.all([
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
      // Everyone at Braincloud (teachers and Thai staff) for the leave form.
      query(
        "dim_user",
        [{ column: "affiliation", op: "eq", value: "BC" }],
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
      items: teacherItems(state.people),
      placeholder: "Type your name",
      invalidText: "Choose a person from the list, or add yourself below.",
      emptyText: "No match. Can't find your name? Add yourself below.",
    });
    executive.setDirectory({
      schools: state.schools,
      teacherItems: teacherItems(state.teachers),
    });
    profiles.setTeachers(teacherItems(state.teachers));
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
      items: teacherItems(state.people),
      placeholder: "Type a teacher's name",
    });
  } catch (e) {
    message(e.message, true);
  }
}
initialize();
const newPerson = initializeNewPerson({
  form: $("teacher-form"),
  getPeople: () => state.people || [],
  choose(id) {
    $("teacher-select").value = id;
    combos.teacher?.refresh();
  },
});
initializeRequestWorkflows({
  query,
  api,
  getSchools: () => state.schools,
  teacherName,
});
initializeDashboard({ query });
const executive = initializeExecutive({
  api,
  busy,
  message,
  query,
  table,
  teacherName,
  filters,
  // Teacher names and school detail need that permission.
  isAdmin: () => can("teachers.profile"),
});
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
      // Not in the list: the person adds themselves with this request.
      for (const key of Object.keys(data))
        if (key.startsWith("np_")) delete data[key];
      if (category === "Teacher" && newPerson.isOpen()) {
        data.new_person = newPerson.read();
        delete data.teacher_id;
      }
      const serialized = JSON.stringify(data);
      if (!pending || pending.serialized !== serialized)
        pending = { serialized, key: crypto.randomUUID() };
      const who = (id) =>
        data.new_person ? newPerson.describe(data.new_person) : teacherName(id);
      if (!(await confirmSubmission(form, data, who))) {
        message("You can edit your request before sending.");
        return;
      }
      const result = await api("/requests", {
        method: "POST",
        data,
        headers: { "Idempotency-Key": pending.key, ...lineRequestHeaders() },
      });
      message(`#${result.id} sent. The team takes it from there.`);
      if (result.teacher_id && data.new_person) {
        // Now in the staff list: select them for any next request.
        state.people.push({
          user_id: result.teacher_id,
          ...data.new_person,
          affiliation: "BC",
          status: "Active",
        });
        combos.teacher?.setItems(teacherItems(state.people));
        newPerson.done(result.teacher_id);
      }
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
          ["withdrawn", "Withdrawn"],
        ],
        rows.map((r) => ({
          ...r,
          teacher: teacherName(r.teacher_id),
          withdrawn: withdrawn(r) ? "Withdrawn" : "",
        })),
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
      rows = confirmedSessions(
        await query("fact_daily_session", filters(f.start, f.end), false, [
          { column: "date" },
          { column: "session_id" },
        ]),
      );
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
// ── Signing in ──
// One company Google sign-in. The server answers with a named administrator
// session (the permissions an owner gave this person) or, for everyone else
// from the company, a staff session for the read-only team calendar. The
// shared password remains for emergencies and has every permission.
// Sessions are remembered on this device until they expire or Sign out.
const ADMIN_KEY = "braincloud-admin";
function rememberAdmin(session) {
  try {
    localStorage.setItem(ADMIN_KEY, JSON.stringify(session));
  } catch {}
}
function rememberedAdmin() {
  try {
    const s = JSON.parse(localStorage.getItem(ADMIN_KEY) || "null");
    if (s?.token && Date.parse(s.expires_at) > Date.now()) return s;
    localStorage.removeItem(ADMIN_KEY);
  } catch {}
  return null;
}
function adminLive() {
  return !!state.session && Date.parse(state.session.expires_at) > Date.now();
}
// What the signed-in administrator may do. The server checks every request;
// this only hides what would be refused.
function can(key) {
  return adminLive() && !!state.session.permissions?.includes(key);
}
function applyPermissions() {
  for (const node of document.querySelectorAll(
    "#admin-workspace [data-need], nav [data-need]",
  ))
    node.hidden = !node.dataset.need.split(" ").some(can);
  // The Timeline page: owners and Manager level and up.
  $("operations").classList.toggle("is-locked", !can("teachers.profile"));
  $("emergency-banner").hidden = state.session?.method !== "password";
  $("access-tab-label").textContent = can("access.manage")
    ? "Access & activity"
    : "My activity";
  updateAccount();
}
// The account card at the foot of the menu: who is signed in, and Sign out.
function updateAccount() {
  const viewer = viewerSession();
  const admin = adminLive() ? state.session : null;
  $("account").hidden = !admin && !viewer;
  $("account-email").textContent = admin
    ? admin.email || "Emergency password"
    : viewer?.email || "";
  $("account-role").textContent = admin
    ? admin.method === "password"
      ? "All permissions"
      : levelLabel(admin.preset)
    : viewer
      ? "Team calendar"
      : "";
  const until = (admin || viewer)?.expires_at;
  $("account-expiry").textContent = until
    ? "Signed in until " +
      new Date(until).toLocaleString("en-GB", {
        timeZone: "Asia/Bangkok",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";
}
function signOut() {
  try {
    localStorage.removeItem(ADMIN_KEY);
  } catch {}
  dispatchEvent(new Event("admin-signed-out"));
  state.session = null;
  state.edit = null;
  state.alarm = null;
  $("login-panel").hidden = false;
  $("admin-workspace").hidden = true;
  $("admin-requests").replaceChildren();
  $("job-output").replaceChildren();
  directory.clear();
  profiles.clear();
  access.clear();
  $("edit-coverage").replaceChildren();
  $("edit-details").textContent = "";
  $("edit-form").reset();
  $("alarm-form").reset();
  $("alarm-output").replaceChildren();
  if ($("edit-dialog").open) $("edit-dialog").close();
  applyPermissions();
  updateAccount();
  showAdminSignIn();
}
// Sign out of everything on this device: the administrator session and the
// staff session, on the server and in this browser.
async function signOutEverywhere(control) {
  await busy(control, async () => {
    // Forget the sessions on this device first, so nothing can reopen with
    // them (even if the page is left at once), then end them on the server.
    const tokens = [
      adminLive() && ["/admin/logout", state.session.token],
      viewerSession() && ["/viewer/logout", viewerSession().token],
    ].filter(Boolean);
    forgetViewer();
    if (state.session) signOut();
    teamCalendar.clear();
    if (!$("calendar").hidden) showTeamSignIn();
    else $("team-calendar-wrap").hidden = true;
    updateAccount();
    message("Signed out.");
    await Promise.allSettled(
      tokens.map(([path, token]) =>
        fetch(base + path, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + token,
          },
          body: "{}",
        }),
      ),
    );
  });
}
function handleSignIn(session) {
  if (session.kind === "admin") {
    forgetViewer();
    rememberAdmin(session);
    openWorkspace(session);
    teamCalendar.clear();
    $("admin-signin-note").textContent = "";
    message("Signed in as " + session.email + ".");
  } else {
    keepViewer(session);
    $("admin-signin-note").textContent =
      session.email +
      " can see the team calendar but has no administrator access. Ask an owner if you need it.";
    updateAccount();
  }
  if (!$("calendar").hidden) openTeamCalendar();
}
function signInError(error) {
  $("admin-signin-note").textContent = error.message;
  $("team-signin-note").textContent = error.message;
}
const signInOptions = () => ({
  api,
  demo,
  onSession: handleSignIn,
  onError: signInError,
});
function showAdminSignIn() {
  signIn($("admin-signin-button"), signInOptions());
}
initializeAttendance({ api });

// ── Team calendar: the one calendar for everyone ──
// Company staff read POST /calendar, which never carries reasons,
// submitters or leave types. People an owner has given access see more on
// the same page: leave details with `leave.details`, Mark handled and Edit
// with `requests.edit`.
const viewerApi = (path, options = {}) => {
  const token = viewerSession()?.token || (adminLive() && state.session.token);
  return api(path, {
    ...options,
    headers: {
      ...(options.headers || {}),
      ...(token ? { Authorization: "Bearer " + token } : {}),
    },
  });
};
const teamCalendar = initializeAdminCalendar({
  api: async (path, options) => {
    try {
      return await viewerApi(path, options);
    } catch (error) {
      if (/sign in|session/i.test(error.message)) {
        forgetViewer();
        updateAccount();
        showTeamSignIn();
      }
      throw error;
    }
  },
  query,
  message,
  rootId: "team-calendar-root",
  // People allowed to see leave details (owners, HR, coordinators) get the
  // full view here too; everyone else the company view without reasons.
  endpoint: () => (can("leave.details") ? "/admin/calendar" : "/calendar"),
  readOnly: true,
  canEdit: () => can("requests.edit"),
  canSeeDetails: () => can("leave.details"),
  showEditLink: () => !adminLive(),
  isVisible: () => !$("calendar").hidden && !$("team-calendar-wrap").hidden,
});
let pendingDate = null;
function showTeamSignIn() {
  $("team-calendar-wrap").hidden = true;
  $("team-signin").hidden = false;
  $("team-signin-note").textContent = "";
  signIn($("team-signin-button"), signInOptions());
}
async function openTeamCalendar(date) {
  if (date) pendingDate = date;
  const viewer = viewerSession();
  if (!viewer && !adminLive()) return showTeamSignIn();
  $("team-signin").hidden = true;
  $("team-calendar-wrap").hidden = false;
  if (pendingDate) {
    const day = pendingDate;
    pendingDate = null;
    await teamCalendar.openDate(day);
  } else teamCalendar.start();
}
const onTeamRoute = () => {
  const [page, arg] = location.hash.slice(1).split("/");
  if (page === "calendar") openTeamCalendar(arg);
};
addEventListener("hashchange", onTeamRoute);
// Signing out of Admin removes any leave details from the team calendar.
addEventListener("admin-signed-out", () => {
  teamCalendar.clear();
  if (viewerSession()) {
    if (!$("calendar").hidden) openTeamCalendar();
    return;
  }
  if (!$("calendar").hidden) showTeamSignIn();
  else $("team-calendar-wrap").hidden = true;
});
$("account-signout").addEventListener("click", (e) =>
  signOutEverywhere(e.currentTarget),
);
const directory = initializeDirectory({ api, message });
const profiles = initializeTeacherProfile({ api, busy, message });
const access = initializeAccess({
  api,
  busy,
  message,
  can,
  me: () => state.session,
});
// Administrator sections: one visible at a time; data loads on first visit.
function showAdminTab(name) {
  const tab = document.querySelector(`[data-admin-tab="${name}"]`);
  // A tab the person cannot use falls back to the first one they can.
  if (!tab || tab.hidden)
    name = [...document.querySelectorAll("[data-admin-tab]")].find(
      (b) => !b.hidden,
    ).dataset.adminTab;
  for (const b of document.querySelectorAll("[data-admin-tab]"))
    b.setAttribute("aria-pressed", String(b.dataset.adminTab === name));
  for (const panel of document.querySelectorAll("[data-admin-panel]"))
    panel.hidden = panel.dataset.adminPanel !== name;
  if (name === "directory") directory.start();
  if (name === "access") access.start();
  enterSection(document.querySelector(`[data-admin-panel="${name}"]`));
}
for (const b of document.querySelectorAll("[data-admin-tab]"))
  b.addEventListener("click", () => showAdminTab(b.dataset.adminTab));
$("login-form").addEventListener("submit", (e) => {
  e.preventDefault();
  busy(e.submitter, async () => {
    const session = await api("/admin/login", {
      method: "POST",
      data: { password: e.target.elements.password.value },
    });
    e.target.reset();
    e.target.closest("details").open = false;
    rememberAdmin(session);
    openWorkspace(session);
    message("Signed in with the emergency password.");
  });
});
function openWorkspace(session) {
  state.session = session;
  $("login-panel").hidden = true;
  $("admin-workspace").hidden = false;
  applyPermissions();
  dispatchEvent(new Event("admin-signed-in"));
  showAdminTab("settings");
}
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
        ["withdrawn", "Withdrawn"],
      ],
      data.map((r) => ({
        ...r,
        withdrawn: withdrawn(r) ? "Withdrawn" : "",
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
      ["start_date", "end_date", "reason", "type"].map((k) => [k, values[k]]),
    );
    // Withdrawn is the only state left; otherwise the old value is kept.
    if (values.withdrawn) changes.status = "Cancelled";
    else if (withdrawn(state.edit)) changes.status = "Pending";
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
    teamCalendar.refresh();
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
  for (const k of ["start_date", "end_date", "reason"])
    $("edit-form").elements[k].value = item[k] || "";
  $("edit-form").elements.withdrawn.checked = withdrawn(item);
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
teamCalendar.onEdit(editRequest);
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
  canView: () => can("teachers.profile"),
  api,
  query,
  busy,
  message,
  table,
  teacherName,
  schoolName,
  getTeachers: () => state.teachers,
});
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
      "Test email queued for the company account only. The mailer sends it within about a minute; use Check email status to confirm.";
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
// Last, so every module above is listening when a remembered session returns.
{
  const kept = rememberedAdmin();
  if (kept) {
    openWorkspace(kept);
    // Permissions may have changed since; the server has the current ones.
    api("/admin/me")
      .then(({ data }) => {
        if (state.session?.token !== kept.token) return;
        state.session = { ...state.session, ...data };
        rememberAdmin(state.session);
        applyPermissions();
        // The team calendar may show more (or less) with current permissions.
        teamCalendar.clear();
        if (!$("calendar").hidden) openTeamCalendar();
        showAdminTab(
          document.querySelector('[data-admin-tab][aria-pressed="true"]')
            ?.dataset.adminTab || "settings",
        );
      })
      .catch(() => {});
  } else showAdminSignIn();
  updateAccount();
  onTeamRoute();
}
